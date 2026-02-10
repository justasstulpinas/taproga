import { GetServerSideProps } from "next";
import { supabase } from "src/infra/supabase.client";
import { canHostEditMenu } from "../../../../lib/guards/menuAccess";

type Menu = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
};

type EventLike = {
  state: string;
  menu_enabled: boolean;
  rsvp_deadline: string | null;
};

type Props = {
  eventId: string;
  menus: Menu[];
  event: EventLike;
};

export default function HostEventMenuPage({ eventId, menus, event }: Props) {
  console.log("CLIENT MENUS:", menus); // ← ADD THIS LINE

  const menuLocked = !canHostEditMenu(event);

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Event menus</h1>

      {menuLocked && (
        <p className="mb-4 text-sm text-red-600">
          Menu editing is locked because RSVP deadline has passed.
        </p>
      )}

      {menus.length === 0 && (
        <p className="text-gray-500">No menus created yet.</p>
      )}

      <ul className="space-y-4">
        {menus.map((menu) => (
          <li key={menu.id} className="border p-4 rounded">
            <h2 className="font-medium">{menu.title}</h2>

            {menu.description && (
              <p className="text-sm text-gray-600">{menu.description}</p>
            )}

            <p className="text-xs mt-2">
              Status: {menu.is_active ? "active" : "inactive"}
            </p>

            <button
              disabled={menuLocked}
              className={`mt-3 px-3 py-1 rounded text-sm ${
                menuLocked
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-black text-white"
              }`}
            >
              Edit
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}


export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const eventId = ctx.params?.eventId;

  if (typeof eventId !== "string") {
    return { notFound: true };
  }

  // Fetch event
  const { data: event } = await supabase
    .from("events")
    .select("state, menu_enabled, rsvp_deadline")
    .eq("id", eventId)
    .single();

  // Fetch menus (ONE QUERY ONLY)
  const { data: menus, error } = await supabase
    .from("menus")
    .select("id, title, description, is_active")
    .eq("event_id", eventId)
    .order("created_at");

  console.log("SSR MENUS:", menus, error);

  // Fallback if event not found
  if (!event) {
    return {
      props: {
        eventId,
        menus: [],
        event: {
          state: "draft",
          menu_enabled: false,
          rsvp_deadline: null,
        },
      },
    };
  }

  return {
    props: {
      eventId,
      menus: menus ?? [],
      event,
    },
  };
};

