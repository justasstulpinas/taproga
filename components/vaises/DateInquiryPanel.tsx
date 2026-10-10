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
  buildMonthCells,
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
} from "@/services/vaises/dateInquiry";
import { withMinimumDuration } from "@/lib/withMinimumDuration";

// Long enough to read the "checking" state; with a real backend, slower responses aren't padded.
const MIN_CHECK_DISPLAY_MS = 900;
const MIN_SEND_DISPLAY_MS = 600;

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "result"; availability: DateAvailability }
  | { status: "error" };

type SendState = "idle" | "sending" | "sent" | "error";

type DateInquiryPanelProps = {
  id: string;
  isOpen: boolean;
  onClose: () => void;
};

export default function DateInquiryPanel({
  id,
  isOpen,
  onClose,
}: DateInquiryPanelProps) {
  const headingId = useId();
  const contactId = useId();
  const contactErrorId = useId();
  const formId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);

  // Set after mount so server and client render the same markup regardless of timezone.
  const [today, setToday] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<MonthCursor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const [contact, setContact] = useState("");
  const [contactInvalid, setContactInvalid] = useState(false);
  const [attemptedSend, setAttemptedSend] = useState(false);
  const [send, setSend] = useState<SendState>("idle");
  const [sentTo, setSentTo] = useState<ContactValue | null>(null);

  const showResult = check.status === "result";
  const calendarHidden = showResult || check.status === "checking";

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
    if (showResult) {
      contactRef.current?.focus({ preventScroll: true });
    }
  }, [showResult]);

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

  function resetInquiry() {
    setCheck({ status: "idle" });
    setSend("idle");
    setAttemptedSend(false);
    setContactInvalid(false);
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

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDate || check.status !== "result") return;
    setAttemptedSend(true);
    const parsed = parseContact(contact);
    if (!parsed) {
      setContactInvalid(true);
      return;
    }
    setContactInvalid(false);
    setSend("sending");
    try {
      await withMinimumDuration(
        submitDateInquiry({
          isoDate: toIsoDate(selectedDate),
          availability: check.availability,
          contact: parsed,
        }),
        MIN_SEND_DISPLAY_MS,
      );
      setSentTo(parsed);
      setSend("sent");
    } catch {
      setSend("error");
    }
  }

  const isReserved =
    check.status === "result" && check.availability === "reserved";

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
          {/* Calendar and answer share one fixed-size slot and crossfade in place. */}
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

            {check.status === "result" && selectedDate && (
              <div className="vaises-date-result vaises-date-layer" role="status">
                <p className="vaises-date-result-title">
                  {isReserved ? "Data jau rezervuota" : "Jūsų data laisva"}
                </p>
                <p className="vaises-date-hint vaises-date-result-date">
                  {formatLongDateLt(selectedDate)}
                </p>
                {!isReserved && (
                  <p className="vaises-date-result-text">
                    Padėsime, kad jūsų šventė būtų nepamirštama.
                  </p>
                )}
                {isReserved && (
                  <p className="vaises-date-result-text">
                    Bet mielai suteiksime jums konsultaciją.
                  </p>
                )}

                {send === "sent" && sentTo ? (
                  <p className="vaises-date-result-text">
                    {/* The date already ends in "d.", so it never sits before a full stop. */}
                    Ačiū! Gavome jūsų užklausą. Dėl {formatLongDateLt(selectedDate)}{" "}
                    susisieksime su jumis {describeContactLt(sentTo)}.
                  </p>
                ) : (
                  <form
                    id={formId}
                    className="vaises-date-form"
                    noValidate
                    onSubmit={handleSend}
                  >
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
                      aria-describedby={
                        contactInvalid ? contactErrorId : undefined
                      }
                      onChange={(event) =>
                        handleContactChange(event.target.value)
                      }
                    />
                    {contactInvalid && (
                      <p
                        id={contactErrorId}
                        className="vaises-date-error"
                        role="alert"
                      >
                        Įveskite el. pašto adresą arba telefono numerį.
                      </p>
                    )}
                    {send === "error" && (
                      <p className="vaises-date-error" role="alert">
                        Nepavyko išsiųsti. Bandykite dar kartą.
                      </p>
                    )}
                  </form>
                )}

                <button
                  type="button"
                  className="vaises-date-link"
                  onClick={changeDate}
                >
                  Keisti datą
                </button>
              </div>
            )}
          </div>

          <div className="vaises-date-below">
            {/* Always rendered (empty once the answer shows) so the buttons below never move. */}
            <p className="vaises-date-hint vaises-date-selection" aria-live="polite">
              {showResult ? null : check.status === "error" ? (
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
              {showResult ? (
                send !== "sent" && (
                  <button
                    type="submit"
                    form={formId}
                    className="vaises-date-primary vaises-date-primary-delayed"
                    disabled={send === "sending"}
                  >
                    {send === "sending" ? "Siunčiama…" : "Siųsti užklausą"}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="vaises-date-primary"
                  disabled={!selectedDate || check.status === "checking"}
                  onClick={handleCheck}
                >
                  {check.status === "checking" ? "Tikrinama…" : "Tikrinti"}
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
    </aside>
  );
}
