import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["navItem", "questionPanel", "currentIndicator", "saveError", "saveButton", "submitButton"]
  static values = {
    currentIndex: { type: Number, default: 0 },
    totalQuestions: Number,
    savedText: { type: String, default: "Saved!" },
    saveText: { type: String, default: "Save Answer" },
    answeredTemplate: { type: String, default: "__count__ of __total__ answered" },
    // Three different things, three different messages: the attempt is closed,
    // the student does not own this exam, the network failed.
    errorClosed: { type: String, default: "" },
    errorForbidden: { type: String, default: "" },
    errorNetwork: { type: String, default: "" },
    errorGeneric: { type: String, default: "" },
    // Named questions, because "something failed" is not something a student can
    // act on when four answers are at stake.
    errorPartial: { type: String, default: "" }
  }

  connect() {
    this.answeredSet = new Set()
    this._buttonResetTimeout = null
    // `_gathered` lets the second pass through: `requestSubmit()` fires `submit`
    // again, and without it `submitExam` would re-enter itself forever.
    this._gathered = false
    this._submitting = false
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

  // SUBMIT GATHERS WHAT IS SELECTED.
  //
  // The only binding to the save path was the "Guardar respuesta" button, and
  // `change->markAnswered` only touches client state. A student who selected all
  // four options and pressed "Enviar evaluación" sent four checked radios and
  // ZERO requests to /answers — the exam scored 0% with four "sin responder".
  //
  // So submit now hands in what is selected, through the SAME `_save` path the
  // button uses (one submitter, not a copy), and scores only once every save has
  // landed. Deliberately NOT auto-saving on `change`: WP-27 made an answer final
  // once given, so saving on first click would make the first click final and
  // lock out a change of mind — and relaxing that rule to allow re-answering
  // reopens the click-every-option hole WP-27 closed. "Handed in for grading" is
  // the moment a student already understands to be final.
  async submitExam(event) {
    if (this._gathered) return

    event.preventDefault()
    if (this._submitting) return

    const form = event.currentTarget
    const pending = this.saveButtonTargets.filter((btn) => this.answerFor(btn) !== "")
    if (pending.length === 0) {
      // Nothing selected. Let it through and let the server score an empty exam
      // rather than trapping the student in a form that will not submit.
      this._gathered = true
      form.requestSubmit()
      return
    }

    this._submitting = true
    this.setSubmitDisabled(true)

    const failures = []
    for (const btn of pending) {
      const saved = await this._save(btn)
      if (!saved) failures.push(parseInt(btn.dataset.index, 10) + 1)
    }

    this._submitting = false

    if (failures.length > 0) {
      // Submitting after a partial save scores a full exam on half its answers.
      this.setSubmitDisabled(false)
      this._showSaveMessage(null, this.errorPartialValue.replace("__questions__", failures.join(", ")))
      return
    }

    // Stays disabled: the gather succeeded and the form is on its way.
    this._gathered = true
    form.requestSubmit()
  }

  async saveAnswer(event) {
    await this._save(event.currentTarget)
  }

  // Whatever this question's panel currently holds, or "" for unanswered.
  answerFor(btn) {
    const panel = this.questionPanelTargets[parseInt(btn.dataset.index, 10)]
    if (!panel) return ""

    const radio = panel.querySelector("input[type='radio']:checked")
    const hiddenInput = panel.querySelector("input[data-code-editor-target='hiddenInput']")
    const textarea = panel.querySelector("textarea")

    let answer = ""
    if (radio) answer = radio.value
    else if (hiddenInput && hiddenInput.value) answer = hiddenInput.value
    else if (textarea) answer = textarea.value

    return answer.trim()
  }

  setSubmitDisabled(disabled) {
    if (this.hasSubmitButtonTarget) this.submitButtonTarget.disabled = disabled
  }

  // Returns true when the answer is safely on the server.
  async _save(btn) {
    const index = parseInt(btn.dataset.index, 10)
    const questionId = btn.dataset.questionId
    const url = btn.dataset.saveUrl

    const answer = this.answerFor(btn)
    if (!answer) return true

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
        return true
      } else {
        // THE `else` THIS NEVER HAD.
        //
        // A 422 is a RESOLVED promise with ok:false. Without this branch the
        // `if` was simply skipped: nothing was added to answeredSet, the button
        // never said "Guardado", `catch` never ran, and nothing was logged. The
        // console stayed clean while every answer was thrown away — which is why
        // this took four packages to find.
        await this._showSaveError(btn, response)
        return false
      }
    } catch (error) {
      // Network failure is a third thing, and the student should be able to tell
      // it from a refusal.
      console.error("Save answer failed:", error)
      this._showSaveMessage(btn, this.errorNetworkValue)
      return false
    }
  }

  async _showSaveError(btn, response) {
    let message = this.errorGenericValue

    if (response.status === 403) {
      message = this.errorForbiddenValue
    } else if (response.status === 422) {
      // The server names the reason so the widget does not have to guess.
      const body = await response.json().catch(() => ({}))
      message = body.message || this.errorClosedValue
    }

    this._showSaveMessage(btn, message)
  }

  // `btn` is null for the submit-time summary, which belongs in the banner only.
  _showSaveMessage(btn, message) {
    if (!message) return

    if (btn) {
      btn.textContent = message
      btn.classList.add("question-nav__save--error")
      clearTimeout(this._buttonResetTimeout)
      this._buttonResetTimeout = setTimeout(() => {
        btn.textContent = this.saveTextValue
        btn.classList.remove("question-nav__save--error")
      }, 6000)
    }

    if (this.hasSaveErrorTarget) {
      this.saveErrorTarget.textContent = message
      this.saveErrorTarget.hidden = false
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
