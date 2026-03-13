import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { generatingText: { type: String, default: "Generating..." } }

  async generate(event) {
    const btn = event.currentTarget
    const stepId = btn.dataset.imageGenerateStepIdParam
    const sectionIndex = btn.dataset.imageGenerateSectionIndexParam

    if (!stepId || sectionIndex === undefined) return

    // Disable button and show spinner
    btn.disabled = true
    const originalHTML = btn.innerHTML
    const spinnerText = btn.dataset.generatingText || this.generatingTextValue
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/>
      </svg>
      <span>${spinnerText}</span>
    `

    try {
      const token = document.querySelector('meta[name="csrf-token"]')?.content
      const url = `/content_engine/section_images/${stepId}/${sectionIndex}/generate`

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "same-origin"
      })

      const data = await response.json()

      if (data.success && (data.html || data.image_url)) {
        const container = document.getElementById(`visual_image_${stepId}_${sectionIndex}`)
        if (container) {
          container.innerHTML = data.html || this._buildImageHTML(data.image_url)
          // Animate in
          const img = container.querySelector("img")
          if (img) {
            img.style.opacity = "0"
            img.style.transition = "opacity 0.5s ease"
            img.onload = () => { img.style.opacity = "1" }
          }
        }
      } else {
        this._showError(btn, data.error || "Image generation failed")
        btn.innerHTML = originalHTML
        btn.disabled = false
      }
    } catch (error) {
      console.error("[image-generate] Failed:", error)
      this._showError(btn, "Something went wrong. Please try again.")
      btn.innerHTML = originalHTML
      btn.disabled = false
    }
  }

  _buildImageHTML(url) {
    return `
      <div style="border-radius:14px; overflow:hidden; border:1px solid var(--color-border-subtle); box-shadow:0 2px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.02);">
        <img src="${url}" alt="AI-generated illustration"
             style="width:100%; max-width:100%; height:auto; display:block; opacity:0; transition:opacity 0.5s ease;"
             loading="lazy"
             onload="this.style.opacity='1'">
      </div>
    `
  }

  _showError(btn, message) {
    const parent = btn.parentElement
    if (!parent) return

    const errorEl = document.createElement("p")
    errorEl.style.cssText = "color:var(--color-error); font-size:0.8125rem; margin:0.5rem 0 0; opacity:0; transition:opacity 0.3s;"
    errorEl.textContent = message
    parent.appendChild(errorEl)

    requestAnimationFrame(() => { errorEl.style.opacity = "1" })
    setTimeout(() => {
      errorEl.style.opacity = "0"
      setTimeout(() => errorEl.remove(), 300)
    }, 4000)
  }
}
