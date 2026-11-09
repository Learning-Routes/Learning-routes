---
name: answer-check
description: When reviewing check blocks, or the creator's quiz questions, to confirm each has exactly one correct option and that it really is correct.
area: calidad
tags: [revision, preguntas, evaluacion]
version: 1
cost: strong
---

A check marked wrong teaches the wrong thing and tells the student who got it right that they failed. Check every one.

For each check block (`question`, `options` with `{label, correct}`, `explanation`):
1. Solve the question yourself before looking at which option is marked. For arithmetic, units, dates or logic, work it out step by step; do not trust a quick read. Fractions: common denominator first. Percentages: of what. Units: convert before comparing.
2. Count the options marked `correct: true`. It must be exactly one. None, or two or more, is a problem.
3. Compare: is your answer the one marked? Is any unmarked option also defensibly right (a distractor that is true, or true under another reasonable reading)?
4. Read the `explanation`: it must agree with the marked answer and with your working. An explanation that contradicts its own answer is a problem too.
5. Check the question tests what the lesson taught, not something it never covered.

What to report, in plain words, one line per problem: the lesson, the question, what is wrong, and the right value with its short working. Example:

> "En la lección 2, la pregunta «¿Cuánto es 2/3 + 1/6?» tiene marcada «3/9», pero el resultado es 5/6: 2/3 = 4/6, y 4/6 + 1/6 = 5/6."
> "En la lección 5, «¿Cuál es el océano más grande?» tiene dos respuestas marcadas como correctas (Pacífico y Atlántico); solo el Pacífico lo es."

Then ask one question: whether to fix it. When the creator says yes, change only what is wrong.

Never:
- Never silently change the creator's question or answer. Their words stay as they are until they agree.
- Never say a check is fine without having solved it.
- Never flag something as wrong if you are not sure; say instead what to verify and why you have a doubt.
- Never show ids, field names or "correct: true" to the creator. Say "la respuesta marcada como correcta".

If everything is right, say so in one line, and name how many questions you checked.

**Sources**
- Haladyna, T. M., Downing, S. M., & Rodriguez, M. C. (2002). A review of multiple-choice item-writing guidelines for classroom assessment. *Applied Measurement in Education, 15*(3), 309-333.
- Butler, A. C., & Roediger, H. L. (2008). Feedback enhances the positive effects and reduces the negative effects of multiple-choice testing. *Memory & Cognition, 36*(3), 604-616.
