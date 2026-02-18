import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["content"]

  async connect() {
    this._connected = true
    await this.renderMath()
    if (!this._connected) return
    this._boundRenderMath = () => this.renderMath()
    document.addEventListener("turbo:frame-render", this._boundRenderMath)
  }

  disconnect() {
    this._connected = false
    if (this._boundRenderMath) {
      document.removeEventListener("turbo:frame-render", this._boundRenderMath)
    }
  }

  async renderMath() {
    if (!this._connected) return
    const element = this.hasContentTarget ? this.contentTarget : this.element

    try {
      const katex = await import("katex")
      if (!this._connected) return

      // Build new HTML with both replacements before a single DOM write
      let html = element.innerHTML

      // Render display math: $$...$$
      html = html.replace(
        /\$\$([\s\S]*?)\$\$/g,
        (match, tex) => {
          try {
            return katex.default.renderToString(tex.trim(), { displayMode: true, throwOnError: false })
          } catch (e) {
            return match
          }
        }
      )

      // Render inline math: \(...\)
      html = html.replace(
        /\\\(([\s\S]*?)\\\)/g,
        (match, tex) => {
          try {
            return katex.default.renderToString(tex.trim(), { displayMode: false, throwOnError: false })
          } catch (e) {
            return match
          }
        }
      )

      // Guard against write after disconnect
      if (!this._connected) return
      element.innerHTML = html
    } catch (error) {
      console.warn("KaTeX failed to load:", error)
    }
  }
}
