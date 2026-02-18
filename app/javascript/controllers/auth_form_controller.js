import { Controller } from "@hotwired/stimulus"

// Replaces inline onfocus/onblur/onmouseover/onmouseout handlers on auth forms.
// Provides focus ring, hover lift, and border highlight effects declaratively.
export default class extends Controller {
  static targets = ["input", "submit", "oauth", "link"]

  // --- Input focus/blur ---
  inputFocus(event) {
    const el = event.currentTarget
    el.style.borderColor = "rgba(28,24,18,0.22)"
    el.style.boxShadow = "0 0 0 3px rgba(28,24,18,0.04)"
  }

  inputBlur(event) {
    const el = event.currentTarget
    el.style.borderColor = "rgba(28,24,18,0.1)"
    el.style.boxShadow = "none"
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
  linkOver(event) {
    event.currentTarget.style.color = "#1C1812"
  }

  linkOut(event) {
    event.currentTarget.style.color = "#A09889"
  }

  // --- Inline link underline ---
  inlineLinkOver(event) {
    event.currentTarget.style.textDecoration = "underline"
  }

  inlineLinkOut(event) {
    event.currentTarget.style.textDecoration = "none"
  }
}
