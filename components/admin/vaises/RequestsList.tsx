import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSessionExpiry } from "@/lib/admin/sessionExpiry";
import { adminLt } from "@/lib/i18n/admin.lt";
import {
  erase,
  listRequests,
  markHandled,
  reopen,
  type VaisesRequestOut,
  type VaisesRequestPage,
  type VaisesRequestStatus,
} from "@/services/admin/vaises";

const copy = adminLt.requests;
const UNDO_WINDOW_MS = 5000;
const TABS: readonly VaisesRequestStatus[] = ["new", "handled"];
const TAB_LABELS: Record<VaisesRequestStatus, string> = { new: copy.tabNew, handled: copy.tabHandled };
const EMPTY_LABELS: Record<VaisesRequestStatus, string> = { new: copy.emptyNew, handled: copy.emptyHandled };
const SKELETON_ROWS = 3;

const arrival = new Intl.DateTimeFormat("lt-LT", {
  timeZone: "Europe/Vilnius",
  dateStyle: "medium",
  timeStyle: "short",
});

type ListState = { items: VaisesRequestOut[]; next: string | null; loaded: boolean; busy: boolean; failed: boolean };
type Lists = Record<VaisesRequestStatus, ListState>;
type Notice =
  | { key: number; kind: "undo"; request: VaisesRequestOut }
  | { key: number; kind: "error"; text: string };

type NewNotice = Notice extends infer N ? (N extends { key: number } ? Omit<N, "key"> : never) : never;

type Props = {
  initialTab: VaisesRequestStatus;
  initialPage: VaisesRequestPage | null;
  highlightId: string | null;
  highlighted: VaisesRequestOut | null;
};

const emptyList = (): ListState => ({ items: [], next: null, loaded: false, busy: false, failed: false });

function byNewest(a: VaisesRequestOut, b: VaisesRequestOut): number {
  return Date.parse(b.created_at) - Date.parse(a.created_at);
}

function withRequest(items: VaisesRequestOut[], request: VaisesRequestOut): VaisesRequestOut[] {
  return [...items.filter((item) => item.id !== request.id), request].sort(byNewest);
}

function initialLists({ initialTab, initialPage, highlighted }: Props): Lists {
  const lists: Lists = { new: emptyList(), handled: emptyList() };
  if (initialPage === null) {
    lists[initialTab].failed = true;
    return lists;
  }
  const items = highlighted?.status === initialTab ? withRequest(initialPage.items, highlighted) : initialPage.items;
  lists[initialTab] = { items, next: initialPage.next_cursor, loaded: true, busy: false, failed: false };
  return lists;
}

function nameOf(request: VaisesRequestOut): string {
  return request.event_date_label ?? copy.consultationName;
}

function contactHref(request: VaisesRequestOut): string {
  return `${request.contact_kind === "email" ? "mailto:" : "tel:"}${request.contact}`;
}

function Skeleton() {
  return (
    <ul role="status" aria-label={copy.loading} className="admin-skeleton">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <li key={index} aria-hidden="true" />
      ))}
    </ul>
  );
}

function EraseDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    // showModal focuses the first focusable element; make the safe choice the default.
    cancelRef.current?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="erase-title"
      onClose={onClose}
      className="admin-dialog"
    >
      <h2 id="erase-title">{copy.eraseTitle}</h2>
      <p>{copy.eraseBody}</p>
      <div className="admin-dialog-actions">
        <button type="button" ref={cancelRef} onClick={() => ref.current?.close()} className="admin-btn">
          {copy.eraseCancel}
        </button>
        <button type="button" onClick={onConfirm} className="admin-btn admin-btn--danger">
          {copy.eraseConfirm}
        </button>
      </div>
    </dialog>
  );
}

type RowProps = {
  request: VaisesRequestOut;
  highlighted: boolean;
  onHandle: (request: VaisesRequestOut) => void;
  onErase: (request: VaisesRequestOut) => void;
};

