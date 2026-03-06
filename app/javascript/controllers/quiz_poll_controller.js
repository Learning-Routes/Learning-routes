import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    url: String,
    interval: { type: Number, default: 3000 }
  }

  connect() {
    this._active = true
    this.poll()
  }

  disconnect() {
    this._active = false
    if (this.timeout) clearTimeout(this.timeout)
  }

  async poll() {
    if (!this._active) return
    try {
      const response = await fetch(this.urlValue, {
        headers: {
          "Accept": "text/vnd.turbo-stream.html",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content
        },
        credentials: "same-origin"
      })

      if (!this._active) return
      if (response.ok) {
        const html = await response.text()
        if (html.includes("turbo-stream")) {
          Turbo.renderStreamMessage(html)
          return
        }
      }
    } catch (error) {
      if (!this._active) return
      console.warn("Quiz poll failed:", error)
    }

    if (this._active) {
      this.timeout = setTimeout(() => this.poll(), this.intervalValue)
    }
  }
}
