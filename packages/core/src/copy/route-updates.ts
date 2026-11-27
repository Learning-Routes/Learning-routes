import type { LocaleCode } from "../locales";

/** What Mis rutas says when a creator has published a route again since the student started it. */
export interface RouteUpdatesText {
  updateReady: string;
  update: string;
  updated: string;
  updateFailed: string;
}

export const ROUTE_UPDATES_TEXT: Record<LocaleCode, RouteUpdatesText> = {
  es: {
    updateReady: "«{route}» tiene contenido nuevo. Tu avance se conserva.",
    update: "Actualizar",
    updated: "Listo: ya tienes el contenido nuevo.",
    updateFailed: "No pudimos actualizar la ruta. Inténtalo de nuevo.",
  },
  en: {
    updateReady: "“{route}” has new content. Your progress is kept.",
    update: "Update",
    updated: "Done: you now have the new content.",
    updateFailed: "We could not update the route. Try again.",
  },
  pt: {
    // Pending native review.
    updateReady: "«{route}» tem conteúdo novo. O seu progresso é mantido.",
    update: "Atualizar",
    updated: "Pronto: você já tem o conteúdo novo.",
    updateFailed: "Não foi possível atualizar a rota. Tente de novo.",
  },
  fr: {
    // Pending native review.
    updateReady: "« {route} » a du nouveau contenu. Votre progression est conservée.",
    update: "Mettre à jour",
    updated: "C'est fait : vous avez le nouveau contenu.",
    updateFailed: "Impossible de mettre à jour le parcours. Réessayez.",
  },
  it: {
    // Pending native review.
    updateReady: "«{route}» ha contenuti nuovi. I tuoi progressi restano.",
    update: "Aggiorna",
    updated: "Fatto: ora hai i contenuti nuovi.",
    updateFailed: "Non siamo riusciti ad aggiornare il percorso. Riprova.",
  },
};
