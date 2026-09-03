// Shared submit path for interactive lesson blocks.
//
// Every block controller used to decide the outcome itself and keep it in a JS variable
// that died on reload. Now the block sends its RAW submission — which option, which
// pairing, which strings — and the server re-grades it against the stored section and
// returns the verdict. The client no longer gets a vote.
//
// A complete submission is an answer the student intended the server to judge as a
// whole. A pointer movement, keystroke, or single misplaced tile is incomplete.
//
// The element must carry, ON ITSELF OR ON AN ANCESTOR:
//   data-block-url-value="/learning/routes/:id/steps/:id/blocks/:section_index"
//
// There is no single blessed carrier. This comment used to name the
// `.lesson-section` wrapper as "the" one, and WP-21 moved the check modal out of
// that wrapper — a change that looked safe precisely because this file said the
// plumbing lived somewhere else. `closest` found nothing, the submission was
// dropped by the `return null` below, and no check reached the server for a week.
// Any element that hosts a block controller and is NOT inside a `.lesson-section`
// has to render the attribute itself; `_check.html.erb` does.

export async function submitBlock(element, payload, { complete = false } = {}) {
  // Nearest carrier wins: the `.lesson-section` wrapper for in-flow blocks, the
  // modal backdrop itself for the check (which has no section ancestor).
  const host = element.closest("[data-block-url-value]")
  const url = host?.dataset?.blockUrlValue
  if (!url) {
    // No URL means the partial was rendered outside a step (preview, agent reply).
    // Grading is not applicable there; fail quiet rather than throwing in the student's face.
    return null
  }

  const token = document.querySelector('meta[name="csrf-token"]')?.content
  const block = { ...payload, submission_complete: complete === true }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-Token": token || ""
      },
      body: JSON.stringify({ block })
    })

    if (!response.ok) return null
    return await response.json()
  } catch (_e) {
    // Offline or a transient failure. The student keeps their in-page feedback; the
    // attempt simply is not recorded, and they can submit again.
    return null
  }
}

// Announce the verdict so interactive_lesson_controller can update the step's
// completion affordance without each block knowing about it.
export function announceResult(element, result) {
  if (!result) return

  element.dispatchEvent(new CustomEvent("block:graded", {
    bubbles: true,
    detail: result
  }))
}

// The index an option/term/definition occupies in the SERVER'S stored array, which is
// not its position on screen: WP-15 permutes those columns per student and per attempt
// so position is not a tell, and every element keeps its original index in a data
// attribute. Grading is index identity against the stored array, so this is the only
// index a block may ever send or compare.
//
// Falls back to DOM position for a block rendered before the permutation shipped, or by
// anything that forgot the attribute — that is the pre-WP-15 behaviour, and it is only
// correct when the board is unpermuted, which is exactly when the fallback applies.
export function originalIndexOf(element, siblings) {
  const declared = Number(element?.dataset?.optionIndex ?? element?.dataset?.termIndex)
  if (Number.isInteger(declared)) return declared

  const position = Array.from(siblings || []).indexOf(element)
  return position >= 0 ? position : null
}
