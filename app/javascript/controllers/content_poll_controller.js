import { Controller } from "@hotwired/stimulus"

// Polls a URL and replaces the turbo-frame when content is ready.
// Stops polling once the "generating" indicator disappears.
export default class extends Controller {
  static values = { url: String, interval: { type: Number, default: 3000 } }

  connect() {
    this._timer = setInterval(() => this._poll(), this.intervalValue)
  }

  disconnect() {
    this._stop()
  }

  async _poll() {
    try {
      const response = await fetch(this.urlValue, {
        headers: { Accept: "text/html", "Turbo-Frame": this.element.id }
      })
      if (!response.ok) return

      const html = await response.text()
      // If response no longer contains the poll controller, content is ready
      if (!html.includes('data-controller="content-poll"')) {
        this._stop()
        // Replace frame content
        const template = document.createElement("template")
        template.innerHTML = html.trim()
        const frame = template.content.querySelector("turbo-frame")
        if (frame) {
          this.element.replaceWith(frame)
        }
      }
    } catch (e) {
      // Silently retry on next interval
    }
  }

  _stop() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }
}
