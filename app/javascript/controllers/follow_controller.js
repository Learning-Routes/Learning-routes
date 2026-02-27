import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["button", "label"]
  static values = {
    userId: String,
    following: Boolean,
    createUrl: String,
    destroyUrl: String,
    followText: { type: String, default: "Follow" },
    followingText: { type: String, default: "Following" }
  }

  toggle(event) {
    event.preventDefault()
    const token = document.querySelector('meta[name="csrf-token"]')?.content

    // Optimistic update
    this.followingValue = !this.followingValue
    this._updateUI()

    const request = this.followingValue
      ? fetch(this.createUrlValue, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token, "Accept": "text/vnd.turbo-stream.html" },
          body: JSON.stringify({ followed_id: this.userIdValue })
        })
      : fetch(`${this.destroyUrlValue}/${this.userIdValue}`, {
          method: "DELETE",
          headers: { "X-CSRF-Token": token, "Accept": "text/vnd.turbo-stream.html" }
        })

    request.catch(() => {
      // Revert on failure
      this.followingValue = !this.followingValue
      this._updateUI()
    })
  }

  _updateUI() {
    if (this.hasLabelTarget) {
      this.labelTarget.textContent = this.followingValue ? this.followingTextValue : this.followTextValue
    }
    if (this.hasButtonTarget) {
      const root = document.documentElement
      const style = getComputedStyle(root)
      if (this.followingValue) {
        this.buttonTarget.style.background = "transparent"
        this.buttonTarget.style.border = `1px solid ${style.getPropertyValue("--color-faint").trim() || "#CCC5B8"}`
        this.buttonTarget.style.color = style.getPropertyValue("--color-txt").trim() || "#1C1812"
      } else {
        const accent = style.getPropertyValue("--color-accent").trim() || "#2C261E"
        this.buttonTarget.style.background = accent
        this.buttonTarget.style.border = `1px solid ${accent}`
        this.buttonTarget.style.color = style.getPropertyValue("--color-accent-text").trim() || "#F5F1EB"
      }
    }
  }
}
