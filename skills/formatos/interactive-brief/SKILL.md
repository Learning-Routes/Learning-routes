---
name: interactive-brief
description: When the creator wants an interactive activity (a game, simulator, practice tool) or brings an interactive HTML creation they already made.
area: formatos
tags: [bloques, interactivo, actividades, creaciones]
version: 1
cost: strong
---

Two cases. Find out which one with a single question if it is not clear.

**The creator already made it** (a piano, a game, a simulator in one HTML file):
- It goes into the lesson exactly as they made it. Never rewrite, shorten, "improve" or rebuild it, and never offer to make a new version, even if they ask whether it could be better. Say it will go in as it is.
- If they want changes, those are theirs to make in the tool they used; you can describe what to change in plain words.
- Ask only what the lesson needs: which lesson it belongs to, and its shape (wide 16:9, standard 4:3, square 1:1, tall 3:4) if you cannot tell. Write a short `description` of what the student does and an `alt_text` that says what it is for someone who cannot use it.
- Warn plainly, without jargon, about what will not work here: it cannot reach the internet, save progress in the browser, open new windows or pop-up messages, and it has a size limit. It can load common libraries and Google Fonts.
- A "finished" signal is the only line that may be added to their file, and only if the creator asks for it.

**The creator wants one but has none:**
- First see if an activity the platform already has fits: matching pairs (term to definition), fill in the blank, a scenario with choices and consequences, a simulation with sliders, flashcards, a code playground. Offer the one that fits best and build it.
- If none fits, write a brief the creator can take to whoever or whatever builds it: the learning goal in one sentence; what the student sees; what they do, step by step; what feedback they get when right and when wrong; how they know they are done; the shape. Keep it under ten lines. Do not write the HTML yourself here.

Never:
- Never promise an activity you cannot add.
- Never call it "code", "HTML", "embed" or name tools when talking to the creator unless they used those words first. Say "tu actividad" or "tu creación".

Example brief:
> "Meta: ordenar fracciones de menor a mayor. El alumno ve 5 tarjetas (1/2, 1/3, 3/4…). Las arrastra a una fila. Si el orden es correcto, la fila se pone verde y aparece «¡Bien!»; si no, se marca la primera tarjeta mal colocada. Termina al acertar tres rondas. Forma: ancha."

**Sources**
- de Jong, T., & van Joolingen, W. R. (1998). Scientific discovery learning with computer simulations of conceptual domains. *Review of Educational Research, 68*(2), 179-201.
- Hattie, J., & Timperley, H. (2007). The power of feedback. *Review of Educational Research, 77*(1), 81-112.
- Clark, R. C., & Mayer, R. E. (2016). *e-Learning and the Science of Instruction* (4th ed.). Wiley.
