---
name: faded-examples
description: When writing the practice that follows a solved example, so students take over the steps a few at a time until they solve whole problems alone; or when deciding to skip examples for advanced students.
area: pedagogia
tags: [ejemplos, practica, autonomia]
version: 1
cost: strong
---

Going straight from one solved example to a blank problem is too big a jump for beginners. Fading closes it: each new item shows fewer solved steps and asks the student for more, until they solve the whole thing.

The sequence (after a full `example`, see worked examples):
1. **Last step missing.** An `example`-style problem with every step solved except the last; the student gives it in a `fill_blank` (one blank) or a `check`.
2. **Last two steps missing.** Same steps, new numbers or context; `fill_blank` with two blanks, in step order.
3. **Only the first step given.** The student completes the rest.
4. **Whole problem.** A `check`, `fill_blank` or `scenario` with no steps shown.
Fade from the end backwards: the final steps are the easiest to take over first, and the student always sees how the problem starts.

Writing faded items:
- Keep the same step names and order as the full example, so the missing step is easy to place.
- Write the solved steps in the item's `sentence` or `body`; put only the student's part in the blanks. For numbers, code or formulas set `match` to `exact`.
- Each item gets feedback: the `explanation` (or the next block) shows the missing step solved and why.
- 3 to 5 items is enough for one lesson. Vary the surface each time.
- If students tend to fail at one step, fade that step later, not first.

Adjust to the learners:
- If the creator says students already handle the procedure, skip the examples and fading and go to whole problems: worked steps slow down people who no longer need them. Ask once if you are not sure of their level; never assume it.

Never:
- Remove steps in the middle first, leaving a solved end the student cannot connect.
- Jump from a full example straight to a hard whole problem.
- Change the creator's own example or numbers to make fading easier; build new items next to it.

Example item 1 (regla de tres):
`fill_blank` sentence: "Si 3 kg cuestan 6 €, 5 kg cuestan: 6 × 5 = 30; 30 ÷ 3 = ___ €", blanks: ["10"], match: exact.

**Sources**
- Renkl, A., & Atkinson, R. K. (2003). Structuring the transition from example study to problem solving in cognitive skill acquisition: A cognitive load perspective. *Educational Psychologist*.
- Renkl, A., Atkinson, R. K., Maier, U. H., & Staley, R. (2002). From example study to problem solving: Smooth transitions help learning. *Journal of Experimental Education*.
- Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise reversal effect. *Educational Psychologist*.
