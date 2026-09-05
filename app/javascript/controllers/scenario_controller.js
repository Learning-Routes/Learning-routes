import { Controller } from "@hotwired/stimulus"
import { submitBlock, announceResult } from "controllers/block_submission"

export default class extends Controller {
  static targets = ["option", "optionsContainer", "consequence", "consequenceFor", "retryContainer"]

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

    // Highlight chosen option
    this.optionTargets.forEach(opt => {
      opt.style.opacity = "0.4"
      opt.style.pointerEvents = "none"
    })
    btn.style.opacity = "1"
    btn.style.borderColor = "#a855f7"
    btn.style.background = "rgba(168, 85, 247, 0.12)"

    // Reveal the consequence rendered for THIS option.
    //
    // The text used to arrive in a `data-consequence` attribute and be assigned
    // with `textContent`, which printed `&quot;` for every double quote and
    // `**asterisks**` for emphasis, and dropped every newline. The markdown is
    // rendered server-side now; the controller only unhides the right element
    // and never touches text content.
    this.consequenceForTargets.forEach((el) => {
      el.classList.toggle("hidden", el.dataset.optionIndex !== idx)
    })
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
    this.consequenceForTargets.forEach((el) => el.classList.add("hidden"))
    this.consequenceTarget.classList.add("hidden")
    this.retryContainerTarget.classList.add("hidden")
  }
}
