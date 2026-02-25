import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["icon", "count", "button"]
  static values = {
    url: String,
    likeableType: String,
    likeableId: String,
    liked: Boolean
  }

  toggle(event) {
    event.preventDefault()

    // Optimistic UI update
    this.likedValue = !this.likedValue
    this.updateUI()

    const token = document.querySelector('meta[name="csrf-token"]')?.content

    fetch(this.urlValue, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
        "Accept": "application/json"
      },
      body: JSON.stringify({
        likeable_type: this.likeableTypeValue,
        likeable_id: this.likeableIdValue
      })
    })
    .then(response => response.json())
    .then(data => {
      this.likedValue = data.liked
      if (this.hasCountTarget) {
        this.countTarget.textContent = data.likes_count
      }
      this.updateUI()
    })
    .catch(() => {
      // Revert on error
      this.likedValue = !this.likedValue
      this.updateUI()
    })
  }

  updateUI() {
    if (this.hasButtonTarget) {
      this.buttonTarget.classList.toggle("liked", this.likedValue)
    }
    if (this.hasIconTarget) {
      this.iconTarget.innerHTML = this.likedValue ? this.filledHeart() : this.outlineHeart()
      if (this.likedValue) {
        this.iconTarget.classList.add("like-pulse")
        setTimeout(() => this.iconTarget.classList.remove("like-pulse"), 300)
      }
    }
  }

  filledHeart() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="text-red-500"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
  }

  outlineHeart() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
  }
}
