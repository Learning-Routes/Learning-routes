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

    const rs = getComputedStyle(document.documentElement)
    const activeBorder = rs.getPropertyValue("--color-txt").trim() || "#2C261E"
    const inactiveBorder = rs.getPropertyValue("--color-border-subtle").trim() || "#E0DBCF"
    const activeBg = rs.getPropertyValue("--color-tint").trim() || "rgba(44,38,30,0.05)"

    this.visibilityBtnTargets.forEach(b => {
      const isActive = b.dataset.visibility === this._visibility
      b.style.borderColor = isActive ? activeBorder : inactiveBorder
      b.style.background = isActive ? activeBg : "transparent"
    })
  }

  selectRoute(event) {
    event.preventDefault()
    this.routeIdValue = event.currentTarget.dataset.routeId

    const rs2 = getComputedStyle(document.documentElement)
    const selBorder = rs2.getPropertyValue("--color-txt").trim() || "#2C261E"
    const unselBorder = rs2.getPropertyValue("--color-border-subtle").trim() || "rgba(28,24,18,0.1)"
    const selBg = rs2.getPropertyValue("--color-tint").trim() || "rgba(44,38,30,0.04)"

    this.routeSelectTargets.forEach(el => {
      const isSelected = el.dataset.routeId === this.routeIdValue
      el.style.borderColor = isSelected ? selBorder : unselBorder
      el.style.background = isSelected ? selBg : "transparent"
    })
  }

  async submit(event) {
    event.preventDefault()
    const routeId = this.routeIdValue
    if (!routeId) {
      // Flash the route list to indicate selection needed
      const alertColor = getComputedStyle(document.documentElement).getPropertyValue("--color-flash-alert-text").trim() || "#B06050"
      const defaultBorder = getComputedStyle(document.documentElement).getPropertyValue("--color-border-subtle").trim() || "rgba(28,24,18,0.1)"
      this.routeSelectTargets.forEach(el => {
        el.style.borderColor = alertColor
        setTimeout(() => { el.style.borderColor = defaultBorder }, 800)
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
    const rs = getComputedStyle(document.documentElement)
    const aBorder = rs.getPropertyValue("--color-txt").trim() || "#2C261E"
    const iBorder = rs.getPropertyValue("--color-border-subtle").trim() || "#E0DBCF"
    const aBg = rs.getPropertyValue("--color-tint").trim() || "rgba(44,38,30,0.05)"

    this.visibilityBtnTargets.forEach(b => {
      const isDefault = b.dataset.visibility === "public"
      b.style.borderColor = isDefault ? aBorder : iBorder
      b.style.background = isDefault ? aBg : "transparent"
    })
    this.routeSelectTargets.forEach(el => {
      el.style.borderColor = iBorder
      el.style.background = "transparent"
    })
  }
}
