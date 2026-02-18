import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["option", "submit"]

  connect() {
    this.update()
  }

  update() {
    const checked = this.element.querySelectorAll("input[type='checkbox']:checked")
    const hasCustomInput = this.element.querySelector("input[type='text']")
    const customValue = hasCustomInput ? hasCustomInput.value.trim() : ""

    if (this.hasSubmitTarget) {
      const disabled = checked.length === 0 && !customValue
      this.submitTarget.disabled = disabled
      this.submitTarget.style.opacity = disabled ? "0.45" : "1"
      this.submitTarget.style.cursor = disabled ? "not-allowed" : "pointer"
    }
  }
}
