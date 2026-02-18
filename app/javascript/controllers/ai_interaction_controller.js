import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["loadingIndicator"]
  static values = { stepId: String }

  connect() {
    this._abortController = null
  }

  disconnect() {
    if (this._abortController) this._abortController.abort()
  }

  async request(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return

    // Abort any in-flight request
    if (this._abortController) this._abortController.abort()
    this._abortController = new AbortController()

    // Show loading
    if (this.hasLoadingIndicatorTarget) {
      this.loadingIndicatorTarget.classList.remove("hidden")
    }
    event.currentTarget.disabled = true

    try {
      const token = document.querySelector('meta[name="csrf-token"]')?.content
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "text/vnd.turbo-stream.html",
          "X-CSRF-Token": token,
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "same-origin",
        signal: this._abortController.signal
      })

      if (response.ok) {
        const html = await response.text()
        Turbo.renderStreamMessage(html)
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("AI interaction failed:", error)
      }
    } finally {
      if (this.hasLoadingIndicatorTarget) {
        this.loadingIndicatorTarget.classList.add("hidden")
      }
      event.currentTarget.disabled = false
    }
  }
}
