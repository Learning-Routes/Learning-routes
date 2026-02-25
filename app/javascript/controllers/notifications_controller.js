import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["badge", "dropdown", "list"]
  static values = { url: String, pollInterval: { type: Number, default: 30000 } }

  connect() {
    this.polling = setInterval(() => this.fetchUnreadCount(), this.pollIntervalValue)
    this.open = false
  }

  disconnect() {
    if (this.polling) clearInterval(this.polling)
    document.removeEventListener("click", this._boundClose)
  }

  toggle(event) {
    event.preventDefault()
    event.stopPropagation()
    this.open = !this.open
    if (this.hasDropdownTarget) {
      this.dropdownTarget.style.display = this.open ? "block" : "none"
    }
    if (this.open) {
      this._boundClose = this.closeOnOutsideClick.bind(this)
      document.addEventListener("click", this._boundClose)
    } else {
      document.removeEventListener("click", this._boundClose)
    }
  }

  closeOnOutsideClick(event) {
    if (!this.element.contains(event.target)) {
      this.open = false
      if (this.hasDropdownTarget) this.dropdownTarget.style.display = "none"
      document.removeEventListener("click", this._boundClose)
    }
  }

  fetchUnreadCount() {
    fetch(this.urlValue, { headers: { "Accept": "application/json" } })
      .then(r => r.json())
      .then(data => {
        if (this.hasBadgeTarget) {
          this.badgeTarget.textContent = data.count > 99 ? "99+" : data.count
          this.badgeTarget.style.display = data.count === 0 ? "none" : "inline-block"
        }
      })
      .catch(() => {})
  }

  markRead(event) {
    const id = event.currentTarget.dataset.notificationId
    const token = document.querySelector('meta[name="csrf-token"]')?.content
    fetch(`/community_engine/notifications/${id}/mark_read`, {
      method: "PATCH",
      headers: { "X-CSRF-Token": token }
    })
    event.currentTarget.style.background = "transparent"
    event.currentTarget.style.opacity = "0.5"
  }

  markAllRead(event) {
    event.preventDefault()
    const token = document.querySelector('meta[name="csrf-token"]')?.content
    fetch("/community_engine/notifications/mark_all_read", {
      method: "POST",
      headers: { "X-CSRF-Token": token }
    }).then(() => {
      if (this.hasBadgeTarget) {
        this.badgeTarget.textContent = "0"
        this.badgeTarget.style.display = "none"
      }
      this.element.querySelectorAll(".notification-item").forEach(el => {
        el.style.background = "transparent"
        el.style.opacity = "0.5"
      })
    })
  }
}
