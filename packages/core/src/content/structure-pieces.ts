import { type Block, type Builder, type Node, only, plain } from "./structure-builder";

// The pieces of a document that become more than words: a question, a card, an image and a video
// (Platform STEP 8 §2).

const TICK = /\s*✅\s*/u;
const ANSWER = /^\**(?:respuesta|answer|explicaci[oó]n)\**\s*:\**\s*/iu;
const EXERCISE = /^\**(?:ejercicio|exercise)\b[^:]*:\**\s*/iu;
const VIDEO = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/|youtu\.be\/|vimeo\.com\/)\S+$/i;
/** A question: the paragraph before a list with a ✅, and an answer's words after it. */
export function asCheck(builder: Builder, nodes: Node[], at: number) {
  const [asked, list, after] = [nodes[at], nodes[at + 1], nodes[at + 2]];
  if (asked?.type !== "paragraph" || list?.type !== "list") {
    return 0;
  }
  const items = list.children ?? [];
  if (!items.some((item) => TICK.test(plain(item)))) {
    return 0;
  }
  const answer = after?.type === "paragraph" ? plain(after) : "";
  const explained = ANSWER.test(answer);
  builder.add(
    {
      type: "check",
      question: builder.text(plain(asked)),
      options: items.map((item) => ({
        label: builder.text(plain(item).replace(TICK, " ").trim()),
        correct: TICK.test(plain(item)),
      })),
      ...(explained ? { explanation: builder.text(answer.replace(ANSWER, "")) } : {}),
    } as Block,
    asked,
    `check: ${plain(asked)}`,
  );
  return explained ? 3 : 2;
}

/** A card: "Ejercicio: …" and then "Respuesta: …". Cards in a row stay one block. */
export function asCard(builder: Builder, nodes: Node[], at: number) {
  const [front, back] = [nodes[at], nodes[at + 1]];
  if (front?.type !== "paragraph" || back?.type !== "paragraph") {
    return 0;
  }
  if (!(EXERCISE.test(plain(front)) && ANSWER.test(plain(back)))) {
    return 0;
  }
  const card = {
    front: builder.text(plain(front).replace(EXERCISE, "")),
    back: builder.text(plain(back).replace(ANSWER, "")),
  };
  builder.flush();
  const last = builder.lastBlock() as { type?: string; cards?: (typeof card)[] } | undefined;
  if (last?.type === "cards") {
    last.cards?.push(card);
    builder.note(front, "imported", "card");
  } else {
    builder.add({ type: "cards", cards: [card] } as Block, front, "card");
  }
  return 2;
}

export function asImage(builder: Builder, node: Node) {
  const image = only(node, "image");
  if (!image) {
    return false;
  }
  if (!image.url?.startsWith("https://")) {
    builder.flush();
    builder.note(node, "skipped", `image: ${image.alt ?? ""}`, "images come from an https address");
    return true;
  }
  builder.add(
    {
      type: "visual",
      image_url: image.url,
      ...(image.alt ? { alt_text: builder.text(image.alt) } : {}),
    } as Block,
    node,
    `image: ${image.alt ?? image.url}`,
  );
  return true;
}

export function asVideo(builder: Builder, node: Node) {
  const link = only(node, "link")?.url;
  const words = node.type === "paragraph" ? plain(node).trim() : "";
  const address = link ?? words;
  if (!VIDEO.test(address)) {
    return false;
  }
  builder.add({ type: "video", video_url: address } as Block, node, `video: ${address}`);
  return true;
}
