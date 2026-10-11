import { useMemo, useRef, useState } from "react";
import { parseIsoDate, vilniusTodayIso } from "@/lib/admin/vilniusToday";
import { adminLt } from "@/lib/i18n/admin.lt";
import {
  buildMonthCells,
  formatFullDateLt,
  formatLongDateLt,
  isSameDay,
  isSameMonth,
  LT_MONTHS,
  LT_WEEKDAYS_SHORT,
  shiftMonth,
  toIsoDate,
  type MonthCursor,
} from "@/lib/vaises/dateInquiry";
import { blockDate, unblockDate } from "@/services/admin/vaises";

const copy = adminLt.dates;
// The page loads this many months ahead of the current one; paging stops at the last loaded month.
const MONTHS_AHEAD = 12;

const NAV_CLASS =
  "inline-flex size-[2.95rem] items-center justify-center rounded-full text-xl hover:bg-[var(--line-soft)] disabled:opacity-30 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-dark)]";
const DAY_CLASS =
  "relative flex size-[2.95rem] items-center justify-center rounded-full border border-transparent text-sm hover:border-[var(--line-strong)] disabled:text-[var(--text-secondary)] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-dark)]";
const BLOCKED_CLASS =
  "bg-[var(--accent-dark)] text-[var(--bg-main)] hover:border-[var(--accent-dark)] line-through decoration-2";

type Props = { initialBlocked: string[]; month: MonthCursor };

export default function BlockedDatesCalendar({ initialBlocked, month }: Props) {
  const todayIso = useMemo(() => vilniusTodayIso(), []);
  const today = useMemo(() => parseIsoDate(todayIso), [todayIso]);
  const minMonth = useMemo(() => ({ year: today.getFullYear(), month: today.getMonth() }), [today]);
  const maxMonth = useMemo(() => shiftMonth(minMonth, MONTHS_AHEAD), [minMonth]);

  const [cursor, setCursor] = useState<MonthCursor>(month);
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(() => new Set(initialBlocked));
  const [error, setError] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const inFlight = useRef(new Set<string>());

  const cells = buildMonthCells(cursor, today);
  const upcoming = [...blocked].filter((iso) => iso >= todayIso).sort();

  function setDate(iso: string, isBlocked: boolean) {
    setBlocked((current) => {
      const next = new Set(current);
      if (isBlocked) next.add(iso);
      else next.delete(iso);
      return next;
    });
  }

  async function toggle(date: Date) {
    const iso = toIsoDate(date);
    if (inFlight.current.has(iso)) return;
    const wasBlocked = blocked.has(iso);
    inFlight.current.add(iso);
    setError(null);
    setDate(iso, !wasBlocked);
    try {
      if (wasBlocked) await unblockDate(iso);
      else await blockDate(iso, crypto.randomUUID());
    } catch {
      setDate(iso, wasBlocked);
      const failure = wasBlocked ? copy.unblockFailed : copy.blockFailed;
      setError(failure(formatLongDateLt(date)));
      buttons.current.get(iso)?.focus();
    } finally {
      inFlight.current.delete(iso);
    }
  }

  return (
    <div className="space-y-6">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            aria-label={copy.previousMonth}
            disabled={isSameMonth(cursor, minMonth)}
            onClick={() => setCursor(shiftMonth(cursor, -1))}
            className={NAV_CLASS}
          >
            ‹
          </button>
          <h2 aria-live="polite" className="text-base">
            {LT_MONTHS[cursor.month]} {cursor.year}
          </h2>
          <button
            type="button"
            aria-label={copy.nextMonth}
            disabled={isSameMonth(cursor, maxMonth)}
            onClick={() => setCursor(shiftMonth(cursor, 1))}
            className={NAV_CLASS}
          >
            ›
          </button>
        </div>
        <div aria-hidden="true" className="grid grid-cols-7 justify-items-center pb-2 text-xs text-[var(--text-secondary)]">
          {LT_WEEKDAYS_SHORT.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 justify-items-center gap-y-1">
          {cells.map((cell) => {
            if (cell.kind === "blank") return <span key={cell.key} aria-hidden="true" />;
            const iso = toIsoDate(cell.date);
            const isBlocked = blocked.has(iso);
            return (
              <button
                key={cell.key}
                ref={(node) => {
                  if (node) buttons.current.set(iso, node);
                  else buttons.current.delete(iso);
                }}
                type="button"
                disabled={cell.isPast}
                aria-pressed={isBlocked}
                aria-label={formatFullDateLt(cell.date)}
                aria-current={isSameDay(cell.date, today) ? "date" : undefined}
                onClick={() => void toggle(cell.date)}
                className={`${DAY_CLASS} ${isBlocked ? BLOCKED_CLASS : ""}`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm">
            {error}
          </p>
        )}
      </div>

      <section aria-labelledby="upcoming-blocked">
        <h2 id="upcoming-blocked" className="mb-2 text-base">
          {copy.upcomingTitle}
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">{copy.empty}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {upcoming.map((iso) => (
              <li key={iso}>{formatLongDateLt(parseIsoDate(iso))}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
