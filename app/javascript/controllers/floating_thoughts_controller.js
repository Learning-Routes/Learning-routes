import { Controller } from "@hotwired/stimulus"

// Displays floating comment bubbles that animate in.
// With multiple thoughts: cycles through them with fade in/out.
// With a single thought: fades it in once and keeps it visible.
export default class extends Controller {
  static targets = ["thought"]
  static values = { interval: { type: Number, default: 4000 } }

  connect() {
    this.currentIndex = 0
    if (this.thoughtTargets.length === 0) return

    // Hide all thoughts initially
    this.thoughtTargets.forEach(el => {
      el.style.opacity = "0"
      el.style.transform = "translateY(12px)"
    })

    // Show first thought after a short delay
    this._timeout = setTimeout(() => this._showNext(), 600)
  }

  disconnect() {
    if (this._timeout) clearTimeout(this._timeout)
  }

  _showNext() {
    const thoughts = this.thoughtTargets
    if (thoughts.length === 0) return

    // Hide previous thought (only if multiple)
    if (thoughts.length > 1) {
      const prevIndex = (this.currentIndex - 1 + thoughts.length) % thoughts.length
      const prev = thoughts[prevIndex]
      if (prev) {
        prev.style.transition = "opacity 0.6s ease, transform 0.6s ease"
        prev.style.opacity = "0"
        prev.style.transform = "translateY(-10px)"
      }
    }

    // Show current thought
    const current = thoughts[this.currentIndex]
    current.style.transition = "none"
    current.style.transform = "translateY(12px)"
    current.style.opacity = "0"
    // Force reflow
    current.offsetHeight
    current.style.transition = "opacity 0.6s ease, transform 0.6s ease"
    current.style.opacity = "1"
    current.style.transform = "translateY(0)"

    // Only continue cycling if there are multiple thoughts
    if (thoughts.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % thoughts.length
      this._timeout = setTimeout(() => this._showNext(), this.intervalValue)
    }
  }
}
