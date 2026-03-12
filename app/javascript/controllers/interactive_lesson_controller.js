import { Controller } from "@hotwired/stimulus"

/**
 * interactive-lesson controller
 *
 * Powers the Duolingo-style section-by-section lesson navigation.
 * Replaces lesson-nav as the main orchestrator — handles transitions,
 * progress bar, quiz gating, section timing, swipe, completion,
 * XP rewards, and celebration screen.
 *
 * All user-facing text is in Spanish.
 */

// Lazy-load canvas-confetti for micro-celebrations
let _confettiModule = null
async function getConfetti() {
  if (!_confettiModule) {
    try {
      _confettiModule = (await import("canvas-confetti")).default
    } catch {
      _confettiModule = () => {} // noop fallback
    }
  }
  return _confettiModule
}

export default class extends Controller {
  static targets = [
    "progressBar",
    "sectionCounter",
    "sectionsContainer",
    "section",
    "continueBar",
    "continueBtn",
    "continueBtnText",
    "backBtn",
    "progressSegment",
    // v2 targets
    "heartsWrap",
    "heartsCount",
    "companion",
    "companionBubble",
    "levelUpOverlay",
    "levelUpNum",
    "toast",
    "xpBarWrap",
    "xpFill",
    "xpLevel"
  ]

