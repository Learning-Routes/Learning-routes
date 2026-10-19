import { Controller } from "@hotwired/stimulus"
import { tiltFor } from "card_tilt"

// A .card3 you can act on tilts towards a fine pointer. Never on touch, never
// with reduced motion; the lift on hover is CSS.
export default class extends Controller {
  connect() {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    this.move = (event) => this.tilt(event)
    this.leave = () => this.reset()
    this.element.addEventListener("pointermove", this.move)
    this.element.addEventListener("pointerleave", this.leave)
  }

  disconnect() {
    if (!this.move) return
    this.element.removeEventListener("pointermove", this.move)
    this.element.removeEventListener("pointerleave", this.leave)
  }

  tilt(event) {
    const box = this.element.getBoundingClientRect()
    const { rx, ry, mx, my } = tiltFor((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height)
    const style = this.element.style
    style.setProperty("--rx", `${rx}deg`)
    style.setProperty("--ry", `${ry}deg`)
    style.setProperty("--mx", `${mx}%`)
    style.setProperty("--my", `${my}%`)
  }

  reset() {
    for (const name of ["--rx", "--ry", "--mx", "--my"]) this.element.style.removeProperty(name)
  }
}
