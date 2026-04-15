// app/javascript/controllers/flashcards_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["card", "inner", "currentNum", "buttons"]
  static values = { total: Number }

  connect() {
    this.currentIndex = 0
    this.flipped = false
    this.ratings = {}
  }

  flip(event) {
    event.preventDefault()
    const inner = this.innerTargets[this.currentIndex]
    if (!inner) return

    this.flipped = !this.flipped
    inner.style.transform = this.flipped ? "rotateY(180deg)" : "rotateY(0deg)"
  }

  rate(event) {
    const difficulty = event.currentTarget.dataset.difficulty
    this.ratings[this.currentIndex] = difficulty

    // Move to next card
    this.nextCard()
  }

  nextCard() {
    if (this.currentIndex >= this.totalValue - 1) {
      // All cards done - could restart or show summary
      return
    }

    // Hide current
    const current = this.cardTargets[this.currentIndex]
    current.style.opacity = "0"
    current.style.pointerEvents = "none"

    // Reset flip state
    const inner = this.innerTargets[this.currentIndex]
    if (inner) inner.style.transform = "rotateY(0deg)"
    this.flipped = false

    // Show next
    this.currentIndex++
    const next = this.cardTargets[this.currentIndex]
    next.style.opacity = "1"
    next.style.pointerEvents = "auto"

    // Update counter
    if (this.hasCurrentNumTarget) {
      this.currentNumTarget.textContent = this.currentIndex + 1
    }
  }
}
