import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    this.element.style.transition = "opacity 0.3s ease, transform 0.3s ease"
    this.timeout = setTimeout(() => this.dismiss(), 5000)
  }

  disconnect() {
    clearTimeout(this.timeout)
    clearTimeout(this.removeTimeout)
  }

  dismiss() {
    this.element.style.opacity = "0"
    this.element.style.transform = "translateY(-10px)"
    this.removeTimeout = setTimeout(() => this.element.remove(), 300)
  }
}
