import { Controller } from "@hotwired/stimulus"
import { connectStreamSource, disconnectStreamSource } from "@hotwired/turbo"

export default class extends Controller {
  static targets = ["panel", "messages", "input", "fab", "badge", "backdrop", "sendBtn"]
  static values = { stepId: String, url: String }

  connect() {
    this.open = false
    this.scrollObserver = null
    this.lastScrollTime = Date.now()

    // Auto-scroll on new messages
    this.setupAutoScroll()

    // Subscribe to Turbo Stream channel for this step
    this.subscribeToChannel()

    // Proactive suggestion after 45s of no scroll
    this.setupProactiveSuggestion()
  }

  disconnect() {
    if (this.streamSource) {
      disconnectStreamSource(this.streamSource)
    }
    if (this.proactiveTimer) {
      clearTimeout(this.proactiveTimer)
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

      if (response.ok) {
        const html = await response.text()
        Turbo.renderStreamMessage(html)
      }

      // Show loading skeleton for AI response
      this.showSkeleton()
    } catch (e) {
      console.error("[TutorChat] Send failed:", e)
    } finally {
      this.inputTarget.disabled = false
      if (this.hasSendBtnTarget) this.sendBtnTarget.style.opacity = "1"
      this.inputTarget.focus()
    }
  }

  showSkeleton() {
    const skeleton = document.createElement("div")
    skeleton.className = "flex gap-2 tutor-skeleton"
    skeleton.innerHTML = '<div class="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0" style="background: rgba(44, 38, 30, 0.08);">🤖</div>' +
      '<div class="px-3 py-2 rounded-2xl rounded-tl-sm" style="background: rgba(44, 38, 30, 0.05); max-width: 85%;">' +
      '<div class="flex gap-1"><span class="w-2 h-2 rounded-full animate-pulse" style="background: #887F72;"></span>' +
      '<span class="w-2 h-2 rounded-full animate-pulse" style="background: #887F72; animation-delay: 0.2s;"></span>' +
      '<span class="w-2 h-2 rounded-full animate-pulse" style="background: #887F72; animation-delay: 0.4s;"></span></div></div>'
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

  subscribeToChannel() {
    // Connect to ActionCable Turbo Stream for real-time updates
    const streamName = "tutor_chat_step_" + this.stepIdValue
    const source = new EventSource("/turbo-stream?stream=" + encodeURIComponent(streamName))
    // Turbo Stream via ActionCable is handled automatically if cable is set up
    // For polling fallback, the MutationObserver handles scroll
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
