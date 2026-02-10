import { EventState } from "@/domain/event/event.types";

export function canEditMenu(eventState: EventState): boolean {
  // Menu can be edited until RSVP closes
  return eventState === "draft" || eventState === "paid" || eventState === "active";
}
