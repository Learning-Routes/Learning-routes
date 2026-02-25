import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input", "submit", "oauth", "link"]
  static values = {
    requiredMsg: { type: String, default: "This field is required" },
    emailMsg: { type: String, default: "Please enter a valid email" },
    minLengthMsg: { type: String, default: "Must be at least %{min} characters" }
  }

  connect() {
    // Disable native browser validation tooltips
    const form = this.element.querySelector("form")
    if (form) {
      form.setAttribute("novalidate", "")
      form.addEventListener("submit", this._handleSubmit.bind(this))
    }
  }

  _handleSubmit(e) {
    this._clearErrors()
    let valid = true

    this.inputTargets.forEach(input => {
      if (!this._validateInput(input)) valid = false
    })

    if (!valid) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  _validateInput(input) {
    // Required check
    if (input.required && !input.value.trim()) {
      this._showError(input, this.requiredMsgValue)
      return false
    }

    // Email format
    if (input.type === "email" && input.value.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(input.value.trim())) {
        this._showError(input, this.emailMsgValue)
        return false
      }
    }

    // Min length (password)
    if (input.minLength > 0 && input.value.length < input.minLength) {
      this._showError(input, this.minLengthMsgValue.replace("%{min}", input.minLength))
      return false
    }

    return true
  }

  _showError(input, message) {
    // Style the input border red
    input.style.borderColor = "#C0614D"
    input.style.boxShadow = "0 0 0 3px rgba(192,97,77,0.08)"

    // Insert error message below input
    const errorEl = document.createElement("p")
    errorEl.className = "auth-field-error"
    errorEl.textContent = message
    Object.assign(errorEl.style, {
      fontFamily: "'DM Sans', sans-serif",
      fontSize: "0.72rem",
      fontWeight: "500",
      color: "#C0614D",
      margin: "0.35rem 0 0 0.2rem",
      lineHeight: "1"
    })
    input.parentNode.appendChild(errorEl)

    // Focus first invalid input
    if (!this._focusedError) {
      input.focus()
      this._focusedError = true
    }
  }

  _clearErrors() {
    this._focusedError = false
    this.element.querySelectorAll(".auth-field-error").forEach(el => el.remove())
    this.inputTargets.forEach(input => {
      input.style.borderColor = "rgba(28,24,18,0.1)"
      input.style.boxShadow = "none"
    })
  }

  // --- Input focus/blur ---
  inputFocus(event) {
    const el = event.currentTarget
    // Clear error state on focus
    const errorEl = el.parentNode.querySelector(".auth-field-error")
    if (errorEl) errorEl.remove()
    el.style.borderColor = "rgba(28,24,18,0.22)"
    el.style.boxShadow = "0 0 0 3px rgba(28,24,18,0.04)"
  }

  inputBlur(event) {
    const el = event.currentTarget
    if (!el.parentNode.querySelector(".auth-field-error")) {
      el.style.borderColor = "rgba(28,24,18,0.1)"
      el.style.boxShadow = "none"
    }
  }

  // --- Submit button hover ---
  submitOver(event) {
    const el = event.currentTarget
    el.style.transform = "translateY(-1px)"
    el.style.boxShadow = "0 4px 14px rgba(28,24,18,0.18), 0 2px 4px rgba(28,24,18,0.08)"
  }

  submitOut(event) {
    const el = event.currentTarget
    el.style.transform = "translateY(0)"
    el.style.boxShadow = "0 1px 3px rgba(28,24,18,0.12), 0 1px 2px rgba(28,24,18,0.06)"
  }

  // --- OAuth button hover ---
  oauthOver(event) {
    const el = event.currentTarget
    el.style.borderColor = "rgba(28,24,18,0.22)"
    el.style.boxShadow = "0 2px 8px rgba(28,24,18,0.06)"
  }

  oauthOut(event) {
    const el = event.currentTarget
    el.style.borderColor = "rgba(28,24,18,0.1)"
    el.style.boxShadow = "none"
  }

  // --- Text link hover ---
  linkOver(event) { event.currentTarget.style.color = "#1C1812" }
  linkOut(event) { event.currentTarget.style.color = "#A09889" }

  // --- Inline link underline ---
  inlineLinkOver(event) { event.currentTarget.style.textDecoration = "underline" }
  inlineLinkOut(event) { event.currentTarget.style.textDecoration = "none" }
}
