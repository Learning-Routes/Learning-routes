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
  }

  toggle(event) {
    event.preventDefault()
    this.open = !this.open
    if (this.hasDropdownTarget) {
      this.dropdownTarget.classList.toggle("hidden", !this.open)
    }
    if (this.open) {
      document.addEventListener("click", this.closeOnOutsideClick)
    }
  }

  closeOnOutsideClick = (event) => {
    if (!this.element.contains(event.target)) {
      this.open = false
      if (this.hasDropdownTarget) this.dropdownTarget.classList.add("hidden")
      document.removeEventListener("click", this.closeOnOutsideClick)
    }
  }

  fetchUnreadCount() {
    fetch(this.urlValue, { headers: { "Accept": "application/json" } })
      .then(r => r.json())
      .then(data => {
        if (this.hasBadgeTarget) {
          this.badgeTarget.textContent = data.count > 99 ? "99+" : data.count
          this.badgeTarget.classList.toggle("hidden", data.count === 0)
        }
      })
      .catch(() => {})
  }

  markRead(event) {
    const id = event.currentTarget.dataset.notificationId
    const token = document.querySelector('meta[name="csrf-token"]')?.content
    fetch(`/community/notifications/${id}/mark_read`, {
      method: "PATCH",
      headers: { "X-CSRF-Token": token }
    })
    event.currentTarget.classList.remove("bg-amber-50/10")
    event.currentTarget.classList.add("opacity-60")
  }

  markAllRead(event) {
    event.preventDefault()
    const token = document.querySelector('meta[name="csrf-token"]')?.content
    fetch("/community/notifications/mark_all_read", {
      method: "POST",
      headers: { "X-CSRF-Token": token }
    }).then(() => {
      if (this.hasBadgeTarget) {
        this.badgeTarget.textContent = "0"
        this.badgeTarget.classList.add("hidden")
      }
      this.element.querySelectorAll(".notification-item").forEach(el => {
        el.classList.remove("bg-amber-50/10")
        el.classList.add("opacity-60")
      })
    })
  }
}
