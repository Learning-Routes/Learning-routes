import type { LocaleCode } from "../locales";

// "Editar tu página" (Platform STEP 8 §4). Spanish is the source. pt, fr and it: Pending native review.

export interface CreatorPageText {
  editTitle: string;
  nameLabel: string;
  taglineLabel: string;
  bioLabel: string;
  colorLabel: string;
  colorHint: string;
  save: string;
  saved: string;
}

export const CREATOR_PAGE_TEXT: Record<LocaleCode, CreatorPageText> = {
  es: {
    editTitle: "Editar tu página",
    nameLabel: "Nombre",
    taglineLabel: "Frase corta",
    bioLabel: "Sobre ti",
    colorLabel: "Color de tu marca",
    colorHint:
      "Seis dígitos, como #6a2ea0. Si no contrasta con el blanco, te sugerimos uno que sí.",
    save: "Guardar",
    saved: "Guardado.",
  },
  en: {
    editTitle: "Edit your page",
    nameLabel: "Name",
    taglineLabel: "Short line",
    bioLabel: "About you",
    colorLabel: "Your brand colour",
    colorHint:
      "Six digits, like #6a2ea0. If it doesn't contrast with white, we'll suggest one that does.",
    save: "Save",
    saved: "Saved.",
  },
  pt: {
    editTitle: "Editar sua página",
    nameLabel: "Nome",
    taglineLabel: "Frase curta",
    bioLabel: "Sobre você",
    colorLabel: "Cor da sua marca",
    colorHint: "Seis dígitos, como #6a2ea0. Se não contrastar com o branco, sugerimos outra.",
    save: "Salvar",
    saved: "Salvo.",
  },
  fr: {
    editTitle: "Modifier votre page",
    nameLabel: "Nom",
    taglineLabel: "Phrase courte",
    bioLabel: "À propos de vous",
    colorLabel: "Couleur de votre marque",
    colorHint:
      "Six chiffres, comme #6a2ea0. Si elle contraste mal avec le blanc, nous en proposerons une autre.",
    save: "Enregistrer",
    saved: "Enregistré.",
  },
  it: {
    editTitle: "Modifica la tua pagina",
    nameLabel: "Nome",
    taglineLabel: "Frase breve",
    bioLabel: "Su di te",
    colorLabel: "Il colore del tuo marchio",
    colorHint:
      "Sei cifre, come #6a2ea0. Se non contrasta con il bianco, te ne suggeriamo un altro.",
    save: "Salva",
    saved: "Salvato.",
  },
};
