import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["form", "submitBtn", "counter"]
  static values = { total: Number }

  connect() {
    this.answeredSet = new Set()
    this.updateCounter()
  }

  markAnswered(event) {
    const name = event.target.name
    if (name) {
      this.answeredSet.add(name)
      this.updateCounter()
    }
  }

  updateCounter() {
    const answered = this.answeredSet.size
    const total = this.totalValue

    if (this.hasCounterTarget) {
      this.counterTarget.textContent = `${answered}/${total}`
    }

    if (this.hasSubmitBtnTarget) {
      this.submitBtnTarget.disabled = answered < total
    }
  }
}
