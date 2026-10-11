const sentenceEnd = (text: string): string => (text.endsWith(".") ? text : `${text}.`);

export const adminLt = {
  brand: "Vaišės",
  nav: {
    requests: "Užklausos",
    dates: "Datos",
    label: "Administravimas",
    signOut: "Atsijungti",
    signingOut: "Atsijungiama…",
    signOutFailed: "Nepavyko atsijungti. Bandykite dar kartą.",
  },
  login: {
    title: "Prisijungimas",
    email: "El. paštas",
    password: "Slaptažodis",
    submit: "Prisijungti",
    submitting: "Jungiamasi…",
    invalidCredentials: "Neteisingas el. paštas arba slaptažodis.",
    rateLimited: "Per daug bandymų. Pabandykite vėliau.",
  },
  dates: {
    title: "Užblokuotos datos",
    intro: "Pažymėtos dienos lankytojams rodomos kaip užimtos.",
    previousMonth: "Ankstesnis mėnuo",
    nextMonth: "Kitas mėnuo",
    upcomingTitle: "Artimiausios užblokuotos datos",
    empty: "Užblokuotų datų nėra.",
    loadFailed: "Nepavyko įkelti užblokuotų datų. Perkraukite puslapį.",
    // Lithuanian long dates already end in "d.", so the sentence's full stop is not doubled.
    blockFailed: (date: string) => `Nepavyko užblokuoti ${sentenceEnd(date)} Bandykite dar kartą.`,
    unblockFailed: (date: string) => `Nepavyko atblokuoti ${sentenceEnd(date)} Bandykite dar kartą.`,
  },
} as const;
