import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["loadingIndicator", "output", "messageInput"]
  static values = { stepId: String, interactUrl: String }

  connect() {
    this._abortController = null
  }

  disconnect() {
    if (this._abortController) this._abortController.abort()
  }

  // Legacy button click handler (turbo-stream)
  async request(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return

    if (this._abortController) this._abortController.abort()
    this._abortController = new AbortController()

    this._showLoading(event.currentTarget)

    try {
      const token = document.querySelector('meta[name="csrf-token"]')?.content
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "text/vnd.turbo-stream.html",
          "X-CSRF-Token": token,
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "same-origin",
        signal: this._abortController.signal
      })

      if (response.ok) {
        const html = await response.text()
        Turbo.renderStreamMessage(html)
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("AI interaction failed:", error)
      }
    } finally {
      this._hideLoading(event.currentTarget)
    }
  }

  // New JSON-based agent interaction
  async interact(event) {
    const btn = event.currentTarget
    const actionType = btn.dataset.actionType || "explain_differently"
    const sectionIndex = btn.dataset.sectionIndex
    const url = btn.dataset.url || this.interactUrlValue
    if (!url) return

    if (this._abortController) this._abortController.abort()
    this._abortController = new AbortController()

    this._showLoading(btn)

    try {
      const token = document.querySelector('meta[name="csrf-token"]')?.content
      const body = { action_type: actionType }
      if (sectionIndex !== undefined) body.section_index = parseInt(sectionIndex)

      // Check if there's a custom message input
      if (this.hasMessageInputTarget && this.messageInputTarget.value.trim()) {
        body.message = this.messageInputTarget.value.trim()
        this.messageInputTarget.value = ""
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "same-origin",
        body: JSON.stringify(body),
        signal: this._abortController.signal
      })

      const data = await response.json()

      if (data.success && data.html) {
        this._renderResult(data.html, data.type)
      } else if (data.error) {
        this._renderError(data.error)
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("AI agent interaction failed:", error)
        this._renderError("Something went wrong. Please try again.")
      }
    } finally {
      this._hideLoading(btn)
    }
  }

  _renderResult(html, type) {
    const outputId = `ai_supplementary_${this.stepIdValue}`
    const container = document.getElementById(outputId)
    if (!container) return

    const wrapper = document.createElement("div")
    wrapper.className = "ai-agent-result"
    wrapper.style.cssText = "opacity:0; transform:translateY(8px); transition:all 0.3s ease;"
    wrapper.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
        <span style="font-family:'DM Mono',monospace; font-size:0.625rem; font-weight:600; color:var(--color-muted); text-transform:uppercase; letter-spacing:0.1em;">AI Assistant</span>
        <span style="font-size:0.625rem; color:var(--color-muted); background:var(--color-card); border-radius:4px; padding:0.125rem 0.375rem;">${type || "text"}</span>
      </div>
      <div class="lesson-content" data-controller="math-renderer mermaid-diagram">${html}</div>
    `

    // Insert at top of container
    container.prepend(wrapper)

    // Animate in
    requestAnimationFrame(() => {
      wrapper.style.opacity = "1"
      wrapper.style.transform = "translateY(0)"
    })

    // Re-initialize Mermaid diagrams if present
    if (html.includes("mermaid-diagram")) {
      this._initMermaid(wrapper)
    }

    // Scroll into view
    wrapper.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  _renderError(message) {
    const outputId = `ai_supplementary_${this.stepIdValue}`
    const container = document.getElementById(outputId)
    if (!container) return

    const errorEl = document.createElement("div")
    errorEl.style.cssText = "color:var(--color-error); padding:0.75rem; font-size:0.875rem; opacity:0; transition:opacity 0.3s;"
    errorEl.textContent = message
    container.prepend(errorEl)

    requestAnimationFrame(() => { errorEl.style.opacity = "1" })

    // Auto-remove after 5s
    setTimeout(() => {
      errorEl.style.opacity = "0"
      setTimeout(() => errorEl.remove(), 300)
    }, 5000)
  }

  _showLoading(btn) {
    if (this.hasLoadingIndicatorTarget) {
      this.loadingIndicatorTarget.classList.remove("hidden")
    }
    if (btn) btn.disabled = true
  }

  _hideLoading(btn) {
    if (this.hasLoadingIndicatorTarget) {
      this.loadingIndicatorTarget.classList.add("hidden")
    }
    if (btn) btn.disabled = false
  }

  _initMermaid(container) {
    // Dispatch event so mermaid-diagram controllers can pick up new diagrams
    container.querySelectorAll("[data-controller~='mermaid-diagram']").forEach(el => {
      el.dispatchEvent(new Event("mermaid:render"))
    })
  }
}
