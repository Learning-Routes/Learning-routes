import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["code", "button"]
  static values = { copiedText: { type: String, default: "Copied!" } }

  connect() {
    this._resetTimeout = null
  }

  disconnect() {
    clearTimeout(this._resetTimeout)
  }

  async copy() {
    const text = this.codeTarget.textContent
    try {
      await navigator.clipboard.writeText(text)
      const originalText = this.buttonTarget.textContent
      this.buttonTarget.textContent = this.copiedTextValue
      clearTimeout(this._resetTimeout)
      this._resetTimeout = setTimeout(() => {
        this.buttonTarget.textContent = originalText
      }, 2000)
    } catch (error) {
      console.error("Copy failed:", error)
    }
  }
}
