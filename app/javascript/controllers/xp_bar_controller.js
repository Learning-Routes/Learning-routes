import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { progress: Number }

  connect() {
    this._connected = true
    const bar = this.element
    bar.style.width = "0%"

    // Animate after a short delay for visual effect
    this._raf = requestAnimationFrame(() => {
      if (!this._connected) return
      this._timeout = setTimeout(() => {
        if (!this._connected) return
        bar.style.transition = "width 1.2s cubic-bezier(0.22, 1, 0.36, 1)"
        bar.style.width = `${this.progressValue}%`
      }, 300)
    })
  }

  disconnect() {
    this._connected = false
    cancelAnimationFrame(this._raf)
    clearTimeout(this._timeout)
  }
}
