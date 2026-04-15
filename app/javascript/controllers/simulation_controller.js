import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["canvas", "slider", "sliderValue", "controls", "result"]
  static values = { variables: Array, formula: String }

  connect() {
    this.ctx = this.canvasTarget.getContext("2d")
    this.values = {}
    this.variablesValue.forEach(v => {
      this.values[v.name] = v.default || (v.min + v.max) / 2
    })
    this.draw()
  }

  update(event) {
    const name = event.currentTarget.dataset.varName
    const val = parseFloat(event.currentTarget.value)
    const index = parseInt(event.currentTarget.dataset.varIndex)
    this.values[name] = val

    // Update display value
    if (this.sliderValueTargets[index]) {
      this.sliderValueTargets[index].textContent = val.toFixed(1)
    }

    this.draw()
  }

  draw() {
    const ctx = this.ctx
    const w = this.canvasTarget.width
    const h = this.canvasTarget.height

    // Clear
    ctx.fillStyle = "#FEFDFB"
    ctx.fillRect(0, 0, w, h)

    // Draw grid
    ctx.strokeStyle = "rgba(28, 24, 18, 0.06)"
    ctx.lineWidth = 1
    for (let x = 0; x <= w; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    }
    for (let y = 0; y <= h; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }

    // Draw axes
    ctx.strokeStyle = "#2C261E"
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(40, h - 30); ctx.lineTo(w - 20, h - 30); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(40, h - 30); ctx.lineTo(40, 20); ctx.stroke()

    // Draw a simple function curve based on variable values
    const vars = this.values
    const varNames = Object.keys(vars)
    if (varNames.length === 0) return

    ctx.strokeStyle = "#8b5cf6"
    ctx.lineWidth = 3
    ctx.beginPath()

    const plotW = w - 80
    const plotH = h - 60
    const scale = vars[varNames[0]] || 1

    for (let i = 0; i <= plotW; i++) {
      const x = i / plotW
      // Simple visualization: sine wave modulated by first variable
      const y = Math.sin(x * Math.PI * 2 * (varNames.length > 1 ? (vars[varNames[1]] || 1) / 10 : 2)) * scale / (this.variablesValue[0]?.max || 100)
      const px = 40 + i
      const py = h / 2 - y * plotH / 2

      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // Labels
    ctx.fillStyle = "#6D665B"
    ctx.font = "12px 'DM Mono', monospace"
    varNames.forEach((name, i) => {
      ctx.fillText(name + " = " + (vars[name] || 0).toFixed(1), w - 180, 30 + i * 20)
    })
  }
}
