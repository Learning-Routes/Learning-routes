import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["code", "button"]

  async copy() {
    const text = this.codeTarget.textContent
    try {
      await navigator.clipboard.writeText(text)
      const originalText = this.buttonTarget.textContent
      this.buttonTarget.textContent = "Copied!"
      setTimeout(() => {
        this.buttonTarget.textContent = originalText
      }, 2000)
    } catch (error) {
      console.error("Copy failed:", error)
    }
  }
}
