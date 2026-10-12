import type { GetServerSideProps } from "next";
import Head from "next/head";
import AdminLayout from "../../../components/admin/AdminLayout";
import RequestsList from "../../../components/admin/vaises/RequestsList";
import { requireSuperadmin } from "@/lib/admin/requireSuperadmin";
import { serverApiFetch } from "@/lib/admin/serverApi";
import { adminLt } from "@/lib/i18n/admin.lt";
import type { VaisesRequestOut, VaisesRequestPage, VaisesRequestStatus } from "@/services/admin/vaises";

const copy = adminLt.requests;
const REQUESTS = "/admin/vaises/requests";

type Props = {
  initialTab: VaisesRequestStatus;
  initialPage: VaisesRequestPage | null;
  highlightId: string | null;
  highlighted: VaisesRequestOut | null;
};

export default function RequestsPage(props: Props) {
  return (
    <AdminLayout>
      <Head>
        <title>{copy.title}</title>
      </Head>
      <div className="admin-page-head">
        <h1 className="admin-page-title">{copy.title}</h1>
      </div>
      <RequestsList {...props} />
    </AdminLayout>
  );
}

async function fetchJson<T>(path: string, cookie: string | undefined): Promise<T | null> {
  try {
    const response = await serverApiFetch(path, cookie);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const guard = await requireSuperadmin(ctx);
  if ("redirect" in guard) return guard;

  const cookie = ctx.req.headers.cookie;
  const highlightId = typeof ctx.query.id === "string" ? ctx.query.id : null;
  const highlighted = highlightId
    ? await fetchJson<VaisesRequestOut>(`${REQUESTS}/${encodeURIComponent(highlightId)}`, cookie)
    : null;
  const initialTab = highlighted?.status ?? "new";
  const initialPage = await fetchJson<VaisesRequestPage>(`${REQUESTS}?status=${initialTab}`, cookie);
  return { props: { initialTab, initialPage, highlightId, highlighted } };
};
