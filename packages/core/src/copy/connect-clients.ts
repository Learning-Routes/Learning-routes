import type { LocaleCode } from "../locales";

// The steps for each assistant on "Conecta tu asistente" (Platform STEP 7 §4). Data only. A button's
// name is written as that product shows it, in English, because that is what the person will see.
// Checked against each product's own docs on 4 November 2026.

export type ConnectClient = "claude" | "claude-code" | "chatgpt" | "gemini-cli";

export const CONNECT_CLIENTS: readonly ConnectClient[] = [
  "claude",
  "claude-code",
  "chatgpt",
  "gemini-cli",
];

export const CLIENT_NAMES: Record<ConnectClient, string> = {
  claude: "Claude",
  "claude-code": "Claude Code",
  chatgpt: "ChatGPT",
  "gemini-cli": "Gemini CLI",
};

/** The one line that adds the server, for the clients that have one. {address} is the server's. */
export const CLIENT_COMMANDS: Partial<Record<ConnectClient, string>> = {
  "claude-code": "claude mcp add --transport http --scope user learning-routes {address}",
  "gemini-cli": "gemini mcp add --transport http learning-routes {address}",
};

export interface ConnectClientsText {
  tabsLabel: string;
  copyCommand: string;
  steps: Record<ConnectClient, readonly string[]>;
  /** What a plan must include, where the product says so. Checked 5 November 2026. */
  plans: Partial<Record<ConnectClient, string>>;
}

