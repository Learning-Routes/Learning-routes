import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["tabAll", "tabFollowing", "tabTrending", "content"]
  static values = { activeTab: { type: String, default: "all" } }

  switchTab(event) {
    event.preventDefault()
    const tab = event.currentTarget.dataset.tab

    // Update active tab styling using CSS vars for dark mode support
    const style = getComputedStyle(document.documentElement)
    const activeColor = style.getPropertyValue("--color-txt").trim() || "#1C1812"
    const inactiveColor = style.getPropertyValue("--color-sub").trim() || "#6D665B"
    const borderColor = style.getPropertyValue("--color-txt").trim() || "#2C261E"

    this.element.querySelectorAll("[data-tab]").forEach(el => {
      const isActive = el.dataset.tab === tab
      el.style.color = isActive ? activeColor : inactiveColor
      el.style.borderBottom = isActive ? `2px solid ${borderColor}` : "2px solid transparent"
    })

    this.activeTabValue = tab

    // Load content via Turbo Frame
    const url = tab === "all" ? "/community_engine/feed" : `/community_engine/feed/${tab}`
    const frame = this.contentTarget.querySelector("turbo-frame")
    if (frame) frame.src = url
  }
}
