import { useEffect, useMemo, useRef, useState } from "react";
import { bookingWindowEndIso, monthOfIso, monthRangeIso } from "@/lib/admin/bookingWindow";
import { useSessionExpiry } from "@/lib/admin/sessionExpiry";
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
import { blockDate, listBlockedDates, unblockDate } from "@/services/admin/vaises";

const copy = adminLt.dates;
const weekday = new Intl.DateTimeFormat("lt-LT", { weekday: "long" });

type MonthStatus = "loading" | "loaded" | "failed";

type Props = {
  initialBlocked: string[];
  month: MonthCursor;
  /** Last date the server load covered (it starts today), or null when that load failed. */
  through: string | null;
};

const monthKey = (cursor: MonthCursor): string => `${cursor.year}-${cursor.month}`;
const monthLabel = (cursor: MonthCursor): string => `${LT_MONTHS[cursor.month]} ${cursor.year}`;

/** Months the server load fully covers; the current month only matters from today on. */
function coveredMonths(from: MonthCursor, through: string | null): Record<string, MonthStatus> {
  const covered: Record<string, MonthStatus> = {};
  if (through === null) return covered;
  for (let cursor = from; monthRangeIso(cursor).to <= through; cursor = shiftMonth(cursor, 1)) {
    covered[monthKey(cursor)] = "loaded";
  }
  return covered;
}

export default function BlockedDatesCalendar({ initialBlocked, month, through }: Props) {
  const todayIso = useMemo(() => vilniusTodayIso(), []);
  const today = useMemo(() => parseIsoDate(todayIso), [todayIso]);
  const windowEndIso = useMemo(() => bookingWindowEndIso(todayIso), [todayIso]);
  const minMonth = useMemo(() => monthOfIso(todayIso), [todayIso]);
  const maxMonth = useMemo(() => monthOfIso(windowEndIso), [windowEndIso]);
  const onSessionExpired = useSessionExpiry();

  const [cursor, setCursor] = useState<MonthCursor>(month);
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(() => new Set(initialBlocked));
  const [months, setMonths] = useState<Record<string, MonthStatus>>(() => coveredMonths(minMonth, through));
  const [error, setError] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const inFlight = useRef(new Set<string>());
  const requested = useRef(new Set(Object.keys(months)));

  const cells = buildMonthCells(cursor, today);
  const status = months[monthKey(cursor)];
  // Only the server-loaded range is complete; later months are known only once visited.
  const upcoming = through === null ? null : [...blocked].filter((iso) => iso >= todayIso && iso <= through).sort();

  function setDate(iso: string, isBlocked: boolean) {
    setBlocked((current) => {
      const next = new Set(current);
      if (isBlocked) next.add(iso);
      else next.delete(iso);
      return next;
    });
  }

  async function loadMonth(target: MonthCursor) {
    const key = monthKey(target);
    requested.current.add(key);
    setMonths((current) => ({ ...current, [key]: "loading" }));
    try {
      const { from, to } = monthRangeIso(target);
      const dates = await listBlockedDates(from, to);
      setBlocked((current) => new Set([...current, ...dates]));
      setMonths((current) => ({ ...current, [key]: "loaded" }));
    } catch (caught) {
      requested.current.delete(key);
      setMonths((current) => ({ ...current, [key]: "failed" }));
      onSessionExpired(caught);
    }
  }

  useEffect(() => {
    // loadMonth only touches refs and state setters, so the cursor alone decides whether to fetch.
    if (!requested.current.has(monthKey(cursor))) void loadMonth(cursor);
  }, [cursor]);

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
    } catch (caught) {
      setDate(iso, wasBlocked);
      const failure = wasBlocked ? copy.unblockFailed : copy.blockFailed;
      setError(failure(formatLongDateLt(date)));
      buttons.current.get(iso)?.focus();
      onSessionExpired(caught);
    } finally {
      inFlight.current.delete(iso);
    }
  }

  return (
    <div className="admin-dates">
      <div>
        <div className="admin-calendar-head">
          <button
            type="button"
            aria-label={copy.previousMonth}
            disabled={isSameMonth(cursor, minMonth)}
            onClick={() => setCursor(shiftMonth(cursor, -1))}
            className="admin-calendar-nav"
          >
            ‹
          </button>
          <h2 aria-live="polite" className="admin-calendar-title">
            {monthLabel(cursor)}
          </h2>
          <button
            type="button"
            aria-label={copy.nextMonth}
            disabled={isSameMonth(cursor, maxMonth)}
            onClick={() => setCursor(shiftMonth(cursor, 1))}
            className="admin-calendar-nav"
          >
            ›
          </button>
        </div>
        <div aria-hidden="true" className="admin-weekdays">
          {LT_WEEKDAYS_SHORT.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {status === "loaded" ? (
          <div className="admin-days">
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
                  disabled={cell.isPast || iso > windowEndIso}
                  aria-pressed={isBlocked}
                  aria-label={formatFullDateLt(cell.date)}
                  aria-current={isSameDay(cell.date, today) ? "date" : undefined}
                  onClick={() => void toggle(cell.date)}
                  className={isBlocked ? "admin-day admin-day--blocked" : "admin-day"}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        ) : status === "failed" ? (
          <div role="alert" className="admin-calendar-failed">
            <p className="admin-alert">{copy.monthLoadFailed(monthLabel(cursor))}</p>
            <button type="button" onClick={() => void loadMonth(cursor)} className="admin-btn">
              {copy.retry}
            </button>
          </div>
        ) : (
          <div role="status" className="admin-calendar-placeholder">
            <span className="admin-sr-only">{copy.loading}</span>
          </div>
        )}
        {error && (
          <p role="alert" className="admin-alert admin-calendar-error">
            {error}
          </p>
        )}
      </div>

      <section aria-labelledby="upcoming-blocked" className="admin-upcoming">
        <h2 id="upcoming-blocked">{copy.upcomingTitle}</h2>
        {upcoming === null ? (
          <p className="admin-muted">{copy.upcomingUnavailable}</p>
        ) : upcoming.length === 0 ? (
          <p className="admin-muted">{copy.empty}</p>
        ) : (
          <ol>
            {upcoming.map((iso) => {
              const date = parseIsoDate(iso);
              return (
                <li key={iso}>
                  <span>{formatLongDateLt(date)}</span>
                  <span className="admin-upcoming-weekday">{weekday.format(date)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