export const CONNECT_CLIENTS_TEXT: Record<LocaleCode, ConnectClientsText> = {
  es: {
    tabsLabel: "Tu asistente",
    plans: {
      chatgpt:
        "Para crear rutas desde ChatGPT necesitas un plan Business, Enterprise o Edu, según OpenAI. En Pro solo puede leer. En otros planes, confírmalo con OpenAI, o usa Claude.",
    },
    copyCommand: "Copiar comando",
    steps: {
      claude: [
        "En Claude, abre Customize, luego Connectors, y elige “+ Add” y “Add custom connector”.",
        "Pega la dirección y pulsa “Continue” hasta “Add”.",
        "Pulsa “Connect”, entra con tu correo y pulsa “Permitir”.",
      ],
      "claude-code": [
        "Pega este comando en tu terminal.",
        "En Claude Code, escribe /mcp y elige learning-routes.",
        "Entra con tu correo y pulsa “Permitir”.",
      ],
      chatgpt: [
        "Abre chatgpt.com/plugins, pulsa el botón + y elige “Add custom MCP server”.",
        "Pega la dirección en “Connection” y acepta el aviso.",
        "Pulsa “Create as a plugin”, entra con tu correo y pulsa “Permitir”.",
      ],
      "gemini-cli": [
        "Pega este comando en tu terminal.",
        "En Gemini CLI, escribe /mcp auth learning-routes.",
        "Entra con tu correo y pulsa “Permitir”.",
      ],
    },
  },
  en: {
    tabsLabel: "Your assistant",
    plans: {
      chatgpt:
        "To create routes from ChatGPT you need a Business, Enterprise or Edu plan, OpenAI says. On Pro it can only read. On other plans, check with OpenAI, or use Claude.",
    },
    copyCommand: "Copy command",
    steps: {
      claude: [
        "In Claude, open Customize, then Connectors, and choose “+ Add” and “Add custom connector”.",
        "Paste the address and press “Continue” until “Add”.",
        "Press “Connect”, sign in with your email, and press “Allow”.",
      ],
      "claude-code": [
        "Paste this command into your terminal.",
        "In Claude Code, type /mcp and choose learning-routes.",
        "Sign in with your email and press “Allow”.",
      ],
      chatgpt: [
        "Open chatgpt.com/plugins, press the + button, and choose “Add custom MCP server”.",
        "Paste the address under “Connection” and accept the warning.",
        "Press “Create as a plugin”, sign in with your email, and press “Allow”.",
      ],
      "gemini-cli": [
        "Paste this command into your terminal.",
        "In Gemini CLI, type /mcp auth learning-routes.",
        "Sign in with your email and press “Allow”.",
      ],
    },
  },
  pt: {
    // Pending native review.
    tabsLabel: "Seu assistente",
    plans: {
      chatgpt:
        "Para criar rotas pelo ChatGPT você precisa de um plano Business, Enterprise ou Edu, segundo a OpenAI. No Pro ele só pode ler. Em outros planos, confirme com a OpenAI ou use o Claude.",
    },
    copyCommand: "Copiar comando",
    steps: {
      claude: [
        "No Claude, abra Customize, depois Connectors, e escolha “+ Add” e “Add custom connector”.",
        "Cole o endereço e clique em “Continue” até “Add”.",
        "Clique em “Connect”, entre com seu e-mail e clique em “Permitir”.",
      ],
      "claude-code": [
        "Cole este comando no seu terminal.",
        "No Claude Code, digite /mcp e escolha learning-routes.",
        "Entre com seu e-mail e clique em “Permitir”.",
      ],
      chatgpt: [
        "Abra chatgpt.com/plugins, clique no botão + e escolha “Add custom MCP server”.",
        "Cole o endereço em “Connection” e aceite o aviso.",
        "Clique em “Create as a plugin”, entre com seu e-mail e clique em “Permitir”.",
      ],
      "gemini-cli": [
        "Cole este comando no seu terminal.",
        "No Gemini CLI, digite /mcp auth learning-routes.",
        "Entre com seu e-mail e clique em “Permitir”.",
      ],
    },
  },
  fr: {
    // Pending native review.
    tabsLabel: "Votre assistant",
    plans: {
      chatgpt:
        "Pour créer des parcours depuis ChatGPT, il faut une offre Business, Enterprise ou Edu, selon OpenAI. Avec Pro, il peut seulement lire. Pour les autres offres, vérifiez auprès d'OpenAI, ou utilisez Claude.",
    },
    copyCommand: "Copier la commande",
    steps: {
      claude: [
        "Dans Claude, ouvrez Customize, puis Connectors, et choisissez « + Add » et « Add custom connector ».",
        "Collez l'adresse et cliquez sur « Continue » jusqu'à « Add ».",
        "Cliquez sur « Connect », connectez-vous avec votre e-mail et cliquez sur « Autoriser ».",
      ],
      "claude-code": [
        "Collez cette commande dans votre terminal.",
        "Dans Claude Code, tapez /mcp et choisissez learning-routes.",
        "Connectez-vous avec votre e-mail et cliquez sur « Autoriser ».",
      ],
      chatgpt: [
        "Ouvrez chatgpt.com/plugins, cliquez sur le bouton + et choisissez « Add custom MCP server ».",
        "Collez l'adresse sous « Connection » et acceptez l'avertissement.",
        "Cliquez sur « Create as a plugin », connectez-vous avec votre e-mail et cliquez sur « Autoriser ».",
      ],
      "gemini-cli": [
        "Collez cette commande dans votre terminal.",
        "Dans Gemini CLI, tapez /mcp auth learning-routes.",
        "Connectez-vous avec votre e-mail et cliquez sur « Autoriser ».",
      ],
    },
  },
  it: {
    // Pending native review.
    tabsLabel: "Il tuo assistente",
    plans: {
      chatgpt:
        "Per creare percorsi da ChatGPT serve un piano Business, Enterprise o Edu, secondo OpenAI. Con Pro può solo leggere. Per gli altri piani, verifica con OpenAI, o usa Claude.",
    },
    copyCommand: "Copia comando",
    steps: {
      claude: [
        "In Claude, apri Customize, poi Connectors, e scegli “+ Add” e “Add custom connector”.",
        "Incolla l'indirizzo e premi “Continue” fino ad “Add”.",
        "Premi “Connect”, accedi con la tua email e premi “Consenti”.",
      ],
      "claude-code": [
        "Incolla questo comando nel terminale.",
        "In Claude Code, digita /mcp e scegli learning-routes.",
        "Accedi con la tua email e premi “Consenti”.",
      ],
      chatgpt: [
        "Apri chatgpt.com/plugins, premi il pulsante + e scegli “Add custom MCP server”.",
        "Incolla l'indirizzo in “Connection” e accetta l'avviso.",
        "Premi “Create as a plugin”, accedi con la tua email e premi “Consenti”.",
      ],
      "gemini-cli": [
        "Incolla questo comando nel terminale.",
        "In Gemini CLI, digita /mcp auth learning-routes.",
        "Accedi con la tua email e premi “Consenti”.",
      ],
    },
  },
};
