import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { describeContactLt, parseContact, type ContactValue } from "@/lib/vaises/dateInquiry";
import { withMinimumDuration } from "@/lib/withMinimumDuration";
import { submitConsultationRequest } from "@/services/vaises/dateInquiry";

const MIN_SEND_DISPLAY_MS = 600;

type SendState = "idle" | "sending" | "sent" | "error";

type ConsultationPanelProps = {
  id: string;
  isOpen: boolean;
  onClose: () => void;
};

/** Left side panel with only the contact step; shares DateInquiryPanel's styles and motion. */
export default function ConsultationPanel({ id, isOpen, onClose }: ConsultationPanelProps) {
  const headingId = useId();
  const contactId = useId();
  const contactErrorId = useId();
  const formId = useId();
  const contactRef = useRef<HTMLInputElement>(null);

  const [contact, setContact] = useState("");
  const [contactInvalid, setContactInvalid] = useState(false);
  const [attemptedSend, setAttemptedSend] = useState(false);
  const [send, setSend] = useState<SendState>("idle");
  const [sentTo, setSentTo] = useState<ContactValue | null>(null);

  useEffect(() => {
    if (isOpen) {
      contactRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen]);

  function handleContactChange(value: string) {
    setContact(value);
    // Validate live only once the user has tried to send, so typing isn't nagged mid-entry.
    if (attemptedSend) {
      setContactInvalid(parseContact(value) === null);
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttemptedSend(true);
    const parsed = parseContact(contact);
    if (!parsed) {
      setContactInvalid(true);
      return;
    }
    setContactInvalid(false);
    setSend("sending");
    try {
      await withMinimumDuration(submitConsultationRequest(parsed), MIN_SEND_DISPLAY_MS);
      setSentTo(parsed);
      setSend("sent");
    } catch {
      setSend("error");
    }
  }

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
        <div className="vaises-date-group vaises-consult">
          <p id={headingId} className="vaises-date-result-title">
            Susisiekime
          </p>

          {send === "sent" && sentTo ? (
            <p className="vaises-date-result-text">
              Ačiū! Susisieksime su jumis {describeContactLt(sentTo)}.
            </p>
          ) : (
            <form id={formId} className="vaises-date-form" noValidate onSubmit={handleSend}>
              <label htmlFor={contactId} className="vaises-date-label">
                Įveskite savo el. paštą arba telefono numerį ir mes su jumis susisieksime.
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
              {/* Always rendered so a message appearing never shifts the buttons. */}
              <p id={contactErrorId} className="vaises-date-error vaises-consult-message" role="alert">
                {contactInvalid
                  ? "Įveskite el. pašto adresą arba telefono numerį."
                  : send === "error"
                    ? "Nepavyko išsiųsti. Bandykite dar kartą."
                    : ""}
              </p>
            </form>
          )}

          <div className="vaises-date-actions">
            {send !== "sent" && (
              <button
                type="submit"
                form={formId}
                className="vaises-date-primary"
                disabled={send === "sending"}
              >
                {send === "sending" ? "Siunčiama…" : "Siųsti užklausą"}
              </button>
            )}
            <button type="button" className="vaises-entry-detail-close" onClick={onClose}>
              Uždaryti
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
