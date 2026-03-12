import { Controller } from "@hotwired/stimulus"

/**
 * lesson-nav controller
 *
 * Manages Duolingo-style section-by-section lesson navigation with
 * swipe support, segmented progress bar, and knowledge-check gating.
 *
 * All UI text is in Spanish.
 */
export default class extends Controller {
  static targets = [
    "section",
    "progressBar",
    "progressSegment",
    "progressCounter",
    "continueBtn",
    "backBtn",
    "container"
  ]

  static values = {
    current: { type: Number, default: 0 },
    total: Number,
    checkRequired: { type: Boolean, default: false }
  }

  connect() {
    this._animating = false
    this._timers = []
    this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    // Derive total from sections if not explicitly set
    if (!this.hasTotalValue || this.totalValue === 0) {
      this.totalValue = this.sectionTargets.length
    }

    // Guard: no sections
    if (this.totalValue === 0) return

    // Show only the first section
    this.sectionTargets.forEach((el, i) => {
      el.style.display = i === 0 ? "" : "none"
      el.removeAttribute("aria-hidden")
      if (i !== 0) el.setAttribute("aria-hidden", "true")
    })

    this._updateProgress()
    this._updateButton()

    // Detect if initial section is a check
    this._detectCheck(this.currentValue)

    // Swipe detection
    this._onTouchStart = this._handleTouchStart.bind(this)
    this._onTouchEnd = this._handleTouchEnd.bind(this)

    if (this.hasContainerTarget) {
      this.containerTarget.addEventListener("touchstart", this._onTouchStart, { passive: true })
      this.containerTarget.addEventListener("touchend", this._onTouchEnd, { passive: true })
    }

    // Listen for knowledge-check answered events
    this._onCheckAnswered = this._handleCheckAnswered.bind(this)
    this.element.addEventListener("lesson-check:answered", this._onCheckAnswered)
  }

  disconnect() {
    // Clean up timers
    this._timers.forEach(id => clearTimeout(id))
    this._timers = []

    // Remove touch listeners
    if (this.hasContainerTarget) {
      this.containerTarget.removeEventListener("touchstart", this._onTouchStart)
      this.containerTarget.removeEventListener("touchend", this._onTouchEnd)
    }

    // Remove custom event listener
    this.element.removeEventListener("lesson-check:answered", this._onCheckAnswered)
  }

  // ── Actions ──────────────────────────────────────────────────

  next() {
    if (this._animating) return

    // If check is required and not answered, shake button
    if (this.checkRequiredValue) {
      this._shakeButton()
      return
    }

    const from = this.currentValue
    const to = from + 1

    // Last section → complete
    if (to >= this.totalValue) {
      this._dispatchComplete()
      return
    }

    this._transition(from, to, "left")
  }

  prev() {
    if (this._animating) return

    const from = this.currentValue
    const to = from - 1

    if (to < 0) return

    this._transition(from, to, "right")
  }

  checkAnswered(event) {
    this._handleCheckAnswered(event)
  }

  // ── Private: transitions ─────────────────────────────────────

  _transition(from, to, direction) {
    if (from === to) return
    if (to < 0 || to >= this.totalValue) return

    this._animating = true

    const outgoing = this.sectionTargets[from]
    const incoming = this.sectionTargets[to]

    if (!outgoing || !incoming) {
      this._animating = false
      return
    }

    if (this._reducedMotion) {
      // Instant transition
      outgoing.style.display = "none"
      outgoing.setAttribute("aria-hidden", "true")
      incoming.style.display = ""
      incoming.removeAttribute("aria-hidden")
      this.currentValue = to
      this._detectCheck(to)
      this._updateProgress()
      this._updateButton()
      this._animating = false
      return
    }

    // Animated transition
    const exitClass = direction === "left"
      ? "lesson-section--exit-left"
      : "lesson-section--exit-right"
    const enterClass = direction === "left"
      ? "lesson-section--enter-left"
      : "lesson-section--enter-right"

    // Prepare incoming off-screen
    incoming.style.display = ""
    incoming.classList.add(enterClass)

    // Force reflow so the enter class takes effect before removal
    incoming.offsetHeight // eslint-disable-line no-unused-expressions

    // Start exit animation
    outgoing.classList.add(exitClass)

    // Start enter animation (remove the positioning class to slide in)
    incoming.classList.remove(enterClass)

    // After transition duration, clean up
    const timer = setTimeout(() => {
      outgoing.classList.remove(exitClass)
      outgoing.style.display = "none"
      outgoing.setAttribute("aria-hidden", "true")
      incoming.removeAttribute("aria-hidden")

      this.currentValue = to
      this._detectCheck(to)
      this._updateProgress()
      this._updateButton()
      this._animating = false
    }, 400)

    this._timers.push(timer)
  }

