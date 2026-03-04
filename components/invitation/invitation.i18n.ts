export type InvitationLanguage = "lt" | "en";

export const INVITE_TEXT = {
  lt: {
    common: {
      invitation: "Kvietimas",
      languageAria: "Kalba",
      mockup: "Šablonas",
    },
    nav: {
      home: "Pradžia",
      schedule: "Programa",
      location: "Vieta",
      countdown: "Iki šventės liko",
      rsvp: "Dalyvavimas",
      menu: "Meniu",
    },
    panels: {
      welcome: {
        kicker: "Pradžia",
        title: "Tuokiamės",
        names: "Nuotaka ir Jaunikis",
        subtitle: "Kviečiame švęsti mūsų ypatingą dieną",
      },
      info: {
        kicker: "Informacija",
        title: "Informacija",
        body: "Peržiūrėkite svarbią šventės informaciją ir parašykite, jei kyla klausimų.",
      },
      countdown: {
        kicker: "Skaičiuojame laiką iki",
        title: "Mūsų vestuvių dienos",
        subtitle: "Nekantraujame švęsti kartu su jumis.",
        days: "Dienos",
        hours: "Valandos",
        minutes: "Minutės",
        seconds: "Sekundės",
      },
      location: {
        title: "Vieta",
        venueName: "Vietos pavadinimas",
        venueAddress: "Vietos adresas",
        showMap: "Rodyti žemėlapyje",
      },
      schedule: {
        kicker: "Žvilgtelėkite į mūsų",
        title: "Vestuvių dienos programą",
        subtitle: "Mūsų šventės eigos tvarkaraštis",
        item1: "Ceremonija ir užkandžiai.",
        item2: "Vakarienė ir vakaro programa.",
        item3: "Tortas ir šokiai",
      },
      rsvp: {
        title: "Dalyvavimas",
        subtitle: "Prašome patvirtinti, ar dalyvausite",
        attending: "Dalyvausiu",
        notAttending: "Nedalyvausiu",
        plusOne: "+1 svečias (nebūtina)",
        plusOnePlaceholder: "Svečio vardas ir pavardė",
      },
      menu: {
        title: "Meniu",
        option1: "Klasikinis meniu",
        option2: "Vegetariškas meniu",
        option3: "Veganiškas meniu",
      },
      dressCode: {
        kicker: "Aprangos kodas",
        title: "Aprangos kodas",
        body: "Prašome rinktis elegantišką kokteilinę aprangą, neutralių tonų.",
      },
      additionalInfo: {
        kicker: "Papildoma informacija",
        title: "Papildoma informacija",
        body: "Čia galite pridėti informaciją apie parkavimą, apgyvendinimą, transportą ir kitus svarbius dalykus.",
        leftTitle: "Dovanos",
        rightTitle: "Aprangos kodas",
        description: "Papildoma informacija svečiams.",
      },
      textBlock: {
        title: "Teksto blokas",
      },
    },
  },
  en: {
    common: {
      invitation: "Invitation",
      languageAria: "Language",
      mockup: "Mockup",
    },
    nav: {
      home: "Home",
      schedule: "Schedule",
      location: "Location",
      countdown: "Countdown",
      rsvp: "RSVP",
      menu: "Menu",
    },
    panels: {
      welcome: {
        kicker: "Home",
        title: "We are getting married",
        names: "Bride & Groom",
        subtitle: "Join us to celebrate our special day",
      },
      info: {
        kicker: "Information",
        title: "Information",
        body: "Please review key details for this event and let us know if you have questions.",
      },
      countdown: {
        kicker: "Countdown to our",
        title: "Wedding Day",
        subtitle: "We cannot wait to celebrate with you.",
        days: "Days",
        hours: "Hours",
        minutes: "Minutes",
        seconds: "Seconds",
      },
      location: {
        title: "Location",
        venueName: "Venue name",
        venueAddress: "Venue address",
        showMap: "Show on map",
      },
      schedule: {
        kicker: "Here is a sneak peek of our",
        title: "Wedding Day Schedule",
        subtitle: "A calm summer evening, shared moments, and time spent together.",
        item1: "Ceremony — vows surrounded by nature.",
        item2: "Dinner — shared table and celebration.",
        item3: "Fireworks — closing the evening together.",
      },
      rsvp: {
        title: "RSVP",
        subtitle: "Please confirm your attendance",
        attending: "Attending",
        notAttending: "Not attending",
        plusOne: "+1 guest (optional)",
        plusOnePlaceholder: "Guest full name",
      },
      menu: {
        title: "Menu",
        option1: "Classic Menu",
        option2: "Vegetarian Menu",
        option3: "Vegan Menu",
      },
      dressCode: {
        kicker: "Dress code",
        title: "Dress Code",
        body: "Please choose elegant cocktail attire in neutral tones.",
      },
      additionalInfo: {
        kicker: "Additional info",
        title: "Additional Information",
        body: "Add practical details for your guests, including parking, transport and other important notes.",
        leftTitle: "Registry",
        rightTitle: "Dress Code",
        description: "Additional details for guests.",
      },
      textBlock: {
        title: "Text section",
      },
    },
  },
} as const;

export function getInviteText(language: InvitationLanguage) {
  return INVITE_TEXT[language];
}

export function resolveLocalizedString(
  value: unknown,
  language: InvitationLanguage,
  ltDefault: string,
  enDefault: string
) {
  if (typeof value !== "string") {
    return language === "lt" ? ltDefault : enDefault;
  }

  if (value.length === 0 || value.trim().length === 0) {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed === ltDefault || trimmed === enDefault) {
    return language === "lt" ? ltDefault : enDefault;
  }

  return value;
}

export function hasVisibleText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}
