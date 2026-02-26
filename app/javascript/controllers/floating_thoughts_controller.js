import { Controller } from "@hotwired/stimulus"

// Displays floating comment bubbles that animate in.
// Detects the initial transform direction (translateX or translateY) from CSS.
// With multiple thoughts: cycles through them with fade in/out.
// With a single thought: fades it in once and keeps it visible.
export default class extends Controller {
  static targets = ["thought"]
  static values = { interval: { type: Number, default: 4000 } }

  connect() {
    this.currentIndex = 0
    if (this.thoughtTargets.length === 0) return

    // Detect animation direction from first element's initial transform
    const first = this.thoughtTargets[0]
    const initialTransform = first.style.transform || ""
    this._useX = initialTransform.includes("translateX")

    // Hide all thoughts initially (preserve their initial transform)
    this.thoughtTargets.forEach(el => {
      el.style.opacity = "0"
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

    const hideTransform = this._useX ? "translateX(-12px)" : "translateY(-10px)"
    const startTransform = this._useX ? "translateX(-8px)" : "translateY(12px)"
    const endTransform = this._useX ? "translateX(0)" : "translateY(0)"

    // Hide previous thought (only if multiple)
    if (thoughts.length > 1) {
      const prevIndex = (this.currentIndex - 1 + thoughts.length) % thoughts.length
      const prev = thoughts[prevIndex]
      if (prev) {
        prev.style.transition = "opacity 0.5s ease, transform 0.5s ease"
        prev.style.opacity = "0"
        prev.style.transform = hideTransform
      }
    }

    // Show current thought
    const current = thoughts[this.currentIndex]
    current.style.transition = "none"
    current.style.transform = startTransform
    current.style.opacity = "0"
    // Force reflow
    current.offsetHeight
    current.style.transition = "opacity 0.5s ease, transform 0.5s ease"
    current.style.opacity = "1"
    current.style.transform = endTransform

    // Only continue cycling if there are multiple thoughts
    if (thoughts.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % thoughts.length
      this._timeout = setTimeout(() => this._showNext(), this.intervalValue)
    }
  }
}
