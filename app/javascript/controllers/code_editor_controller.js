import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["editorContainer", "output", "hiddenInput"]
  static values = { language: { type: String, default: "javascript" }, stepId: String, initialCode: String, readOnly: { type: Boolean, default: false } }

  async connect() {
    this._abortController = new AbortController()
    try {
      const ace = await import("ace-builds")
      this.editor = ace.edit(this.editorContainerTarget)
      this.editor.setTheme("ace/theme/one_dark")
      this.editor.session.setMode(`ace/mode/${this.languageValue}`)
      this.editor.setOptions({
        fontSize: "14px",
        showPrintMargin: false,
        readOnly: this.readOnlyValue
      })
      if (this.initialCodeValue) {
        this.editor.setValue(this.initialCodeValue, -1)
      }
      // Sync to hidden input for form submission
      if (this.hasHiddenInputTarget) {
        this.editor.on("change", () => {
          this.hiddenInputTarget.value = this.editor.getValue()
        })
      }
    } catch (error) {
      // Fallback to textarea if Ace fails to load
      console.warn("Ace Editor failed to load, using textarea fallback:", error)
      const textarea = document.createElement("textarea")
      textarea.className = "w-full bg-gray-800/50 border-0 p-5 text-sm text-gray-300 font-mono resize-none focus:outline-none min-h-[300px]"
      textarea.value = this.initialCodeValue || ""
      this.editorContainerTarget.appendChild(textarea)
      this.fallbackTextarea = textarea
    }
  }

  disconnect() {
    if (this._abortController) this._abortController.abort()
    if (this.editor) {
      this.editor.destroy()
      this.editor = null
    }
  }

  getCode() {
    if (this.editor) return this.editor.getValue()
    if (this.fallbackTextarea) return this.fallbackTextarea.value
    return ""
  }

  async submit() {
    const code = this.getCode()
    if (!code.trim()) return

    const token = document.querySelector('meta[name="csrf-token"]')?.content
    const stepId = this.stepIdValue

    try {
      const formData = new FormData()
      formData.append("answer", code)

      const response = await fetch(`/content/exercises/${stepId}/submit_answer`, {
        method: "POST",
        headers: {
          "X-CSRF-Token": token,
          "Accept": "text/vnd.turbo-stream.html"
        },
        body: formData,
        credentials: "same-origin",
        signal: this._abortController.signal
      })

      if (response.ok) {
        const html = await response.text()
        Turbo.renderStreamMessage(html)
      }
    } catch (error) {
      if (error.name !== "AbortError") console.error("Submit failed:", error)
    }
  }

  async requestHint() {
    const token = document.querySelector('meta[name="csrf-token"]')?.content
    const stepId = this.stepIdValue

    try {
      const response = await fetch(`/content/exercises/${stepId}/get_hint`, {
        method: "POST",
        headers: {
          "X-CSRF-Token": token,
          "Accept": "text/vnd.turbo-stream.html"
        },
        credentials: "same-origin",
        signal: this._abortController.signal
      })

      if (response.ok) {
        const html = await response.text()
        Turbo.renderStreamMessage(html)
      }
    } catch (error) {
      if (error.name !== "AbortError") console.error("Hint request failed:", error)
    }
  }

  reset() {
    if (this.editor) {
      this.editor.setValue(this.initialCodeValue || "", -1)
    } else if (this.fallbackTextarea) {
      this.fallbackTextarea.value = this.initialCodeValue || ""
    }
  }
}
