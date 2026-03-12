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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    this._spawnParticles()
  }

  _spawnParticles() {
    const container = this.hasContainerTarget ? this.containerTarget : this.element
    const colors = [
      "rgba(99,102,241,0.12)",
      "rgba(16,185,129,0.1)",
      "rgba(245,158,11,0.1)",
      "rgba(236,72,153,0.08)"
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
    }
  }
}