  // ── Private: check detection ─────────────────────────────────

  _detectCheck(index) {
    const section = this.sectionTargets[index]
    if (!section) return

    const isCheck = section.dataset.lessonCheck === "true"
    const isAnswered = section.dataset.lessonCheckAnswered === "true"

    if (isCheck && !isAnswered) {
      this.checkRequiredValue = true
    } else {
      this.checkRequiredValue = false
    }
  }

  _handleCheckAnswered(event) {
    this.checkRequiredValue = false

    // Mark the section as answered
    const section = this.sectionTargets[this.currentValue]
    if (section) {
      section.dataset.lessonCheckAnswered = "true"
    }

    this._updateButton()
  }

  // ── Private: progress bar ────────────────────────────────────

  _updateProgress() {
    const current = this.currentValue
    const total = this.totalValue

    // Update counter text
    if (this.hasProgressCounterTarget) {
      this.progressCounterTarget.textContent = `${current + 1}/${total}`
    }

    // Update segments
    this.progressSegmentTargets.forEach((seg, i) => {
      seg.classList.remove("lesson-progress--active", "lesson-progress--visited")

      if (i < current) {
        seg.classList.add("lesson-progress--visited")
      } else if (i === current) {
        seg.classList.add("lesson-progress--active")
      }
    })
  }

  // ── Private: continue button ─────────────────────────────────

  _updateButton() {
    if (!this.hasContinueBtnTarget) return

    const btn = this.continueBtnTarget
    const isLast = this.currentValue === this.totalValue - 1

    // Show/hide back button
    if (this.hasBackBtnTarget) {
      this.backBtnTarget.style.display = this.currentValue > 0 ? "" : "none"
    }

    if (this.checkRequiredValue) {
      btn.textContent = "Responde para continuar"
      btn.disabled = true
      btn.classList.add("lesson-btn--muted")
      btn.classList.remove("lesson-btn--primary")
    } else if (isLast) {
      btn.textContent = "Completar lección"
      btn.disabled = false
      btn.classList.remove("lesson-btn--muted")
      btn.classList.add("lesson-btn--primary")
    } else {
      btn.textContent = "Continuar"
      btn.disabled = false
      btn.classList.remove("lesson-btn--muted")
      btn.classList.add("lesson-btn--primary")
    }
  }

  _shakeButton() {
    if (!this.hasContinueBtnTarget) return

    const btn = this.continueBtnTarget
    btn.classList.add("lesson-btn--shake")

    const timer = setTimeout(() => {
      btn.classList.remove("lesson-btn--shake")
    }, 500)

    this._timers.push(timer)
  }

  // ── Private: completion ──────────────────────────────────────

  _dispatchComplete() {
    this.dispatch("complete", {
      detail: { sectionsCompleted: this.totalValue }
    })
  }

  // ── Private: swipe detection ─────────────────────────────────

  _handleTouchStart(event) {
    if (event.touches.length === 1) {
      this._touchStartX = event.touches[0].clientX
      this._touchStartY = event.touches[0].clientY
    }
  }

  _handleTouchEnd(event) {
    if (this._touchStartX == null) return

    const endX = event.changedTouches[0].clientX
    const endY = event.changedTouches[0].clientY
    const diffX = this._touchStartX - endX
    const diffY = Math.abs(this._touchStartY - endY)

    // Only trigger if horizontal swipe is dominant and exceeds threshold
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > diffY) {
      if (diffX > 0) {
        this.next()  // swipe left → next
      } else {
        this.prev()  // swipe right → prev
      }
    }

    this._touchStartX = null
    this._touchStartY = null
  }
}
