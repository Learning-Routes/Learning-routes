import { Controller } from "@hotwired/stimulus"

// Handles inline knowledge check questions within lessons.
// Each option has data-correct="true"|"false". On selection, shows
// immediate feedback with color coding.
export default class extends Controller {
  static targets = ["options", "option", "feedback"]

  disconnect() {
    if (this._timers) this._timers.forEach(t => clearTimeout(t))
  }

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
      this._microCelebration(btn)
    } else {
      btn.classList.add("lesson-check__option--wrong")
      btn.style.opacity = "1"
      this._showFeedback(false)
    }
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
