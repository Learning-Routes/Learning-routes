import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "formView", "successView", "urlField", "description",
                     "visibilityBtn", "submitBtn", "copyBtn", "routeSelect"]
  static values = { url: String, routeId: String }

  connect() {
    this._visibility = "public"
  }

  open(event) {
    event?.preventDefault()
    if (this.hasModalTarget) this.modalTarget.classList.remove("hidden")
    document.body.style.overflow = "hidden"
  }

  close(event) {
    event?.preventDefault()
    if (this.hasModalTarget) this.modalTarget.classList.add("hidden")
    document.body.style.overflow = ""
    this._resetForm()
  }

  selectVisibility(event) {
    event.preventDefault()
    const btn = event.currentTarget
    this._visibility = btn.dataset.visibility

    this.visibilityBtnTargets.forEach(b => {
      const isActive = b.dataset.visibility === this._visibility
      b.style.borderColor = isActive ? "#2C261E" : "#E0DBCF"
      b.style.background = isActive ? "rgba(44,38,30,0.05)" : "transparent"
    })
  }

  selectRoute(event) {
    this.routeIdValue = event.currentTarget.dataset.routeId
    // Highlight selected route
    this.routeSelectTargets.forEach(el => {
      el.style.borderColor = el.dataset.routeId === this.routeIdValue ? "#2C261E" : "rgba(28,24,18,0.1)"
      el.style.background = el.dataset.routeId === this.routeIdValue ? "rgba(44,38,30,0.04)" : "transparent"
    })
  }

  async submit(event) {
    event.preventDefault()
    const routeId = this.routeIdValue
    if (!routeId) return

    const btn = this.submitBtnTarget
    btn.disabled = true
    btn.style.opacity = "0.6"

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content
    const description = this.hasDescriptionTarget ? this.descriptionTarget.value : ""

    try {
      const response = await fetch(this.urlValue, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Accept": "application/json"
        },
        body: JSON.stringify({
          learning_route_id: routeId,
          visibility: this._visibility,
          description: description
        })
      })

      if (response.ok) {
        const data = await response.json()
        this._showSuccess(data.share_url || data.share_token)
      } else {
        btn.disabled = false
        btn.style.opacity = "1"
      }
    } catch (e) {
      btn.disabled = false
      btn.style.opacity = "1"
    }
  }

  copyUrl(event) {
    event.preventDefault()
    const url = this.urlFieldTarget.value
    navigator.clipboard.writeText(url).then(() => {
      const btn = this.copyBtnTarget
      const orig = btn.textContent
      btn.textContent = "✓"
      setTimeout(() => { btn.textContent = orig }, 1500)
    })
  }

  closeOnOutsideClick(event) {
    if (event.target === this.element) this.close(event)
  }

  _showSuccess(shareUrl) {
    if (this.hasFormViewTarget) this.formViewTarget.classList.add("hidden")
    if (this.hasSuccessViewTarget) this.successViewTarget.classList.remove("hidden")
    if (this.hasUrlFieldTarget) {
      this.urlFieldTarget.value = shareUrl.startsWith("http") ? shareUrl : window.location.origin + shareUrl
    }
  }

  _resetForm() {
    if (this.hasFormViewTarget) this.formViewTarget.classList.remove("hidden")
    if (this.hasSuccessViewTarget) this.successViewTarget.classList.add("hidden")
    if (this.hasDescriptionTarget) this.descriptionTarget.value = ""
    if (this.hasSubmitBtnTarget) {
      this.submitBtnTarget.disabled = false
      this.submitBtnTarget.style.opacity = "1"
    }
    this._visibility = "public"
    this.visibilityBtnTargets.forEach(b => {
      const isDefault = b.dataset.visibility === "public"
      b.style.borderColor = isDefault ? "#2C261E" : "#E0DBCF"
      b.style.background = isDefault ? "rgba(44,38,30,0.05)" : "transparent"
    })
  }
}
