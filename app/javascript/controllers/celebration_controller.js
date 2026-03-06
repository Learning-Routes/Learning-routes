import { Controller } from "@hotwired/stimulus"

// Dynamically import confetti only when needed
let confettiModule = null
async function getConfetti() {
  if (!confettiModule) {
    try {
      confettiModule = (await import("canvas-confetti")).default
    } catch (e) {
      console.warn("[celebration] canvas-confetti not available:", e)
      confettiModule = () => {} // noop fallback
    }
  }
  return confettiModule
}

const COLORS = ["#8B80C4", "#6E9BC8", "#5BA880", "#B09848", "#E8E4DC"]

export default class extends Controller {
  static values = {
    tier: String,    // micro, medium, big, epic
    xp: Number,      // XP amount to display
    message: String, // Message to show
    level: Number,   // New level (for level-up)
    streak: Number   // Streak count (for milestones)
  }

  connect() {
    const tier = this.tierValue
    if (!tier) return

    // Small delay so the DOM is painted first
    requestAnimationFrame(() => {
      switch (tier) {
        case "micro":  this._micro(); break
        case "medium": this._medium(); break
        case "big":    this._big(); break
        case "epic":   this._epic(); break
      }
    })
  }

  disconnect() {
    this._cleanup()
  }

  // ─── Tier 1: MICRO (correct answer) ──────────────────────────

  _micro() {
    if (this.xpValue > 0) this._floatXp(this.element, this.xpValue)

    // Green pulse on the element
    this.element.style.transition = "box-shadow 0.3s, background-color 0.3s"
    this.element.style.boxShadow = "inset 0 0 0 2px rgba(91,168,128,0.3)"
    setTimeout(() => {
      this.element.style.boxShadow = ""
    }, 500)

    this._autoDismiss(1200)
  }

  // ─── Tier 2: MEDIUM (lesson complete, quiz pass) ─────────────

  _medium() {
    this._showToast(this.messageValue || "Completed!", this.xpValue)
    this._animateNavbarXp()
    this._autoDismiss(3500)
  }

  // ─── Tier 3: BIG (step complete, achievement) ────────────────

