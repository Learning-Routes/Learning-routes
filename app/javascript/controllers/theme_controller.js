import { Controller } from "@hotwired/stimulus"

// Theme controller — handles instant theme switching + system preference detection.
// Applied to <html> element to set data-theme attribute before paint.
export default class extends Controller {
  static values = { preference: { type: String, default: "system" } }

  connect() {
    this._mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    this._mediaQuery.addEventListener("change", this._onSystemChange)
    this._applyTheme()
  }

  disconnect() {
    this._mediaQuery?.removeEventListener("change", this._onSystemChange)
  }

  preferenceValueChanged() {
    this._applyTheme()
  }

  _onSystemChange = () => {
    if (this.preferenceValue === "system") {
      this._applyTheme()
    }
  }

  _applyTheme() {
    const resolved = this._resolveTheme()
    document.documentElement.setAttribute("data-theme", resolved)

    // Update meta theme-color for mobile browsers
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.content = resolved === "dark" ? "#1A1710" : "#F5F1EB"
    }
  }

  _resolveTheme() {
    if (this.preferenceValue === "system") {
      return this._mediaQuery?.matches ? "dark" : "light"
    }
    return this.preferenceValue
  }
}
