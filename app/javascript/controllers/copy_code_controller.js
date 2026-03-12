import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["code", "button", "runBtn", "output"]
  static values = { copiedText: { type: String, default: "Copied!" } }

  connect() {
    this._resetTimeout = null
    this._runTimeout = null
  }

  disconnect() {
    clearTimeout(this._resetTimeout)
    clearTimeout(this._runTimeout)
  }

  async copy() {
    const text = this.codeTarget.textContent
    try {
      await navigator.clipboard.writeText(text)
      const originalText = this.buttonTarget.textContent
      this.buttonTarget.textContent = this.copiedTextValue
      clearTimeout(this._resetTimeout)
      this._resetTimeout = setTimeout(() => {
        this.buttonTarget.textContent = originalText
      }, 2000)
    } catch (error) {
      console.error("Copy failed:", error)
    }
  }

  /**
   * Decorative "Run" button — shows a simulated output for visual flair.
   * Does NOT actually execute code.
   */
  fakeRun() {
    if (!this.hasRunBtnTarget || !this.hasOutputTarget) return

    // Visual feedback on button
    const btn = this.runBtnTarget
    btn.style.background = "#F9E2AF"
    btn.textContent = "Running…"
    btn.disabled = true

    // Show output area with typing animation
    const output = this.outputTarget
    output.classList.add("show")
    output.textContent = "▶ Running…"

    clearTimeout(this._runTimeout)
    this._runTimeout = setTimeout(() => {
      output.textContent = "✓ Code executed successfully"
      btn.style.background = "#A6E3A1"
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run`
      btn.disabled = false

      // Hide output after a few seconds
      this._runTimeout = setTimeout(() => {
        output.classList.remove("show")
      }, 4000)
    }, 1200)
  }
}
