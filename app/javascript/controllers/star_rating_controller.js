import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["star"]
  static values = { url: String, current: Number }

  rate(event) {
    const score = parseInt(event.currentTarget.dataset.score, 10)
    this.currentValue = score
    this._updateStars(score)

    const token = document.querySelector('meta[name="csrf-token"]')?.content
    fetch(this.urlValue, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-Token": token,
        "Accept": "text/vnd.turbo-stream.html"
      },
      body: `score=${score}`
    })
  }

  hover(event) {
    const score = parseInt(event.currentTarget.dataset.score, 10)
    this._updateStars(score)
  }

  unhover() {
    this._updateStars(this.currentValue)
  }

  _updateStars(activeScore) {
    this.starTargets.forEach(btn => {
      const s = parseInt(btn.dataset.score, 10)
      const svg = btn.querySelector("svg")
      if (!svg) return
      const filled = s <= activeScore
      svg.setAttribute("fill", filled ? "#B09848" : "none")
      svg.setAttribute("stroke", filled ? "#B09848" : getComputedStyle(document.documentElement).getPropertyValue("--color-muted").trim() || "#887F72")
      btn.style.transform = s === activeScore ? "scale(1.2)" : "scale(1)"
    })
  }
}
