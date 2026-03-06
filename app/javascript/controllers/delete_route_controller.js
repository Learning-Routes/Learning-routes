import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "modalCard", "initialView", "codeView", "codeInput", "sendBtn", "confirmBtn", "error"]
  static values = { requestUrl: String, confirmUrl: String }

  connect() {
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
    this._reset()
  }

  backdropClick(event) {
    if (event.target === event.currentTarget) {
      this.close(event)
    }
  }

  async requestCode(event) {
    event.preventDefault()
    const btn = this.sendBtnTarget
    btn.disabled = true
    btn.style.opacity = "0.6"

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content

    try {
      const response = await fetch(this.requestUrlValue, {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken,
          "Accept": "application/json"
        }
      })

      if (response.ok) {
        this.initialViewTarget.style.display = "none"
        this.codeViewTarget.style.display = "block"
        if (this.hasCodeInputTarget) this.codeInputTarget.focus()
      } else if (response.status === 429) {
        this._showError(btn.dataset.rateLimitMsg || "Too many requests. Please wait.")
        btn.disabled = false
        btn.style.opacity = "1"
      } else {
        this._showError(btn.dataset.errorMsg || "Something went wrong.")
        btn.disabled = false
        btn.style.opacity = "1"
      }
    } catch (e) {
      console.error("Request deletion code failed:", e)
      btn.disabled = false
      btn.style.opacity = "1"
    }
  }

  async confirmDeletion(event) {
    event.preventDefault()
    const code = this.codeInputTarget.value.trim()
    if (code.length !== 6) return

    const btn = this.confirmBtnTarget
    btn.disabled = true
    btn.style.opacity = "0.6"

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content

    try {
      const response = await fetch(this.confirmUrlValue, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Accept": "text/vnd.turbo-stream.html, application/json"
        },
        body: JSON.stringify({ code: code })
      })

      if (response.ok) {
        const contentType = response.headers.get("content-type") || ""
        if (contentType.includes("turbo-stream")) {
          const html = await response.text()
          Turbo.renderStreamMessage(html)
        } else {
          const data = await response.json()
          if (data.redirect) {
            window.location.href = data.redirect
          }
        }
      } else if (response.status === 422) {
        const html = await response.text()
        if (html.includes("turbo-stream")) {
          Turbo.renderStreamMessage(html)
        }
        btn.disabled = false
        btn.style.opacity = "1"
        this.codeInputTarget.value = ""
        this.codeInputTarget.focus()
      }
    } catch (e) {
      console.error("Confirm deletion failed:", e)
      btn.disabled = false
      btn.style.opacity = "1"
    }
  }

  _handleKeydown(event) {
    if (event.key === "Escape") this.close(event)
  }

  _showError(msg) {
    if (this.hasErrorTarget) {
      this.errorTarget.textContent = msg
      this.errorTarget.style.display = "block"
    }
  }

  _reset() {
    if (this.hasInitialViewTarget) this.initialViewTarget.style.display = ""
    if (this.hasCodeViewTarget) this.codeViewTarget.style.display = "none"
    if (this.hasCodeInputTarget) this.codeInputTarget.value = ""
    if (this.hasErrorTarget) {
      this.errorTarget.textContent = ""
      this.errorTarget.style.display = "none"
    }
    if (this.hasSendBtnTarget) {
      this.sendBtnTarget.disabled = false
      this.sendBtnTarget.style.opacity = "1"
    }
    if (this.hasConfirmBtnTarget) {
      this.confirmBtnTarget.disabled = false
      this.confirmBtnTarget.style.opacity = "1"
    }
  }
}
