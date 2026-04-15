// app/javascript/controllers/drag_drop_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["term", "dropZone", "feedback", "termsContainer", "defsContainer"]

  connect() {
    this.matched = new Set()
    this.selectedTerm = null
  }

  dragStart(event) {
    event.dataTransfer.setData("text/plain", event.currentTarget.dataset.termIndex)
    event.dataTransfer.effectAllowed = "move"
    event.currentTarget.style.opacity = "0.5"
  }

  dragEnd(event) {
    event.currentTarget.style.opacity = "1"
  }

  dragOver(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    event.currentTarget.style.borderColor = "#8b5cf6"
    event.currentTarget.style.borderStyle = "solid"
    event.currentTarget.style.background = "rgba(139, 92, 246, 0.08)"
  }

  dragLeave(event) {
    event.currentTarget.style.borderColor = "rgba(28, 24, 18, 0.12)"
    event.currentTarget.style.borderStyle = "dashed"
    event.currentTarget.style.background = "rgba(28, 24, 18, 0.03)"
  }

  drop(event) {
    event.preventDefault()
    const termIndex = event.dataTransfer.getData("text/plain")
    const defIndex = event.currentTarget.dataset.defIndex
    this.checkMatch(termIndex, defIndex, event.currentTarget)
  }

  // Keyboard: select term then select drop zone
  keySelect(event) {
    event.preventDefault()
    const el = event.currentTarget
    if (el.dataset.termIndex !== undefined) {
      // Selecting a term
      this.termTargets.forEach(t => t.style.outline = "none")
      el.style.outline = "3px solid #8b5cf6"
      this.selectedTerm = el.dataset.termIndex
    } else if (el.dataset.defIndex !== undefined && this.selectedTerm !== null) {
      // Dropping on a definition
      this.checkMatch(this.selectedTerm, el.dataset.defIndex, el)
      this.selectedTerm = null
      this.termTargets.forEach(t => t.style.outline = "none")
    }
  }

  checkMatch(termIndex, defIndex, dropZone) {
    const term = this.termTargets.find(t => t.dataset.termIndex === termIndex)
    if (!term) return

    if (term.dataset.correctDef === defIndex) {
      // Correct match
      term.style.background = "rgba(16, 185, 129, 0.15)"
      term.style.borderColor = "#10b981"
      term.setAttribute("draggable", "false")
      term.style.cursor = "default"
      dropZone.style.borderColor = "#10b981"
      dropZone.style.borderStyle = "solid"
      dropZone.style.background = "rgba(16, 185, 129, 0.08)"
      this.matched.add(termIndex)

      if (this.matched.size === this.termTargets.length) {
        this.feedbackTarget.textContent = "All matched correctly!"
        this.feedbackTarget.style.color = "#10b981"
        this.feedbackTarget.classList.remove("hidden")
      }
    } else {
      // Wrong match - shake
      dropZone.style.borderColor = "#ef4444"
      dropZone.style.background = "rgba(239, 68, 68, 0.08)"
      dropZone.classList.add("shake-horizontal")
      setTimeout(() => {
        dropZone.classList.remove("shake-horizontal")
        dropZone.style.borderColor = "rgba(28, 24, 18, 0.12)"
        dropZone.style.borderStyle = "dashed"
        dropZone.style.background = "rgba(28, 24, 18, 0.03)"
      }, 500)
    }
  }
}
