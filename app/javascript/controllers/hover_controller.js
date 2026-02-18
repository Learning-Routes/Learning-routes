import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    this.translate = this.element.dataset.hoverTranslate || "-1px"
    this.shadow = this.element.dataset.hoverShadow || "0 4px 12px rgba(28,24,18,0.1)"
    this.border = this.element.dataset.hoverBorder || null
    this.origTransform = this.element.style.transform || ""
    this.origShadow = this.element.style.boxShadow || ""
    this.origBorder = this.element.style.borderColor || ""
  }

  enter() {
    this.element.style.transform = `translateY(${this.translate})`
    this.element.style.boxShadow = this.shadow
    if (this.border) this.element.style.borderColor = this.border
  }

  leave() {
    this.element.style.transform = this.origTransform
    this.element.style.boxShadow = this.origShadow
    if (this.border) this.element.style.borderColor = this.origBorder
  }
}
