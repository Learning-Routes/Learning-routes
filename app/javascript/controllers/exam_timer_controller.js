import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["display", "form"]
  static values = { durationSeconds: { type: Number, default: 1800 }, warningThresholdSeconds: { type: Number, default: 300 } }

  connect() {
    const storageKey = `exam_timer_${window.location.pathname}`
    const stored = sessionStorage.getItem(storageKey)

    if (stored) {
      this.endTime = parseInt(stored, 10)
    } else {
      this.endTime = Date.now() + (this.durationSecondsValue * 1000)
      sessionStorage.setItem(storageKey, this.endTime.toString())
    }

    this.timerInterval = setInterval(() => this.tick(), 1000)
    this.tick()
  }

  disconnect() {
    if (this.timerInterval) clearInterval(this.timerInterval)
  }

  tick() {
    const remaining = Math.max(0, Math.floor((this.endTime - Date.now()) / 1000))
    const minutes = Math.floor(remaining / 60)
    const seconds = remaining % 60

    if (this.hasDisplayTarget) {
      this.displayTarget.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`

      if (remaining <= this.warningThresholdSecondsValue) {
        this.displayTarget.classList.add("text-red-400", "animate-pulse")
      }
    }

    if (remaining <= 0) {
      clearInterval(this.timerInterval)
      sessionStorage.removeItem(`exam_timer_${window.location.pathname}`)
      if (this.hasFormTarget) {
        this.formTarget.requestSubmit()
      }
    }
  }
}
