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
      // Sync fallback textarea to hidden input for form submission
      if (this.hasHiddenInputTarget) {
        textarea.addEventListener("input", () => {
          this.hiddenInputTarget.value = textarea.value
        })
      }
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

  // `submit()` and `requestHint()` lived here and POSTed to
  // /content/exercises/:id/submit_answer and /get_hint. Both retired with the
  // exercise code editor (WP-35 §3): an exercise renders through the lesson
  // machinery now, and its practice is graded per block by BlockGrader,
  // server-side and gated, rather than by a paid quick_grading call over the
  // contents of this editor that completed nothing.
  //
  // This controller stays because the EXAM's `code` question type mounts it
  // (steps/_question_code.html.erb) for the editor and its hidden input.

  reset() {
    if (this.editor) {
      this.editor.setValue(this.initialCodeValue || "", -1)
    } else if (this.fallbackTextarea) {
      this.fallbackTextarea.value = this.initialCodeValue || ""
    }
  }
}
