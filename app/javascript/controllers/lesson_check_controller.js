import { Controller } from "@hotwired/stimulus"

// Handles inline knowledge check questions within lessons.
// Each option has data-correct="true"|"false". On selection, shows
// immediate feedback with color coding.
export default class extends Controller {
  static targets = ["options", "option", "feedback"]

  select(event) {
    const btn = event.currentTarget
    if (this._answered) return

    this._answered = true
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
    } else {
      btn.classList.add("lesson-check__option--wrong")
      btn.style.opacity = "1"
      this._showFeedback(false)
    }
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
