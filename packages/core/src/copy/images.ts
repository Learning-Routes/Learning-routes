import type { LocaleCode } from "../locales";

// What the server says when a route image cannot be made (Platform STEP 20 §B): the month's twenty
// are used, or no model can make one right now. Plain, and with no blame.

export const IMAGES_TEXT: Record<LocaleCode, { limited: string; unavailable: string }> = {
  es: {
    limited: "Ya creaste tus 20 imágenes de este mes. El mes que viene puedes crear 20 más.",
    unavailable: "Ahora no se pueden crear imágenes. Inténtalo más tarde.",
  },
  en: {
    limited: "You have made your 20 images for this month. You can make 20 more next month.",
    unavailable: "Images can't be made right now. Try again later.",
  },
  pt: {
    limited: "Você já criou suas 20 imagens deste mês. No mês que vem pode criar mais 20.",
    unavailable: "Agora não é possível criar imagens. Tente mais tarde.",
  },
  fr: {
    limited:
      "Vous avez créé vos 20 images de ce mois. Le mois prochain, vous pourrez en créer 20 autres.",
    unavailable: "Impossible de créer des images pour le moment. Réessayez plus tard.",
  },
  it: {
    limited:
      "Hai già creato le tue 20 immagini di questo mese. Il mese prossimo potrai crearne altre 20.",
    unavailable: "Ora non è possibile creare immagini. Riprova più tardi.",
  },
};
