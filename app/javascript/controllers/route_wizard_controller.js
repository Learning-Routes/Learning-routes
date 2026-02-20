import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "step", "form", "stepBar", "stepLabel", "stepName", "percentLabel",
    "continueBtn", "btnText", "chips", "navLeft", "bottomHint", "footer",
    "topicInputs", "goalInputs", "levelInput", "paceInput",
    "customInput", "customInputWrap", "topicGrid", "errorBanner",
    "bar0", "bar1", "bar2", "bar3", "bar4",
    "styleAnswer1", "styleAnswer2", "styleAnswer3",
    "styleAnswer4", "styleAnswer5", "styleAnswer6",
    "styleProgress", "styleResultCard", "styleResultIcon",
    "styleResultName", "styleResultDesc", "styleDoneMsg"
  ]

  static values = {
    step: { type: Number, default: 0 },
    generating: { type: Boolean, default: false },
    i18n: { type: Object, default: {} }
  }

  connect() {
    if (this.generatingValue) return

    this.selectedTopics = new Set()
    this.selectedGoals = new Set()
    this.selectedLevel = ""
    this.selectedPace = ""
    this.styleAnswers = {}
    this.isAnimating = false
    this._allowSubmit = false

    this.updateUI()
    this.validateStep()
  }

  // Helper to get i18n text with fallback
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

  // Prevent accidental form submissions (Enter key in text input)
  handleSubmit(event) {
    if (!this._allowSubmit) {
      event.preventDefault()
      // If user pressed Enter on step 0 and the step is valid, advance instead
      if (this.isCurrentStepValid()) {
        this.next()
      }
      return
    }
    this._allowSubmit = false
  }

  // Prevent Enter key from submitting when in custom topic input
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

    if (this.stepValue === 4) {
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

  toggleTopic(event) {
    const card = event.currentTarget
    const topic = card.dataset.topic
    const color = card.dataset.color
    const check = card.querySelector(".wizard-check")

    if (this.selectedTopics.has(topic)) {
      this.selectedTopics.delete(topic)
      card.style.background = "#FDFCFA"
      card.style.borderColor = "rgba(28,24,18,0.06)"
      card.style.transform = "scale(1)"
      if (check) check.style.display = "none"
    } else {
      this.selectedTopics.add(topic)
      card.style.background = color + "08"
      card.style.borderColor = color + "40"
      card.style.transform = "scale(1.02)"
      if (check) check.style.display = "flex"
    }

    this.syncTopicInputs()
    this.validateStep()
  }

  selectLevel(event) {
    const card = event.currentTarget
    const level = card.dataset.level
    const color = card.dataset.color

    const stepEl = this.stepTargets.find(el => parseInt(el.dataset.step) === 1)
    if (!stepEl) return

    stepEl.querySelectorAll("[data-level]").forEach(el => {
        el.style.background = "#FDFCFA"
        el.style.borderColor = "rgba(28,24,18,0.06)"
        const icon = el.querySelector("div:first-child")
        if (icon) icon.style.background = "rgba(28,24,18,0.02)"
        const dot = el.querySelector(".wizard-radio-dot")
        if (dot) {
          dot.style.transform = "scale(0)"
          dot.style.background = "transparent"
        }
        const ring = dot?.parentElement
        if (ring) ring.style.borderColor = "rgba(28,24,18,0.1)"
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

  toggleGoal(event) {
    const card = event.currentTarget
    const goal = card.dataset.goal
    const check = card.querySelector(".wizard-goal-check")
    const label = card.querySelector("span:nth-child(2)")

    if (this.selectedGoals.has(goal)) {
      this.selectedGoals.delete(goal)
      card.style.background = "#FDFCFA"
      card.style.borderColor = "rgba(28,24,18,0.06)"
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

  // ===== LEARNING STYLE TEST =====

  selectStyleAnswer(event) {
    const card = event.currentTarget
    const question = card.dataset.question
    const option = card.dataset.option

    // Deselect all options in this question
    const questionContainer = card.closest("[data-style-question]")
    if (questionContainer) {
      questionContainer.querySelectorAll("[data-option]").forEach(el => {
        el.style.background = "#FEFDFB"
        el.style.borderColor = "rgba(28,24,18,0.06)"
        const text = el.querySelector(".style-option-text")
        if (text) text.style.fontWeight = "400"
        const check = el.querySelector(".style-check")
        if (check) check.style.display = "none"
      })
    }

    // Select this option
    card.style.background = "rgba(139,128,196,0.05)"
    card.style.borderColor = "rgba(139,128,196,0.3)"
    const text = card.querySelector(".style-option-text")
    if (text) text.style.fontWeight = "500"
    const check = card.querySelector(".style-check")
    if (check) check.style.display = "flex"

    // Store answer
    this.styleAnswers[question] = option

    // Update hidden field
    const targetName = `hasStyleAnswer${question}Target`
    if (this[targetName]) {
      this[`styleAnswer${question}Target`].value = option
    }

    // Update progress counter
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

    // Show result preview if all answered
    if (Object.keys(this.styleAnswers).length === 6) {
      this.showStyleResult()
    }

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

  // ===== PACE =====

  selectPace(event) {
    const card = event.currentTarget
    const pace = card.dataset.pace
    const color = card.dataset.color

    const stepEl = this.stepTargets.find(el => parseInt(el.dataset.step) === 4)
    if (!stepEl) return

    stepEl.querySelectorAll("[data-pace]").forEach(el => {
        el.style.background = "#FDFCFA"
        el.style.borderColor = "rgba(28,24,18,0.06)"
        const icon = el.querySelector("div:first-child")
        if (icon) icon.style.background = "rgba(28,24,18,0.02)"
        const badge = el.querySelector(".wizard-time-badge")
        if (badge) {
          badge.style.color = "#9E9587"
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

  updateCustomTopic() {
    const val = this.hasCustomInputTarget ? this.customInputTarget.value.trim() : ""
    if (this.hasCustomInputWrapTarget) {
      this.customInputWrapTarget.style.borderColor = val.length > 0
        ? "#5BA88035"
        : "rgba(28,24,18,0.06)"
    }
    this.validateStep()
  }

  // Show validation errors as a temporary banner
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
        return Object.keys(this.styleAnswers).length === 6
      case 4:
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
      btn.style.background = "linear-gradient(135deg, #2C261E, #2C261Edd)"
      btn.style.color = "#FEFDFB"
      btn.style.boxShadow = "0 2px 12px rgba(28,24,18,0.15)"
      btn.style.cursor = "pointer"
    } else {
      btn.disabled = true
      btn.style.background = "rgba(28,24,18,0.06)"
      btn.style.color = "#D4CFC5"
      btn.style.boxShadow = "none"
      btn.style.cursor = "default"
    }

    if (this.hasBtnTextTarget) {
      this.btnTextTarget.textContent = this.stepValue === 4
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
    if (this.hasPercentLabelTarget) {
      this.percentLabelTarget.textContent = `${(step + 1) * 20}%`
    }

    // Progress bars — 5 segments (with defensive guards)
    const barTargets = ["bar0", "bar1", "bar2", "bar3", "bar4"]
    barTargets.forEach((name, i) => {
      const hasMethod = `has${name.charAt(0).toUpperCase() + name.slice(1)}Target`
      if (!this[hasMethod]) return
      const bar = this[`${name}Target`]
      if (i < step) {
        bar.style.width = "100%"
        bar.style.opacity = "0.7"
        bar.style.background = "linear-gradient(90deg, #8B80C4, #6E9BC8)"
      } else if (i === step) {
        bar.style.width = "50%"
        bar.style.opacity = "0.7"
        bar.style.background = "#5BA880"
      } else {
        bar.style.width = "0%"
        bar.style.opacity = "0"
      }
    })

    if (this.hasNavLeftTarget) {
      if (step === 0) {
        this.navLeftTarget.innerHTML = `
          <a href="/profile" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:#1C1812;">
            <span style="font-family:'DM Sans',sans-serif; font-weight:700; font-size:0.9rem; letter-spacing:-0.5px; color:#1C1812;">Learning Routes</span>
          </a>`
      } else {
        const backText = this.t("back_text", "Back")
        this.navLeftTarget.innerHTML = `
          <button type="button" data-action="click->route-wizard#back"
                  style="background:none; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; font-weight:400; font-size:0.78rem; color:#9E9587; padding:0;">
            \u2190 ${backText}
          </button>`
      }
    }

    if (this.hasChipsTarget) {
      this.updateChips()
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
        this.addChip(chips, `\u270F\uFE0F ${custom.substring(0, 15)}${custom.length > 15 ? "\u2026" : ""}`)
      }
    }

    if (this.stepValue >= 2 && this.selectedLevel) {
      this.addChip(chips, levelLabels[this.selectedLevel] || this.selectedLevel)
    }

    // Show learning style chip on steps 4+
    if (this.stepValue >= 4 && this.dominantStyleData) {
      this.addChip(chips, `${this.dominantStyleData.emoji} ${this.dominantStyleData.name}`)
    }
  }

  addChip(container, text) {
    const chip = document.createElement("span")
    chip.textContent = text
    chip.style.cssText = "font-family:'DM Sans',sans-serif; font-size:0.6rem; font-weight:500; color:#9E9587; padding:2px 8px; border-radius:6px; background:rgba(28,24,18,0.03);"
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

    // Safety timeout — never stay locked more than 1 second
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
            toEl.style.transition = "opacity 0.35s cubic-bezier(0.16,1,0.3,1), transform 0.35s cubic-bezier(0.16,1,0.3,1)"
            toEl.style.opacity = "1"
            toEl.style.transform = "translateX(0)"

            setTimeout(() => {
              toEl.style.transition = ""
              this.isAnimating = false
              if (this._animSafetyTimer) clearTimeout(this._animSafetyTimer)
            }, 350)
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
