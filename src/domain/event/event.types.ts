import { EventState } from "@/src/shared/constants";

export type EventRowForPublic = {
  id: string;
  title: string;
  event_date: string;
  state: EventState;
  guest_access_enabled: boolean;
  slug: string;
};

export type EventPublic = {
  id: string;
  title: string;
  event_date: string;
  state: EventState;
  verificationPhrase: string;
};

export type EventSummary = {
  id: string;
  title: string;
  slug: string;
  state: EventState;
  guest_access_enabled: boolean;
};

export type NewEventInput = {
  title: string;
  date: string;
  time: string;
  timezone: string;
};
