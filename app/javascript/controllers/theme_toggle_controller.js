import { Controller } from "@hotwired/stimulus"

// Instant theme toggle — switches CSS immediately, persists to server in background.
// No page reload needed.
export default class extends Controller {
  static targets = ["systemIcon", "lightIcon", "darkIcon"]
  static values = {
    current: { type: String, default: "system" },
    url: String,
    csrf: String
  }

  cycle() {
    const order = ["system", "light", "dark"]
    const idx = order.indexOf(this.currentValue)
    const next = order[(idx + 1) % order.length]

    // 1. Instant visual switch (no reload)
    this.currentValue = next
    this._applyTheme(next)
    this._updateIcon(next)

    // 2. Persist to server in background (non-blocking)
    this._persistToServer(next)
  }

  _applyTheme(pref) {
    const resolved = pref === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : pref

    document.documentElement.setAttribute("data-theme", resolved)

    // Update the main theme controller's value so it stays in sync
    const htmlEl = document.documentElement
    if (htmlEl.dataset.themePreferenceValue !== undefined) {
      htmlEl.dataset.themePreferenceValue = pref
    }

    // Update meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.content = resolved === "dark" ? "#1A1710" : "#F5F1EB"
    }
  }

  _updateIcon(theme) {
    if (this.hasSystemIconTarget) this.systemIconTarget.style.display = theme === "system" ? "" : "none"
    if (this.hasLightIconTarget) this.lightIconTarget.style.display = theme === "light" ? "" : "none"
    if (this.hasDarkIconTarget) this.darkIconTarget.style.display = theme === "dark" ? "" : "none"
  }

  _persistToServer(theme) {
    fetch(this.urlValue, {
      method: "PATCH",
      headers: {
        "X-CSRF-Token": this.csrfValue,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/vnd.turbo-stream.html"
      },
      body: `theme=${encodeURIComponent(theme)}`
    }).catch(() => {
      // Silently fail — theme is already applied visually
    })
  }
}
