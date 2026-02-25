import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "urlDisplay", "copyButton", "copyFeedback"]
  static values = { url: String }

  open(event) {
    event.preventDefault()
    if (this.hasModalTarget) this.modalTarget.classList.remove("hidden")
  }

  close(event) {
    event.preventDefault()
    if (this.hasModalTarget) this.modalTarget.classList.add("hidden")
  }

  copy(event) {
    event.preventDefault()
    const url = this.urlValue || this.urlDisplayTarget?.textContent
    navigator.clipboard.writeText(window.location.origin + url).then(() => {
      if (this.hasCopyFeedbackTarget) {
        this.copyFeedbackTarget.textContent = "¡Copiado!"
        this.copyFeedbackTarget.classList.remove("hidden")
        setTimeout(() => this.copyFeedbackTarget.classList.add("hidden"), 2000)
      }
    })
  }

  closeOnOutsideClick(event) {
    if (event.target === this.modalTarget) this.close(event)
  }
}
