import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    url: String,
    requestId: String
  }

  static targets = ["dotsText"]

  connect() {
    this.dotCount = 0
    this.startedAt = Date.now()
    this.dotInterval = setInterval(() => this.animateDots(), 500)
    this.pollInterval = setInterval(() => this.poll(), 2000)
  }

  disconnect() {
    if (this.dotInterval) clearInterval(this.dotInterval)
    if (this.pollInterval) clearInterval(this.pollInterval)
  }

  animateDots() {
    this.dotCount = (this.dotCount + 1) % 4
    const dots = ".".repeat(this.dotCount)
    if (this.hasDotsTextTarget) {
      this.dotsTextTarget.textContent = dots
    }
  }

  async poll() {
    try {
      const response = await fetch(this.urlValue, {
        headers: { "Accept": "application/json" }
      })

      if (!response.ok) return

      const data = await response.json()

      if (data.status === "completed" && data.redirect_url) {
        clearInterval(this.pollInterval)
        clearInterval(this.dotInterval)
        window.location.href = data.redirect_url
      } else if (data.status === "failed") {
        clearInterval(this.pollInterval)
        clearInterval(this.dotInterval)
        window.location.href = "/routes/create"
      } else if (Date.now() - this.startedAt > 90000) {
        // Timeout after 90 seconds — job likely not processing
        clearInterval(this.pollInterval)
        clearInterval(this.dotInterval)
        window.location.href = "/routes/create"
      }
    } catch (e) {
      // Silently continue polling on network errors
    }
  }
}