function RequestRow({ request, highlighted, onHandle, onErase }: RowProps) {
  const kind = request.service
    ? copy.serviceLabels[request.service]
    : request.kind === "date_inquiry"
      ? copy.kindDateInquiry
      : copy.kindConsultation;
  const availability =
    request.availability_at_submit === "available"
      ? copy.availabilityAvailable
      : request.availability_at_submit === "reserved"
        ? copy.availabilityReserved
        : null;
  const erased = request.anonymised_at !== null;
  return (
    <li
      id={`request-${request.id}`}
      aria-label={request.event_date_label ? `${kind}, ${request.event_date_label}` : kind}
      data-highlighted={highlighted ? "true" : undefined}
      className="admin-request"
    >
      <div className="admin-request-body">
        {request.event_date_label ? (
          <>
            <p className="admin-request-kind">{kind}</p>
            <p className="admin-request-date">{request.event_date_label}</p>
          </>
        ) : (
          <p className="admin-request-date">{kind}</p>
        )}
        <p className="admin-request-meta">
          {availability && (
            <span className={`admin-status admin-status--${request.availability_at_submit}`}>
              {copy.availabilityLabel}: {availability}
            </span>
          )}
          <span>
            {copy.receivedLabel}: {arrival.format(new Date(request.created_at))}
          </span>
        </p>
        {!erased && request.message && (
          // Visitor text: always a text node, never markup.
          <p className="admin-request-message">{request.message}</p>
        )}
        {erased || request.contact === null ? (
          <p className="admin-muted">{copy.contactErased}</p>
        ) : (
          <a href={contactHref(request)} className="admin-contact">
            {request.contact}
          </a>
        )}
      </div>
      <div className="admin-request-actions">
        {request.status === "new" && (
          <button type="button" onClick={() => onHandle(request)} className="admin-btn admin-btn--primary">
            {copy.markHandled}
          </button>
        )}
        {!erased && (
          <button type="button" onClick={() => onErase(request)} className="admin-link-btn admin-link-btn--danger">
            {copy.erase}
          </button>
        )}
      </div>
    </li>
  );
}