  static values = {
    stepId: String,
    routeId: String,
    totalSections: Number,
    currentSection: { type: Number, default: 0 },
    completeUrl: String,
    // v2 values
    hearts: { type: Number, default: 5 },
    userLevel: { type: Number, default: 1 },
    userXpPct: { type: Number, default: 0 },
    userStreak: { type: Number, default: 0 }
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  connect() {
    this._animating = false
    this._locked = false
    this._completed = false
    this._timers = []
    this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    // Quiz tracking for lesson_perfect bonus
    this._quizCorrect = 0
    this._quizTotal = 0

    // Derive total from DOM if not set
    if (!this.hasTotalSectionsValue || this.totalSectionsValue === 0) {
      this.totalSectionsValue = this.sectionTargets.length
    }

    if (this.totalSectionsValue === 0) return

    // Section timing analytics
    this.sectionTimes = {}
    this._sectionStartTime = Date.now()

    // Global lesson timer
    this._lessonStartTime = Date.now()

    // Initialize section visibility
    this.sectionTargets.forEach((el, i) => {
      el.style.display = i === 0 ? "" : "none"
      if (i !== 0) el.setAttribute("aria-hidden", "true")
      else el.removeAttribute("aria-hidden")
    })

    this._detectQuizLock(this.currentSectionValue)
    this.updateUI()

    // Activate quiz controller on the initial visible section
    this._activateQuizInSection(this.sectionTargets[this.currentSectionValue])

    // Swipe support
    this._onTouchStart = this._handleTouchStart.bind(this)
    this._onTouchEnd = this._handleTouchEnd.bind(this)

    if (this.hasSectionsContainerTarget) {
      this.sectionsContainerTarget.addEventListener("touchstart", this._onTouchStart, { passive: true })
      this.sectionsContainerTarget.addEventListener("touchend", this._onTouchEnd, { passive: true })
    }

    // Listen for quiz events bubbling from child controllers
    this._onQuizCompleted = this._handleQuizCompleted.bind(this)
    this._onQuizCorrect = this._handleQuizCorrect.bind(this)
    // Also listen for legacy lesson-check:answered from lesson_check_controller
    this._onLegacyCheckAnswered = this._handleLegacyCheckAnswered.bind(this)

    this.element.addEventListener("quiz:completed", this._onQuizCompleted)
    this.element.addEventListener("quiz:correct", this._onQuizCorrect)
    this.element.addEventListener("lesson-check:answered", this._onLegacyCheckAnswered)

    // v2: listen for wrong answers (hearts system)
    this._onQuizWrong = this._handleQuizWrong.bind(this)
    this.element.addEventListener("quiz:wrong", this._onQuizWrong)

    // v2: hearts tracking
    this._currentHearts = this.heartsValue

    // v2: companion messages per section type
    this._companionMessages = {
      concept: ["¡A aprender! 🧠", "Esto es clave 💡", "Concéntrate aquí 📖"],
      check: ["¡Tú puedes! 💪", "Piensa bien... 🤔", "¡Demuestra lo que sabes!"],
      example: ["Ejemplo real 👨‍💻", "Así se aplica 🔧", "¡Practica! 🚀"],
      audio: ["¡Hora de escuchar! 🎧", "Relájate y escucha 🎵"],
      visual: ["Mira esto 👀", "Visual > texto 📊"],
      summary: ["¡Casi terminas! 🏁", "Buen resumen 📝"],
      tip: ["Pro tip 💎", "Recuerda esto ⭐"]
    }
    this._companionIndex = 0

    // v2: show initial companion message after a beat
    this._scheduleCompanionGreeting()
  }

  disconnect() {
    this._timers.forEach(id => clearTimeout(id))
    this._timers = []

    // Clear named timers
    clearTimeout(this._companionBubbleTimer)
    clearTimeout(this._toastTimer)

    if (this.hasSectionsContainerTarget) {
      this.sectionsContainerTarget.removeEventListener("touchstart", this._onTouchStart)
      this.sectionsContainerTarget.removeEventListener("touchend", this._onTouchEnd)
    }

    this.element.removeEventListener("quiz:completed", this._onQuizCompleted)
    this.element.removeEventListener("quiz:correct", this._onQuizCorrect)
    this.element.removeEventListener("lesson-check:answered", this._onLegacyCheckAnswered)
    this.element.removeEventListener("quiz:wrong", this._onQuizWrong)
  }

  // ── Actions ────────────────────────────────────────────────────

  nextSection() {
    if (this._animating || this._completed) return

    if (this._locked) {
      this._shakeButton()
      return
    }

    const from = this.currentSectionValue
    const to = from + 1

    if (to >= this.totalSectionsValue) {
      this.completeLesson()
      return
    }

    this._transitionToSection(to, "forward")
  }

  previousSection() {
    if (this._animating || this._completed) return

    const to = this.currentSectionValue - 1
    if (to < 0) return

    this._transitionToSection(to, "backward")
  }

  // ── Transition ─────────────────────────────────────────────────

  _transitionToSection(index, direction) {
    const from = this.currentSectionValue
    if (from === index) return
    if (index < 0 || index >= this.totalSectionsValue) return

    this._animating = true

    // Record time for outgoing section
    this._recordSectionTime(from)

    const outgoing = this.sectionTargets[from]
    const incoming = this.sectionTargets[index]

    if (!outgoing || !incoming) {
      this._animating = false
      return
    }

    if (this._reducedMotion) {
      outgoing.style.display = "none"
      outgoing.setAttribute("aria-hidden", "true")
      incoming.style.display = ""
      incoming.removeAttribute("aria-hidden")
      this.currentSectionValue = index
      this._sectionStartTime = Date.now()
      this._detectQuizLock(index)
      this.updateUI()
      this._activateQuizInSection(incoming)
      this._animating = false
      return
    }

    const exitClass = direction === "forward"
      ? "lesson-section--exit-left"
      : "lesson-section--exit-right"
    const enterClass = direction === "forward"
      ? "lesson-section--enter-left"
      : "lesson-section--enter-right"

    // Frame 1: position incoming off-screen
    incoming.style.display = ""
    incoming.classList.add(enterClass)

    // Frame 2 (after reflow): start both animations
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        outgoing.classList.add(exitClass)
        incoming.classList.remove(enterClass)

        const timer = setTimeout(() => {
          outgoing.classList.remove(exitClass)
          outgoing.style.display = "none"
          outgoing.setAttribute("aria-hidden", "true")
          incoming.removeAttribute("aria-hidden")

          this.currentSectionValue = index
          this._sectionStartTime = Date.now()
          this._detectQuizLock(index)
          this.updateUI()
          this._animating = false

          // Activate quiz controller on the new section
          this._activateQuizInSection(incoming)

          // v2: companion message for new section type
          this._showCompanionForSection(incoming)
        }, 400)

        this._timers.push(timer)
      })
    })
  }

  // ── UI Update ──────────────────────────────────────────────────

  updateUI() {
    const current = this.currentSectionValue
    const total = this.totalSectionsValue

    // Progress segments
    this.progressSegmentTargets.forEach((seg, i) => {
      seg.classList.remove("lesson-progress--active", "lesson-progress--visited")
      if (i < current) {
        seg.classList.add("lesson-progress--visited")
      } else if (i === current) {
        seg.classList.add("lesson-progress--active")
      }
    })

    // Counter text
    if (this.hasSectionCounterTarget) {
      this.sectionCounterTarget.textContent = `${current + 1}/${total}`
    }

    // Back button
    if (this.hasBackBtnTarget) {
      this.backBtnTarget.style.display = current > 0 ? "" : "none"
    }

    // Continue button state
    this._updateContinueButton()
  }

  _updateContinueButton() {
    if (!this.hasContinueBtnTarget) return

    const btn = this.continueBtnTarget
    const isLast = this.currentSectionValue === this.totalSectionsValue - 1

    if (this._locked) {
      this._setBtnText("Responde para continuar")
      btn.disabled = true
      btn.classList.add("lesson-btn--muted")
      btn.classList.remove("lesson-btn--primary")
    } else if (isLast) {
      this._setBtnText("Completar lección")
      btn.disabled = false
      btn.classList.remove("lesson-btn--muted")
      btn.classList.add("lesson-btn--primary")
    } else {
      this._setBtnText("Continuar")
      btn.disabled = false
      btn.classList.remove("lesson-btn--muted")
      btn.classList.add("lesson-btn--primary")
    }
  }

  _setBtnText(text) {
    if (this.hasContinueBtnTextTarget) {
      this.continueBtnTextTarget.textContent = text
    } else if (this.hasContinueBtnTarget) {
      this.continueBtnTarget.textContent = text
    }
  }

  // ── Quiz Lock / Unlock ─────────────────────────────────────────

  _detectQuizLock(index) {
    const section = this.sectionTargets[index]
    if (!section) return

    const isCheck = section.dataset.lessonCheck === "true"
    const isAnswered = section.dataset.lessonCheckAnswered === "true"

    this._locked = isCheck && !isAnswered
    // Track whether this check section has a lesson-quiz controller
    // (which dispatches quiz:completed with proper delay)
    this._hasQuizController = isCheck && !!section.querySelector('[data-controller*="lesson-quiz"]')
  }

  // Activate quiz/check controllers when a section becomes visible
  _activateQuizInSection(section) {
    if (!section) return

    const quizEl = section.querySelector('[data-controller*="lesson-quiz"]')
    if (quizEl) {
      const quizCtrl = this.application.getControllerForElementAndIdentifier(quizEl, "lesson-quiz")
      if (quizCtrl) quizCtrl.activate()
    }

    const checkEl = section.querySelector('[data-controller*="lesson-check"]')
    if (checkEl) {
      const checkCtrl = this.application.getControllerForElementAndIdentifier(checkEl, "lesson-check")
      if (checkCtrl && typeof checkCtrl.activate === "function") checkCtrl.activate()
    }
  }

  lockContinue() {
    this._locked = true
    this._updateContinueButton()
  }

  unlockContinue() {
    this._locked = false
    const section = this.sectionTargets[this.currentSectionValue]
    if (section) section.dataset.lessonCheckAnswered = "true"
    this._updateContinueButton()
  }

  // ── Quiz Event Handlers ────────────────────────────────────────

  _handleQuizCompleted(event) {
    // Find which section this event came from
    const sourceSection = event.target.closest('[data-interactive-lesson-target="section"]')
    const currentSection = this.sectionTargets[this.currentSectionValue]

    // Only unlock if the event came from the CURRENTLY VISIBLE section
    // (prevents expired timers on hidden sections from unlocking)
    if (sourceSection && sourceSection !== currentSection) return

    this._quizTotal++
    if (event.detail?.correct) this._quizCorrect++
    this.unlockContinue()
  }

  async _handleQuizCorrect(event) {
    // Only react to events from the current visible section
    const sourceSection = event.target.closest('[data-interactive-lesson-target="section"]')
    const currentSection = this.sectionTargets[this.currentSectionValue]
    if (sourceSection && sourceSection !== currentSection) return

    const xp = event.detail?.xp || 15
    const bonus = event.detail?.bonus || false
    this._showXpFloat(xp)
    this._fireQuizConfetti()

    // v2: animate HUD XP bar
    this._animateHudXp(xp)

    // v2: companion reaction
    if (bonus) {
      this._showCompanionMessage("¡VELOCIDAD! ⚡")
    } else {
      this._showCompanionMessage("¡Correcto! 🎉")
    }

    // v2: toast for bonus
    if (bonus) {
      this._showToast("⚡ +5 XP de velocidad")
    }
  }

  // ── v2: Hearts System ───────────────────────────────────────────

  _handleQuizWrong(event) {
    // Only react to events from the current visible section
    const sourceSection = event.target.closest('[data-interactive-lesson-target="section"]')
    const currentSection = this.sectionTargets[this.currentSectionValue]
    if (sourceSection && sourceSection !== currentSection) return

    this._currentHearts = Math.max(0, this._currentHearts - 1)
    this._updateHeartsDisplay()

    // Companion reacts
    this._showCompanionMessage(this._currentHearts > 0 ? "¡No te rindas! 💪" : "Sin vidas... 😢")

    // Check for game over (0 hearts)
    if (this._currentHearts <= 0) {
      this._showToast("¡Sin vidas! Pero puedes seguir 😅")
    }
  }

  _updateHeartsDisplay() {
    if (!this.hasHeartsCountTarget) return
    this.heartsCountTarget.textContent = this._currentHearts

    // Shake animation
    if (this.hasHeartsWrapTarget) {
      this.heartsWrapTarget.classList.add("lesson-hearts--shake")
      const timer = setTimeout(() => {
        this.heartsWrapTarget.classList.remove("lesson-hearts--shake")
      }, 500)
      this._timers.push(timer)

      // Red pulse when low
      if (this._currentHearts <= 1) {
        this.heartsWrapTarget.classList.add("lesson-hearts--critical")
      }
    }
  }

  // ── v2: HUD XP Bar ─────────────────────────────────────────────

  _animateHudXp(xpGained) {
    if (!this.hasXpFillTarget) return

    // Calculate new percentage (approximate — server is source of truth)
    const currentPct = this.userXpPctValue || 0
    // Each level ~100*N^1.5 XP, rough increment per XP
    const pctIncrement = Math.min(xpGained * 1.5, 100 - currentPct)
    const newPct = Math.min(currentPct + pctIncrement, 100)
    this.userXpPctValue = newPct

    this.xpFillTarget.style.transition = "width 0.8s cubic-bezier(0.34,1.56,0.64,1)"
    this.xpFillTarget.style.width = `${newPct}%`

    // Pulse the XP bar
    if (this.hasXpBarWrapTarget) {
      this.xpBarWrapTarget.classList.add("lesson-xp--pulse")
      const timer = setTimeout(() => this.xpBarWrapTarget.classList.remove("lesson-xp--pulse"), 800)
      this._timers.push(timer)
    }
  }

  // ── v2: Companion ───────────────────────────────────────────────

  companionTap() {
    const section = this.sectionTargets[this.currentSectionValue]
    const type = this._getSectionType(section)
    const msgs = this._companionMessages[type] || this._companionMessages.concept
    const msg = msgs[this._companionIndex % msgs.length]
    this._companionIndex++
    this._showCompanionMessage(msg)

    // Little bounce on tap
    if (this.hasCompanionTarget) {
      this.companionTarget.style.transform = "scale(1.2)"
      const timer = setTimeout(() => {
        this.companionTarget.style.transform = ""
      }, 200)
      this._timers.push(timer)
    }
  }

  _scheduleCompanionGreeting() {
    if (!this.hasCompanionTarget) return
    const timer = setTimeout(() => {
      this._showCompanionMessage("¡Vamos a aprender! 🚀")
    }, 1500)
    this._timers.push(timer)
  }

  _showCompanionMessage(msg) {
    if (!this.hasCompanionBubbleTarget) return

    const bubble = this.companionBubbleTarget
    bubble.textContent = msg
    bubble.classList.add("lesson-companion-bubble--visible")

    // Auto-hide after 3 seconds
    if (this._companionBubbleTimer) clearTimeout(this._companionBubbleTimer)
    this._companionBubbleTimer = setTimeout(() => {
      bubble.classList.remove("lesson-companion-bubble--visible")
    }, 3000)
    this._timers.push(this._companionBubbleTimer)
  }

  _showCompanionForSection(section) {
    const type = this._getSectionType(section)
    const msgs = this._companionMessages[type] || this._companionMessages.concept
    const msg = msgs[Math.floor(Math.random() * msgs.length)]
    // Small delay so it doesn't overlap with the transition
    const timer = setTimeout(() => this._showCompanionMessage(msg), 600)
    this._timers.push(timer)
  }

  _getSectionType(section) {
    if (!section) return "concept"
    // Prefer data attribute (set in HTML template)
    if (section.dataset.sectionType) return section.dataset.sectionType
    if (section.dataset.lessonCheck === "true") return "check"
    // Fallback: check for badge class hints via querySelector (avoids full innerHTML scan)
    const badge = section.querySelector(".lesson-section-badge")
    if (badge) {
      const cls = badge.className || ""
      if (cls.includes("--audio")) return "audio"
      if (cls.includes("--visual")) return "visual"
      if (cls.includes("--example")) return "example"
      if (cls.includes("--tip")) return "tip"
      if (cls.includes("--summary")) return "summary"
      if (cls.includes("--challenge")) return "check"
    }
    return "concept"
  }

  // ── v2: Toast ───────────────────────────────────────────────────

  _showToast(text) {
    if (!this.hasToastTarget) return

    const toast = this.toastTarget
    toast.textContent = text
    toast.classList.add("lesson-toast--visible")

    if (this._toastTimer) clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => {
      toast.classList.remove("lesson-toast--visible")
    }, 2500)
    this._timers.push(this._toastTimer)
  }

  // ── v2: Level-Up Overlay ────────────────────────────────────────

  _showLevelUpOverlay(level) {
    if (!this.hasLevelUpOverlayTarget) return

    if (this.hasLevelUpNumTarget) {
      this.levelUpNumTarget.textContent = level
    }

    this.levelUpOverlayTarget.style.display = ""
    this.levelUpOverlayTarget.classList.add("lesson-lvlup--active")

    // Update HUD level badge
    if (this.hasXpLevelTarget) {
      this.xpLevelTarget.textContent = level
    }

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      this.levelUpOverlayTarget.classList.remove("lesson-lvlup--active")
      const hide = setTimeout(() => {
        this.levelUpOverlayTarget.style.display = "none"
      }, 500)
      this._timers.push(hide)
    }, 3000)
    this._timers.push(timer)
  }

  // Handle legacy lesson-check:answered events (fallback for sections without lesson-quiz)
  _handleLegacyCheckAnswered(event) {
    // If lesson-quiz is present on this section, it handles unlock via quiz:completed
    // with a proper delay. Skip the legacy handler.
    if (this._hasQuizController) return

    // Only react to events from the current visible section
    const sourceSection = event.target.closest('[data-interactive-lesson-target="section"]')
    const currentSection = this.sectionTargets[this.currentSectionValue]
    if (sourceSection && sourceSection !== currentSection) return

    this._quizTotal++

    // Fallback for inline checks without lesson-quiz: unlock after short delay
    const timer = setTimeout(() => {
      this.unlockContinue()
    }, 1200)
    this._timers.push(timer)

    if (event.detail?.correct) {
      this._quizCorrect++
      this._showXpFloat(15)
      this._fireQuizConfetti()
    }
  }

  async _fireQuizConfetti() {
    if (this._reducedMotion) return

    const confetti = await getConfetti()
    confetti({
      particleCount: 18,
      spread: 40,
      origin: { x: 0.5, y: 0.6 },
      colors: ["#5BA880", "#B09848", "#6E9BC8", "#8B80C4"],
      disableForReducedMotion: true,
      gravity: 1.2,
      ticks: 100
    })
  }

  _showXpFloat(xp) {
    const section = this.sectionTargets[this.currentSectionValue]
    if (!section) return

    const float = document.createElement("div")
    float.textContent = `+${xp} XP`
    float.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) scale(0.5);
      font-family:'DM Mono',monospace; font-size:1.5rem; font-weight:700;
      color:#B09848; pointer-events:none; z-index:100;
      opacity:0; transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease;
    `
    document.body.appendChild(float)

    requestAnimationFrame(() => {
      float.style.opacity = "1"
      float.style.transform = "translate(-50%,-50%) scale(1)"
    })

    const timer = setTimeout(() => {
      float.style.opacity = "0"
      float.style.transform = "translate(-50%, -80%) scale(0.8)"
      const cleanup = setTimeout(() => float.remove(), 400)
      this._timers.push(cleanup)
    }, 800)

    this._timers.push(timer)
  }

  // ── Shake ──────────────────────────────────────────────────────

  _shakeButton() {
    if (!this.hasContinueBtnTarget) return
    const btn = this.continueBtnTarget
    btn.classList.add("lesson-btn--shake")
    const timer = setTimeout(() => btn.classList.remove("lesson-btn--shake"), 500)
    this._timers.push(timer)
  }

  // ── Completion ─────────────────────────────────────────────────

  async completeLesson() {
    if (this._completed) return
    this._completed = true

    // Record final section time
    this._recordSectionTime(this.currentSectionValue)

    const totalTime = Math.round((Date.now() - this._lessonStartTime) / 1000)

    // Fill all progress segments
    this.progressSegmentTargets.forEach(seg => {
      seg.classList.remove("lesson-progress--active")
      seg.classList.add("lesson-progress--visited")
    })

    if (this.hasSectionCounterTarget) {
      this.sectionCounterTarget.textContent = `${this.totalSectionsValue}/${this.totalSectionsValue}`
    }

    // POST to server with section timing + quiz results
    const completeUrl = this.completeUrlValue
    let serverData = null

    if (completeUrl) {
      try {
        const response = await fetch(completeUrl, {
          method: "POST",
          headers: {
            "X-CSRF-Token": this._csrfToken(),
            "Accept": "application/json, text/vnd.turbo-stream.html",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            section_times: this.sectionTimes,
            total_time: totalTime,
            quiz_results: {
              correct: this._quizCorrect,
              total: this._quizTotal
            }
          })
        })

        if (response.ok) {
          const contentType = response.headers.get("Content-Type") || ""
          if (contentType.includes("json")) {
            serverData = await response.json()
          } else if (contentType.includes("turbo-stream")) {
            const html = await response.text()
            Turbo.renderStreamMessage(html)
          }
        }
      } catch (err) {
        console.error("[InteractiveLesson] Complete request failed:", err)
      }
    }

    // Show celebration screen with server data
    this._showCelebrationScreen(serverData)
  }

  _showCelebrationScreen(data) {
    // Hide current section
    const current = this.sectionTargets[this.currentSectionValue]
    if (current) {
      current.style.display = "none"
      current.setAttribute("aria-hidden", "true")
    }

    // Hide continue bar & companion
    if (this.hasContinueBarTarget) {
      this.continueBarTarget.style.display = "none"
    }
    if (this.hasCompanionTarget) {
      this.companionTarget.style.display = "none"
    }

    const routeUrl = data?.route_url || this._routeOverviewUrl()
    const nextUrl = data?.next_step_url
    const nextTitle = data?.next_step_title
    const xpGained = data?.xp_gained || 0
    const leveledUp = data?.leveled_up || false
    const newLevel = data?.level || 0
    const streak = data?.streak || 0
    const routeCompleted = data?.route_completed || false

    // Compute lesson stats
    const totalTime = Math.round((Date.now() - this._lessonStartTime) / 1000)
    const minutes = Math.floor(totalTime / 60)
    const seconds = totalTime % 60
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
    const quizScore = this._quizTotal > 0
      ? `${this._quizCorrect}/${this._quizTotal}`
      : null
    const quizPct = this._quizTotal > 0
      ? Math.round((this._quizCorrect / this._quizTotal) * 100)
      : null
    const perfect = this._quizTotal > 0 && this._quizCorrect === this._quizTotal

    // Build celebration screen
    const screen = document.createElement("div")
    screen.className = "lesson-completion-screen"

    const heading = routeCompleted ? "¡Ruta completada!" : "¡Lección completada!"
    const sub = routeCompleted
      ? "Has completado toda la ruta de aprendizaje"
      : (perfect ? "¡Perfecto! Sin errores 🏆" : "¡Sigue así, vas increíble!")

    // Stat cards
    let statsHtml = `<div class="lesson-completion-stats">`
    if (xpGained > 0) {
      statsHtml += `
        <div class="lesson-completion-stat" style="--delay:0.1s">
          <div class="lesson-completion-stat-icon" style="background:linear-gradient(135deg,#F5C842,#B09848);">⭐</div>
          <div class="lesson-completion-stat-value">+${xpGained}</div>
          <div class="lesson-completion-stat-label">XP ganados</div>
        </div>
      `
    }
    if (quizScore) {
      statsHtml += `
        <div class="lesson-completion-stat" style="--delay:0.2s">
          <div class="lesson-completion-stat-icon" style="background:linear-gradient(135deg,#6E9BC8,#5B7FC8);">✓</div>
          <div class="lesson-completion-stat-value">${quizPct}%</div>
          <div class="lesson-completion-stat-label">${quizScore} correctas</div>
        </div>
      `
    }
    if (streak > 0) {
      statsHtml += `
        <div class="lesson-completion-stat" style="--delay:0.3s">
          <div class="lesson-completion-stat-icon" style="background:linear-gradient(135deg,#F59E0B,#D97706);">🔥</div>
          <div class="lesson-completion-stat-value">${streak}</div>
          <div class="lesson-completion-stat-label">${streak === 1 ? "día" : "días"} de racha</div>
        </div>
      `
    }
    statsHtml += `
      <div class="lesson-completion-stat" style="--delay:0.4s">
        <div class="lesson-completion-stat-icon" style="background:linear-gradient(135deg,#8B80C4,#6E60B4);">⏱</div>
        <div class="lesson-completion-stat-value">${timeStr}</div>
        <div class="lesson-completion-stat-label">Tiempo total</div>
      </div>
    `
    statsHtml += `</div>`

    let btnHtml
    if (nextUrl && !routeCompleted) {
      btnHtml = `
        <a href="${this._escAttr(nextUrl)}" class="lesson-completion-btn lesson-completion-btn--primary">
          ${nextTitle ? `Siguiente: ${this._esc(nextTitle)}` : "Siguiente paso"}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
        <a href="${this._escAttr(routeUrl)}" class="lesson-completion-btn lesson-completion-btn--secondary">
          Ver ruta completa
        </a>
      `
    } else {
      btnHtml = `
        <a href="${this._escAttr(routeUrl)}" class="lesson-completion-btn lesson-completion-btn--primary">
          ${routeCompleted ? "Ver ruta" : "Continuar ruta"}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
      `
    }

    screen.innerHTML = `
      <div class="lesson-completion-inner">
        <div class="lesson-completion-check">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 class="lesson-completion-heading">${heading}</h2>
        <p class="lesson-completion-sub">${sub}</p>
        ${statsHtml}
        <div class="lesson-completion-actions">
          ${btnHtml}
        </div>
      </div>
    `

    if (this.hasSectionsContainerTarget) {
      this.sectionsContainerTarget.appendChild(screen)
    }

    // Fire celebration confetti
    this._fireCelebrationConfetti(leveledUp || routeCompleted)

    // Animate navbar engagement bar if present
    this._animateNavbarXp(xpGained)

    // v2: Level-up overlay (shown AFTER confetti with delay)
    if (leveledUp && newLevel > 0) {
      this._goldFlash()
      const timer = setTimeout(() => this._showLevelUpOverlay(newLevel), 1200)
      this._timers.push(timer)
    } else if (routeCompleted) {
      this._goldFlash()
    }
  }

  async _fireCelebrationConfetti(isEpic) {
    if (this._reducedMotion) return

    const confetti = await getConfetti()

    if (isEpic) {
      // Epic: multi-burst
      confetti({ particleCount: 100, spread: 160, origin: { x: 0.3, y: 0.5 }, colors: ["#8B80C4", "#6E9BC8", "#5BA880", "#B09848", "#E8E4DC"], disableForReducedMotion: true })
      const t1 = setTimeout(() => {
        confetti({ particleCount: 100, spread: 160, origin: { x: 0.7, y: 0.5 }, colors: ["#8B80C4", "#6E9BC8", "#5BA880", "#B09848", "#E8E4DC"], disableForReducedMotion: true })
      }, 300)
      const t2 = setTimeout(() => {
        confetti({ particleCount: 50, angle: 90, spread: 120, origin: { y: 0 }, colors: ["#8B80C4", "#6E9BC8", "#5BA880", "#B09848", "#E8E4DC"], disableForReducedMotion: true })
      }, 600)
      this._timers.push(t1, t2)
    } else {
      // Big: single burst
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#8B80C4", "#6E9BC8", "#5BA880", "#B09848", "#E8E4DC"],
        disableForReducedMotion: true
      })
    }
  }

  _goldFlash() {
    const flash = document.createElement("div")
    flash.style.cssText = `
      position:fixed; inset:0; background:rgba(176,152,72,0.08);
      pointer-events:none; z-index:9997;
      animation:celebration-gold-flash 0.6s ease-out forwards;
    `
    document.body.appendChild(flash)
    const timer = setTimeout(() => flash.remove(), 700)
    this._timers.push(timer)
  }

  _animateNavbarXp(xpGained) {
    if (!xpGained) return

    const xpCount = document.querySelector("[data-engagement-target='xpCount']")
    if (xpCount) {
      xpCount.style.transition = "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), color 0.3s"
      xpCount.style.transform = "scale(1.4)"
      xpCount.style.color = "#5BA880"
      const t = setTimeout(() => {
        xpCount.style.transform = "scale(1)"
        xpCount.style.color = ""
      }, 800)
      this._timers.push(t)
    }

    const flame = document.querySelector("[data-engagement-target='flameIcon']")
    if (flame) {
      flame.style.transition = "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"
      flame.style.transform = "scale(1.5)"
      const t = setTimeout(() => { flame.style.transform = "scale(1)" }, 600)
      this._timers.push(t)
    }
  }

  _routeOverviewUrl() {
    // Build URL from current path: /learning/routes/:route_id/steps/:step_id -> /learning/routes/:route_id
    const path = window.location.pathname
    const match = path.match(/\/routes\/([^/]+)/)
    if (match) return path.substring(0, path.indexOf("/steps"))
    return path
  }

  // ── Section Timing ─────────────────────────────────────────────

  _recordSectionTime(index) {
    if (this._sectionStartTime) {
      const elapsed = Math.round((Date.now() - this._sectionStartTime) / 1000)
      this.sectionTimes[index] = (this.sectionTimes[index] || 0) + elapsed
    }
  }

  // ── Swipe ──────────────────────────────────────────────────────

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

    // Threshold 80px prevents accidental swipes while staying responsive
    // (research recommends 150px but that's too much on small phones)
    if (Math.abs(diffX) > 80 && Math.abs(diffX) > diffY * 1.5) {
      if (diffX > 0) {
        this.nextSection()
      } else {
        this.previousSection()
      }
    }

    this._touchStartX = null
    this._touchStartY = null
  }

  // ── Helpers ────────────────────────────────────────────────────

  _csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]')
    return meta ? meta.content : ""
  }

  _esc(str) {
    const d = document.createElement("span")
    d.textContent = str || ""
    return d.innerHTML
  }

  _escAttr(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }
}
