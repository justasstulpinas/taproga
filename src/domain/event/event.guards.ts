import { EventState } from "@/src/shared/constants";
import { EventRowForPublic } from "@/src/domain/event/event.types";

export function canGuestViewEvent(event: EventRowForPublic): boolean {
  return event.state === EventState.Active && event.guest_access_enabled;
}
