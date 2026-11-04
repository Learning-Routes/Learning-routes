import type { LocaleCode } from "../locales";

// The words of admin (Platform STEP 4 §6.4), from v2's Operador. Data only. Spanish is the
// source; a locale missing a string fails the types.

export interface AdminText {
  createSpace: string;
  invitedTitle: string;
  spaceName: string;
  spaceAddress: string;
  spaceAddressHint: string;
  spaceOwnerEmail: string;
  createAction: string;
  creating: string;
  /** {slug} is the new space's address. */
  created: string;
  seePage: string;
  backToAdmin: string;
  noAccount: string;
  addressTaken: string;
  addressRefused: string;
  fixName: string;
  fixEmail: string;
  adminTitle: string;
  noApplications: string;
  markInvited: string;
  decline: string;
  catalogRequests: string;
  noRequests: string;
  approve: string;
  noteLabel: string;
  listedTitle: string;
  changedSinceApproval: string;
  landingPlace: string;
  noPlace: string;
  /** {n} is the place, from 1 to 3. */
  place: string;
  save: string;
}

export const ADMIN_TEXT: Record<LocaleCode, AdminText> = {
  es: {
    createSpace: "Crear un espacio",
    invitedTitle: "Con la invitación enviada",
    spaceName: "Nombre del espacio",
    spaceAddress: "Dirección",
    spaceAddressHint: "Letras minúsculas, números y guiones. No se podrá cambiar.",
    spaceOwnerEmail: "Correo de quien lo dirige",
    createAction: "Crear el espacio",
    creating: "Creando el espacio",
    created: "Espacio creado: {slug}.",
    seePage: "Ver su página",
    backToAdmin: "Volver a admin",
    noAccount: "Esa persona todavía no ha entrado nunca. Pídele que entre una vez con su correo.",
    addressTaken: "Esa dirección ya está en uso. Elige otra.",
    addressRefused:
      "Esa dirección no se puede usar. Elige otra, con letras minúsculas, números y guiones.",
    fixName: "Escribe el nombre del espacio.",
    fixEmail: "Escribe un correo con @, como tu@ejemplo.com.",
    adminTitle: "Quieren enseñar",
    noApplications: "No hay solicitudes nuevas.",
    markInvited: "Ya envié la invitación",
    decline: "Rechazar",
    catalogRequests: "Pidieron entrar al catálogo",
    noRequests: "No hay rutas por revisar.",
    approve: "Aprobar",
    noteLabel: "Nota para quien creó la ruta",
    listedTitle: "En el catálogo",
    changedSinceApproval: "Cambió desde que se aprobó",
    landingPlace: "Lugar en «Rutas para empezar»",
    noPlace: "Ninguno",
    place: "Lugar {n}",
    save: "Guardar lugar",
  },
  en: {
    createSpace: "Create a space",
    invitedTitle: "Invitation sent",
    spaceName: "Space name",
    spaceAddress: "Address",
    spaceAddressHint: "Lower-case letters, numbers and hyphens. It can't be changed later.",
    spaceOwnerEmail: "Email of the person running it",
    createAction: "Create the space",
    creating: "Creating the space",
    created: "Space created: {slug}.",
    seePage: "See its page",
    backToAdmin: "Back to admin",
    noAccount: "That person has never signed in. Ask them to sign in once with their email.",
    addressTaken: "That address is taken. Choose another.",
    addressRefused:
      "That address can't be used. Choose another, with lower-case letters, numbers and hyphens.",
    fixName: "Enter the space's name.",
    fixEmail: "Enter an email with an @, like you@example.com.",
    adminTitle: "They want to teach",
    noApplications: "There are no new applications.",
    markInvited: "I sent the invitation",
    decline: "Decline",
    catalogRequests: "Asked to join the catalog",
    noRequests: "There are no routes to review.",
    approve: "Approve",
    noteLabel: "Note for the route's creator",
    listedTitle: "In the catalog",
    changedSinceApproval: "Changed since approval",
    landingPlace: "Place in “Routes to start with”",
    noPlace: "None",
    place: "Place {n}",
    save: "Save place",
  },
  pt: {
    createSpace: "Criar um espaço",
    invitedTitle: "Convite enviado",
    spaceName: "Nome do espaço",
    spaceAddress: "Endereço",
    spaceAddressHint: "Letras minúsculas, números e hífens. Não poderá ser alterado.",
    spaceOwnerEmail: "E-mail de quem o dirige",
    createAction: "Criar o espaço",
    creating: "Criando o espaço",
    created: "Espaço criado: {slug}.",
    seePage: "Ver a página",
    backToAdmin: "Voltar para admin",
    noAccount: "Essa pessoa nunca entrou. Peça que entre uma vez com o e-mail dela.",
    addressTaken: "Esse endereço já está em uso. Escolha outro.",
    addressRefused:
      "Esse endereço não pode ser usado. Escolha outro, com letras minúsculas, números e hífens.",
    fixName: "Digite o nome do espaço.",
    fixEmail: "Digite um e-mail com @, como voce@exemplo.com.",
    adminTitle: "Querem ensinar",
    noApplications: "Não há pedidos novos.",
    markInvited: "Já enviei o convite",
    decline: "Recusar",
    catalogRequests: "Pediram para entrar no catálogo",
    noRequests: "Não há rotas para revisar.",
    approve: "Aprovar",
    noteLabel: "Nota para quem criou a rota",
    listedTitle: "No catálogo",
    changedSinceApproval: "Mudou desde a aprovação",
    landingPlace: "Lugar em “Rotas para começar”",
    noPlace: "Nenhum",
    place: "Lugar {n}",
    save: "Salvar lugar",
  },
  fr: {
    createSpace: "Créer un espace",
    invitedTitle: "Invitation envoyée",
    spaceName: "Nom de l'espace",
    spaceAddress: "Adresse",
    spaceAddressHint: "Lettres minuscules, chiffres et tirets. Elle ne pourra pas être modifiée.",
    spaceOwnerEmail: "E-mail de la personne qui le dirige",
    createAction: "Créer l'espace",
    creating: "Création de l'espace",
    created: "Espace créé : {slug}.",
    seePage: "Voir sa page",
    backToAdmin: "Retour à l'admin",
    noAccount:
      "Cette personne ne s'est encore jamais connectée. Demandez-lui de se connecter une fois avec son e-mail.",
    addressTaken: "Cette adresse est déjà prise. Choisissez-en une autre.",
    addressRefused:
      "Cette adresse ne peut pas être utilisée. Choisissez-en une autre, avec des lettres minuscules, des chiffres et des tirets.",
    fixName: "Saisissez le nom de l'espace.",
    fixEmail: "Saisissez un e-mail avec un @, comme vous@exemple.com.",
    adminTitle: "Ils veulent enseigner",
    noApplications: "Aucune nouvelle demande.",
    markInvited: "J'ai envoyé l'invitation",
    decline: "Refuser",
    catalogRequests: "Demandes d'entrée au catalogue",
    noRequests: "Aucun parcours à examiner.",
    approve: "Approuver",
    noteLabel: "Note pour la personne qui a créé le parcours",
    listedTitle: "Dans le catalogue",
    changedSinceApproval: "Modifié depuis l'approbation",
    landingPlace: "Place dans « Des parcours pour commencer »",
    noPlace: "Aucune",
    place: "Place {n}",
    save: "Enregistrer la place",
  },
  it: {
    createSpace: "Crea uno spazio",
    invitedTitle: "Invito inviato",
    spaceName: "Nome dello spazio",
    spaceAddress: "Indirizzo",
    spaceAddressHint: "Lettere minuscole, numeri e trattini. Non si potrà cambiare.",
    spaceOwnerEmail: "Email di chi lo gestisce",
    createAction: "Crea lo spazio",
    creating: "Creazione dello spazio",
    created: "Spazio creato: {slug}.",
    seePage: "Vedi la pagina",
    backToAdmin: "Torna ad admin",
    noAccount:
      "Questa persona non ha mai effettuato l'accesso. Chiedile di accedere una volta con la sua email.",
    addressTaken: "Questo indirizzo è già in uso. Scegline un altro.",
    addressRefused:
      "Questo indirizzo non si può usare. Scegline un altro, con lettere minuscole, numeri e trattini.",
    fixName: "Scrivi il nome dello spazio.",
    fixEmail: "Scrivi un'email con la @, come tu@esempio.com.",
    adminTitle: "Vogliono insegnare",
    noApplications: "Non ci sono nuove richieste.",
    markInvited: "Ho inviato l'invito",
    decline: "Rifiuta",
    catalogRequests: "Hanno chiesto di entrare nel catalogo",
    noRequests: "Non ci sono percorsi da rivedere.",
    approve: "Approva",
    noteLabel: "Nota per chi ha creato il percorso",
    listedTitle: "Nel catalogo",
    changedSinceApproval: "Cambiato dopo l'approvazione",
    landingPlace: "Posto in «Percorsi per iniziare»",
    noPlace: "Nessuno",
    place: "Posto {n}",
    save: "Salva il posto",
  },
};
