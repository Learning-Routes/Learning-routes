import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "step", "form", "stepBar", "stepLabel", "stepName", "percentLabel",
    "continueBtn", "btnText", "chips", "navLeft", "bottomHint", "footer",
    "topicInputs", "goalInputs", "levelInput", "paceInput",
    "customInput", "customInputWrap", "topicGrid",
    "bar0", "bar1", "bar2", "bar3"
  ]

  static values = {
    step: { type: Number, default: 0 },
    generating: { type: Boolean, default: false }
  }

  connect() {
    if (this.generatingValue) return

    this.selectedTopics = new Set()
    this.selectedGoals = new Set()
    this.selectedLevel = ""
    this.selectedPace = ""
    this.stepLabels = ["Tema", "Nivel", "Objetivo", "Ritmo"]
    this.isAnimating = false

    this.updateUI()
    this.validateStep()
  }

  next() {
    if (this.isAnimating) return
    if (!this.isCurrentStepValid()) return

    if (this.stepValue === 3) {
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

    // Deselect all
    this.stepTargets[1].querySelectorAll("[data-level]").forEach(el => {
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

    // Select this one
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
    this.levelInputTarget.value = level
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

  selectPace(event) {
    const card = event.currentTarget
    const pace = card.dataset.pace
    const color = card.dataset.color

    // Deselect all
    this.stepTargets[3].querySelectorAll("[data-pace]").forEach(el => {
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

    // Select this one
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
    this.paceInputTarget.value = pace
    this.validateStep()
  }

  updateCustomTopic() {
    const val = this.customInputTarget.value.trim()
    const wrap = this.customInputWrapTarget
    wrap.style.borderColor = val.length > 0
      ? "#5BA88035"
      : "rgba(28,24,18,0.06)"
    this.validateStep()
  }

  // --- Private helpers ---

  syncTopicInputs() {
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
      case 0:
        return this.selectedTopics.size > 0 || this.customInputTarget.value.trim().length > 0
      case 1:
        return this.selectedLevel !== ""
      case 2:
        return this.selectedGoals.size > 0
      case 3:
        return this.selectedPace !== ""
      default:
        return false
    }
  }

  validateStep() {
    const valid = this.isCurrentStepValid()
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
      this.btnTextTarget.textContent = this.stepValue === 3 ? "Generar ruta" : "Continuar"
    }
  }

  updateUI() {
    const step = this.stepValue
    const labels = this.stepLabels

    // Step label
    if (this.hasStepLabelTarget) {
      this.stepLabelTarget.textContent = `Paso ${step + 1}`
    }
    if (this.hasStepNameTarget) {
      this.stepNameTarget.textContent = `— ${labels[step]}`
    }
    if (this.hasPercentLabelTarget) {
      this.percentLabelTarget.textContent = `${(step + 1) * 25}%`
    }

    // Progress bars
    const bars = [this.bar0Target, this.bar1Target, this.bar2Target, this.bar3Target]
    bars.forEach((bar, i) => {
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

    // Nav left: logo on step 0, back button on steps 1+
    if (this.hasNavLeftTarget) {
      if (step === 0) {
        this.navLeftTarget.innerHTML = `
          <a href="/profile" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:#1C1812;">
            <span style="font-family:'DM Sans',sans-serif; font-weight:700; font-size:0.9rem; letter-spacing:-0.5px; color:#1C1812;">Learning Routes</span>
          </a>`
      } else {
        this.navLeftTarget.innerHTML = `
          <button type="button" data-action="click->route-wizard#back"
                  style="background:none; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; font-weight:400; font-size:0.78rem; color:#9E9587; padding:0;">
            ← Atrás
          </button>`
      }
    }

    // Chips
    if (this.hasChipsTarget) {
      this.updateChips()
    }
  }

  updateChips() {
    const chips = this.chipsTarget
    chips.innerHTML = ""

    if (this.stepValue === 0) return

    const topicLabels = {
      programming: "💻 Programación",
      languages: "🌍 Idiomas",
      math: "📐 Matemáticas",
      science: "🔬 Ciencias",
      business: "📊 Negocios",
      arts: "🎨 Arte y Diseño"
    }

    const levelLabels = {
      beginner: "🌱 Principiante",
      basic: "🌿 Básico",
      intermediate: "🌳 Intermedio",
      advanced: "🏔️ Avanzado"
    }

    // Show selected topics (max 2)
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

    // Custom topic
    const custom = this.customInputTarget.value.trim()
    if (custom) {
      this.addChip(chips, `✏️ ${custom.substring(0, 15)}${custom.length > 15 ? "…" : ""}`)
    }

    // Level (on steps 2+)
    if (this.stepValue >= 2 && this.selectedLevel) {
      this.addChip(chips, levelLabels[this.selectedLevel] || this.selectedLevel)
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

    // Animate out
    fromEl.style.transition = "opacity 0.2s ease, transform 0.2s ease"
    fromEl.style.opacity = "0"
    fromEl.style.transform = `translateX(${-20 * direction}px)`

    setTimeout(() => {
      fromEl.style.display = "none"
      fromEl.style.transition = ""
      fromEl.style.opacity = ""
      fromEl.style.transform = ""

      // Show target
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
        }, 350)
      })
    }, 200)
  }
}
