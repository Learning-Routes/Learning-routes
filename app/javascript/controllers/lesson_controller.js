import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["timer", "markCompleteBtn"]
  static values = { stepId: String, routeId: String }

  connect() {
    this.startTime = Date.now()
    this.timerInterval = setInterval(() => this.updateTimer(), 1000)
  }

  disconnect() {
    if (this.timerInterval) clearInterval(this.timerInterval)
  }

  updateTimer() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60
    if (this.hasTimerTarget) {
      this.timerTarget.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`
    }
  }
}
