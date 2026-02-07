export enum EventState {
  Draft = "draft",
  Paid = "paid",
  Active = "active",
  EventPassed = "event_passed",
  Archived = "archived",
  Expired = "expired",
}

export const STRIPE_PRICES = {
  1: "price_1SxVGRPPEUcxCfTzpt6iGuA6",
  2: "price_1SxVHSPPEUcxCfTzEapYbAUQ",
  3: "price_1SxVI2PPEUcxCfTzAE8s7KI7",
} as const;
