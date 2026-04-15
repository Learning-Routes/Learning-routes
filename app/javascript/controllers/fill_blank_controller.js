// app/javascript/controllers/fill_blank_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input", "feedback"]
  static values = { answers: Array }

  connect() {
    this.correct = new Set()
  }

  checkAnswer(event) {
    const input = event.currentTarget
    const index = parseInt(input.dataset.blankIndex)
    const expected = this.answersValue[index]
    if (!expected) return

    const value = input.value.trim().toLowerCase()
    const answer = expected.toLowerCase()

    if (value === answer) {
      input.style.borderColor = "#10b981"
      input.style.background = "rgba(16, 185, 129, 0.1)"
      input.style.color = "#059669"
      this.correct.add(index)

      if (this.correct.size === this.answersValue.length) {
        this.feedbackTarget.textContent = "All blanks filled correctly!"
        this.feedbackTarget.style.color = "#10b981"
        this.feedbackTarget.classList.remove("hidden")
      }
    } else if (value.length >= answer.length) {
      input.style.borderColor = "#ef4444"
      input.style.background = "rgba(239, 68, 68, 0.05)"
      input.classList.add("shake-horizontal")
      setTimeout(() => {
        input.classList.remove("shake-horizontal")
        if (!this.correct.has(index)) {
          input.style.borderColor = "rgba(28, 24, 18, 0.15)"
          input.style.background = "rgba(28, 24, 18, 0.02)"
        }
      }, 500)
    } else {
      // Still typing - neutral
      input.style.borderColor = "rgba(28, 24, 18, 0.15)"
      input.style.background = "rgba(28, 24, 18, 0.02)"
    }
  }
}
