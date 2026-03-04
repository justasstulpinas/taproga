import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import GuestLayout from "../../components/layout/GuestLayout";
import DesktopWarning from "../../components/layout/DesktopWarning";
import Button from "../../components/ui/Button";
import { supabase } from "@/infra/supabase.client";

type EntryEvent = {
  id: string;
  title: string;
  slug: string;
  state: string;
  guest_access_enabled: boolean;
};

type Props = {
  event: EntryEvent;
};

export default function GuestEntryPage({ event }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [selectedPhrase, setSelectedPhrase] = useState<string | null>(null);
  const [step, setStep] = useState<"name" | "phrase">("name");

  useEffect(() => {
    setMounted(true);
  }, []);

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setStep("phrase");
  }

  function handleContinue() {
    if (!selectedPhrase) return;

    const query = new URLSearchParams({
      name: name.trim(),
      phrase: selectedPhrase,
    });

    router.push(`/${event.slug}/invite?${query.toString()}`);
  }

  const phrases = [
    "Friends and Family",
    "Wedding Guest",
    "Celebration Crew",
  ];

  return (
    <>
      <Head>
        <title>{event.title}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <GuestLayout>
        <DesktopWarning />

        <section
          className={`mx-auto w-full max-w-hero space-y-6 text-center transition-all duration-300 ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <h2>{event.title}</h2>
          <p className="muted">Please confirm your details to continue.</p>

          {step === "name" ? (
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full border border-borderSoft p-4 rounded-[12px] font-sans bg-white"
                required
              />
              <Button type="submit">Continue</Button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="muted">Select your phrase</p>

              <div className="grid gap-2">
                {phrases.map((phrase) => {
                  const selected = selectedPhrase === phrase;
                  return (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => setSelectedPhrase(phrase)}
                      className={`border border-borderSoft p-4 rounded-[12px] font-sans transition-all duration-300 ease-out active:scale-95 ${
                        selected
                          ? "bg-actionActive text-white border-actionActive"
                          : "bg-white text-textPrimary"
                      }`}
                    >
                      {phrase}
                    </button>
                  );
                })}
              </div>

              <Button
                type="button"
                onClick={handleContinue}
                disabled={!selectedPhrase}
                className="disabled:opacity-50"
              >
                Continue
              </Button>
            </div>
          )}
        </section>
      </GuestLayout>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug;

  if (typeof slug !== "string") {
    return { notFound: true };
  }

  const { data, error } = await supabase
    .from("events")
    .select("id,title,slug,state,guest_access_enabled")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return { notFound: true };
  }

  if (data.state !== "active" || data.guest_access_enabled !== true) {
    return { notFound: true };
  }

  return {
    props: {
      event: data as EntryEvent,
    },
  };
};
