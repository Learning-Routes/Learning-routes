import { Controller } from "@hotwired/stimulus"

// Handles visual state for checkbox/radio card selections
// Applies inline styles when checked (more reliable than Tailwind peer-checked with arbitrary values)
export default class extends Controller {
  static targets = ["card"]

  connect() {
    this.updateAll()
  }

  toggle(event) {
    const input = event.target
    // For radio buttons, uncheck all siblings first
    if (input.type === "radio") {
      this.cardTargets.forEach(card => this.applyStyle(card, false))
    }
    this.updateAll()
  }

  updateAll() {
    this.cardTargets.forEach(card => {
      const input = card.querySelector("input[type='checkbox'], input[type='radio']")
      if (input) this.applyStyle(card, input.checked)
    })
  }

  applyStyle(card, checked) {
    const div = card.querySelector("[data-card-visual]")
    if (!div) return
    const style = getComputedStyle(document.documentElement)
    if (checked) {
      div.style.borderColor = style.getPropertyValue("--color-txt").trim() || "#2C261E"
      div.style.background = style.getPropertyValue("--color-tint").trim() || "rgba(44,38,30,0.04)"
    } else {
      div.style.borderColor = style.getPropertyValue("--color-border-subtle").trim() || "rgba(28,24,18,0.08)"
      div.style.background = style.getPropertyValue("--color-card").trim() || "#FEFDFB"
    }
  }
}
