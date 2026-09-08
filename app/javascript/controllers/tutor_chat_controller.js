import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["panel", "messages", "input", "fab", "badge", "backdrop", "sendBtn", "error"]
  static values = { stepId: String, url: String, i18n: Object }

  connect() {
    this.open = false
    this.scrollObserver = null
    this.lastScrollTime = Date.now()

    // Auto-scroll on new messages
    this.setupAutoScroll()

    // No subscription code here any more. The panel renders
    // `turbo_stream_from "tutor_chat_step_<id>"`, so turbo-rails owns the
    // subscription and tears it down with the element. What used to be here was
    // `new EventSource("/turbo-stream?stream=…")` against a route this app does
    // not have: a 404 every few seconds per open lesson, delivering nothing.

    // Proactive suggestion after 45s of no scroll
    this.setupProactiveSuggestion()
  }

  disconnect() {
    if (this.proactiveTimer) {
      clearTimeout(this.proactiveTimer)
    }
    if (this._scrollHandler) {
      document.removeEventListener("scroll", this._scrollHandler)
    }
    if (this.scrollObserver) {
      this.scrollObserver.disconnect()
    }
  }

  toggle() {
    this.open = !this.open
    if (this.hasPanelTarget) {
      this.panelTarget.style.transform = this.open ? "translateX(0)" : "translateX(100%)"
    }
    if (this.hasBackdropTarget) {
      this.backdropTarget.classList.toggle("hidden", !this.open)
    }
    if (this.open && this.hasInputTarget) {
      setTimeout(() => this.inputTarget.focus(), 250)
    }
    // Hide badge when opening
    if (this.open && this.hasBadgeTarget) {
      this.badgeTarget.classList.add("hidden")
    }
  }

  async send() {
    if (!this.hasInputTarget) return
    const message = this.inputTarget.value.trim()
    if (!message) return

    this.inputTarget.value = ""
    this.inputTarget.disabled = true
    if (this.hasSendBtnTarget) this.sendBtnTarget.style.opacity = "0.5"

    try {
      const response = await fetch(this.urlValue, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRF-Token": document.querySelector("meta[name=csrf-token]")?.content || "",
          "Accept": "text/vnd.turbo-stream.html"
        },
        body: "message=" + encodeURIComponent(message)
      })

      if (!response.ok) {
        // The server said no and the student was told nothing: the skeleton
        // pulsed forever. A 403 is the generation gate on a refunded route, a
        // 429 is the rate limiter, and anything else is worth saying plainly.
        await this._showSendError(response)
        return
      }

      this._clearError()
      Turbo.renderStreamMessage(await response.text())

      // Show loading skeleton for AI response
      this.showSkeleton()
    } catch (e) {
      console.error("[TutorChat] Send failed:", e)
      this._showError(this._t("send_failed"))
    } finally {
      this.inputTarget.disabled = false
      if (this.hasSendBtnTarget) this.sendBtnTarget.style.opacity = "1"
      this.inputTarget.focus()
    }
  }

  // Tokens, not hex. The skeleton used #887F72 and two rgba() literals while the
  // panel it sits in used three different ones.
  showSkeleton() {
    const skeleton = document.createElement("div")
    skeleton.className = "flex gap-2 tutor-skeleton"
    const dot = (delay) =>
      `<span class="w-2 h-2 rounded-full animate-pulse" style="background: var(--color-muted);${delay}"></span>`
    skeleton.innerHTML =
      '<div class="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0" style="background: var(--color-tint-strong);">🤖</div>' +
      '<div class="px-3 py-2 rounded-2xl rounded-tl-sm" style="background: var(--color-tint); max-width: 85%;">' +
      '<div class="flex gap-1">' + dot("") + dot(" animation-delay: 0.2s;") + dot(" animation-delay: 0.4s;") +
      "</div></div>"
    if (this.hasMessagesTarget) {
      this.messagesTarget.appendChild(skeleton)
      this.scrollToBottom()
    }
  }

  removeSkeleton() {
    const skeletons = this.messagesTarget?.querySelectorAll(".tutor-skeleton")
    skeletons?.forEach(s => s.remove())
  }

  setupAutoScroll() {
    if (!this.hasMessagesTarget) return
    const observer = new MutationObserver(() => {
      this.removeSkeleton()
      this.scrollToBottom()
    })
    observer.observe(this.messagesTarget, { childList: true })
    this.scrollObserver = observer
  }

  scrollToBottom() {
    if (this.hasMessagesTarget) {
      this.messagesTarget.scrollTop = this.messagesTarget.scrollHeight
    }
  }

  // ── Refusals the student can read ──────────────────────────────────────

  async _showSendError(response) {
    this.removeSkeleton()

    // Prefer the server's own sentence when it sends one, the way
    // answers_controller#refuse does.
    let message = null
    try {
      const body = await response.clone().json()
      message = body?.message
    } catch (_) { /* not JSON; fall through to the status map */ }

    if (!message) {
      if (response.status === 403) message = this._t("send_forbidden")
      else if (response.status === 429) message = this._t("send_rate_limited")
      else message = this._t("send_failed")
    }
    this._showError(message)
  }

  _showError(message) {
    if (!this.hasErrorTarget) return
    this.errorTarget.textContent = message
    this.errorTarget.classList.remove("hidden")
  }

  _clearError() {
    if (!this.hasErrorTarget) return
    this.errorTarget.textContent = ""
    this.errorTarget.classList.add("hidden")
  }

  _t(key) {
    return this.i18nValue?.[key] || ""
  }

  setupProactiveSuggestion() {
    // Track scroll activity on the page
    this._scrollHandler = () => { this.lastScrollTime = Date.now() }
    document.addEventListener("scroll", this._scrollHandler, { passive: true })

    this.proactiveTimer = setTimeout(() => {
      const elapsed = Date.now() - this.lastScrollTime
      if (elapsed >= 45000 && !this.open && this.hasBadgeTarget) {
        this.badgeTarget.textContent = "?"
        this.badgeTarget.classList.remove("hidden")
        this.fabTarget?.classList.add("tutor-fab-pulse")
      }
    }, 45000)
  }
}
