---
name: check-block
description: When writing or fixing a check block, a multiple-choice question that lets the student test what they just read.
area: formatos
tags: [bloques, preguntas, evaluacion]
version: 1
cost: strong
---

A check block has `question`, `options` (each `{label, correct}`) and an optional `explanation` shown after the student answers.

What to do:
- Ask about one idea the lesson actually taught. A student who read the lesson should be able to answer; one who did not should not get it by guessing from wording.
- Exactly one option has `correct: true`. Before writing it, work out the answer yourself; for any arithmetic, compute it step by step.
- Three or four options. Each wrong option (distractor) comes from a real mistake students make on this idea: a common misconception, a step forgotten, a rule applied in the wrong place. If you cannot name the mistake behind a distractor, replace it.
- Keep options alike in length, grammar and detail, so the longest or most precise one does not give itself away. Vary where the correct one sits.
- Write the question as a full question, stated positively. Avoid "¿Cuál NO…?"; if a negative is unavoidable, make it bold.
- No "todas las anteriores", "ninguna de las anteriores" or trick wording.
- Always write `explanation`: why the correct answer is right, and why the most tempting wrong one is wrong, in one to three sentences. It teaches, so it never just says "Correcto".

Never:
- Never mark two options correct. If the creator wants a question with several right answers, explain that this kind of question has one, and offer to reword it so one answer fits, or to split it.
- Never test something the lesson did not cover, or a detail nobody needs.
- Never change a question the creator wrote; if its marked answer looks wrong, tell them plainly and let them decide.

Example:
> question: "¿Qué alimenta a la masa madre?"
> options: "La harina" (correct: true), "La sal", "El agua tibia"   ← each wrong one is something beginners really believe
> explanation: "La harina da a las levaduras el almidón que comen. La sal se añade después y, en exceso, las frena."

**Sources**
- Haladyna, T. M., Downing, S. M., & Rodriguez, M. C. (2002). A review of multiple-choice item-writing guidelines for classroom assessment. *Applied Measurement in Education, 15*(3), 309-333.
- Butler, A. C., & Roediger, H. L. (2008). Feedback enhances the positive effects and reduces the negative effects of multiple-choice testing. *Memory & Cognition, 36*(3), 604-616.
- Hattie, J., & Timperley, H. (2007). The power of feedback. *Review of Educational Research, 77*(1), 81-112.
