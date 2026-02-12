import { GetServerSideProps } from "next";
import { supabase } from "src/infra/supabase.client";
import { canGuestEditMenu } from "../../../../lib/guards/menuAccess";

type Menu = { id: string; title: string; description: string | null };
type Props = {
  event: { id: string; menu_enabled: boolean; rsvp_deadline: string | null; state: string };
  menus: Menu[];
  guestId: string;
};

export default function GuestMenu({ event, menus, guestId }: Props) {
  const locked = !canGuestEditMenu(event);

  async function select(menuTitle: string) {
    if (locked) return;
    await supabase.from("guests").update({ menu_choice: menuTitle }).eq("id", guestId);
  }

  if (!event.menu_enabled) return null;

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Choose your menu</h1>
      <ul className="space-y-3">
        {menus.map(m => (
          <li key={m.id} className="border p-3 rounded">
            <button disabled={locked} onClick={() => select(m.title)}>
              <div className="font-medium">{m.title}</div>
              {m.description && <div className="text-sm text-gray-600">{m.description}</div>}
            </button>
          </li>
        ))}
      </ul>
      {locked && <p className="mt-3 text-sm text-red-600">Menu selection is locked.</p>}
    </main>
  );
}
