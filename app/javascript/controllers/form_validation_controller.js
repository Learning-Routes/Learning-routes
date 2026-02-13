import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["field", "submit"]

  validate(event) {
    const field = event.target
    const value = field.value.trim()

    this.clearError(field)

    if (field.required && !value) {
      this.showError(field, "This field is required")
      return
    }

    if (field.type === "email" && value && !this.isValidEmail(value)) {
      this.showError(field, "Please enter a valid email")
      return
    }

    if (field.minLength > 0 && value.length < field.minLength) {
      this.showError(field, `Must be at least ${field.minLength} characters`)
      return
    }

    if (field.name === "user[password_confirmation]") {
      const password = this.element.querySelector("[name='user[password]']")
      if (password && value !== password.value) {
        this.showError(field, "Passwords don't match")
        return
      }
    }
  }

  showError(field, message) {
    field.classList.add("border-red-500")
    field.classList.remove("border-gray-300")

    const existing = field.parentElement.querySelector(".field-error")
    if (existing) existing.remove()

    const error = document.createElement("p")
    error.className = "field-error mt-1 text-sm text-red-600"
    error.textContent = message
    field.parentElement.appendChild(error)
  }

  clearError(field) {
    field.classList.remove("border-red-500")
    field.classList.add("border-gray-300")

    const error = field.parentElement.querySelector(".field-error")
    if (error) error.remove()
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }
}
