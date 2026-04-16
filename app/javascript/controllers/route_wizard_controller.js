import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "step", "form", "stepBar", "stepLabel", "stepName",
    "continueBtn", "btnText", "chips", "navLeft", "bottomHint", "footer",
    "topicInputs", "goalInputs", "levelInput", "paceInput",
    "hoursInput", "sessionInput", "hoursGrid", "sessionGrid",
    "customInput", "customInputWrap", "topicGrid", "errorBanner",
    "topicDetailWrap", "topicDetailLabel", "topicDetailInput",
    "progressBar", "stepCounter", "stepNum", "timeSummary",
    "styleProgressFill", "styleQuestionNum",
    "styleAnswer1", "styleAnswer2", "styleAnswer3",
    "styleAnswer4", "styleAnswer5", "styleAnswer6",
    "styleAnswer7", "styleAnswer8", "styleAnswer9",
    "styleAnswer10", "styleAnswer11", "styleAnswer12",
    "styleProgress", "styleResultCard", "styleResultIcon",
    "styleResultName", "styleResultDesc", "styleDoneMsg",
    "savedStyleBanner", "savedStyleText", "styleHeader", "styleQuestionsWrap",
    "localeInput", "localeGrid"
  ]

  static values = {
    step: { type: Number, default: 0 },
    generating: { type: Boolean, default: false },
    i18n: { type: Object, default: {} },
    savedPrefs: { type: Object, default: {} },
    homeUrl: { type: String, default: "/profile" }
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

    // Combine topic detail + custom topic into one field for submission
    this._combineCustomTopicValues()
  }

  _combineCustomTopicValues() {
    const detailVal = this.hasTopicDetailInputTarget ? this.topicDetailInputTarget.value.trim() : ""
    const customVal = this.hasCustomInputTarget ? this.customInputTarget.value.trim() : ""

    if (detailVal && customVal) {
      this.topicDetailInputTarget.value = `${detailVal} — ${customVal}`
    } else if (customVal && !detailVal) {
      // If only custom text, inject it
      if (this.hasTopicDetailInputTarget) {
        this.topicDetailInputTarget.value = customVal
      }
    }
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

    this.animateStepTransition(this.stepValue, this.stepValue + 1, "forward")
  }

  back() {
    if (this.isAnimating || this.stepValue === 0) return

    this.animateStepTransition(this.stepValue, this.stepValue - 1, "backward")
  }

  // ===== STEP 0: TOPICS =====

  toggleTopic(event) {
    const card = event.currentTarget
    const topic = card.dataset.topic

    if (this.selectedTopics.has(topic)) {
      this.selectedTopics.delete(topic)
      card.classList.remove("selected")
      card.setAttribute("aria-checked", "false")
    } else {
      this.selectedTopics.add(topic)
      card.classList.add("selected")
      card.setAttribute("aria-checked", "true")
    }

    this.syncTopicInputs()
    this._updateTopicDetailPrompt()
    this.validateStep()
  }

  updateTopicDetail() {
    // Validate whenever the topic detail input changes
    this.validateStep()
  }

  _updateTopicDetailPrompt() {
    if (!this.hasTopicDetailWrapTarget) return

    const topics = Array.from(this.selectedTopics)

    if (topics.length === 0) {
      this.topicDetailWrapTarget.style.display = "none"
      if (this.hasTopicDetailInputTarget) this.topicDetailInputTarget.value = ""
      return
    }

    this.topicDetailWrapTarget.style.display = ""

    // Get contextual placeholder based on selected topic(s)
    const prompts = this.i18nValue.topic_detail_prompts || {}
    let placeholder

    if (topics.length === 1) {
      placeholder = prompts[topics[0]] || prompts.multiple || ""
    } else {
      placeholder = prompts.multiple || ""
    }

    if (this.hasTopicDetailInputTarget) {
      this.topicDetailInputTarget.placeholder = placeholder
    }
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

  // ===== ROUTE LOCALE (in step 0) =====

  selectLocale(event) {
    const card = event.currentTarget
    const locale = card.dataset.locale

    if (this.hasLocaleGridTarget) {
      this.localeGridTarget.querySelectorAll("[data-locale]").forEach(el => {
        el.classList.remove("selected")
        el.setAttribute("aria-checked", "false")
      })
    }

    card.classList.add("selected")
    card.setAttribute("aria-checked", "true")

    if (this.hasLocaleInputTarget) {
      this.localeInputTarget.value = locale
    }
  }

  // ===== STEP 1: LEVEL =====

  selectLevel(event) {
    const card = event.currentTarget
    const level = card.dataset.level

    const stepEl = this.stepTargets.find(el => parseInt(el.dataset.step) === 1)
    if (!stepEl) return

    stepEl.querySelectorAll("[data-level]").forEach(el => {
      el.classList.remove("selected")
      el.setAttribute("aria-checked", "false")
    })

    card.classList.add("selected")
    card.setAttribute("aria-checked", "true")

    this.selectedLevel = level
    if (this.hasLevelInputTarget) this.levelInputTarget.value = level
    this.validateStep()
  }

  // ===== STEP 2: GOALS =====

  toggleGoal(event) {
    const card = event.currentTarget
    const goal = card.dataset.goal

    if (this.selectedGoals.has(goal)) {
      this.selectedGoals.delete(goal)
      card.classList.remove("selected")
      card.setAttribute("aria-checked", "false")
    } else {
      this.selectedGoals.add(goal)
      card.classList.add("selected")
      card.setAttribute("aria-checked", "true")
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
        el.classList.remove("selected")
      })
    }

    card.classList.add("selected")

    this.selectedHours = hours
    if (this.hasHoursInputTarget) this.hoursInputTarget.value = hours
    this._updateTimeSummary()
    this.validateStep()
  }

  selectSession(event) {
    const card = event.currentTarget
    const mins = parseInt(card.dataset.minutes, 10)

    if (this.hasSessionGridTarget) {
      this.sessionGridTarget.querySelectorAll("[data-minutes]").forEach(el => {
        el.classList.remove("selected")
      })
    }

    card.classList.add("selected")

    this.selectedSession = mins
    if (this.hasSessionInputTarget) this.sessionInputTarget.value = mins
    this._updateTimeSummary()
    this.validateStep()
  }

  _updateTimeSummary() {
    if (!this.hasTimeSummaryTarget) return
    if (this.selectedHours && this.selectedSession) {
      this.timeSummaryTarget.textContent = this.selectedHours + "h/week in " + this.selectedSession + "-minute sessions"
    } else {
      this.timeSummaryTarget.textContent = ""
    }
  }

  // ===== STEP 4: LEARNING STYLE =====

  activateOnEnter(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      event.currentTarget.click()
    }
  }

  selectStyleAnswer(event) {
    const card = event.currentTarget
    const question = card.dataset.question
    const option = card.dataset.option

    const questionContainer = card.closest("[data-style-question]")
    if (questionContainer) {
      questionContainer.querySelectorAll("[data-option]").forEach(el => {
        el.classList.remove("selected")
        el.setAttribute("aria-checked", "false")
      })
    }

    card.classList.add("selected")
    card.setAttribute("aria-checked", "true")

    this.styleAnswers[question] = option

    const targetName = `hasStyleAnswer${question}Target`
    if (this[targetName]) {
      this[`styleAnswer${question}Target`].value = option
    }

    this.updateStyleProgress()

    // Update mini progress
    const answered = Object.keys(this.styleAnswers).length
    if (this.hasStyleProgressFillTarget) {
      this.styleProgressFillTarget.style.width = ((answered / 12) * 100) + "%"
    }
    if (this.hasStyleQuestionNumTarget) {
      this.styleQuestionNumTarget.textContent = Math.min(answered + 1, 12)
    }

    // Auto-advance: hide current question, show next unanswered one after 400ms
    const nextQ = parseInt(question) + 1
    if (nextQ <= 12 && !this.styleAnswers[String(nextQ)]) {
      const timer = setTimeout(() => {
        if (questionContainer) {
          questionContainer.style.display = "none"
        }
        const nextEl = this.element.querySelector(`[data-style-question="${nextQ}"]`)
        if (nextEl) {
          nextEl.style.display = ""
          nextEl.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }, 400)
      this._timers.push(timer)
    }

    if (Object.keys(this.styleAnswers).length === 12) {
      this.showStyleResult()
    }

    this.validateStep()
  }

  retakeStyle() {
    this.styleSaved = false
    this.styleAnswers = {}

    // Clear hidden fields
    for (let i = 1; i <= 12; i++) {
      const target = `hasStyleAnswer${i}Target`
      if (this[target]) this[`styleAnswer${i}Target`].value = ""
    }

    // Show questions, hide banner
    if (this.hasSavedStyleBannerTarget) this.savedStyleBannerTarget.style.display = "none"
    if (this.hasStyleHeaderTarget) this.styleHeaderTarget.style.display = "block"
    if (this.hasStyleQuestionsWrapTarget) this.styleQuestionsWrapTarget.style.display = "flex"

    // Reset question UI
    this.element.querySelectorAll("[data-style-question] [data-option]").forEach(el => {
      el.classList.remove("selected")
      el.setAttribute("aria-checked", "false")
    })

    // Show all questions again
    this.element.querySelectorAll("[data-style-question]").forEach(el => {
      el.style.display = ""
    })

    if (this.hasStyleResultCardTarget) {
      this.styleResultCardTarget.style.display = "none"
      this.styleResultCardTarget.style.opacity = "0"
    }
    if (this.hasStyleDoneMsgTarget) {
      this.styleDoneMsgTarget.style.opacity = "0"
    }

    // Reset mini progress
    if (this.hasStyleProgressFillTarget) {
      this.styleProgressFillTarget.style.width = "0%"
    }
    if (this.hasStyleQuestionNumTarget) {
      this.styleQuestionNumTarget.textContent = "1"
    }

    this.updateStyleProgress()
    this.validateStep()
  }

  updateStyleProgress() {
    const answered = Object.keys(this.styleAnswers).length
    if (this.hasStyleProgressTarget) {
      const template = this.t("progress_of_6", ":done of 12")
      this.styleProgressTarget.textContent = template.replace(":done", answered)
    }
    if (answered === 12 && this.hasStyleDoneMsgTarget) {
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

    const stepEl = this.stepTargets.find(el => parseInt(el.dataset.step) === 5)
    if (!stepEl) return

    stepEl.querySelectorAll("[data-pace]").forEach(el => {
      el.classList.remove("selected")
      el.setAttribute("aria-checked", "false")
    })

    card.classList.add("selected")
    card.setAttribute("aria-checked", "true")

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

      if (Object.keys(answers).length >= 12) {
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
        el.classList.add("selected")
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
        // If topics are selected, require topic detail for specificity
        if (hasTopics) {
          const hasDetail = this.hasTopicDetailInputTarget && this.topicDetailInputTarget.value.trim().length > 0
          return hasDetail
        }
        return hasCustom
      }
      case 1:
        return this.selectedLevel !== ""
      case 2:
        return this.selectedGoals.size > 0
      case 3:
        return this.selectedHours > 0 && this.selectedSession > 0
      case 4:
        return this.styleSaved || Object.keys(this.styleAnswers).length === 12
      case 5:
        return this.selectedPace !== ""
      default:
        return false
    }
  }

  validateStep() {
    const valid = this.isCurrentStepValid()
    if (this.hasContinueBtnTarget) {
      if (valid) {
        this.continueBtnTarget.classList.remove("disabled")
        this.continueBtnTarget.removeAttribute("disabled")
      } else {
        this.continueBtnTarget.classList.add("disabled")
        this.continueBtnTarget.setAttribute("disabled", "")
      }
    }
    // Update button text on last step
    if (this.hasBtnTextTarget) {
      if (this.stepValue === this.totalSteps - 1 && valid) {
        this.btnTextTarget.textContent = "Create my route \u2728"
      } else {
        this.btnTextTarget.textContent = this.t("continue_text", "Continue")
      }
    }
  }

  updateUI() {
    // Progress bar
    const pct = (this.stepValue / (this.totalSteps - 1)) * 100
    if (this.hasProgressBarTarget) this.progressBarTarget.style.width = pct + "%"
    if (this.hasStepNumTarget) this.stepNumTarget.textContent = this.stepValue + 1

    // Back button
    if (this.hasNavLeftTarget) {
      if (this.stepValue > 0) {
        this.navLeftTarget.innerHTML = '<button type="button" class="wizard-btn-back" data-action="click->route-wizard#back">Back</button>'
      } else {
        this.navLeftTarget.innerHTML = ""
      }
    }
  }

  animateStepTransition(fromIdx, toIdx, direction) {
    if (this.isAnimating) return
    this.isAnimating = true

    const fromStep = this.stepTargets[fromIdx]
    const toStep = this.stepTargets[toIdx]
    if (!fromStep || !toStep) { this.isAnimating = false; return }

    const exitClass = direction === "forward" ? "wizard-step-exit-left" : "wizard-step-exit-right"
    const enterClass = direction === "forward" ? "wizard-step-enter-right" : "wizard-step-enter-left"

    // Exit current step
    fromStep.classList.add(exitClass)

    const timer = setTimeout(() => {
      fromStep.setAttribute("aria-hidden", "true")
      fromStep.classList.remove(exitClass)

      // Enter new step
      toStep.setAttribute("aria-hidden", "false")
      toStep.style.display = ""
      toStep.classList.add(enterClass)

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          toStep.classList.remove(enterClass)
          this.stepValue = toIdx
          this.updateUI()
          this.validateStep()
          this.isAnimating = false
        })
      })
    }, 250)
    this._timers.push(timer)
  }
}
