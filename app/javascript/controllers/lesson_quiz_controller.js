import { Controller } from "@hotwired/stimulus"

/**
 * lesson-quiz controller
 *
 * Child controller for knowledge-check sections inside the interactive lesson.
 * Dispatches quiz:correct (with XP detail) and quiz:completed events that
 * bubble up to the interactive-lesson controller for gating/unlock.
 *
 * Coexists with lesson-check controller on the same element.
 * lesson-check handles ALL visual feedback (option highlighting, feedback text,
 * micro celebration, explanation reveal). This controller only:
 *  1. Tracks the answered state independently
 *  2. Dispatches quiz:correct when the answer is right
 *  3. Dispatches quiz:completed after a delay to unlock the continue button
 */
export default class extends Controller {
  static targets = ["option"]

  static values = {
    correct: Number,   // index of the correct option (0-based)
    xp: { type: Number, default: 15 }
  }

  connect() {
    this._answered = false
    this._timers = []
  }

  disconnect() {
    this._timers.forEach(id => clearTimeout(id))
    this._timers = []
  }

  selectOption(event) {
    if (this._answered) return
    this._answered = true

    const btn = event.currentTarget
    const selectedIndex = this.optionTargets.indexOf(btn)
    const isCorrect = selectedIndex === this.correctValue

    if (isCorrect) {
      // Dispatch quiz:correct immediately so parent can show XP float
      this.element.dispatchEvent(new CustomEvent("quiz:correct", {
        bubbles: true,
        detail: { xp: this.xpValue, index: selectedIndex }
      }))

      // Unlock continue after short delay
      const timer = setTimeout(() => {
        this.element.dispatchEvent(new CustomEvent("quiz:completed", {
          bubbles: true,
          detail: { correct: true }
        }))
      }, 1500)
      this._timers.push(timer)
    } else {
      // Wrong answer — unlock continue after longer delay
      const timer = setTimeout(() => {
        this.element.dispatchEvent(new CustomEvent("quiz:completed", {
          bubbles: true,
          detail: { correct: false }
        }))
      }, 2500)
      this._timers.push(timer)
    }
  }
}
