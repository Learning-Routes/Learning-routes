import { Controller } from "@hotwired/stimulus"
import { submitBlock, announceResult, originalIndexOf } from "controllers/block_submission"

// Handles inline knowledge check questions within lessons.
// Each option has data-correct="true"|"false". On selection, shows
// immediate feedback with color coding.
export default class extends Controller {
  static targets = ["options", "option", "feedback", "explanation"]

  // THE ONLY SUBMITTER for a check block.
  //
  // `lesson-quiz` shares this element and owns the timer, XP and hearts; it must
  // never POST. Two controllers submitting to one endpoint is how the timeout
  // hole was made: the timer branch ended the block, disabled every option, and
  // dispatched `quiz:completed` — while the sole submit path lived in `select()`,
  // which only fires on a click the student could no longer make. The server was
  // never told, so no BlockAttempt existed, `outstanding_blocks_for` never
  // cleared, and `complete` refused forever.
  connect() {
    this._answered = false
    this._submitted = false
    this._timers = []

    // The timer lives in the sibling controller on this same element; it tells
    // us the block ended and we record it, rather than POSTing itself.
    this._onTimedOut = this.recordTimeout.bind(this)
    this.element.addEventListener("lesson-check:timed-out", this._onTimedOut)
  }

  disconnect() {
    this.element.removeEventListener("lesson-check:timed-out", this._onTimedOut)
    if (this._timers) this._timers.forEach(t => clearTimeout(t))
  }

  // A timeout is an OUTCOME, not the absence of one.
  //
  // `BlockGrader#grade_check` returns `graded(false, 0)` for a nil choice, so
  // this records a wrong answer worth zero that SATISFIES the gate — which is
  // the point. `BlockAttempt::RELEASE_AFTER = 3` exists so a student who cannot
  // get it right is not trapped, and a timeout that records nothing bypasses
  // that release entirely.
  recordTimeout() {
    if (this._submitted) return

    this._answered = true
    this._submitted = true
    submitBlock(this.element, { option_index: null, timed_out: true }, { complete: true })
      .then((result) => announceResult(this.element, result))
  }

  // Called by interactive-lesson when this section becomes visible
  activate() {
    // Nothing to start here, but resets if needed
  }

  // Reset state for revisiting
  reset() {
    this._answered = false
    this._submitted = false
    if (this._timers) this._timers.forEach(t => clearTimeout(t))
    this._timers = []

    this.optionTargets.forEach(opt => {
      opt.style.pointerEvents = ""
      opt.style.opacity = ""
      opt.classList.remove("lesson-check__option--correct", "lesson-check__option--wrong")
      opt.style.boxShadow = ""
    })

    if (this.hasFeedbackTarget) {
      this.feedbackTarget.style.display = "none"
    }
    if (this.hasExplanationTarget) {
      this.explanationTarget.style.display = "none"
    }
  }

  select(event) {
    const btn = event.currentTarget
    if (this._answered || this._submitted) return

    this._answered = true
    this._submitted = true
    const isCorrect = btn.dataset.correct === "true"

    // Disable all options
    this.optionTargets.forEach(opt => {
      opt.style.pointerEvents = "none"
      opt.style.opacity = "0.6"

      if (opt.dataset.correct === "true") {
        opt.classList.add("lesson-check__option--correct")
        opt.style.opacity = "1"
      }
    })

    if (isCorrect) {
      btn.classList.add("lesson-check__option--correct")
      this._showFeedback(true)
      this._microCelebration(btn)
    } else {
      btn.classList.add("lesson-check__option--wrong")
      btn.style.opacity = "1"
      this._showFeedback(false)
    }

    // Show explanation if present
    if (this.hasExplanationTarget) {
      this.explanationTarget.style.display = ""
    }

    // Dispatch event so lesson-nav can ungate the continue button
    // Send the RAW choice; the server decides whether it was right. The visual
    // feedback above is optimistic and is corrected by the response if they disagree.
    // data-option-index FIRST, position only as a fallback. WP-15 §B permutes the
    // options for display while keeping each one's original index in the stored
    // `options` array, and `grade_check` compares against that original index — so a
    // position-derived index would now be the wrong answer on a shuffled board.
    const optionIndex = originalIndexOf(btn, this.optionTargets)
    submitBlock(this.element, { option_index: optionIndex }, { complete: true })
      .then((result) => announceResult(this.element, result))

    this.element.dispatchEvent(new CustomEvent("lesson-check:answered", {
      bubbles: true,
      detail: { correct: isCorrect }
    }))
  }

  _microCelebration(btn) {
    // Green pulse + floating "+10 XP"
    if (!this._timers) this._timers = []

    btn.style.transition = "box-shadow 0.3s"
    btn.style.boxShadow = "inset 0 0 0 2px rgba(91,168,128,0.4), 0 0 12px rgba(91,168,128,0.15)"
    this._timers.push(setTimeout(() => { btn.style.boxShadow = "" }, 600))

    // Floating XP
    const span = document.createElement("span")
    span.textContent = "+10 XP"
    span.style.cssText = `
      position:absolute; top:-0.3rem; right:0.5rem;
      font-family:'DM Mono',monospace; font-size:0.78rem; font-weight:700;
      color:#B09848; pointer-events:none; opacity:1; z-index:10;
      transition:all 0.9s cubic-bezier(0.16,1,0.3,1);
    `
    const pos = getComputedStyle(btn.parentElement).position
    if (pos === "static") btn.parentElement.style.position = "relative"
    btn.parentElement.appendChild(span)

    requestAnimationFrame(() => {
      span.style.opacity = "0"
      span.style.transform = "translateY(-2rem)"
    })
    this._timers.push(setTimeout(() => span.remove(), 1100))
  }

  _showFeedback(correct) {
    if (!this.hasFeedbackTarget) return
    const fb = this.feedbackTarget
    fb.style.display = "block"

    if (correct) {
      fb.className = "lesson-check__feedback lesson-check__feedback--correct"
      fb.textContent = "\u{1F389} " + (document.documentElement.lang === "es" ? "Correcto!" : "Correct!")
    } else {
      fb.className = "lesson-check__feedback lesson-check__feedback--wrong"
      fb.textContent = (document.documentElement.lang === "es"
        ? "No exactamente. Mira la respuesta correcta arriba."
        : "Not quite. See the correct answer above.")
    }
  }
}
