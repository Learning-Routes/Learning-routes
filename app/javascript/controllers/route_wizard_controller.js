import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "step", "form", "stepBar", "stepLabel", "stepName",
    "continueBtn", "btnText", "chips", "navLeft", "bottomHint", "footer",
    "topicInputs", "goalInputs", "levelInput", "paceInput",
    "hoursInput", "sessionInput", "hoursGrid", "sessionGrid",
    "customInput", "customInputWrap", "topicGrid", "errorBanner",
    "node0", "node1", "node2", "node3", "node4", "node5",
    "line0", "line1", "line2", "line3", "line4",
    "styleAnswer1", "styleAnswer2", "styleAnswer3",
    "styleAnswer4", "styleAnswer5", "styleAnswer6",
    "styleProgress", "styleResultCard", "styleResultIcon",
    "styleResultName", "styleResultDesc", "styleDoneMsg",
    "savedStyleBanner", "savedStyleText", "styleHeader", "styleQuestionsWrap"
  ]

  static values = {
    step: { type: Number, default: 0 },
    generating: { type: Boolean, default: false },
    i18n: { type: Object, default: {} },
    savedPrefs: { type: Object, default: {} }
  }

  connect() {
    if (this.generatingValue) return

    this.totalSteps = 6
    this.selectedTopics = new Set()
    this.selectedGoals = new Set()
    this.selectedLevel = ""
    this.selectedPace = ""
    this.selectedHours = 0
    this.selectedSession = 0
    this.styleAnswers = {}
    this.isAnimating = false
    this._allowSubmit = false
    this.styleSaved = false
    this._timers = []

    // Load saved preferences
    this._loadSavedPrefs()

    this.updateUI()
    this.validateStep()
  }

  disconnect() {
    if (this._animSafetyTimer) clearTimeout(this._animSafetyTimer)
    this._timers.forEach(t => clearTimeout(t))
    this._timers = []
  }

  t(key, fallback) {
    const keys = key.split(".")
    let val = this.i18nValue
    for (const k of keys) {
      if (val && typeof val === "object" && k in val) {
        val = val[k]
      } else {
        return fallback || key
      }
    }
    return val || fallback || key
  }

  handleSubmit(event) {
    if (!this._allowSubmit) {
      event.preventDefault()
      if (this.isCurrentStepValid()) {
        this.next()
      }
      return
    }
    this._allowSubmit = false
  }

  preventEnterSubmit(event) {
    if (event.key === "Enter") {
      event.preventDefault()
      if (this.isCurrentStepValid()) {
        this.next()
      }
    }
  }

  next() {
    if (this.isAnimating) return
    if (!this.isCurrentStepValid()) return

    const lastStep = this.totalSteps - 1
    if (this.stepValue === lastStep) {
      this._allowSubmit = true
      this.formTarget.requestSubmit()
      return
    }

    this.animateStepTransition(this.stepValue, this.stepValue + 1, 1)
    this.stepValue++
    this.updateUI()
    this.validateStep()
  }

  back() {
    if (this.isAnimating || this.stepValue === 0) return

    this.animateStepTransition(this.stepValue, this.stepValue - 1, -1)
    this.stepValue--
    this.updateUI()
    this.validateStep()
  }

  // ===== STEP 0: TOPICS =====

  toggleTopic(event) {
    const card = event.currentTarget
    const topic = card.dataset.topic
    const color = card.dataset.color
    const check = card.querySelector(".wizard-check")
    const iconWrap = card.querySelector(".wizard-topic-icon")

    if (this.selectedTopics.has(topic)) {
      this.selectedTopics.delete(topic)
      card.style.background = ""
      card.style.borderColor = ""
      card.style.transform = "scale(1)"
      if (check) check.style.display = "none"
      if (iconWrap) iconWrap.style.background = "var(--color-tint, rgba(28,24,18,0.02))"
    } else {
      this.selectedTopics.add(topic)
      card.style.background = color + "08"
      card.style.borderColor = color + "40"
      card.style.transform = "scale(1.01)"
      if (check) {
        check.style.display = "flex"
        check.style.background = color
      }
      if (iconWrap) iconWrap.style.background = color + "12"
    }

    this.syncTopicInputs()
    this.validateStep()
  }

  updateCustomTopic() {
    const val = this.hasCustomInputTarget ? this.customInputTarget.value.trim() : ""
    if (this.hasCustomInputWrapTarget) {
      this.customInputWrapTarget.style.borderColor = val.length > 0
        ? "#5BA88035"
        : ""
    }
    this.validateStep()
  }

  // ===== STEP 1: LEVEL =====

  selectLevel(event) {
    const card = event.currentTarget
    const level = card.dataset.level
    const color = card.dataset.color

    const stepEl = this.stepTargets.find(el => parseInt(el.dataset.step) === 1)
    if (!stepEl) return

    stepEl.querySelectorAll("[data-level]").forEach(el => {
      el.style.background = ""
      el.style.borderColor = ""
      const icon = el.querySelector("div:first-child")
      if (icon) icon.style.background = "var(--color-tint, rgba(28,24,18,0.02))"
      const dot = el.querySelector(".wizard-radio-dot")
      if (dot) {
        dot.style.transform = "scale(0)"
        dot.style.background = "transparent"
      }
      const ring = dot?.parentElement
      if (ring) ring.style.borderColor = "var(--color-border-subtle, rgba(28,24,18,0.1))"
    })

    card.style.background = color + "08"
    card.style.borderColor = color + "40"
    const icon = card.querySelector("div:first-child")
    if (icon) icon.style.background = color + "14"
    const dot = card.querySelector(".wizard-radio-dot")
    if (dot) {
      dot.style.background = color
      dot.style.transform = "scale(1)"
    }
    const ring = dot?.parentElement
    if (ring) ring.style.borderColor = color

    this.selectedLevel = level
    if (this.hasLevelInputTarget) this.levelInputTarget.value = level
    this.validateStep()
  }

  // ===== STEP 2: GOALS =====

  toggleGoal(event) {
    const card = event.currentTarget
    const goal = card.dataset.goal
    const check = card.querySelector(".wizard-goal-check")
    const label = card.querySelector("span:nth-child(2)")

    if (this.selectedGoals.has(goal)) {
      this.selectedGoals.delete(goal)
      card.style.background = ""
      card.style.borderColor = ""
      if (label) label.style.fontWeight = "500"
      if (check) check.style.display = "none"
    } else {
      this.selectedGoals.add(goal)
      card.style.background = "#8B80C408"
      card.style.borderColor = "#8B80C435"
      if (label) label.style.fontWeight = "600"
      if (check) check.style.display = "block"
    }

    this.syncGoalInputs()
    this.validateStep()
  }

  // ===== STEP 3: TIME COMMITMENT =====

  selectHours(event) {
    const card = event.currentTarget
    const hours = parseInt(card.dataset.hours, 10)

    if (this.hasHoursGridTarget) {
      this.hoursGridTarget.querySelectorAll("[data-hours]").forEach(el => {
        el.style.background = ""
        el.style.borderColor = ""
      })
    }

    card.style.background = "#6E9BC810"
    card.style.borderColor = "#6E9BC840"

    this.selectedHours = hours
    if (this.hasHoursInputTarget) this.hoursInputTarget.value = hours
    this.validateStep()
  }

  selectSession(event) {
    const card = event.currentTarget
    const mins = parseInt(card.dataset.minutes, 10)

    if (this.hasSessionGridTarget) {
      this.sessionGridTarget.querySelectorAll("[data-minutes]").forEach(el => {
        el.style.background = ""
        el.style.borderColor = ""
      })
    }

    card.style.background = "#6E9BC810"
    card.style.borderColor = "#6E9BC840"

    this.selectedSession = mins
    if (this.hasSessionInputTarget) this.sessionInputTarget.value = mins
    this.validateStep()
  }

  // ===== STEP 4: LEARNING STYLE =====

  selectStyleAnswer(event) {
    const card = event.currentTarget
    const question = card.dataset.question
    const option = card.dataset.option

    const questionContainer = card.closest("[data-style-question]")
    if (questionContainer) {
      questionContainer.querySelectorAll("[data-option]").forEach(el => {
        el.style.background = ""
        el.style.borderColor = ""
        const text = el.querySelector(".style-option-text")
        if (text) text.style.fontWeight = "400"
        const check = el.querySelector(".style-check")
        if (check) check.style.display = "none"
      })
    }

    card.style.background = "rgba(139,128,196,0.05)"
    card.style.borderColor = "rgba(139,128,196,0.3)"
    const text = card.querySelector(".style-option-text")
    if (text) text.style.fontWeight = "500"
    const check = card.querySelector(".style-check")
    if (check) check.style.display = "flex"

    this.styleAnswers[question] = option

    const targetName = `hasStyleAnswer${question}Target`
    if (this[targetName]) {
      this[`styleAnswer${question}Target`].value = option
    }

    this.updateStyleProgress()

    // Auto-scroll to next unanswered question
    const nextQ = parseInt(question) + 1
    if (nextQ <= 6 && !this.styleAnswers[String(nextQ)]) {
      setTimeout(() => {
        const nextEl = this.element.querySelector(`[data-style-question="${nextQ}"]`)
        if (nextEl) {
          nextEl.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }, 150)
    }

    if (Object.keys(this.styleAnswers).length === 6) {
      this.showStyleResult()
    }

    this.validateStep()
  }

  retakeStyle() {
    this.styleSaved = false
    this.styleAnswers = {}

    // Clear hidden fields
    for (let i = 1; i <= 6; i++) {
      const target = `hasStyleAnswer${i}Target`
      if (this[target]) this[`styleAnswer${i}Target`].value = ""
    }

    // Show questions, hide banner
    if (this.hasSavedStyleBannerTarget) this.savedStyleBannerTarget.style.display = "none"
    if (this.hasStyleHeaderTarget) this.styleHeaderTarget.style.display = "block"
    if (this.hasStyleQuestionsWrapTarget) this.styleQuestionsWrapTarget.style.display = "flex"

    // Reset question UI
    this.element.querySelectorAll("[data-style-question] [data-option]").forEach(el => {
      el.style.background = ""
      el.style.borderColor = ""
      const text = el.querySelector(".style-option-text")
      if (text) text.style.fontWeight = "400"
      const check = el.querySelector(".style-check")
      if (check) check.style.display = "none"
    })

    if (this.hasStyleResultCardTarget) {
      this.styleResultCardTarget.style.display = "none"
      this.styleResultCardTarget.style.opacity = "0"
    }
    if (this.hasStyleDoneMsgTarget) {
      this.styleDoneMsgTarget.style.opacity = "0"
    }

    this.updateStyleProgress()
    this.validateStep()
  }

  updateStyleProgress() {
    const answered = Object.keys(this.styleAnswers).length
    if (this.hasStyleProgressTarget) {
      const template = this.t("progress_of_6", ":done of 6")
      this.styleProgressTarget.textContent = template.replace(":done", answered)
    }
    if (answered === 6 && this.hasStyleDoneMsgTarget) {
      this.styleDoneMsgTarget.style.opacity = "1"
      this.styleDoneMsgTarget.style.transform = "translateY(0)"
    }
  }

  showStyleResult() {
    const scores = { visual: 0, auditory: 0, reading: 0, kinesthetic: 0 }
    const styleMap = { v: "visual", a: "auditory", r: "reading", k: "kinesthetic" }

    Object.values(this.styleAnswers).forEach(optionId => {
      const letter = optionId.slice(-1)
      const style = styleMap[letter]
      if (style) scores[style]++
    })

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
    let dominant = sorted[0][0]
    if (sorted[0][1] === sorted[1][1]) dominant = "multimodal"

    const stylesI18n = this.i18nValue.styles || {}
    const styleInfo = stylesI18n[dominant] || stylesI18n["multimodal"] || { emoji: "\u{1F9E9}", name: "Multimodal", desc: "" }

    if (this.hasStyleResultCardTarget) {
      this.styleResultCardTarget.style.display = "block"
      setTimeout(() => {
        this.styleResultCardTarget.style.opacity = "1"
        this.styleResultCardTarget.style.transform = "translateY(0)"
      }, 50)
    }
    if (this.hasStyleResultIconTarget) this.styleResultIconTarget.textContent = styleInfo.emoji
    if (this.hasStyleResultNameTarget) this.styleResultNameTarget.textContent = styleInfo.name
    if (this.hasStyleResultDescTarget) this.styleResultDescTarget.textContent = styleInfo.desc || ""

    this.dominantStyle = dominant
    this.dominantStyleData = styleInfo
  }

  // ===== STEP 5: PACE =====

  selectPace(event) {
    const card = event.currentTarget
    const pace = card.dataset.pace
    const color = card.dataset.color

    const stepEl = this.stepTargets.find(el => parseInt(el.dataset.step) === 5)
    if (!stepEl) return

    stepEl.querySelectorAll("[data-pace]").forEach(el => {
      el.style.background = ""
      el.style.borderColor = ""
      const icon = el.querySelector("div:first-child")
      if (icon) icon.style.background = "rgba(28,24,18,0.02)"
      const badge = el.querySelector(".wizard-time-badge")
      if (badge) {
        badge.style.color = ""
        badge.style.opacity = "0.5"
        badge.style.background = "rgba(28,24,18,0.02)"
      }
    })

    card.style.background = color + "08"
    card.style.borderColor = color + "40"
    const icon = card.querySelector("div:first-child")
    if (icon) icon.style.background = color + "14"
    const badge = card.querySelector(".wizard-time-badge")
    if (badge) {
      badge.style.color = color
      badge.style.opacity = "0.8"
      badge.style.background = color + "0D"
    }

    this.selectedPace = pace
    if (this.hasPaceInputTarget) this.paceInputTarget.value = pace
    this.validateStep()
  }

  showError(message) {
    if (this.hasErrorBannerTarget) {
      this.errorBannerTarget.textContent = message
      this.errorBannerTarget.style.display = "block"
      this.errorBannerTarget.style.opacity = "1"
      setTimeout(() => {
        this.errorBannerTarget.style.opacity = "0"
        setTimeout(() => { this.errorBannerTarget.style.display = "none" }, 300)
      }, 4000)
    }
  }

  // --- Private helpers ---

  _loadSavedPrefs() {
    const prefs = this.savedPrefsValue
    if (!prefs || Object.keys(prefs).length === 0) return

    // Pre-fill learning style if saved
    if (prefs.style_answers && prefs.style_result) {
      const answers = prefs.style_answers
      const result = prefs.style_result

      if (Object.keys(answers).length >= 6) {
        this.styleSaved = true
        this.styleAnswers = { ...answers }

        // Fill hidden fields
        for (const [q, option] of Object.entries(answers)) {
          const target = `hasStyleAnswer${q}Target`
          if (this[target]) this[`styleAnswer${q}Target`].value = option
        }

        // Show saved banner
        const stylesI18n = this.i18nValue.styles || {}
        const dominant = result.dominant || "multimodal"
        const styleInfo = stylesI18n[dominant] || stylesI18n["multimodal"] || {}

        if (this.hasSavedStyleBannerTarget) {
          this.savedStyleBannerTarget.style.display = "block"
          if (this.hasSavedStyleTextTarget) {
            const badge = this.t("saved_style_badge", "Learning style saved")
            this.savedStyleTextTarget.textContent = `${badge}: ${styleInfo.emoji || ""} ${styleInfo.name || dominant}`
          }
        }

        // Hide questions (show retake option)
        if (this.hasStyleHeaderTarget) this.styleHeaderTarget.style.display = "none"
        if (this.hasStyleQuestionsWrapTarget) this.styleQuestionsWrapTarget.style.display = "none"

        this.dominantStyle = dominant
        this.dominantStyleData = styleInfo
      }
    }

    // Pre-fill time commitment
    if (prefs.weekly_hours) {
      this.selectedHours = prefs.weekly_hours
      if (this.hasHoursInputTarget) this.hoursInputTarget.value = prefs.weekly_hours
      // Visually select the card
      this._timers.push(setTimeout(() => this._preselectTimeCard("hoursGrid", "hours", prefs.weekly_hours), 100))
    }
    if (prefs.session_minutes) {
      this.selectedSession = prefs.session_minutes
      if (this.hasSessionInputTarget) this.sessionInputTarget.value = prefs.session_minutes
      this._timers.push(setTimeout(() => this._preselectTimeCard("sessionGrid", "minutes", prefs.session_minutes), 100))
    }
  }

  _preselectTimeCard(gridTarget, dataAttr, value) {
    const hasTarget = `has${gridTarget.charAt(0).toUpperCase() + gridTarget.slice(1)}Target`
    if (!this[hasTarget]) return
    const grid = this[`${gridTarget}Target`]
    grid.querySelectorAll(`[data-${dataAttr}]`).forEach(el => {
      if (parseInt(el.dataset[dataAttr === "hours" ? "hours" : "minutes"], 10) === value) {
        el.style.background = "#6E9BC810"
        el.style.borderColor = "#6E9BC840"
      }
    })
  }

  syncTopicInputs() {
    if (!this.hasTopicInputsTarget) return
    this.topicInputsTarget.innerHTML = ""
    this.selectedTopics.forEach(topic => {
      const input = document.createElement("input")
      input.type = "hidden"
      input.name = "route_request[topics][]"
      input.value = topic
      this.topicInputsTarget.appendChild(input)
    })
  }

  syncGoalInputs() {
    if (!this.hasGoalInputsTarget) return
    this.goalInputsTarget.innerHTML = ""
    this.selectedGoals.forEach(goal => {
      const input = document.createElement("input")
      input.type = "hidden"
      input.name = "route_request[goals][]"
      input.value = goal
      this.goalInputsTarget.appendChild(input)
    })
  }

  isCurrentStepValid() {
    switch (this.stepValue) {
      case 0: {
        const hasTopics = this.selectedTopics.size > 0
        const hasCustom = this.hasCustomInputTarget && this.customInputTarget.value.trim().length > 0
        return hasTopics || hasCustom
      }
      case 1:
        return this.selectedLevel !== ""
      case 2:
        return this.selectedGoals.size > 0
      case 3:
        return this.selectedHours > 0 && this.selectedSession > 0
      case 4:
        return this.styleSaved || Object.keys(this.styleAnswers).length === 6
      case 5:
        return this.selectedPace !== ""
      default:
        return false
    }
  }

  validateStep() {
    const valid = this.isCurrentStepValid()
    if (!this.hasContinueBtnTarget) return

    const btn = this.continueBtnTarget

    if (valid) {
      btn.disabled = false
      btn.style.background = "linear-gradient(135deg, var(--color-accent, #2C261E), var(--color-accent, #2C261E)dd)"
      btn.style.color = "var(--color-accent-text, #FEFDFB)"
      btn.style.boxShadow = "0 2px 12px rgba(28,24,18,0.15)"
      btn.style.cursor = "pointer"
    } else {
      btn.disabled = true
      btn.style.background = "var(--color-tint-strong, rgba(28,24,18,0.08))"
      btn.style.color = "var(--color-faint-text, #D4CFC5)"
      btn.style.boxShadow = "none"
      btn.style.cursor = "default"
    }

    if (this.hasBtnTextTarget) {
      const lastStep = this.totalSteps - 1
      this.btnTextTarget.textContent = this.stepValue === lastStep
        ? this.t("generate_text", "Generate route")
        : this.t("continue_text", "Continue")
    }
  }

  updateUI() {
    const step = this.stepValue
    const stepNames = this.i18nValue.step_names || []

    if (this.hasStepLabelTarget) {
      const template = this.t("step_label", "Step :n")
      this.stepLabelTarget.textContent = template.replace(":n", step + 1)
    }
    if (this.hasStepNameTarget) {
      this.stepNameTarget.textContent = stepNames[step] || ""
    }

    // Route-node progress
    this._updateNodes(step)

    if (this.hasNavLeftTarget) {
      if (step === 0) {
        this.navLeftTarget.innerHTML = `
          <a href="/profile" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--color-txt, #1C1812);">
            <span style="font-family:'DM Sans',sans-serif; font-weight:700; font-size:0.9rem; letter-spacing:-0.5px; color:var(--color-txt, #1C1812);">Learning Routes</span>
          </a>`
      } else {
        const backText = this.t("back_text", "Back")
        this.navLeftTarget.innerHTML = `
          <button type="button" data-action="click->route-wizard#back"
                  style="background:none; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; font-weight:400; font-size:0.78rem; color:var(--color-muted, #9E9587); padding:0;">
            \u2190 ${backText}
          </button>`
      }
    }

    if (this.hasChipsTarget) {
      this.updateChips()
    }
  }

  _updateNodes(currentStep) {
    for (let i = 0; i < this.totalSteps; i++) {
      const nodeTarget = `node${i}`
      const hasNode = `has${nodeTarget.charAt(0).toUpperCase() + nodeTarget.slice(1)}Target`
      if (!this[hasNode]) continue
      const node = this[`${nodeTarget}Target`]

      if (i < currentStep) {
        // Completed
        node.style.background = "#5BA880"
        node.style.borderColor = "#5BA880"
        node.style.color = "#fff"
        node.style.animation = "none"
        node.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      } else if (i === currentStep) {
        // Current
        node.style.background = "var(--color-accent, #2C261E)"
        node.style.borderColor = "var(--color-accent, #2C261E)"
        node.style.color = "var(--color-accent-text, #fff)"
        node.style.animation = "nodePulse 2s ease-in-out infinite"
        node.textContent = i + 1
      } else {
        // Upcoming
        node.style.background = "transparent"
        node.style.borderColor = "var(--color-border-subtle, rgba(28,24,18,0.1))"
        node.style.color = "var(--color-faint, rgba(28,24,18,0.25))"
        node.style.animation = "none"
        node.textContent = i + 1
      }
    }

    // Lines
    for (let i = 0; i < this.totalSteps - 1; i++) {
      const lineTarget = `line${i}`
      const hasLine = `has${lineTarget.charAt(0).toUpperCase() + lineTarget.slice(1)}Target`
      if (!this[hasLine]) continue
      const line = this[`${lineTarget}Target`]

      if (i < currentStep) {
        line.style.width = "100%"
      } else {
        line.style.width = "0%"
      }
    }
  }

  updateChips() {
    if (!this.hasChipsTarget) return
    const chips = this.chipsTarget
    chips.innerHTML = ""

    if (this.stepValue === 0) return

    const topicLabels = this.i18nValue.topics || {}
    const levelLabels = this.i18nValue.levels || {}

    let count = 0
    this.selectedTopics.forEach(t => {
      if (count < 2) {
        this.addChip(chips, topicLabels[t] || t)
        count++
      }
    })
    if (this.selectedTopics.size > 2) {
      this.addChip(chips, `+${this.selectedTopics.size - 2}`)
    }

    if (this.hasCustomInputTarget) {
      const custom = this.customInputTarget.value.trim()
      if (custom) {
        this.addChip(chips, `${custom.substring(0, 12)}${custom.length > 12 ? "\u2026" : ""}`)
      }
    }

    if (this.stepValue >= 2 && this.selectedLevel) {
      this.addChip(chips, levelLabels[this.selectedLevel] || this.selectedLevel)
    }

    if (this.stepValue >= 5 && this.dominantStyleData) {
      this.addChip(chips, `${this.dominantStyleData.emoji} ${this.dominantStyleData.name}`)
    }
  }

  addChip(container, text) {
    const chip = document.createElement("span")
    chip.textContent = text
    chip.style.cssText = "font-family:'DM Sans',sans-serif; font-size:0.58rem; font-weight:500; color:var(--color-muted, #9E9587); padding:2px 7px; border-radius:5px; background:rgba(28,24,18,0.03);"
    container.appendChild(chip)
  }

  animateStepTransition(fromIdx, toIdx, direction) {
    this.isAnimating = true
    const fromEl = this.stepTargets.find(el => parseInt(el.dataset.step) === fromIdx)
    const toEl = this.stepTargets.find(el => parseInt(el.dataset.step) === toIdx)

    if (!fromEl || !toEl) {
      this.isAnimating = false
      return
    }

    if (this._animSafetyTimer) clearTimeout(this._animSafetyTimer)
    this._animSafetyTimer = setTimeout(() => { this.isAnimating = false }, 1000)

    try {
      fromEl.style.transition = "opacity 0.2s ease, transform 0.2s ease"
      fromEl.style.opacity = "0"
      fromEl.style.transform = `translateX(${-20 * direction}px)`

      setTimeout(() => {
        try {
          fromEl.style.display = "none"
          fromEl.style.transition = ""
          fromEl.style.opacity = ""
          fromEl.style.transform = ""

          toEl.style.display = "block"
          toEl.style.opacity = "0"
          toEl.style.transform = `translateX(${20 * direction}px)`

          requestAnimationFrame(() => {
            toEl.style.transition = "opacity 0.3s cubic-bezier(0.16,1,0.3,1), transform 0.3s cubic-bezier(0.16,1,0.3,1)"
            toEl.style.opacity = "1"
            toEl.style.transform = "translateX(0)"

            setTimeout(() => {
              toEl.style.transition = ""
              this.isAnimating = false
              if (this._animSafetyTimer) clearTimeout(this._animSafetyTimer)
            }, 300)
          })
        } catch (e) {
          this.isAnimating = false
        }
      }, 200)
    } catch (e) {
      this.isAnimating = false
    }
  }
}
