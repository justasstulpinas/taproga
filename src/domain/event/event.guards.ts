import { EventRowForPublic, EventState } from "@/domain/event/event.types";

export function canGuestViewEvent(event: EventRowForPublic): boolean {
  return event.state === EventState.Active && event.guest_access_enabled;
}
