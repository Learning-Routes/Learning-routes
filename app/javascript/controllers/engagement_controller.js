import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "streak", "streakCount", "flameIcon",
    "xpWrap", "xpCount", "xpFloat",
    "levelBadge", "levelNum", "levelProgress"
  ]

  static values = {
    xp: Number,
    level: Number,
    streak: Number,
    progress: Number,
    xpGained: Number,
    leveledUp: Boolean
  }

  connect() {
    // Animate if xpGained was set (turbo stream update)
    if (this.hasXpGainedValue && this.xpGainedValue > 0) {
      this._animateXpGain(this.xpGainedValue)

      if (this.hasLeveledUpValue && this.leveledUpValue) {
        this._animateLevelUp()
      }
    }
  }

  disconnect() {
    if (this._floatTimer) clearTimeout(this._floatTimer)
  }

  // --- Animations ---

  _animateXpGain(amount) {
    // Floating "+XP" text
    if (this.hasXpFloatTarget) {
      const el = this.xpFloatTarget
      el.textContent = `+${amount} XP`
      el.style.opacity = "1"
      el.style.transform = "translateX(-50%) translateY(0)"
      el.style.transition = "all 1.2s cubic-bezier(0.16, 1, 0.3, 1)"

      requestAnimationFrame(() => {
        el.style.opacity = "0"
        el.style.transform = "translateX(-50%) translateY(-1.5rem)"
      })

      this._floatTimer = setTimeout(() => {
        el.style.transition = "none"
        el.style.opacity = "0"
        el.style.transform = "translateX(-50%) translateY(0)"
      }, 1400)
    }

    // Pulse the XP counter
    if (this.hasXpCountTarget) {
      this.xpCountTarget.style.transition = "transform 0.3s, color 0.3s"
      this.xpCountTarget.style.transform = "scale(1.3)"
      this.xpCountTarget.style.color = "#5BA880"
      setTimeout(() => {
        this.xpCountTarget.style.transform = "scale(1)"
        this.xpCountTarget.style.color = ""
      }, 600)
    }

    // Pulse streak flame
    if (this.hasFlameIconTarget) {
      this.flameIconTarget.style.transition = "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
      this.flameIconTarget.style.transform = "scale(1.4)"
      setTimeout(() => {
        this.flameIconTarget.style.transform = "scale(1)"
      }, 500)
    }

    // Animate level progress bar
    if (this.hasLevelProgressTarget && this.hasProgressValue) {
      this.levelProgressTarget.style.width = `${this.progressValue}%`
    }
  }

  _animateLevelUp() {
    if (!this.hasLevelBadgeTarget) return

    const badge = this.levelBadgeTarget
    badge.style.transition = "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.5s"
    badge.style.transform = "scale(1.3)"
    badge.style.boxShadow = "0 0 16px rgba(91,168,128,0.5)"

    setTimeout(() => {
      badge.style.transform = "scale(1)"
      badge.style.boxShadow = "none"
    }, 1200)

    // Simple confetti burst
    this._confetti()
  }

  _confetti() {
    const colors = ["#5BA880", "#F59E0B", "#8B80C4", "#6E9BC8", "#E8E4DC"]
    const container = document.createElement("div")
    container.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;"
    document.body.appendChild(container)

    for (let i = 0; i < 40; i++) {
      const dot = document.createElement("div")
      const size = 4 + Math.random() * 6
      const x = 40 + Math.random() * 20 // center-ish
      const color = colors[Math.floor(Math.random() * colors.length)]
      dot.style.cssText = `
        position:absolute;
        left:${x}%;
        top:40%;
        width:${size}px;
        height:${size}px;
        background:${color};
        border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
        opacity:1;
        transition:all ${1 + Math.random() * 1}s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      `
      container.appendChild(dot)

      requestAnimationFrame(() => {
        dot.style.left = `${x + (Math.random() - 0.5) * 40}%`
        dot.style.top = `${-10 + Math.random() * 80}%`
        dot.style.opacity = "0"
        dot.style.transform = `rotate(${Math.random() * 360}deg)`
      })
    }

    setTimeout(() => container.remove(), 2500)
  }
}
