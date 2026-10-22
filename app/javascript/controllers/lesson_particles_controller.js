import { Controller } from "@hotwired/stimulus"

/**
 * lesson-particles controller
 *
 * Creates subtle floating particles in the lesson background.
 * Respects prefers-reduced-motion.
 */
export default class extends Controller {
  static targets = ["container"]

  connect() {
    this._particles = []
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    this._spawnParticles()
  }

  disconnect() {
    this._particles.forEach(p => p.remove())
    this._particles = []
  }

  _spawnParticles() {
    const container = this.hasContainerTarget ? this.containerTarget : this.element
    const colors = [
      "color-mix(in srgb, var(--color-accent) 12%, transparent)",
      "color-mix(in srgb, var(--color-positive) 10%, transparent)",
      "color-mix(in srgb, var(--color-highlight) 10%, transparent)",
      "color-mix(in srgb, var(--color-accent) 8%, transparent)"
    ]

    for (let i = 0; i < 15; i++) {
      const particle = document.createElement("div")
      particle.className = "lesson-particle"
      const size = 4 + Math.random() * 8
      particle.style.cssText = `
        width:${size}px;height:${size}px;
        left:${Math.random() * 100}%;
        background:${colors[i % colors.length]};
        animation-duration:${10 + Math.random() * 15}s;
        animation-delay:${Math.random() * 12}s;
      `
      container.appendChild(particle)
      this._particles.push(particle)
    }
  }
}
