import { Controller } from "@hotwired/stimulus"

/**
 * lesson-quiz controller — v2 with Timer + Bonus XP + Hearts
 *
 * Child controller for knowledge-check sections inside the interactive lesson.
 * Dispatches quiz:correct (with XP detail) and quiz:completed events that
 * bubble up to the interactive-lesson controller for gating/unlock.
 *
 * v2 additions:
 *  - Countdown timer with urgent state at ≤5s
 *  - Speed bonus: +5 XP if answered in <10s
 *  - Hearts: dispatches quiz:wrong for wrong answers so parent can decrement
 *  - Bonus tag visual feedback (earned/missed)
 *
 * Coexists with lesson-check controller on the same element.
 */
export default class extends Controller {
  static targets = ["option", "timerWrap", "timerDisplay", "bonusTag"]

  static values = {
    correct: Number,        // index of the correct option (0-based)
    xp: { type: Number, default: 15 },
    timed: { type: Boolean, default: false },
    timerSeconds: { type: Number, default: 15 }
  }

  connect() {
    this._answered = false
    this._timers = []
    this._timerInterval = null
    this._secondsLeft = this.timerSecondsValue
    this._startTime = Date.now()

    // Start countdown if timed quiz
    if (this.timedValue) {
      this._startTimer()
    }
  }

  disconnect() {
    this._timers.forEach(id => clearTimeout(id))
    this._timers = []
    this._stopTimer()
  }

  // ── Timer ──────────────────────────────────────────────────

  _startTimer() {
    if (!this.hasTimerDisplayTarget) return

    this._secondsLeft = this.timerSecondsValue
    this._updateTimerDisplay()

    this._timerInterval = setInterval(() => {
      this._secondsLeft--
      this._updateTimerDisplay()

      // Urgent state at ≤5s
      if (this._secondsLeft <= 5 && this.hasTimerWrapTarget) {
        this.timerWrapTarget.classList.add("urgent")
      }

      if (this._secondsLeft <= 0) {
        this._stopTimer()
        // Timer ran out — auto-unlock but no XP
        this._answered = true
        this._markBonusMissed()

        // Visually show the correct answer and disable options
        this.optionTargets.forEach((opt, i) => {
          opt.style.pointerEvents = "none"
          opt.style.opacity = "0.6"
          if (i === this.correctValue) {
            opt.classList.add("lesson-check__option--correct")
            opt.style.opacity = "1"
          }
        })

        this.element.dispatchEvent(new CustomEvent("quiz:completed", {
          bubbles: true,
          detail: { correct: false, timeout: true }
        }))
      }
    }, 1000)
  }

  _stopTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval)
      this._timerInterval = null
    }
  }

  _updateTimerDisplay() {
    if (this.hasTimerDisplayTarget) {
      this.timerDisplayTarget.textContent = `${this._secondsLeft}s`
    }
  }

  _getElapsedSeconds() {
    return Math.round((Date.now() - this._startTime) / 1000)
  }

  // ── Bonus ──────────────────────────────────────────────────

  _markBonusEarned() {
    if (this.hasBonusTagTarget) {
      this.bonusTagTarget.classList.add("earned")
      this.bonusTagTarget.textContent = "⚡ +5 XP BONUS ganado!"
    }
  }

  _markBonusMissed() {
    if (this.hasBonusTagTarget) {
      this.bonusTagTarget.classList.add("missed")
    }
  }

  // ── Answer ─────────────────────────────────────────────────

  selectOption(event) {
    if (this._answered) return
    this._answered = true
    this._stopTimer()

    const btn = event.currentTarget
    const selectedIndex = this.optionTargets.indexOf(btn)
    const isCorrect = selectedIndex === this.correctValue
    const elapsed = this._getElapsedSeconds()
    const earnedBonus = this.timedValue && elapsed < 10 && isCorrect
    const totalXp = earnedBonus ? this.xpValue + 5 : this.xpValue

    if (isCorrect) {
      // Show bonus feedback
      if (earnedBonus) {
        this._markBonusEarned()
      } else if (this.timedValue) {
        this._markBonusMissed()
      }

      // Freeze timer display at current value
      if (this.hasTimerDisplayTarget) {
        this.timerDisplayTarget.textContent = `${this._secondsLeft}s`
        if (this.hasTimerWrapTarget) {
          this.timerWrapTarget.style.color = "#059669"
          this.timerWrapTarget.style.background = "linear-gradient(135deg, rgba(209,250,229,0.8), rgba(167,243,208,0.8))"
          this.timerWrapTarget.classList.remove("urgent")
        }
      }

      // Dispatch quiz:correct immediately so parent can show XP float
      this.element.dispatchEvent(new CustomEvent("quiz:correct", {
        bubbles: true,
        detail: { xp: totalXp, index: selectedIndex, bonus: earnedBonus, elapsed }
      }))

      // Unlock continue after short delay
      const timer = setTimeout(() => {
        this.element.dispatchEvent(new CustomEvent("quiz:completed", {
          bubbles: true,
          detail: { correct: true, bonus: earnedBonus, elapsed }
        }))
      }, 1500)
      this._timers.push(timer)
    } else {
      // Wrong answer
      this._markBonusMissed()

      // Freeze timer in red
      if (this.hasTimerWrapTarget) {
        this.timerWrapTarget.classList.add("urgent")
      }

      // Dispatch quiz:wrong for hearts system
      this.element.dispatchEvent(new CustomEvent("quiz:wrong", {
        bubbles: true,
        detail: { index: selectedIndex }
      }))

      // Unlock continue after longer delay
      const timer = setTimeout(() => {
        this.element.dispatchEvent(new CustomEvent("quiz:completed", {
          bubbles: true,
          detail: { correct: false, elapsed }
        }))
      }, 2500)
      this._timers.push(timer)
    }
  }
}
