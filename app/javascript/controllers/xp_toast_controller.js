import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  show(event) {
    const amount = event?.detail?.amount || event?.params?.amount || 10
    const size = event?.detail?.size || "normal"
    this.createToast(amount, size)
  }

  createToast(amount, size) {
    const toast = document.createElement("div")
    toast.className = "xp-toast-float"
    toast.textContent = "+" + amount + " XP"

    const fontSize = size === "large" ? "1.25rem" : "0.875rem"
    const fontWeight = size === "large" ? "800" : "700"

    Object.assign(toast.style, {
      position: "fixed",
      bottom: "30%",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: "#F5C518",
      textShadow: "0 1px 4px rgba(0,0,0,0.2)",
      pointerEvents: "none",
      zIndex: "9999",
      fontFamily: "'DM Mono', monospace",
      animation: "xp-toast-rise 1.2s ease-out forwards"
    })

    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 1300)
  }
}
