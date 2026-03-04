import { nanoid } from "nanoid";
import type { PanelInstance } from "@/lib/panels/panel.types";

export function createDefaultPanels(): PanelInstance[] {
  return [
    {
      id: nanoid(),
      type: "welcome",
      order: 1,
      enabled: true,
      content: {
        title: "We are getting married",
        names: "",
        subtitle: "Join us to celebrate our special day",
      },
      styles: {},
      background: {},
    },
    {
      id: nanoid(),
      type: "location",
      order: 2,
      enabled: true,
      content: {},
      styles: {},
      background: {},
    },
    {
      id: nanoid(),
      type: "schedule",
      order: 3,
      enabled: true,
      content: {},
      styles: {},
      background: {},
    },
    {
      id: nanoid(),
      type: "additional-info",
      order: 4,
      enabled: true,
      content: {
        entries: [
          {
            title: "Registry",
            imageUrl:
              "https://images.unsplash.com/photo-1525258946800-98cfd641d0de?auto=format&fit=crop&w=900&q=80",
          },
          {
            title: "Dress Code",
            imageUrl:
              "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=900&q=80",
          },
        ],
        description: "Add practical details for your guests, including parking, transport and other important notes.",
      },
      styles: {},
      background: {},
    },
    {
      id: nanoid(),
      type: "rsvp",
      order: 5,
      enabled: true,
      content: {},
      styles: {},
      background: {},
    },
    {
      id: nanoid(),
      type: "menu",
      order: 6,
      enabled: true,
      content: {},
      styles: {},
      background: {},
    },
    {
      id: nanoid(),
      type: "countdown",
      order: 7,
      enabled: true,
      content: {},
      styles: {},
      background: {},
    },
  ];
}
