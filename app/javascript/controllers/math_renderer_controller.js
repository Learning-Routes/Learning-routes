import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["content"]

  async connect() {
    await this.renderMath()
    document.addEventListener("turbo:frame-render", () => this.renderMath())
  }

  async renderMath() {
    const element = this.hasContentTarget ? this.contentTarget : this.element

    try {
      const katex = await import("katex")

      // Render display math: $$...$$
      element.innerHTML = element.innerHTML.replace(
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
      element.innerHTML = element.innerHTML.replace(
        /\\\(([\s\S]*?)\\\)/g,
        (match, tex) => {
          try {
            return katex.default.renderToString(tex.trim(), { displayMode: false, throwOnError: false })
          } catch (e) {
            return match
          }
        }
      )
    } catch (error) {
      console.warn("KaTeX failed to load:", error)
    }
  }
}
