---
name: accessibility
description: When a lesson has images, audio, video or interactive parts, or relies on colour or layout; and in review, to check every student can use it.
area: calidad
tags: [revision, accesibilidad, imagenes, audio, video]
version: 1
cost: strong
---

Every student should get the same lesson, including those who use a screen reader, cannot hear, see colours differently or read slowly.

What to check and do, by block:
- **visual**: `alt_text` says what the image shows that matters for the lesson, in one or two sentences ("Mapa de Perú con las tres regiones: costa, sierra y selva"). Not "imagen de…", not the file name. A purely decorative image gets a short neutral alt. A chart or diagram also needs its point in `body` or `caption` ("Las ventas suben cada mes de enero a junio"). If you cannot see the image, do not guess what it shows: ask the creator to describe it.
- **audio**: `transcript` holds what is said. If the creator has no transcript, say so and ask whether they can provide one; never make up its words.
- **video**: needs subtitles (`subtitles_url`); a short `body` saying what the video covers helps everyone. Point out when subtitles are missing.
- **interactive**: `alt_text` and `description` say what it is and what the student does, so someone who cannot use it knows what they missed.
- **check** and other text: meaning never depends on colour, position or shape alone. "La respuesta en verde" or "el botón de la derecha" fail for many students; name the thing in words.
- Structure: short titles that say what the block is about, lists for steps, one idea per paragraph. Links say where they go, not "haz clic aquí".
- Avoid text that is only inside an image; write it in the block.

Never:
- Never invent an image's content, a transcript or subtitles.
- Never change the creator's media or files; tell them what to add.
- Never use technical words with the creator ("WCAG", "alt", "aria"). Say "una descripción de la imagen para quien no la ve", "la transcripción del audio".

In review, report one line per item: the lesson, what is missing, what to add. Fix what you wrote yourself; ask the creator for what only they know (what a photo shows, what the audio says).

Example:
> "En la lección 3, el mapa no tiene descripción para quien no puede verlo, y el audio de la entrevista no tiene transcripción."

**Sources**
- World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. W3C Recommendation.
- CAST. (2018). *Universal Design for Learning Guidelines* (version 2.2).
- Mayer, R. E. (2009). *Multimedia Learning* (2nd ed.). Cambridge University Press.
