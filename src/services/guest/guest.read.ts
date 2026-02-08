import { supabaseServiceRole } from '@/infra/supabase.service';

export async function resolveGuest(params: {
  eventId: string;
  name: string;
}): Promise<{ guestId: string }> {
  const normalized = params.name.trim().toLowerCase();

  // 1) Try find existing guest
  const { data: existing, error: findErr } = await supabaseServiceRole
    .from('guests')
    .select('id')
    .eq('event_id', params.eventId)
    .eq('normalized_name', normalized)
    .maybeSingle();

  if (findErr) {
    throw new Error('GUEST_LOOKUP_FAILED');
  }

  if (existing?.id) {
    return { guestId: existing.id };
  }

  // 2) Create if not exists
  const { data: created, error: createErr } = await supabaseServiceRole
    .from('guests')
    .insert({
      event_id: params.eventId,
      name: params.name,
      normalized_name: normalized,
    })
    .select('id')
    .single();

  if (createErr || !created) {
    throw new Error('GUEST_CREATE_FAILED');
  }

  return { guestId: created.id };
}
