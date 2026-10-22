import { Controller } from "@hotwired/stimulus"

// STEP 41 §2.3 — the closing sheet. An idea fills the field; focusing the field
// makes the blueprint's dotted lines flow; asking draws the first module with
// the topic on its chip, then goes where the form points: the wizard when
// signed in, sign-up (which keeps the topic) when not.
const DRAW_MS = 900

export default class extends Controller {
  static targets = ["field", "plan", "chip"]

  fill(e) {
    this.fieldTarget.value = e.currentTarget.textContent.trim()
    this.fieldTarget.focus()
  }

  wait() { this.planTarget.classList.add("lp-wait") }

  rest() { this.planTarget.classList.remove("lp-wait") }

  ask(e) {
    const topic = this.fieldTarget.value.trim()
    if (this.drawn) return // the drawing has run; this is the real submit
    e.preventDefault()
    if (!topic) { this.fieldTarget.focus(); return }
    this.chipTarget.textContent = topic.charAt(0).toUpperCase() + topic.slice(1)
    this.planTarget.classList.remove("lp-drawn")
    void this.planTarget.offsetWidth
    this.planTarget.classList.add("lp-drawn")
    this.drawn = true
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setTimeout(() => e.target.requestSubmit(), reduce ? 0 : DRAW_MS)
  }
}
