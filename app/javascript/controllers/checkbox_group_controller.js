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
      this.submitTarget.disabled = checked.length === 0 && !customValue
      this.submitTarget.classList.toggle("opacity-50", checked.length === 0 && !customValue)
    }
  }
}
