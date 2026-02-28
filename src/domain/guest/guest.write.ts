import { supabaseServiceRole } from '@/src/infra/supabase.service';
import { canGuestRSVP } from '@/src/domain/event/event.rules';
import { EventForRSVP } from '@/src/domain/event/event.types';

export type RSVPStatus = 'yes' | 'no';

export class RSVPError extends Error {
  code:
    | 'GUEST_NOT_FOUND'
    | 'NOT_VERIFIED'
    | 'EVENT_NOT_ACTIVE'
    | 'GUEST_ACCESS_DISABLED'
    | 'RSVP_DEADLINE_PASSED'
    | 'UNKNOWN';

  constructor(code: RSVPError['code']) {
    super(code);
    this.code = code;
  }
}

type UpdateGuestRSVPInput = {
  eventId: string;
  guestId: string;
  rsvpStatus: RSVPStatus;
  verified: boolean;
};

export async function updateGuestRSVP({
  eventId,
  guestId,
  rsvpStatus,
  verified,
}: UpdateGuestRSVPInput): Promise<void> {
  if (!verified) {
    throw new RSVPError('NOT_VERIFIED');
  }

  const { data: event, error: eventError } = await supabaseServiceRole
    .from('events')
    .select('id, state, guest_access_enabled, rsvp_deadline')
    .eq('id', eventId)
    .single<EventForRSVP>();

  if (eventError || !event) {
    throw new RSVPError('UNKNOWN');
  }

  const decision = canGuestRSVP(event, new Date());

  if (decision !== 'allowed') {
    switch (decision) {
      case 'event_not_active':
        throw new RSVPError('EVENT_NOT_ACTIVE');
      case 'guest_access_disabled':
        throw new RSVPError('GUEST_ACCESS_DISABLED');
      case 'rsvp_closed':
        throw new RSVPError('RSVP_DEADLINE_PASSED');
    }
  }

  const { error, data } = await supabaseServiceRole
    .from('guests')
    .update({
      rsvp_status: rsvpStatus,
      rsvp_at: new Date().toISOString(),
    })
    .eq('id', guestId)
    .eq('event_id', eventId)
    .select('id')
    .single();

  if (error) {
    if (error.message.includes('RSVP_DEADLINE_PASSED')) {
      throw new RSVPError('RSVP_DEADLINE_PASSED');
    }
    throw new RSVPError('UNKNOWN');
  }

  if (!data) {
    throw new RSVPError('GUEST_NOT_FOUND');
  }
}
