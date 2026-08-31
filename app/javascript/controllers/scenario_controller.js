import { Controller } from "@hotwired/stimulus"
import { submitBlock, announceResult } from "controllers/block_submission"

export default class extends Controller {
  static targets = ["option", "optionsContainer", "consequence", "consequenceText", "retryContainer"]

  connect() {
    this.chosen = false
  }

  choose(event) {
    const idx = event.currentTarget?.dataset?.optionIndex
    submitBlock(
      this.element,
      { option_index: idx === undefined ? null : Number(idx) },
      { complete: true }
    )
      .then((r) => announceResult(this.element, r))

    if (this.chosen) return
    this.chosen = true

    const btn = event.currentTarget
    const consequence = btn.dataset.consequence

    // Highlight chosen option
    this.optionTargets.forEach(opt => {
      opt.style.opacity = "0.4"
      opt.style.pointerEvents = "none"
    })
    btn.style.opacity = "1"
    btn.style.borderColor = "#a855f7"
    btn.style.background = "rgba(168, 85, 247, 0.12)"

    // Show consequence with animation
    this.consequenceTextTarget.textContent = consequence
    this.consequenceTarget.classList.remove("hidden")
    this.consequenceTarget.style.opacity = "0"
    this.consequenceTarget.style.transform = "translateY(10px)"
    requestAnimationFrame(() => {
      this.consequenceTarget.style.transition = "all 0.3s ease"
      this.consequenceTarget.style.opacity = "1"
      this.consequenceTarget.style.transform = "translateY(0)"
    })

    // Show retry button
    this.retryContainerTarget.classList.remove("hidden")
  }

  retry() {
    this.chosen = false

    // Reset all options
    this.optionTargets.forEach(opt => {
      opt.style.opacity = "1"
      opt.style.pointerEvents = "auto"
      opt.style.borderColor = "rgba(168, 85, 247, 0.12)"
      opt.style.background = "rgba(168, 85, 247, 0.04)"
    })

    // Hide consequence and retry
    this.consequenceTarget.classList.add("hidden")
    this.retryContainerTarget.classList.add("hidden")
  }
}
