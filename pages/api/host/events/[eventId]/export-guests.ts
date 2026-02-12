import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServiceRole } from "@/infra/supabase.service";

type GuestRow = {
  name: string;
  rsvp_status: string | null;
  plus_one_allowed: boolean | null;
  plus_one_name: string | null;
  menu_choice: string | null; // menu id
};

type MenuRow = {
  id: string;
  title: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const { eventId } = req.query;

  if (!eventId || typeof eventId !== "string") {
    return res.status(400).json({ error: "INVALID_EVENT_ID" });
  }

  /* ─────────────────────────────────────────────
     1. Load event (for slug → filename)
     ───────────────────────────────────────────── */
  const { data: event, error: eventError } = await supabaseServiceRole
    .from("events")
    .select("slug")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ error: "EVENT_NOT_FOUND" });
  }

  /* ─────────────────────────────────────────────
     2. Load guests
     ───────────────────────────────────────────── */
  const { data: guests, error: guestError } = await supabaseServiceRole
    .from("guests")
    .select(
      "name,rsvp_status,plus_one_allowed,plus_one_name,menu_choice"
    )
    .eq("event_id", eventId)
    .order("name", { ascending: true });

  if (guestError) {
    return res.status(500).json({ error: guestError.message });
  }

  /* ─────────────────────────────────────────────
     3. Load menus
     ───────────────────────────────────────────── */
  const { data: menus, error: menuError } = await supabaseServiceRole
    .from("menus")
    .select("id,title")
    .eq("event_id", eventId);

  if (menuError) {
    return res.status(500).json({ error: menuError.message });
  }

  /* ─────────────────────────────────────────────
     4. Build menu lookup map
     ───────────────────────────────────────────── */
  const menuMap = new Map<string, string>();
  (menus as MenuRow[] | null)?.forEach((m) => {
    menuMap.set(m.id, m.title);
  });

  /* ─────────────────────────────────────────────
     5. CSV helpers
     ───────────────────────────────────────────── */
  const header = [
    "guest_name",
    "rsvp_status",
    "plus_one_allowed",
    "plus_one_name",
    "menu_choice",
    "menu_option_id",
  ];

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = ((guests as GuestRow[] | null) ?? []).map((g) => {
    const menuTitle = g.menu_choice
      ? menuMap.get(g.menu_choice) ?? ""
      : "";

    return [
      escape(g.name),
      escape(g.rsvp_status),
      escape(g.plus_one_allowed),
      escape(g.plus_one_name),
      escape(menuTitle),
      escape(g.menu_choice),
    ];
  });

  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

  /* ─────────────────────────────────────────────
     6. Response headers + filename
     ───────────────────────────────────────────── */
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${event.slug}-guests.csv"`
  );

  return res.status(200).send(csv);
}
