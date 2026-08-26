// app/javascript/controllers/drag_drop_controller.js
import { Controller } from "@hotwired/stimulus"
import { submitBlock, announceResult } from "controllers/block_submission"

export default class extends Controller {
  static values = { successText: { type: String, default: "All matched correctly" } }
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
      // Correct match. Record WHERE the term landed — WP-15 A1: nothing wrote this, so
      // _submitMatches() always built an empty payload, BlockGrader returned
      // correct:false on an empty submission, and the block never unlocked navigation.
      term.dataset.placedDef = defIndex
      term.style.background = "rgba(16, 185, 129, 0.15)"
      term.style.borderColor = "#10b981"
      term.setAttribute("draggable", "false")
      term.style.cursor = "default"
      dropZone.style.borderColor = "#10b981"
      dropZone.style.borderStyle = "solid"
      dropZone.style.background = "rgba(16, 185, 129, 0.08)"
      this.matched.add(termIndex)

      if (this.matched.size === this.termTargets.length) {
        this.feedbackTarget.textContent = this.successTextValue
        this._submitMatches()
        this.feedbackTarget.style.color = "#10b981"
        this.feedbackTarget.classList.remove("hidden")
      }
    } else {
      // Wrong match - shake.
      //
      // WP-15 A3: the UI still bounces, but the attempt is now RECORDED. Before this,
      // a submission only happened once every pair was placed and a wrong drop bounced,
      // so BlockAttempt#attempts could never increment on a failure — which meant
      // RELEASE_AFTER could never fire and a student facing a wrong answer key (A2
      // proved they existed) was trapped forever. This is about the record, not the
      // interaction.
      //
      // The wrong pairing is included in THIS submission so the stored payload reflects
      // what the student actually did, but it is not written to the DOM: the term is not
      // placed, so the next submission does not carry it.
      this._submitMatches({ [termIndex]: defIndex })
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

  // Collect term index -> definition index for every placed term and send it. The
  // server re-derives correctness from the stored `pairs`.
  //
  // Both indices are the ORIGINAL positions in the pairs array — the partial permutes
  // the two columns for display but never renumbers them — so `matches[i] == i` on the
  // server means what it says.
  _submitMatches(attempted = null) {
    const matches = {}
    this.termTargets?.forEach((term) => {
      const placed = term.dataset.placedDef
      if (placed !== undefined && placed !== null && placed !== "") {
        matches[term.dataset.termIndex] = placed
      }
    })
    if (attempted) Object.assign(matches, attempted)

    submitBlock(this.element, { matches }).then((r) => announceResult(this.element, r))
  }
}
