import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  LT_MONTHS,
  LT_WEEKDAYS_SHORT,
  MESSAGE_MAX_CHARS,
  MESSAGE_MAX_WORDS,
  buildMonthCells,
  countWords,
  describeContactLt,
  formatFullDateLt,
  formatLongDateLt,
  isSameDay,
  isSameMonth,
  parseContact,
  shiftMonth,
  startOfDay,
  toIsoDate,
  type ContactValue,
  type MonthCursor,
} from "@/lib/vaises/dateInquiry";
import {
  checkDateAvailability,
  submitDateInquiry,
  type DateAvailability,
  type VaisesService,
} from "@/services/vaises/dateInquiry";
import { messageFor } from "@/lib/api/errors";
import { withMinimumDuration } from "@/lib/withMinimumDuration";
import Turnstile, { type TurnstileHandle } from "./Turnstile";

// Long enough to read the "checking" state; with a real backend, slower responses aren't padded.
const MIN_CHECK_DISPLAY_MS = 900;

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "result"; availability: DateAvailability }
  | { status: "error" };

type Step = "date" | "result" | "message" | "contact" | "sent";

type DateInquiryPanelProps = {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  service: VaisesService;
};

export default function DateInquiryPanel({
  id,
  isOpen,
  onClose,
  service,
}: DateInquiryPanelProps) {
  const headingId = useId();
  const messageId = useId();
  const messageHintId = useId();
  const contactId = useId();
  const contactErrorId = useId();
  const formId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultTitleRef = useRef<HTMLParagraphElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<HTMLParagraphElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  // Set when the visitor moves between steps, so the opening render doesn't steal focus.
  const focusStepRef = useRef(false);
  // One key per inquiry: a retry after a failure must not create a second request.
  const idempotencyKeyRef = useRef<string | null>(null);

  // Set after mount so server and client render the same markup regardless of timezone.
  const [today, setToday] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<MonthCursor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const [step, setStep] = useState<Step>("date");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [contactInvalid, setContactInvalid] = useState(false);
  const [attemptedSend, setAttemptedSend] = useState(false);
  const [sentTo, setSentTo] = useState<ContactValue | null>(null);
  const [sendError, setSendError] = useState("");

  const calendarHidden = step !== "date" || check.status === "checking";
  const messageWords = countWords(message);
  const messageTooLong = messageWords > MESSAGE_MAX_WORDS;
  const isReserved =
    check.status === "result" && check.availability === "reserved";

  useEffect(() => {
    const now = startOfDay(new Date());
    setToday(now);
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
  }, []);

  useEffect(() => {
    if (isOpen) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!focusStepRef.current) return;
    focusStepRef.current = false;
    const target = {
      date: headingRef,
      result: resultTitleRef,
      message: messageRef,
      contact: contactRef,
      sent: sentRef,
    }[step];
    target.current?.focus({ preventScroll: true });
  }, [step]);

  const cells = useMemo(
    () => (cursor && today ? buildMonthCells(cursor, today) : []),
    [cursor, today],
  );

  const currentMonth = today
    ? { year: today.getFullYear(), month: today.getMonth() }
    : null;
  const atCurrentMonth = Boolean(
    cursor && currentMonth && isSameMonth(cursor, currentMonth),
  );

  function goTo(next: Step) {
    focusStepRef.current = true;
    setStep(next);
  }

  /** Back to the calendar; the typed message and contact are kept for the next date. */
  function resetInquiry() {
    idempotencyKeyRef.current = null;
    setCheck({ status: "idle" });
    setStep("date");
    setAttemptedSend(false);
    setContactInvalid(false);
    setSendError("");
  }

  function selectDate(date: Date) {
    setSelectedDate(date);
    resetInquiry();
  }

  function changeDate() {
    resetInquiry();
    headingRef.current?.focus({ preventScroll: true });
  }

  async function handleCheck() {
    if (!selectedDate) return;
    setCheck({ status: "checking" });
    try {
      const availability = await withMinimumDuration(
        checkDateAvailability(toIsoDate(selectedDate)),
        MIN_CHECK_DISPLAY_MS,
      );
      setCheck({ status: "result", availability });
      goTo("result");
    } catch {
      setCheck({ status: "error" });
    }
  }

  function handleContactChange(value: string) {
    setContact(value);
    // Validate live only once the user has tried to send, so typing isn't nagged mid-entry.
    if (attemptedSend) {
      setContactInvalid(parseContact(value) === null);
    }
  }

  async function deliver(
    inquiry: {
      isoDate: string;
      availability: DateAvailability;
      message: string;
      contact: ContactValue;
    },
    idempotencyKey: string,
  ) {
    try {
      const turnstileToken = (await turnstileRef.current?.getToken()) ?? "";
      await submitDateInquiry({ ...inquiry, service, idempotencyKey, turnstileToken });
      if (idempotencyKeyRef.current === idempotencyKey) idempotencyKeyRef.current = null;
    } catch (error) {
      // A reset since this send started means the error belongs to an abandoned inquiry.
      if (idempotencyKeyRef.current !== idempotencyKey) return;
      setSendError(messageFor(error));
      goTo("contact");
    }
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDate || check.status !== "result") return;
    setAttemptedSend(true);
    const parsed = parseContact(contact);
    if (!parsed) {
      setContactInvalid(true);
      return;
    }
    setContactInvalid(false);
    setSendError("");
    idempotencyKeyRef.current ??= crypto.randomUUID();
    // Optimistic: show the thank-you now; a rejection restores the form with everything kept.
    setSentTo(parsed);
    goTo("sent");
    void deliver(
      {
        isoDate: toIsoDate(selectedDate),
        availability: check.availability,
        message,
        contact: parsed,
      },
      idempotencyKeyRef.current,
    );
  }

  const dateLine = selectedDate && (
    <p className="vaises-date-hint vaises-date-result-date">
      {formatLongDateLt(selectedDate)}
    </p>
  );

  return (
    <aside
      id={id}
      className={`vaises-date-panel ${isOpen ? "vaises-date-panel-open" : ""}`}
      aria-labelledby={headingId}
      inert={!isOpen}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="vaises-date-panel-inner">
        <div className="vaises-date-group">
          {/* Calendar and each later step share one fixed-size slot and crossfade in place. */}
          <div className="vaises-date-stage">
            <div
              className={`vaises-calendar vaises-date-layer ${
                calendarHidden ? "vaises-date-layer-hidden" : ""
              }`}
              inert={calendarHidden}
            >
              <div className="vaises-calendar-header">
                <button
                  type="button"
                  className="vaises-calendar-nav"
                  aria-label="Ankstesnis mėnuo"
                  disabled={!cursor || atCurrentMonth}
                  onClick={() => cursor && setCursor(shiftMonth(cursor, -1))}
                >
                  ‹
                </button>
                <h3
                  id={headingId}
                  ref={headingRef}
                  tabIndex={-1}
                  className="vaises-calendar-title"
                  aria-live="polite"
                >
                  {cursor ? `${LT_MONTHS[cursor.month]} ${cursor.year}` : " "}
                </h3>
                <button
                  type="button"
                  className="vaises-calendar-nav"
                  aria-label="Kitas mėnuo"
                  disabled={!cursor}
                  onClick={() => cursor && setCursor(shiftMonth(cursor, 1))}
                >
                  ›
                </button>
              </div>

              <div className="vaises-calendar-weekdays" aria-hidden="true">
                {LT_WEEKDAYS_SHORT.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>

              <div className="vaises-calendar-grid">
                {cells.map((cell) =>
                  cell.kind === "blank" ? (
                    <span key={cell.key} aria-hidden="true" />
                  ) : (
                    <button
                      key={cell.key}
                      type="button"
                      className={`vaises-calendar-day ${
                        selectedDate && isSameDay(cell.date, selectedDate)
                          ? "vaises-calendar-day-selected"
                          : ""
                      } ${today && isSameDay(cell.date, today) ? "vaises-calendar-day-today" : ""}`}
                      aria-label={formatFullDateLt(cell.date)}
                      aria-current={
                        today && isSameDay(cell.date, today) ? "date" : undefined
                      }
                      aria-pressed={Boolean(
                        selectedDate && isSameDay(cell.date, selectedDate),
                      )}
                      disabled={cell.isPast}
                      onClick={() => selectDate(cell.date)}
                    >
                      {cell.day}
                    </button>
                  ),
                )}
              </div>
            </div>

            {check.status === "checking" && (
              <div className="vaises-date-checking vaises-date-layer" role="status">
                <p className="vaises-date-hint">Tikriname datą…</p>
                <span className="vaises-date-progress" aria-hidden="true" />
              </div>
            )}

            {(step === "result" || step === "sent") && selectedDate && (
              <div key={step} className="vaises-date-result vaises-date-layer" role="status">
                <p ref={resultTitleRef} tabIndex={-1} className="vaises-date-result-title">
                  {isReserved ? "Data jau rezervuota" : "Jūsų data laisva"}
                </p>
                {dateLine}
                {step === "result" ? (
                  <p className="vaises-date-result-text">
                    {isReserved
                      ? "Bet mielai suteiksime jums konsultaciją."
                      : "Padėsime, kad jūsų šventė būtų nepamirštama."}
                  </p>
                ) : (
                  sentTo && (
                    <>
                      <p ref={sentRef} tabIndex={-1} className="vaises-date-result-text">
                        Ačiū! Gavome jūsų užklausą.
                      </p>
                      {/* The date is already shown above; the contact sits apart so a typo is easy to spot. */}
                      <p className="vaises-date-sent-contact">
                        Susisieksime {describeContactLt(sentTo)}
                      </p>
                    </>
                  )
                )}
                <button type="button" className="vaises-date-link" onClick={changeDate}>
                  Keisti datą
                </button>
              </div>
            )}

            {step === "message" && (
              <div className="vaises-date-result vaises-date-step vaises-date-layer">
                {dateLine}
                <div className="vaises-date-form">
                  <label htmlFor={messageId} className="vaises-date-label">
                    Papasakokite trumpai apie savo šventę (nebūtina)
                  </label>
                  <textarea
                    id={messageId}
                    ref={messageRef}
                    className="vaises-date-input vaises-date-textarea"
                    value={message}
                    rows={4}
                    maxLength={MESSAGE_MAX_CHARS}
                    aria-invalid={messageTooLong}
                    aria-describedby={messageHintId}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <p
                    id={messageHintId}
                    className={`vaises-date-hint vaises-date-counter ${
                      messageTooLong ? "vaises-date-error" : ""
                    }`}
                  >
                    {messageWords} / {MESSAGE_MAX_WORDS} žodžių
                  </p>
                  {messageTooLong && (
                    <p className="vaises-date-error" role="alert">
                      Ne daugiau kaip {MESSAGE_MAX_WORDS} žodžių.
                    </p>
                  )}
                </div>
                <button type="button" className="vaises-date-link" onClick={() => goTo("result")}>
                  Atgal
                </button>
              </div>
            )}

            {step === "contact" && (
              <div className="vaises-date-result vaises-date-step vaises-date-layer">
                {dateLine}
                <form id={formId} className="vaises-date-form" noValidate onSubmit={handleSend}>
                  <label htmlFor={contactId} className="vaises-date-label">
                    Įveskite savo el. paštą arba telefono numerį ir mes su
                    jumis susisieksime.
                  </label>
                  <input
                    id={contactId}
                    ref={contactRef}
                    type="text"
                    className="vaises-date-input"
                    value={contact}
                    autoComplete="on"
                    // Email or phone: phone keyboards must not capitalise or "correct" an address.
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    maxLength={320}
                    aria-invalid={contactInvalid}
                    aria-describedby={contactInvalid ? contactErrorId : undefined}
                    onChange={(event) => handleContactChange(event.target.value)}
                  />
                  {contactInvalid && (
                    <p id={contactErrorId} className="vaises-date-error" role="alert">
                      Įveskite el. pašto adresą arba telefono numerį.
                    </p>
                  )}
                  {sendError && (
                    <p className="vaises-date-error" role="alert">
                      {sendError}
                    </p>
                  )}
                </form>
                <button type="button" className="vaises-date-link" onClick={() => goTo("message")}>
                  Atgal
                </button>
              </div>
            )}
          </div>

          <div className="vaises-date-below">
            {/* Always rendered (empty once the answer shows) so the buttons below never move. */}
            <p className="vaises-date-hint vaises-date-selection" aria-live="polite">
              {step !== "date" ? null : check.status === "error" ? (
                <span className="vaises-date-error" role="alert">
                  Nepavyko patikrinti datos. Bandykite dar kartą.
                </span>
              ) : selectedDate ? (
                formatLongDateLt(selectedDate)
              ) : (
                "Pasirinkite datą kalendoriuje"
              )}
            </p>
            <div className="vaises-date-actions">
              {step === "date" && (
                <button
                  type="button"
                  className="vaises-date-primary"
                  disabled={!selectedDate || check.status === "checking"}
                  onClick={handleCheck}
                >
                  {check.status === "checking" ? "Tikrinama…" : "Tikrinti"}
                </button>
              )}
              {step === "result" && (
                <button
                  type="button"
                  className="vaises-date-primary vaises-date-primary-delayed"
                  onClick={() => goTo("message")}
                >
                  Toliau
                </button>
              )}
              {step === "message" && (
                <button
                  type="button"
                  className="vaises-date-primary"
                  disabled={messageTooLong}
                  onClick={() => goTo("contact")}
                >
                  Toliau
                </button>
              )}
              {step === "contact" && (
                <button type="submit" form={formId} className="vaises-date-primary">
                  Siųsti užklausą
                </button>
              )}
              <button
                type="button"
                className="vaises-entry-detail-close"
                onClick={onClose}
              >
                Uždaryti
              </button>
            </div>
          </div>
        </div>
      </div>
      <Turnstile ref={turnstileRef} />
    </aside>
  );
}
