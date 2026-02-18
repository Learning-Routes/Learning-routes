import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["tab", "panel"]

  connect() {
    this.showTab(0)
  }

  switch(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10)
    this.showTab(index)
  }

  showTab(index) {
    this.tabTargets.forEach((tab, i) => {
      const isActive = i === index
      tab.style.color = isActive ? "#1C1812" : "#A09889"
      tab.style.fontWeight = isActive ? "600" : "400"
      tab.setAttribute("aria-selected", isActive ? "true" : "false")
      tab.setAttribute("tabindex", isActive ? "0" : "-1")
      const underline = tab.querySelector("[data-underline]")
      if (underline) {
        underline.style.opacity = isActive ? "1" : "0"
        underline.style.transform = isActive ? "scaleX(1)" : "scaleX(0)"
      }
    })

    this.panelTargets.forEach((panel, i) => {
      panel.style.display = i === index ? "block" : "none"

      // Trigger lazy Turbo Frame loading when tab is first activated
      if (i === index) {
        const frame = panel.querySelector("turbo-frame[data-lazy-src]")
        if (frame && !frame.getAttribute("src")) {
          frame.setAttribute("src", frame.dataset.lazySrc)
        }
      }
    })
  }
}
