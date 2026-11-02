import { BRAND, type LocaleCode } from "../locales";

// The words of signing in, in every locale: the screens, and the email's text and
// HTML from one template (Platform STEP 3 §3). Spanish is the source. A locale missing
// a string fails the types. Data only, so browser code may load it.

export interface SignInText {
  emailSubject: string;
  emailIntro: string;
  emailAction: string;
  emailExpiry: string;
  emailIgnore: string;
  title: string;
  intro: string;
  emailLabel: string;
  emailExample: string;
  sendLink: string;
  sending: string;
  invalidEmail: string;
  sentTitle: string;
  sentTo: string;
  sentNext: string;
  resend: string;
  /** {seconds} is replaced with the wait left. */
  resendIn: string;
  resent: string;
  changeAddress: string;
  confirmTitle: string;
  confirmAction: string;
  confirmOnce: string;
  checking: string;
  expiredTitle: string;
  expiredBody: string;
  limitedTitle: string;
  limitedBody: string;
  failedTitle: string;
  failedBody: string;
  signedOutTitle: string;
  signedOutBody: string;
}

export const SIGN_IN_TEXT: Record<LocaleCode, SignInText> = {
  es: {
    emailSubject: `Tu enlace para entrar en ${BRAND}`,
    emailIntro: `Usa este enlace para entrar en ${BRAND}.`,
    emailAction: "Entrar",
    emailExpiry: "Funciona una sola vez y caduca en 5 minutos.",
    emailIgnore: "Si no lo pediste, ignora este correo: nadie entra sin el enlace.",
    title: "Entrar",
    intro: "Escribe tu correo y te enviamos un enlace para entrar. Dura 5 minutos.",
    emailLabel: "Tu correo",
    emailExample: "tu@ejemplo.com",
    sendLink: "Enviar enlace",
    sending: "Enviando el enlace",
    invalidEmail: "Escribe un correo con @, como tu@ejemplo.com.",
    sentTitle: "Revisa tu correo",
    sentTo: "Enviamos un enlace a",
    sentNext: "Ábrelo en este dispositivo. Dura 5 minutos y funciona una sola vez.",
    resend: "Reenviar enlace",
    resendIn: "Podrás reenviarlo en {seconds} s.",
    resent: "Enlace reenviado.",
    changeAddress: "Usar otro correo",
    confirmTitle: "Entrar como",
    confirmAction: "Entrar",
    confirmOnce: "Este enlace funciona una sola vez.",
    checking: "Comprobando el enlace",
    expiredTitle: "Este enlace ya no sirve",
    expiredBody: "Caducó o ya se usó. Pide otro aquí abajo y llegará en un momento.",
    limitedTitle: "Se pidieron muchos enlaces",
    limitedBody: "Espera unos minutos y vuelve a pedir uno.",
    failedTitle: "El enlace no se pudo enviar",
    failedBody: "Revisa tu conexión y vuelve a intentarlo en un minuto.",
    signedOutTitle: "Saliste de tu cuenta",
    signedOutBody: "Para volver, pide un enlace aquí abajo.",
  },
  en: {
    emailSubject: `Your sign-in link for ${BRAND}`,
    emailIntro: `Use this link to sign in to ${BRAND}.`,
    emailAction: "Sign in",
    emailExpiry: "It works once and expires in 5 minutes.",
    emailIgnore: "If you didn't ask for it, ignore this email: no one gets in without the link.",
    title: "Sign in",
    intro: "Enter your email and we'll send you a link to sign in. It lasts 5 minutes.",
    emailLabel: "Your email",
    emailExample: "you@example.com",
    sendLink: "Send link",
    sending: "Sending the link",
    invalidEmail: "Enter an email with an @, like you@example.com.",
    sentTitle: "Check your email",
    sentTo: "We sent a link to",
    sentNext: "Open it on this device. It lasts 5 minutes and works once.",
    resend: "Resend link",
    resendIn: "You can resend it in {seconds} s.",
    resent: "Link resent.",
    changeAddress: "Use another email",
    confirmTitle: "Sign in as",
    confirmAction: "Sign in",
    confirmOnce: "This link works once.",
    checking: "Checking the link",
    expiredTitle: "This link no longer works",
    expiredBody:
      "It expired or was already used. Ask for another below and it will arrive shortly.",
    limitedTitle: "Too many links were requested",
    limitedBody: "Wait a few minutes and ask for one again.",
    failedTitle: "The link couldn't be sent",
    failedBody: "Check your connection and try again in a minute.",
    signedOutTitle: "You signed out",
    signedOutBody: "To come back, ask for a link below.",
  },
  pt: {
    emailSubject: `Seu link para entrar no ${BRAND}`,
    emailIntro: `Use este link para entrar no ${BRAND}.`,
    emailAction: "Entrar",
    emailExpiry: "Ele funciona uma vez e expira em 5 minutos.",
    emailIgnore: "Se você não pediu, ignore este e-mail: ninguém entra sem o link.",
    title: "Entrar",
    intro: "Digite seu e-mail e enviaremos um link para você entrar. Ele dura 5 minutos.",
    emailLabel: "Seu e-mail",
    emailExample: "voce@exemplo.com",
    sendLink: "Enviar link",
    sending: "Enviando o link",
    invalidEmail: "Digite um e-mail com @, como voce@exemplo.com.",
    sentTitle: "Confira seu e-mail",
    sentTo: "Enviamos um link para",
    sentNext: "Abra neste dispositivo. Ele dura 5 minutos e funciona uma vez.",
    resend: "Reenviar link",
    resendIn: "Você poderá reenviar em {seconds} s.",
    resent: "Link reenviado.",
    changeAddress: "Usar outro e-mail",
    confirmTitle: "Entrar como",
    confirmAction: "Entrar",
    confirmOnce: "Este link funciona uma vez.",
    checking: "Verificando o link",
    expiredTitle: "Este link não funciona mais",
    expiredBody: "Ele expirou ou já foi usado. Peça outro abaixo e ele chegará em instantes.",
    limitedTitle: "Muitos links foram pedidos",
    limitedBody: "Aguarde alguns minutos e peça outro.",
    failedTitle: "Não foi possível enviar o link",
    failedBody: "Confira sua conexão e tente de novo em um minuto.",
    signedOutTitle: "Você saiu da sua conta",
    signedOutBody: "Para voltar, peça um link abaixo.",
  },
  fr: {
    emailSubject: `Votre lien de connexion à ${BRAND}`,
    emailIntro: `Utilisez ce lien pour vous connecter à ${BRAND}.`,
    emailAction: "Se connecter",
    emailExpiry: "Il fonctionne une seule fois et expire dans 5 minutes.",
    emailIgnore:
      "Si vous ne l'avez pas demandé, ignorez cet e-mail : personne n'entre sans le lien.",
    title: "Se connecter",
    intro: "Saisissez votre e-mail et nous vous enverrons un lien de connexion. Il dure 5 minutes.",
    emailLabel: "Votre e-mail",
    emailExample: "vous@exemple.com",
    sendLink: "Envoyer le lien",
    sending: "Envoi du lien",
    invalidEmail: "Saisissez un e-mail avec un @, comme vous@exemple.com.",
    sentTitle: "Consultez vos e-mails",
    sentTo: "Nous avons envoyé un lien à",
    sentNext: "Ouvrez-le sur cet appareil. Il dure 5 minutes et fonctionne une seule fois.",
    resend: "Renvoyer le lien",
    resendIn: "Vous pourrez le renvoyer dans {seconds} s.",
    resent: "Lien renvoyé.",
    changeAddress: "Utiliser un autre e-mail",
    confirmTitle: "Se connecter en tant que",
    confirmAction: "Se connecter",
    confirmOnce: "Ce lien fonctionne une seule fois.",
    checking: "Vérification du lien",
    expiredTitle: "Ce lien ne fonctionne plus",
    expiredBody:
      "Il a expiré ou a déjà été utilisé. Demandez-en un autre ci-dessous, il arrivera vite.",
    limitedTitle: "Trop de liens ont été demandés",
    limitedBody: "Attendez quelques minutes et demandez-en un autre.",
    failedTitle: "Le lien n'a pas pu être envoyé",
    failedBody: "Vérifiez votre connexion et réessayez dans une minute.",
    signedOutTitle: "Vous êtes déconnecté",
    signedOutBody: "Pour revenir, demandez un lien ci-dessous.",
  },
  it: {
    emailSubject: `Il tuo link per accedere a ${BRAND}`,
    emailIntro: `Usa questo link per accedere a ${BRAND}.`,
    emailAction: "Accedi",
    emailExpiry: "Funziona una sola volta e scade tra 5 minuti.",
    emailIgnore: "Se non l'hai richiesto, ignora questa email: nessuno entra senza il link.",
    title: "Accedi",
    intro: "Scrivi la tua email e ti invieremo un link per accedere. Dura 5 minuti.",
    emailLabel: "La tua email",
    emailExample: "tu@esempio.com",
    sendLink: "Invia il link",
    sending: "Invio del link",
    invalidEmail: "Scrivi un'email con la @, come tu@esempio.com.",
    sentTitle: "Controlla la tua email",
    sentTo: "Abbiamo inviato un link a",
    sentNext: "Aprilo su questo dispositivo. Dura 5 minuti e funziona una sola volta.",
    resend: "Invia di nuovo il link",
    resendIn: "Potrai inviarlo di nuovo tra {seconds} s.",
    resent: "Link inviato di nuovo.",
    changeAddress: "Usa un'altra email",
    confirmTitle: "Accedi come",
    confirmAction: "Accedi",
    confirmOnce: "Questo link funziona una sola volta.",
    checking: "Controllo del link",
    expiredTitle: "Questo link non funziona più",
    expiredBody: "È scaduto o è già stato usato. Chiedine un altro qui sotto: arriverà a breve.",
    limitedTitle: "Sono stati chiesti troppi link",
    limitedBody: "Aspetta qualche minuto e chiedine un altro.",
    failedTitle: "Non è stato possibile inviare il link",
    failedBody: "Controlla la connessione e riprova tra un minuto.",
    signedOutTitle: "Sei uscito dal tuo account",
    signedOutBody: "Per tornare, chiedi un link qui sotto.",
  },
};
