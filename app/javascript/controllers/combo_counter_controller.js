import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["display"]
  static values = { stepId: String }

  connect() {
    this.count = this.loadCount()
    this.updateDisplay()
  }

  increment() {
    this.count++
    this.saveCount()
    this.updateDisplay()

    // Bounce animation
    if (this.hasDisplayTarget) {
      this.displayTarget.style.transform = "scale(1.3)"
      this.displayTarget.style.transition = "transform 0.2s ease"
      setTimeout(() => {
        this.displayTarget.style.transform = "scale(1)"
      }, 200)
    }
  }

  resetCombo() {
    this.count = 0
    this.saveCount()
    this.updateDisplay()
  }

  updateDisplay() {
    if (!this.hasDisplayTarget) return

    if (this.count < 2) {
      this.displayTarget.style.display = "none"
      return
    }

    this.displayTarget.style.display = "flex"

    let text = "x" + this.count
    let color = "#2C261E"

    if (this.count >= 5) {
      text = "x" + this.count + " On Fire"
      color = "#F5C518"
    } else if (this.count >= 3) {
      text = "x" + this.count + " Streak"
      color = "#4CAF50"
    }

    this.displayTarget.textContent = text
    this.displayTarget.style.color = color
  }

  loadCount() {
    try {
      const key = "combo_" + (this.stepIdValue || "default")
      return parseInt(sessionStorage.getItem(key)) || 0
    } catch (e) {
      return 0
    }
  }

  saveCount() {
    try {
      const key = "combo_" + (this.stepIdValue || "default")
      sessionStorage.setItem(key, this.count.toString())
    } catch (e) {
      // sessionStorage unavailable
    }
  }
}
