import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { fired: Boolean }

  connect() {
    this.firedValue = false
  }

  async fire() {
    if (this.firedValue) return
    this.firedValue = true

    try {
      const confetti = (await import("canvas-confetti")).default
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.5, y: 0.8 },
        colors: ["#F5C518", "#4CAF50", "#2C261E", "#8b5cf6", "#3b82f6"],
        disableForReducedMotion: true,
        ticks: 150
      })
    } catch (e) {
      // canvas-confetti not available — silently skip
    }
  }

  // Allow re-firing for next section
  reset() {
    this.firedValue = false
  }
}
