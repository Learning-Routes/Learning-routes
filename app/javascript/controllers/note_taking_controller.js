import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["textarea", "savedIndicator"]
  static values = { stepId: String, saveUrl: String }

  connect() {
    this.saveTimeout = null
  }

  disconnect() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
  }

  save(event) {
    if (this.saveTimeout) clearTimeout(this.saveTimeout)

    this.saveTimeout = setTimeout(() => {
      this.performSave(event.target)
    }, 1500)
  }

  async create(event) {
    event.preventDefault()
    const textarea = this.hasTextareaTarget ? this.textareaTarget : event.target.querySelector("textarea")
    if (!textarea || !textarea.value.trim()) return
    this.performSave(textarea)
  }

  async performSave(textarea) {
    const body = textarea.value.trim()
    if (!body) return

    const noteId = textarea.dataset.noteId
    const token = document.querySelector('meta[name="csrf-token"]')?.content

    let url, method
    if (noteId) {
      url = this.saveUrlValue || `/content/notes/${noteId}`
      method = "PATCH"
    } else {
      url = "/content/notes"
      method = "POST"
    }

    try {
      const formData = new FormData()
      formData.append("body", body)
      if (!noteId) formData.append("route_step_id", this.stepIdValue)

      const response = await fetch(url, {
        method: method,
        headers: {
          "X-CSRF-Token": token,
          "Accept": "text/vnd.turbo-stream.html, text/html"
        },
        body: formData,
        credentials: "same-origin"
      })

      if (response.ok && this.hasSavedIndicatorTarget) {
        this.savedIndicatorTarget.classList.remove("hidden")
        this.savedIndicatorTarget.textContent = "Saved"
        setTimeout(() => {
          this.savedIndicatorTarget.classList.add("hidden")
        }, 2000)
      }
    } catch (error) {
      console.error("Note save failed:", error)
    }
  }
}
