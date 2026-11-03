import type { LocaleCode } from "../locales";

// The words of admin (Platform STEP 4 §6.4), from v2's Operador. Data only. Spanish is the
// source; a locale missing a string fails the types.

export interface AdminText {
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
    adminTitle: "Quieren enseñar",
    noApplications: "No hay solicitudes nuevas.",
    markInvited: "Marcar como invitada",
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
    adminTitle: "They want to teach",
    noApplications: "There are no new applications.",
    markInvited: "Mark as invited",
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
    adminTitle: "Querem ensinar",
    noApplications: "Não há pedidos novos.",
    markInvited: "Marcar como convidado",
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
    adminTitle: "Ils veulent enseigner",
    noApplications: "Aucune nouvelle demande.",
    markInvited: "Marquer comme invitée",
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
    adminTitle: "Vogliono insegnare",
    noApplications: "Non ci sono nuove richieste.",
    markInvited: "Segna come invitata",
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
