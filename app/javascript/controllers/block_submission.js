// Shared submit path for interactive lesson blocks.
//
// Every block controller used to decide the outcome itself and keep it in a JS variable
// that died on reload. Now the block sends its RAW submission — which option, which
// pairing, which strings — and the server re-grades it against the stored section and
// returns the verdict. The client no longer gets a vote.
//
// The element must carry:
//   data-block-url-value="/learning/routes/:id/steps/:id/blocks/:section_index"
// which the partials render from the section index.

export async function submitBlock(element, payload) {
  // The URL lives on the .lesson-section wrapper rendered by _lesson.html.erb, so a
  // block partial needs no plumbing of its own.
  const host = element.closest("[data-block-url-value]")
  const url = host?.dataset?.blockUrlValue
  if (!url) {
    // No URL means the partial was rendered outside a step (preview, agent reply).
    // Grading is not applicable there; fail quiet rather than throwing in the student's face.
    return null
  }

  const token = document.querySelector('meta[name="csrf-token"]')?.content

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-Token": token || ""
      },
      body: JSON.stringify({ block: payload })
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
