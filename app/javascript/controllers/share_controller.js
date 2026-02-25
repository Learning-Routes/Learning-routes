import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "formView", "successView", "urlField", "description",
                     "visibilityBtn", "submitBtn", "copyBtn", "routeSelect", "modalCard"]
  static values = { url: String, routeId: String }

  connect() {
    this._visibility = "public"
    this._boundKeydown = this._handleKeydown.bind(this)
  }

  disconnect() {
    document.removeEventListener("keydown", this._boundKeydown)
  }

  open(event) {
    if (event) event.preventDefault()
    if (!this.hasModalTarget) return
    this.modalTarget.style.display = "flex"
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", this._boundKeydown)
  }

  close(event) {
    if (event) event.preventDefault()
    if (!this.hasModalTarget) return
    this.modalTarget.style.display = "none"
    document.body.style.overflow = ""
    document.removeEventListener("keydown", this._boundKeydown)
    this._resetForm()
  }

  backdropClick(event) {
    // Only close if clicking the backdrop itself, not the modal card
    if (event.target === event.currentTarget) {
      this.close(event)
    }
  }

  stopPropagation(event) {
    event.stopPropagation()
  }

  selectVisibility(event) {
    event.preventDefault()
    const btn = event.currentTarget
    this._visibility = btn.dataset.visibility

    this.visibilityBtnTargets.forEach(b => {
      const isActive = b.dataset.visibility === this._visibility
      // Modal is always light-themed so these colors are correct
      b.style.borderColor = isActive ? "#2C261E" : "#E0DBCF"
      b.style.background = isActive ? "rgba(44,38,30,0.05)" : "transparent"
    })
  }

  selectRoute(event) {
    event.preventDefault()
    this.routeIdValue = event.currentTarget.dataset.routeId

    this.routeSelectTargets.forEach(el => {
      const isSelected = el.dataset.routeId === this.routeIdValue
      // Modal is always light-themed so these colors are correct
      el.style.borderColor = isSelected ? "#2C261E" : "rgba(28,24,18,0.1)"
      el.style.background = isSelected ? "rgba(44,38,30,0.04)" : "transparent"
    })
  }

  async submit(event) {
    event.preventDefault()
    const routeId = this.routeIdValue
    if (!routeId) {
      // Flash the route list to indicate selection needed
      this.routeSelectTargets.forEach(el => {
        el.style.borderColor = "#B06050"
        setTimeout(() => { el.style.borderColor = "rgba(28,24,18,0.1)" }, 800)
      })
      return
    }

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
      console.error("Share failed:", e)
      btn.disabled = false
      btn.style.opacity = "1"
    }
  }

  copyUrl(event) {
    event.preventDefault()
    const url = this.urlFieldTarget.value
    navigator.clipboard.writeText(url).then(() => {
      const btn = this.copyBtnTarget
      const orig = btn.textContent.trim()
      btn.textContent = "✓"
      setTimeout(() => { btn.textContent = orig }, 1500)
    })
  }

  _handleKeydown(event) {
    if (event.key === "Escape") this.close(event)
  }

  _showSuccess(shareUrl) {
    if (this.hasFormViewTarget) this.formViewTarget.style.display = "none"
    if (this.hasSuccessViewTarget) this.successViewTarget.style.display = "block"
    if (this.hasUrlFieldTarget) {
      const fullUrl = shareUrl.startsWith("http") ? shareUrl : window.location.origin + shareUrl
      this.urlFieldTarget.value = fullUrl
    }
  }

  _resetForm() {
    if (this.hasFormViewTarget) this.formViewTarget.style.display = ""
    if (this.hasSuccessViewTarget) this.successViewTarget.style.display = "none"
    if (this.hasDescriptionTarget) this.descriptionTarget.value = ""
    if (this.hasSubmitBtnTarget) {
      this.submitBtnTarget.disabled = false
      this.submitBtnTarget.style.opacity = "1"
    }
    this.routeIdValue = ""
    this._visibility = "public"
    this.visibilityBtnTargets.forEach(b => {
      const isDefault = b.dataset.visibility === "public"
      b.style.borderColor = isDefault ? "#2C261E" : "#E0DBCF"
      b.style.background = isDefault ? "rgba(44,38,30,0.05)" : "transparent"
    })
    this.routeSelectTargets.forEach(el => {
      el.style.borderColor = "rgba(28,24,18,0.1)"
      el.style.background = "transparent"
    })
  }
}
