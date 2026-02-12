import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { supabaseClient } from "@/infra/supabase.client";
import { ServiceError } from "@/shared/errors";

type HostEvent = {
  id: string;
  title: string;
  state: string;
  event_date: string | null;
  slug: string;
  host_email: string | null;
};

type PageProps = {
  event: HostEvent;
};

function redirectToLogin() {
  return {
    redirect: {
      destination: "/login",
      permanent: false,
    },
  } as const;
}

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) {
        return acc;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

function tryParseAccessToken(value: string): string | null {
  const decoded = decodeURIComponent(value);
  const unquoted =
    decoded.startsWith('"') && decoded.endsWith('"')
      ? decoded.slice(1, -1)
      : decoded;

  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(unquoted)) {
    return unquoted;
  }

  try {
    const parsed = JSON.parse(unquoted) as
      | { access_token?: string; currentSession?: { access_token?: string } }
      | [string, string?]
      | null;

    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0];
    }

    if (parsed && typeof parsed === "object") {
      if (
        "access_token" in parsed &&
        typeof parsed.access_token === "string"
      ) {
        return parsed.access_token;
      }
      if (
        "currentSession" in parsed &&
        parsed.currentSession &&
        typeof parsed.currentSession.access_token === "string"
      ) {
        return parsed.currentSession.access_token;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function getSupabaseAccessToken(cookieHeader?: string): string | null {
  const cookies = parseCookieHeader(cookieHeader);

  if (typeof cookies["sb-access-token"] === "string") {
    return cookies["sb-access-token"];
  }

  const chunkedBases = new Set<string>();
  Object.keys(cookies).forEach((key) => {
    const chunkMatch = key.match(/^(.*)\.\d+$/);
    if (chunkMatch) {
      chunkedBases.add(chunkMatch[1]);
    }
  });

  const candidates: string[] = [];

  chunkedBases.forEach((base) => {
    const chunks = Object.keys(cookies)
      .filter((key) => key.startsWith(`${base}.`))
      .sort((a, b) => {
        const ai = Number(a.slice(base.length + 1));
        const bi = Number(b.slice(base.length + 1));
        return ai - bi;
      })
      .map((key) => cookies[key]);

    if (chunks.length > 0) {
      candidates.push(chunks.join(""));
    }
  });

  Object.entries(cookies).forEach(([key, value]) => {
    if (/^sb-.*-auth-token$/.test(key) || key === "supabase-auth-token") {
      candidates.push(value);
    }
  });

  for (const candidate of candidates) {
    const parsedToken = tryParseAccessToken(candidate);
    if (parsedToken) {
      return parsedToken;
    }
  }

  return null;
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const id = ctx.params?.id;
  if (typeof id !== "string" || !id.trim()) {
    return { notFound: true };
  }

  try {
    const accessToken = getSupabaseAccessToken(ctx.req.headers.cookie);
    if (!accessToken) {
      return redirectToLogin();
    }

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(
      accessToken
    );

    if (userError || !userData.user?.email) {
      return redirectToLogin();
    }

    const sessionEmail = userData.user.email.toLowerCase();

    const { data: event, error: eventError } = await supabaseClient
      .from("events")
      .select("id,title,state,event_date,slug,host_email")
      .eq("id", id)
      .single();

    if (eventError) {
      if (eventError.code === "PGRST116") {
        return { notFound: true };
      }
      throw new ServiceError("SUPABASE_ERROR", eventError.message, eventError);
    }

    if (!event) {
      return { notFound: true };
    }

    if ((event.host_email ?? "").toLowerCase() !== sessionEmail) {
      return { notFound: true };
    }

    return {
      props: {
        event: event as HostEvent,
      },
    };
  } catch (error: unknown) {
    if (error instanceof ServiceError && error.code === "UNAUTHENTICATED") {
      return redirectToLogin();
    }

    return { notFound: true };
  }
};

export default function HostEventDetailPage({
  event,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const parsedDate = event.event_date ? new Date(event.event_date) : null;
  const eventDateText =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleString()
      : "N/A";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/host" className="inline-block rounded border px-3 py-1.5 text-sm">
        Back to host
      </Link>

      <h1 className="text-2xl font-semibold">{event.title}</h1>

      <dl className="space-y-3">
        <div>
          <dt className="text-sm text-gray-500">State</dt>
          <dd className="font-medium">{event.state}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Date</dt>
          <dd className="font-medium">{eventDateText}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Slug</dt>
          <dd className="font-medium">{event.slug}</dd>
        </div>
      </dl>
    </main>
  );
}
