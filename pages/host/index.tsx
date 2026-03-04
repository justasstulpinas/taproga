import type { GetServerSideProps } from "next";
import { createSupabaseServerClient } from "@/infra/supabase.server";

function redirectToLogin() {
  return {
    redirect: {
      destination: "/login",
      permanent: false,
    },
  } as const;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const supabase = createSupabaseServerClient(ctx);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return redirectToLogin();
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const hostEmail = user?.email?.trim().toLowerCase();
  if (userError || !hostEmail) {
    return redirectToLogin();
  }

  const { data: existingEvent, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("host_email", hostEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError) {
    return {
      redirect: {
        destination: "/host/onboarding",
        permanent: false,
      },
    };
  }

  if (!existingEvent?.id) {
    return {
      redirect: {
        destination: "/host/onboarding",
        permanent: false,
      },
    };
  }

  return {
    redirect: {
      destination: `/host/${existingEvent.id}`,
      permanent: false,
    },
  };
};

export default function HostEntryRoute() {
  return null;
}
