import type { GetServerSideProps } from "next";
import Head from "next/head";
import AdminLayout from "../../../components/admin/AdminLayout";
import BlockedDatesCalendar from "../../../components/admin/vaises/BlockedDatesCalendar";
import { requireSuperadmin } from "@/lib/admin/requireSuperadmin";
import { serverApiFetch } from "@/lib/admin/serverApi";
import { parseIsoDate, vilniusTodayIso } from "@/lib/admin/vilniusToday";
import { adminLt } from "@/lib/i18n/admin.lt";
import { shiftMonth, toIsoDate, type MonthCursor } from "@/lib/vaises/dateInquiry";

const copy = adminLt.dates;
// The calendar pages from the current month through this many months ahead.
const MONTHS_AHEAD = 12;

type Props = { blocked: string[]; month: MonthCursor; loadFailed: boolean };

export default function BlockedDatesPage({ blocked, month, loadFailed }: Props) {
  return (
    <AdminLayout>
      <Head>
        <title>{copy.title}</title>
      </Head>
      <h1 className="mb-1 text-xl">{copy.title}</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">{copy.intro}</p>
      {loadFailed && (
        <p role="alert" className="mb-4 text-sm">
          {copy.loadFailed}
        </p>
      )}
      <BlockedDatesCalendar initialBlocked={blocked} month={month} />
    </AdminLayout>
  );
}

async function loadBlocked(from: string, to: string, cookie: string | undefined): Promise<string[] | null> {
  try {
    const response = await serverApiFetch(
      `/admin/vaises/blocked-dates?from=${from}&to=${to}`,
      cookie,
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as { date: string }[];
    return rows.map((row) => row.date);
  } catch {
    return null;
  }
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const guard = await requireSuperadmin(ctx);
  if ("redirect" in guard) return guard;

  const todayIso = vilniusTodayIso();
  const today = parseIsoDate(todayIso);
  const month = { year: today.getFullYear(), month: today.getMonth() };
  const last = shiftMonth(month, MONTHS_AHEAD + 1);
  const to = toIsoDate(new Date(last.year, last.month, 0));

  const blocked = await loadBlocked(todayIso, to, ctx.req.headers.cookie);
  return { props: { blocked: blocked ?? [], month, loadFailed: blocked === null } };
};
