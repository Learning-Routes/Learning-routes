import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["tabAll", "tabFollowing", "tabTrending", "content"]
  static values = { activeTab: { type: String, default: "all" } }

  switchTab(event) {
    event.preventDefault()
    const tab = event.currentTarget.dataset.tab

    // Update active tab styling
    this.element.querySelectorAll("[data-tab]").forEach(el => {
      el.classList.toggle("border-b-2", el.dataset.tab === tab)
      el.classList.toggle("border-[#2C261E]", el.dataset.tab === tab)
      el.classList.toggle("text-[#1C1812]", el.dataset.tab === tab)
      el.classList.toggle("text-[#6D665B]", el.dataset.tab !== tab)
    })

    this.activeTabValue = tab

    // Load content via Turbo Frame
    const url = tab === "all" ? "/community/feed" : `/community/feed/${tab}`
    const frame = this.contentTarget.querySelector("turbo-frame")
    if (frame) frame.src = url
  }
}
