import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["navItem", "questionPanel", "currentIndicator"]
  static values = {
    currentIndex: { type: Number, default: 0 },
    totalQuestions: Number,
    savedText: { type: String, default: "Saved!" },
    saveText: { type: String, default: "Save Answer" },
    answeredTemplate: { type: String, default: "__count__ of __total__ answered" }
  }

  connect() {
    this.answeredSet = new Set()
    this._buttonResetTimeout = null
    this.updateDisplay()
  }

  disconnect() {
    clearTimeout(this._buttonResetTimeout)
  }

  goToQuestion(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10)
    this.showQuestion(index)
  }

  next() {
    if (this.currentIndexValue < this.totalQuestionsValue - 1) {
      this.showQuestion(this.currentIndexValue + 1)
    }
  }

  previous() {
    if (this.currentIndexValue > 0) {
      this.showQuestion(this.currentIndexValue - 1)
    }
  }

  showQuestion(index) {
    this.currentIndexValue = index

    this.questionPanelTargets.forEach((panel, i) => {
      panel.classList.toggle("hidden", i !== index)
    })

    this.navItemTargets.forEach((item, i) => {
      item.classList.toggle("ring-2", i === index)
      item.classList.toggle("ring-indigo-500", i === index)
    })
  }

  markAnswered(event) {
    const index = parseInt(event.currentTarget.dataset.index || event.target.closest("[data-index]")?.dataset.index, 10)
    if (!isNaN(index)) {
      this.answeredSet.add(index)
      this.updateNavItem(index)
      this.updateDisplay()
    }
  }

  async saveAnswer(event) {
    const btn = event.currentTarget
    const index = parseInt(btn.dataset.index, 10)
    const panel = this.questionPanelTargets[index]
    if (!panel) return

    const questionId = btn.dataset.questionId
    const url = btn.dataset.saveUrl

    // Extract answer from the panel's form inputs
    let answer = ""
    const radio = panel.querySelector("input[type='radio']:checked")
    const textarea = panel.querySelector("textarea")
    const hiddenInput = panel.querySelector("input[data-code-editor-target='hiddenInput']")

    if (radio) answer = radio.value
    else if (hiddenInput && hiddenInput.value) answer = hiddenInput.value
    else if (textarea) answer = textarea.value

    if (!answer.trim()) return

    const token = document.querySelector('meta[name="csrf-token"]')?.content
    const formData = new FormData()
    formData.append("question_id", questionId)
    formData.append("answer", answer)

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "X-CSRF-Token": token, "Accept": "text/vnd.turbo-stream.html, text/html" },
        body: formData,
        credentials: "same-origin"
      })

      if (response.ok) {
        this.answeredSet.add(index)
        this.updateNavItem(index)
        this.updateDisplay()
        btn.textContent = this.savedTextValue
        clearTimeout(this._buttonResetTimeout)
        this._buttonResetTimeout = setTimeout(() => { btn.textContent = this.saveTextValue }, 1500)

        const html = await response.text()
        if (html.includes("turbo-stream")) Turbo.renderStreamMessage(html)
      }
    } catch (error) {
      console.error("Save answer failed:", error)
    }
  }

  updateNavItem(index) {
    const item = this.navItemTargets[index]
    if (item) {
      item.classList.remove("bg-gray-800", "text-gray-400")
      item.classList.add("bg-green-900/50", "text-green-400")
    }
  }

  updateDisplay() {
    if (this.hasCurrentIndicatorTarget) {
      this.currentIndicatorTarget.textContent = this.answeredTemplateValue
        .replace("__count__", this.answeredSet.size)
        .replace("__total__", this.totalQuestionsValue)
    }
  }
}
