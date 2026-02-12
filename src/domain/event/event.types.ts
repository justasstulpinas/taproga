export const EventState = {
  Draft: "draft",
  Paid: "paid",
  Active: "active",
  Locked: "locked",
  Archived: "archived",
} as const;

export type EventState = (typeof EventState)[keyof typeof EventState];

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
  event_date: string;
  tier?: 1 | 2 | 3;
};

export type EventForRSVP = {
  id: string;
  state: EventState;
  guest_access_enabled: boolean;
  rsvp_deadline: string | null;
};
