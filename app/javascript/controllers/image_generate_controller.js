import { Controller } from "@hotwired/stimulus"
import DOMPurify from "dompurify"

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
      const url = `/content/section_images/${stepId}/${sectionIndex}/generate`

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

      // 202 = queued. Generation takes 30-90s, so the server answers immediately and
      // we poll. Doing it in the request killed the Puma worker at 60s and returned
      // 502 to the student.
      if (response.status === 202 || data.status === "generating") {
        this._poll(stepId, sectionIndex, btn, originalHTML)
        return
      }

      if (data.success && (data.html || data.image_url)) {
        this._render(stepId, sectionIndex, data.html || this._buildImageHTML(data.image_url))
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

  disconnect() {
    if (this._timer) clearInterval(this._timer)
  }

  // Poll until the job writes a result. Capped so a job that dies silently stops the
  // spinner instead of leaving it turning forever.
  _poll(stepId, sectionIndex, btn, originalHTML, attempt = 0) {
    const MAX_ATTEMPTS = 60 // 3s apart = 3 minutes
    const url = `/content/section_images/${stepId}/${sectionIndex}/status`

    this._timer = setInterval(async () => {
      attempt += 1
      if (attempt > MAX_ATTEMPTS) {
        clearInterval(this._timer)
        this._showError(btn, "This is taking longer than expected. Try again in a moment.")
        btn.innerHTML = originalHTML
        btn.disabled = false
        return
      }

      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
          credentials: "same-origin"
        })
        if (!res.ok) return

        const data = await res.json()

        if (data.status === "ready") {
          clearInterval(this._timer)
          this._render(stepId, sectionIndex, data.html || this._buildImageHTML(data.image_url))
        } else if (data.status === "failed") {
          clearInterval(this._timer)
          this._showError(btn, data.error || "Image generation failed")
          btn.innerHTML = originalHTML
          btn.disabled = false
        }
      } catch {
        // Network blip: keep polling, the cap ends it.
      }
    }, 3000)
  }

  _render(stepId, sectionIndex, html) {
    const container = document.getElementById(`visual_image_${stepId}_${sectionIndex}`)
    if (!container) return

    // Defense-in-depth: server already escapes values via ERB html_escape.
    // Re-sanitize before innerHTML; keep `style` so the framed-image design survives,
    // and DOMPurify strips the inline onload handler (re-wired below).
    container.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ["loading"] })

    const img = container.querySelector("img")
    if (img) {
      img.style.opacity = "0"
      img.style.transition = "opacity 0.5s ease"
      img.onload = () => { img.style.opacity = "1" }
    }
  }

  _buildImageHTML(url) {
    // Allow http(s) and data: image URLs only — reject javascript:/blob:/etc.
    // data: is required because the image service falls back to inline
    // `data:image/svg+xml;base64,…` placeholders (safe as an <img> source; SVG
    // loaded via <img> cannot execute script), and the already_exists response
    // returns only image_url (no server html), which routes through here.
    try {
      const parsed = new URL(url, window.location.origin)
      if (!["https:", "http:", "data:"].includes(parsed.protocol)) return ""
      url = parsed.toString()
    } catch {
      return ""
    }

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