  async _big() {
    const confetti = await getConfetti()
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 },
      colors: COLORS,
      disableForReducedMotion: true
    })

    this._showToast(this.messageValue || "Step complete!", this.xpValue, true)
    this._animateNavbarXp()
    this._autoDismiss(4000)
  }

  // ─── Tier 4: EPIC (route complete, level up) ─────────────────

  async _epic() {
    const confetti = await getConfetti()

    // Multi-burst confetti
    confetti({ particleCount: 100, spread: 160, origin: { x: 0.3, y: 0.5 }, colors: COLORS, disableForReducedMotion: true })
    setTimeout(() => {
      confetti({ particleCount: 100, spread: 160, origin: { x: 0.7, y: 0.5 }, colors: COLORS, disableForReducedMotion: true })
    }, 300)
    setTimeout(() => {
      confetti({ particleCount: 50, angle: 90, spread: 120, origin: { y: 0 }, colors: COLORS, disableForReducedMotion: true })
    }, 600)

    // Gold screen flash
    this._goldFlash()

    // Level-up overlay or big toast
    if (this.levelValue > 0) {
      this._showLevelUp(this.levelValue)
    } else {
      this._showToast(this.messageValue || "Route complete!", this.xpValue, true)
    }

    this._animateNavbarXp()
    this._autoDismiss(6000)
  }

  // ─── Helpers ──────────────────────────────────────────────────

  _floatXp(anchor, amount) {
    const span = document.createElement("span")
    span.textContent = `+${amount} XP`
    span.style.cssText = `
      position:absolute; top:-0.5rem; left:50%; transform:translateX(-50%);
      font-family:'DM Mono',monospace; font-size:0.85rem; font-weight:700;
      color:#B09848; pointer-events:none; white-space:nowrap; z-index:10;
      opacity:1; transition:all 1s cubic-bezier(0.16,1,0.3,1);
    `

    // Ensure anchor has relative positioning
    const pos = getComputedStyle(anchor).position
    if (pos === "static") anchor.style.position = "relative"

    anchor.appendChild(span)

    requestAnimationFrame(() => {
      span.style.opacity = "0"
      span.style.transform = "translateX(-50%) translateY(-2.5rem)"
    })

    setTimeout(() => span.remove(), 1200)
  }

  _showToast(message, xp, large = false) {
    const container = document.getElementById("celebrations")
    if (!container) return

    const toast = document.createElement("div")
    toast.style.cssText = `
      pointer-events:auto; position:fixed; bottom:2rem; left:50%; transform:translateX(-50%) translateY(100%);
      display:flex; align-items:center; gap:0.75rem;
      background:var(--color-card-bg, #FEFDFB); border:1px solid var(--color-faint, rgba(28,24,18,0.06));
      border-radius:14px; padding:${large ? "1rem 1.75rem" : "0.85rem 1.5rem"};
      box-shadow:0 8px 32px rgba(28,24,18,0.12); max-width:420px; z-index:9999;
      opacity:0; transition:all 0.4s cubic-bezier(0.34,1.56,0.64,1);
    `

    // Check icon
    const check = document.createElement("div")
    check.style.cssText = `
      width:${large ? "28px" : "22px"}; height:${large ? "28px" : "22px"}; border-radius:50%;
      background:#5BA880; display:flex; align-items:center; justify-content:center; flex-shrink:0;
    `
    check.innerHTML = `<svg width="${large ? 16 : 13}" height="${large ? 16 : 13}" viewBox="0 0 20 20" fill="#fff"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`

    // Text
    const text = document.createElement("span")
    text.style.cssText = `font-family:'DM Sans',sans-serif; font-size:${large ? "0.95rem" : "0.85rem"}; font-weight:600; color:var(--color-txt, #1C1812);`
    text.textContent = message

    toast.appendChild(check)
    toast.appendChild(text)

    // XP badge
    if (xp > 0) {
      const badge = document.createElement("span")
      badge.style.cssText = `
        font-family:'DM Mono',monospace; font-size:0.78rem; font-weight:600;
        color:#B09848; background:rgba(176,152,72,0.08); border-radius:8px;
        padding:0.2rem 0.5rem; white-space:nowrap;
      `
      badge.textContent = `+${xp} XP`
      toast.appendChild(badge)
    }

    container.appendChild(toast)

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = "1"
      toast.style.transform = "translateX(-50%) translateY(0)"
    })

    // Animate out
    this._toastEl = toast
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = "0"
      toast.style.transform = "translateX(-50%) translateY(100%)"
      setTimeout(() => toast.remove(), 400)
    }, large ? 3500 : 2500)
  }

  _showLevelUp(level) {
    const container = document.getElementById("celebrations")
    if (!container) return

    const overlay = document.createElement("div")
    overlay.style.cssText = `
      pointer-events:auto; position:fixed; inset:0; z-index:9999;
      display:flex; align-items:center; justify-content:center;
      background:rgba(28,25,18,0.6); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
      opacity:0; transition:opacity 0.4s;
    `

    const card = document.createElement("div")
    card.style.cssText = `
      background:var(--color-card-bg, #FEFDFB); border-radius:24px;
      padding:2.5rem 2.5rem 2rem; max-width:320px; width:90%;
      text-align:center; box-shadow:0 24px 64px rgba(28,24,18,0.2);
      transform:scale(0.8); opacity:0;
      transition:all 0.5s cubic-bezier(0.34,1.56,0.64,1);
    `

    card.innerHTML = `
      <div style="font-family:'DM Mono',monospace; font-size:0.6rem; font-weight:600; color:#B09848; text-transform:uppercase; letter-spacing:2px; margin-bottom:0.5rem;">NIVEL</div>
      <div style="font-family:'DM Mono',monospace; font-size:4rem; font-weight:700; color:var(--color-txt, #1C1812); line-height:1; text-shadow:0 0 40px rgba(176,152,72,0.3);">${level}</div>
      <div style="font-family:'DM Sans',sans-serif; font-size:1.1rem; font-weight:700; color:var(--color-txt, #1C1812); margin-top:0.75rem;">Felicidades!</div>
      <div style="font-family:'DM Sans',sans-serif; font-size:0.78rem; color:var(--color-muted, #887F72); margin-top:0.4rem;">Has alcanzado un nuevo nivel</div>
      <button onclick="this.closest('[data-dismiss]').click()" style="
        margin-top:1.5rem; font-family:'DM Sans',sans-serif; font-size:0.82rem; font-weight:600;
        color:#fff; background:#2C261E; border:none; border-radius:11px;
        padding:0.65rem 2rem; cursor:pointer; transition:opacity 0.2s;
      ">Continuar</button>
    `

    overlay.setAttribute("data-dismiss", "")
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.tagName === "BUTTON") {
        overlay.style.opacity = "0"
        card.style.transform = "scale(0.8)"
        card.style.opacity = "0"
        setTimeout(() => overlay.remove(), 400)
      }
    })

    overlay.appendChild(card)
    container.appendChild(overlay)

    this._levelOverlay = overlay

    requestAnimationFrame(() => {
      overlay.style.opacity = "1"
      card.style.transform = "scale(1)"
      card.style.opacity = "1"
    })
  }

  _goldFlash() {
    const flash = document.createElement("div")
    flash.style.cssText = `
      position:fixed; inset:0; background:rgba(176,152,72,0.08);
      pointer-events:none; z-index:9997;
      animation:celebration-gold-flash 0.6s ease-out forwards;
    `
    document.body.appendChild(flash)
    setTimeout(() => flash.remove(), 700)
  }

  _animateNavbarXp() {
    // Find the engagement XP counter in the navbar and pulse it
    const xpCount = document.querySelector("[data-engagement-target='xpCount']")
    if (!xpCount) return

    xpCount.style.transition = "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), color 0.3s"
    xpCount.style.transform = "scale(1.4)"
    xpCount.style.color = "#5BA880"
    setTimeout(() => {
      xpCount.style.transform = "scale(1)"
      xpCount.style.color = ""
    }, 800)

    // Also pulse the streak flame
    const flame = document.querySelector("[data-engagement-target='flameIcon']")
    if (flame) {
      flame.style.transition = "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"
      flame.style.transform = "scale(1.5)"
      setTimeout(() => { flame.style.transform = "scale(1)" }, 600)
    }
  }

  _autoDismiss(ms) {
    this._dismissTimer = setTimeout(() => {
      this.element.remove()
    }, ms)
  }

  _cleanup() {
    if (this._dismissTimer) clearTimeout(this._dismissTimer)
    if (this._toastTimer) clearTimeout(this._toastTimer)
    if (this._toastEl) this._toastEl.remove()
    if (this._levelOverlay) this._levelOverlay.remove()
  }
}
