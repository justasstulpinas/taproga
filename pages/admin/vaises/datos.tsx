import type { GetServerSideProps } from "next";
import Head from "next/head";
import AdminLayout from "../../../components/admin/AdminLayout";
import BlockedDatesCalendar from "../../../components/admin/vaises/BlockedDatesCalendar";
import { requireSuperadmin } from "@/lib/admin/requireSuperadmin";
import { addDaysIso, BLOCKED_RANGE_DAYS, monthOfIso } from "@/lib/admin/bookingWindow";
import { serverApiFetch } from "@/lib/admin/serverApi";
import { vilniusTodayIso } from "@/lib/admin/vilniusToday";
import { adminLt } from "@/lib/i18n/admin.lt";
import type { MonthCursor } from "@/lib/vaises/dateInquiry";

const copy = adminLt.dates;

type Props = { blocked: string[]; month: MonthCursor; through: string | null };

export default function BlockedDatesPage({ blocked, month, through }: Props) {
  return (
    <AdminLayout>
      <Head>
        <title>{copy.title}</title>
      </Head>
      <h1 className="mb-1 text-xl">{copy.title}</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">{copy.intro}</p>
      {through === null && (
        <p role="alert" className="mb-4 text-sm">
          {copy.loadFailed}
        </p>
      )}
      <BlockedDatesCalendar initialBlocked={blocked} month={month} through={through} />
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

  // One call, as long as the API allows: it fills the first ~13 months and the upcoming list.
  // The calendar fetches later months, up to the booking window end, as they are visited.
  const todayIso = vilniusTodayIso();
  const to = addDaysIso(todayIso, BLOCKED_RANGE_DAYS);

  const blocked = await loadBlocked(todayIso, to, ctx.req.headers.cookie);
  return { props: { blocked: blocked ?? [], month: monthOfIso(todayIso), through: blocked === null ? null : to } };
};
