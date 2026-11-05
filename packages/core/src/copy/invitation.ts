import { BRAND, type LocaleCode } from "../locales";

// The invitation to teach: its email, and the page its link opens (Platform STEP 10, pulled
// forward). Spanish is the source. pt, fr and it: Pending native review.

export interface InvitationText {
  email: {
    subject: string;
    heading: string;
    intro: string;
    action: string;
    expiry: string;
    ignore: string;
  };
  title: string;
  intro: string;
  slugLabel: string;
  slugHint: string;
  accept: string;
  accepting: string;
  slugTaken: string;
  slugRefused: string;
  failed: string;
  checking: string;
  expiredTitle: string;
  expiredBody: string;
  usedTitle: string;
  usedBody: string;
  unknownTitle: string;
  unknownBody: string;
  askAgain: string;
  signIn: string;
}

export const INVITATION_TEXT: Record<LocaleCode, InvitationText> = {
  es: {
    email: {
      subject: `Tu invitación para enseñar en ${BRAND}`,
      heading: "{name}, ya puedes enseñar.",
      intro: `Te invitamos a crear tu espacio en ${BRAND}. Elige su dirección y empieza con tu primera ruta.`,
      action: "Crear mi espacio",
      expiry: "El enlace dura 7 días y sirve una sola vez.",
      ignore: "Si no pediste enseñar, ignora este correo: nadie entra sin este enlace.",
    },
    title: "Crea tu espacio",
    intro: "Elige la dirección de tu página. Al confirmar, entras como {email}.",
    slugLabel: "La dirección de tu página",
    slugHint: "Letras minúsculas, números y guiones.",
    accept: "Crear mi espacio",
    accepting: "Creando tu espacio",
    slugTaken: "Esa dirección ya tiene dueño. Prueba con otra.",
    slugRefused: "Esa dirección no se puede usar. Prueba con otra.",
    failed: "No pudimos crear tu espacio. Tu invitación sigue siendo válida: inténtalo de nuevo.",
    checking: "Revisando tu invitación",
    expiredTitle: "Esta invitación venció",
    expiredBody: "Los enlaces duran 7 días. Vuelve a escribirnos y te enviamos otro.",
    usedTitle: "Esta invitación ya se usó",
    usedBody: "Tu espacio ya existe. Entra con tu correo para seguir enseñando.",
    unknownTitle: "No reconocemos esta invitación",
    unknownBody:
      "Puede que haya llegado otra más nueva. Busca el último correo, o escríbenos de nuevo.",
    askAgain: "Pedir otra invitación",
    signIn: "Entrar",
  },
  en: {
    email: {
      subject: `Your invitation to teach on ${BRAND}`,
      heading: "{name}, you can start teaching.",
      intro: `We're inviting you to create your space on ${BRAND}. Choose its address and start your first route.`,
      action: "Create my space",
      expiry: "The link lasts 7 days and works once.",
      ignore: "If you didn't ask to teach, ignore this email: no one gets in without this link.",
    },
    title: "Create your space",
    intro: "Choose your page's address. When you confirm, you sign in as {email}.",
    slugLabel: "Your page's address",
    slugHint: "Lower-case letters, numbers and hyphens.",
    accept: "Create my space",
    accepting: "Creating your space",
    slugTaken: "That address is taken. Try another.",
    slugRefused: "That address can't be used. Try another.",
    failed: "We couldn't create your space. Your invitation is still good: try again.",
    checking: "Checking your invitation",
    expiredTitle: "This invitation has expired",
    expiredBody: "Links last 7 days. Write to us again and we'll send another.",
    usedTitle: "This invitation has been used",
    usedBody: "Your space already exists. Sign in with your email to keep teaching.",
    unknownTitle: "We don't recognise this invitation",
    unknownBody: "A newer one may have arrived. Look for the latest email, or write to us again.",
    askAgain: "Ask for another invitation",
    signIn: "Sign in",
  },
  pt: {
    email: {
      subject: `Seu convite para ensinar no ${BRAND}`,
      heading: "{name}, você já pode ensinar.",
      intro: `Convidamos você a criar seu espaço no ${BRAND}. Escolha o endereço e comece sua primeira rota.`,
      action: "Criar meu espaço",
      expiry: "O link dura 7 dias e funciona uma vez.",
      ignore: "Se você não pediu para ensinar, ignore este e-mail: ninguém entra sem este link.",
    },
    title: "Crie seu espaço",
    intro: "Escolha o endereço da sua página. Ao confirmar, você entra como {email}.",
    slugLabel: "O endereço da sua página",
    slugHint: "Letras minúsculas, números e hifens.",
    accept: "Criar meu espaço",
    accepting: "Criando seu espaço",
    slugTaken: "Esse endereço já tem dono. Tente outro.",
    slugRefused: "Esse endereço não pode ser usado. Tente outro.",
    failed: "Não conseguimos criar seu espaço. Seu convite continua válido: tente de novo.",
    checking: "Verificando seu convite",
    expiredTitle: "Este convite venceu",
    expiredBody: "Os links duram 7 dias. Escreva de novo e enviaremos outro.",
    usedTitle: "Este convite já foi usado",
    usedBody: "Seu espaço já existe. Entre com seu e-mail para continuar ensinando.",
    unknownTitle: "Não reconhecemos este convite",
    unknownBody: "Pode ter chegado um mais novo. Procure o último e-mail ou escreva de novo.",
    askAgain: "Pedir outro convite",
    signIn: "Entrar",
  },
  fr: {
    email: {
      subject: `Votre invitation à enseigner sur ${BRAND}`,
      heading: "{name}, vous pouvez enseigner.",
      intro: `Nous vous invitons à créer votre espace sur ${BRAND}. Choisissez son adresse et lancez votre premier parcours.`,
      action: "Créer mon espace",
      expiry: "Le lien dure 7 jours et fonctionne une seule fois.",
      ignore: "Si vous n'avez rien demandé, ignorez cet e-mail : personne n'entre sans ce lien.",
    },
    title: "Créez votre espace",
    intro: "Choisissez l'adresse de votre page. En confirmant, vous vous connectez avec {email}.",
    slugLabel: "L'adresse de votre page",
    slugHint: "Minuscules, chiffres et tirets.",
    accept: "Créer mon espace",
    accepting: "Création de votre espace",
    slugTaken: "Cette adresse est déjà prise. Essayez-en une autre.",
    slugRefused: "Cette adresse n'est pas utilisable. Essayez-en une autre.",
    failed: "Nous n'avons pas pu créer votre espace. Votre invitation reste valable : réessayez.",
    checking: "Vérification de votre invitation",
    expiredTitle: "Cette invitation a expiré",
    expiredBody: "Les liens durent 7 jours. Écrivez-nous à nouveau et nous en enverrons un autre.",
    usedTitle: "Cette invitation a déjà été utilisée",
    usedBody:
      "Votre espace existe déjà. Connectez-vous avec votre e-mail pour continuer à enseigner.",
    unknownTitle: "Nous ne reconnaissons pas cette invitation",
    unknownBody:
      "Une plus récente est peut-être arrivée. Cherchez le dernier e-mail, ou écrivez-nous à nouveau.",
    askAgain: "Demander une autre invitation",
    signIn: "Se connecter",
  },
  it: {
    email: {
      subject: `Il tuo invito a insegnare su ${BRAND}`,
      heading: "{name}, puoi iniziare a insegnare.",
      intro: `Ti invitiamo a creare il tuo spazio su ${BRAND}. Scegli il suo indirizzo e inizia il tuo primo percorso.`,
      action: "Crea il mio spazio",
      expiry: "Il link dura 7 giorni e funziona una sola volta.",
      ignore:
        "Se non hai chiesto di insegnare, ignora questa email: nessuno entra senza questo link.",
    },
    title: "Crea il tuo spazio",
    intro: "Scegli l'indirizzo della tua pagina. Confermando, entri come {email}.",
    slugLabel: "L'indirizzo della tua pagina",
    slugHint: "Lettere minuscole, numeri e trattini.",
    accept: "Crea il mio spazio",
    accepting: "Creazione del tuo spazio",
    slugTaken: "Questo indirizzo è già preso. Provane un altro.",
    slugRefused: "Questo indirizzo non si può usare. Provane un altro.",
    failed: "Non siamo riusciti a creare il tuo spazio. Il tuo invito è ancora valido: riprova.",
    checking: "Controllo del tuo invito",
    expiredTitle: "Questo invito è scaduto",
    expiredBody: "I link durano 7 giorni. Scrivici di nuovo e te ne manderemo un altro.",
    usedTitle: "Questo invito è già stato usato",
    usedBody: "Il tuo spazio esiste già. Accedi con la tua email per continuare a insegnare.",
    unknownTitle: "Non riconosciamo questo invito",
    unknownBody:
      "Potrebbe esserne arrivato uno più recente. Cerca l'ultima email, o scrivici di nuovo.",
    askAgain: "Chiedi un altro invito",
    signIn: "Accedi",
  },
};