export default function RequestsList(props: Props) {
  const { initialTab, highlightId } = props;
  const [tab, setTab] = useState<VaisesRequestStatus>(initialTab);
  const [lists, setLists] = useState<Lists>(() => initialLists(props));
  const [notices, setNotices] = useState<Notice[]>([]);
  const [erasing, setErasing] = useState<VaisesRequestOut | null>(null);
  const [undoPending, setUndoPending] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const undoIntents = useRef(new Set<string>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const noticeKey = useRef(0);
  const onSessionExpired = useSessionExpiry();

  useEffect(() => {
    if (highlightId) document.getElementById(`request-${highlightId}`)?.scrollIntoView?.({ block: "center" });
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, [highlightId]);

  function patch(status: VaisesRequestStatus, update: (list: ListState) => ListState) {
    setLists((current) => ({ ...current, [status]: update(current[status]) }));
  }

  // A tab that has not been fetched yet will load fresh from the server, so only loaded lists are edited.
  function place(request: VaisesRequestOut) {
    patch(request.status, (list) => (list.loaded ? { ...list, items: withRequest(list.items, request) } : list));
  }

  function remove(status: VaisesRequestStatus, id: string) {
    patch(status, (list) => ({ ...list, items: list.items.filter((item) => item.id !== id) }));
  }

  function begin(id: string): boolean {
    if (inFlight.current.has(id)) return false;
    inFlight.current.add(id);
    return true;
  }

  function finish(id: string) {
    inFlight.current.delete(id);
  }

  function setUndoIntent(id: string, pending: boolean) {
    if (pending) undoIntents.current.add(id);
    else undoIntents.current.delete(id);
    setUndoPending(new Set(undoIntents.current));
  }

  function addNotice(notice: NewNotice): number {
    const key = ++noticeKey.current;
    setNotices((current) => [...current, { ...notice, key }]);
    return key;
  }

  function dismiss(key: number) {
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    setNotices((current) => current.filter((notice) => notice.key !== key));
  }

  function fail(text: string) {
    addNotice({ kind: "error", text });
  }

  async function load(status: VaisesRequestStatus) {
    const list = lists[status];
    if (list.busy) return;
    patch(status, (current) => ({ ...current, busy: true, failed: false }));
    try {
      const page = await listRequests(status, list.loaded ? (list.next ?? undefined) : undefined);
      patch(status, (current) => {
        const known = new Set(current.items.map((item) => item.id));
        const fresh = page.items.filter((item) => !known.has(item.id));
        return { items: [...current.items, ...fresh], next: page.next_cursor, loaded: true, busy: false, failed: false };
      });
    } catch (caught) {
      patch(status, (current) => ({ ...current, busy: false, failed: true }));
      onSessionExpired(caught);
    }
  }

  function select(status: VaisesRequestStatus) {
    setTab(status);
    const list = lists[status];
    if (!list.loaded && !list.busy && !list.failed) void load(status);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const next = TABS[(TABS.indexOf(tab) + 1) % TABS.length];
    select(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  async function handle(request: VaisesRequestOut) {
    if (!begin(request.id)) return;
    remove("new", request.id);
    const key = addNotice({ kind: "undo", request });
    // A queued undo keeps its notice on screen until the handled call settles.
    timers.current.set(key, setTimeout(() => !undoIntents.current.has(request.id) && dismiss(key), UNDO_WINDOW_MS));
    try {
      place(await markHandled(request.id));
    } catch (caught) {
      setUndoIntent(request.id, false);
      dismiss(key);
      place(request);
      fail(copy.handleFailed(nameOf(request)));
      onSessionExpired(caught);
      return;
    } finally {
      finish(request.id);
    }
    if (undoIntents.current.has(request.id)) {
      setUndoIntent(request.id, false);
      await undo({ key, kind: "undo", request });
    }
  }

  async function undo(notice: Extract<Notice, { kind: "undo" }>) {
    const { request } = notice;
    if (inFlight.current.has(request.id)) {
      setUndoIntent(request.id, true);
      return;
    }
    begin(request.id);
    dismiss(notice.key);
    remove("handled", request.id);
    place(request);
    try {
      place(await reopen(request.id));
    } catch (caught) {
      remove("new", request.id);
      place({ ...request, status: "handled" });
      fail(copy.reopenFailed(nameOf(request)));
      onSessionExpired(caught);
    } finally {
      finish(request.id);
    }
  }

  async function confirmErase() {
    const request = erasing;
    setErasing(null);
    if (!request || !begin(request.id)) return;
    place({ ...request, contact: null, contact_kind: null, message: null, anonymised_at: new Date().toISOString() });
    try {
      place(await erase(request.id));
    } catch (caught) {
      place(request);
      fail(copy.eraseFailed(nameOf(request)));
      onSessionExpired(caught);
    } finally {
      finish(request.id);
    }
  }

  const list = lists[tab];
  const showEmpty = list.loaded && !list.busy && list.items.length === 0;

  return (
    <div>
      <div role="tablist" aria-label={copy.tabsLabel} className="admin-tabs">
        {TABS.map((status) => (
          <button
            key={status}
            id={`tab-${status}`}
            type="button"
            role="tab"
            aria-selected={tab === status}
            aria-controls="requests-panel"
            tabIndex={tab === status ? 0 : -1}
            onClick={() => select(status)}
            onKeyDown={onTabKeyDown}
            className="admin-tab"
          >
            {TAB_LABELS[status]}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="admin-notices">
        {notices.map((notice) =>
          notice.kind === "undo" ? (
            <p key={notice.key} role="status" className="admin-notice">
              <span>{copy.handledNotice}</span>
              <button
                type="button"
                aria-busy={undoPending.has(notice.request.id) ? true : undefined}
                onClick={() => void undo(notice)}
                className="admin-link-btn"
              >
                {undoPending.has(notice.request.id) ? copy.undoing : copy.undo}
              </button>
            </p>
          ) : (
            <p key={notice.key} role="alert" className="admin-notice admin-notice--error">
              {notice.text}
            </p>
          ),
        )}
      </div>

      <div id="requests-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {list.items.length > 0 && (
          <ul className="admin-requests">
            {list.items.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                highlighted={request.id === highlightId}
                onHandle={(target) => void handle(target)}
                onErase={setErasing}
              />
            ))}
          </ul>
        )}
        {list.busy && <Skeleton />}
        {showEmpty && <p className="admin-empty">{EMPTY_LABELS[tab]}</p>}
        {list.failed && (
          <div role="alert" className="admin-failed">
            <p className="admin-alert">{copy.loadFailed}</p>
            <button type="button" onClick={() => void load(tab)} className="admin-btn">
              {copy.retry}
            </button>
          </div>
        )}
        {list.loaded && !list.busy && !list.failed && list.next !== null && (
          <button type="button" onClick={() => void load(tab)} className="admin-btn admin-more">
            {copy.showMore}
          </button>
        )}
      </div>

      {erasing && <EraseDialog onConfirm={() => void confirmErase()} onClose={() => setErasing(null)} />}
    </div>
  );
}
