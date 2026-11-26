import type { LocaleCode } from "../locales";

// The words of the app's frame, shown on every signed-in page (Platform STEP 23). Data only. Spanish is the source; a locale missing a string fails the types.

export interface ShellText {
  home: string;
  community: string;
  notices: string;
  /** The link to one's profile, for whoever has not given a name yet. */
  profile: string;
  /** Above the route one is on, in the side panel. */
  youAreOn: string;
  /** {n} is the topic's number, {total} how many the route has. */
  topicOf: string;
  /** {n} is how many notices are unread. */
  unread: string;
}

export const SHELL_TEXT: Record<LocaleCode, ShellText> = {
  es: {
    home: "Inicio",
    community: "Comunidad",
    notices: "Avisos",
    profile: "Perfil",
    youAreOn: "Sigues en",
    topicOf: "Tema {n} de {total}",
    unread: "{n} sin leer",
  },
  en: {
    home: "Home",
    community: "Community",
    notices: "Notices",
    profile: "Profile",
    youAreOn: "You are on",
    topicOf: "Topic {n} of {total}",
    unread: "{n} unread",
  },
  pt: {
    // Pending native review.
    home: "Início",
    community: "Comunidade",
    notices: "Avisos",
    profile: "Perfil",
    youAreOn: "Você está em",
    topicOf: "Tema {n} de {total}",
    unread: "{n} não lidos",
  },
  fr: {
    // Pending native review.
    home: "Accueil",
    community: "Communauté",
    notices: "Avis",
    profile: "Profil",
    youAreOn: "Vous en êtes à",
    topicOf: "Thème {n} sur {total}",
    unread: "{n} non lus",
  },
  it: {
    // Pending native review.
    home: "Inizio",
    community: "Comunità",
    notices: "Avvisi",
    profile: "Profilo",
    youAreOn: "Sei su",
    topicOf: "Tema {n} di {total}",
    unread: "{n} non letti",
  },
};
