import type { LocaleCode } from "../locales";

// The words of the design system's components, Spanish first (Platform STEP 3).
// Data only, so browser code can load it: a locale missing a key fails the type here
// and the copy check in test/copy.test.ts.

export const UI_COPY = {
  es: {
    home: "Ir al inicio",
    primaryNav: "Principal",
    toDark: "Cambiar a modo oscuro",
    toLight: "Cambiar a modo claro",
    loading: "Cargando",
    optional: "opcional",
  },
  en: {
    home: "Go to the home page",
    primaryNav: "Main",
    toDark: "Switch to dark mode",
    toLight: "Switch to light mode",
    loading: "Loading",
    optional: "optional",
  },
  pt: {
    home: "Ir para o início",
    primaryNav: "Principal",
    toDark: "Mudar para o modo escuro",
    toLight: "Mudar para o modo claro",
    loading: "Carregando",
    optional: "opcional",
  },
  fr: {
    home: "Aller à l'accueil",
    primaryNav: "Principale",
    toDark: "Passer en mode sombre",
    toLight: "Passer en mode clair",
    loading: "Chargement",
    optional: "facultatif",
  },
  it: {
    home: "Vai alla home",
    primaryNav: "Principale",
    toDark: "Passa alla modalità scura",
    toLight: "Passa alla modalità chiara",
    loading: "Caricamento",
    optional: "facoltativo",
  },
} as const satisfies Record<LocaleCode, Record<string, string>>;
