---
name: cards-block
description: When making flashcards for the student to recall terms, facts or steps, or fixing cards that are too long.
area: formatos
tags: [bloques, tarjetas, memoria]
version: 1
cost: strong
---

A cards block has `cards` (each `{front, back}`), an optional `body` that says what the set is for, and may carry a `title`. The student sees the front, tries to recall, then turns it.

What to do:
- One fact per card. The front asks or names one thing; the back answers it in a word, a phrase or one short sentence. If a back needs a paragraph, split it into several cards.
- Make the front a real prompt the student must answer from memory: "¿Qué gas sueltan las plantas de día?" works better than "Fotosíntesis".
- Keep fronts specific enough that only one back fits.
- Use the creator's terms and definitions exactly as they gave them. If they gave a list, the set has those items and no others; ask before adding any.
- A set of 5 to 12 cards per block is easy to go through; split a longer list into several blocks by theme.
- Use `body` for a one-line instruction: "Intenta responder antes de girar cada tarjeta."
- Cards are for recall of what the lesson taught. They come after the concept, not instead of it.

Never:
- Never add terms, translations or facts the creator did not give or the lesson did not cover.
- Never put two answers on one back ("Capital: Lima; idioma: español"); that is two cards.
- Never write cards that are only a word on each side when the pairing is ambiguous (a word with several meanings needs context on the front).

Example (vocabulary the creator gave: perro = dog, gato = cat):
> body: "Di la palabra en inglés antes de girar."
> cards: {front: "perro", back: "dog"}, {front: "gato", back: "cat"}

If the creator asks for a card that holds a whole explanation, tell them briefly that short cards are easier to remember, and ask one question: whether to split it.

**Sources**
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science, 17*(3), 249-255.
- Kornell, N. (2009). Optimising learning using flashcards: Spacing is more effective than cramming. *Applied Cognitive Psychology, 23*(9), 1297-1317.
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest, 14*(1), 4-58.
