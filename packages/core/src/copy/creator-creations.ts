import type { LocaleCode } from "../locales";

// A route's creations in the creator's hub (Platform STEP 9 §4). Spanish is the source. pt, fr and
// it: Pending native review.

export interface CreatorCreationsText {
  title: string;
  /** {lesson} is the lesson's title. */
  inLesson: string;
  noThumbnail: string;
  replace: string;
  replaceFile: string;
  remove: string;
  removeConfirm: string;
  removeNote: string;
  replaced: string;
  removed: string;
  failed: string;
}

export const CREATOR_CREATIONS_TEXT: Record<LocaleCode, CreatorCreationsText> = {
  es: {
    title: "Creaciones",
    inLesson: "En el tema «{lesson}»",
    noThumbnail: "La miniatura aún no está lista.",
    replace: "Reemplazar",
    replaceFile: "Nueva versión (archivo HTML de hasta 2 MB)",
    remove: "Quitar",
    removeConfirm: "Quitar del borrador",
    removeNote: "Las versiones ya publicadas la conservan hasta que publiques de nuevo.",
    replaced: "Creación reemplazada. Revísala en la vista previa.",
    removed: "Creación quitada del borrador.",
    failed:
      "No se pudo. Revisa que sea un archivo HTML de hasta 2 MB y vuelve a intentarlo; tu borrador sigue igual.",
  },
  en: {
    title: "Creations",
    inLesson: "In the topic “{lesson}”",
    noThumbnail: "The thumbnail isn't ready yet.",
    replace: "Replace",
    replaceFile: "New version (an HTML file up to 2 MB)",
    remove: "Remove",
    removeConfirm: "Remove from the draft",
    removeNote: "Versions already published keep it until you publish again.",
    replaced: "Creation replaced. Check it in the preview.",
    removed: "Creation removed from the draft.",
    failed:
      "That didn't work. Check that it's an HTML file up to 2 MB and try again; your draft is unchanged.",
  },
  pt: {
    title: "Criações",
    inLesson: "No tema «{lesson}»",
    noThumbnail: "A miniatura ainda não está pronta.",
    replace: "Substituir",
    replaceFile: "Nova versão (arquivo HTML de até 2 MB)",
    remove: "Remover",
    removeConfirm: "Remover do rascunho",
    removeNote: "As versões já publicadas a mantêm até você publicar de novo.",
    replaced: "Criação substituída. Confira na prévia.",
    removed: "Criação removida do rascunho.",
    failed:
      "Não deu certo. Confira se é um arquivo HTML de até 2 MB e tente de novo; seu rascunho continua igual.",
  },
  fr: {
    title: "Créations",
    inLesson: "Dans le sujet « {lesson} »",
    noThumbnail: "La miniature n'est pas encore prête.",
    replace: "Remplacer",
    replaceFile: "Nouvelle version (fichier HTML de 2 Mo maximum)",
    remove: "Retirer",
    removeConfirm: "Retirer du brouillon",
    removeNote: "Les versions déjà publiées la gardent jusqu'à votre prochaine publication.",
    replaced: "Création remplacée. Vérifiez-la dans l'aperçu.",
    removed: "Création retirée du brouillon.",
    failed:
      "Cela n'a pas marché. Vérifiez qu'il s'agit d'un fichier HTML de 2 Mo maximum et réessayez ; votre brouillon n'a pas changé.",
  },
  it: {
    title: "Creazioni",
    inLesson: "Nell'argomento «{lesson}»",
    noThumbnail: "L'anteprima non è ancora pronta.",
    replace: "Sostituisci",
    replaceFile: "Nuova versione (file HTML fino a 2 MB)",
    remove: "Rimuovi",
    removeConfirm: "Rimuovi dalla bozza",
    removeNote: "Le versioni già pubblicate la mantengono finché non pubblichi di nuovo.",
    replaced: "Creazione sostituita. Controllala nell'anteprima.",
    removed: "Creazione rimossa dalla bozza.",
    failed:
      "Non ha funzionato. Controlla che sia un file HTML fino a 2 MB e riprova; la tua bozza è rimasta uguale.",
  },
};
