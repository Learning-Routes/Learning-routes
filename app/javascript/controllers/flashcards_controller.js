// app/javascript/controllers/flashcards_controller.js
import { Controller } from "@hotwired/stimulus"
import { submitBlock, announceResult } from "controllers/block_submission"

// Flashcard ratings are the one self-reported signal FSRS actually wants, and until now
// they landed in `this.ratings` — a plain object that died on reload. Nothing was ever
// persisted and FSRS never saw a single rating.
//
// Two fixes here:
//   1. Ratings are submitted to the server when the session ends.
//   2. nextCard() used to `return` on the last card with the comment
//      "All cards done - could restart or show summary", so at 4/4 the buttons were a
//      literal no-op. It now ends the session and shows a summary.
export default class extends Controller {
  static targets = ["card", "inner", "currentNum", "buttons", "summary", "summaryText"]
  static values = { total: Number }

  connect() {
    this.currentIndex = 0
    this.flipped = false
    this.ratings = {}
    this.finished = false
  }

  flip(event) {
    event.preventDefault()
    const inner = this.innerTargets[this.currentIndex]
    if (!inner) return

    this.flipped = !this.flipped
    inner.style.transform = this.flipped ? "rotateY(180deg)" : "rotateY(0deg)"
  }

  rate(event) {
    if (this.finished) return

    const difficulty = event.currentTarget.dataset.difficulty
    this.ratings[this.currentIndex] = difficulty

    this.nextCard()
  }

  nextCard() {
    // Last card: end the session instead of silently doing nothing.
    if (this.currentIndex >= this.totalValue - 1) {
      this.finishSession()
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

  finishSession() {
    if (this.finished) return
    this.finished = true

    const rated = Object.keys(this.ratings).length

    // Persist. The server maps hard/normal/easy to FSRS HARD/GOOD/EASY and carries the
    // WORST rating to the step — one card still hard means the step should come back
    // sooner than four easy ones would suggest.
    submitBlock(this.element, { ratings: this.ratings, rated_count: rated })
      .then((result) => announceResult(this.element, result))

    if (this.hasButtonsTarget) {
      this.buttonsTarget.style.display = "none"
    }

    if (this.hasSummaryTarget) {
      if (this.hasSummaryTextTarget) {
        const label = this.summaryTarget.dataset.ratedLabel || "You rated {count} cards"
        this.summaryTextTarget.textContent = label.replace("{count}", rated)
      }
      this.summaryTarget.style.display = "block"
    }

    this.element.dispatchEvent(new CustomEvent("flashcards:finished", {
      bubbles: true,
      detail: { rated, ratings: this.ratings }
    }))
  }
}
