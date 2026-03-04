export type PanelType =
  | "welcome"
  | "info"
  | "countdown"
  | "location"
  | "schedule"
  | "dress-code"
  | "additional-info"
  | "rsvp"
  | "menu"
  | "text-block";

export type TextColorConfig = {
  titleColor?: string;
  bodyColor?: string;
};

export type PanelInstance = {
  id: string;
  type: PanelType;
  order: number;
  enabled: boolean;
  content: Record<string, any>;
  styles?: TextColorConfig;
  background?: {
    imageUrl?: string;
    overlay?: boolean;
    overlayOpacity?: number;
    grayscale?: boolean;
  };
};
