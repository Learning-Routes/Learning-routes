import { Controller } from "@hotwired/stimulus"

/**
 * Compact Route Visualization Controller
 *
 * Renders a horizontal SVG route path with nodes representing route steps.
 * Each node's appearance reflects its status (completed, in_progress, available, locked).
 * The accent color is ONE color per route, derived from the route's color seed.
 *
 * Data attributes:
 *   data-compact-route-nodes-value  — JSON array of {label, status}
 *   data-compact-route-seed-value   — integer seed for deterministic vertical offsets
 *   data-compact-route-color-value  — hex accent color for this route (e.g. "#8B80C4")
 */
export default class extends Controller {
  static values = {
    nodes: Array,
    seed: { type: Number, default: 0 },
    color: { type: String, default: "#8B80C4" }
  }

  connect() {
    this._isConnected = true
    this.render()
    this.resizeObserver = new ResizeObserver(() => this.render())
    this.resizeObserver.observe(this.element)
  }

  disconnect() {
    this._isConnected = false
    if (this.resizeObserver) this.resizeObserver.disconnect()
    if (this._pulseFrame) cancelAnimationFrame(this._pulseFrame)
  }

  render() {
    const nodes = this.nodesValue
    if (!nodes || nodes.length === 0) return

    const color = this.colorValue
    const seed = this.seedValue
    const w = this.element.clientWidth
    if (w === 0) return

    const h = 80
    const padX = 28
    const padY = 20
    const nodeR = 5.5
    const usableW = w - padX * 2
    const usableH = h - padY * 2
    const rng = this._seededRng(seed)

    // Calculate node positions
    const positions = nodes.map((node, i) => {
      const x = nodes.length === 1
        ? w / 2
        : padX + (i / (nodes.length - 1)) * usableW
      // Slight vertical variation seeded from route id
      const yOffset = (rng() - 0.5) * usableH * 0.45
      const y = h / 2 + yOffset
      return { x, y, ...node }
    })

    // Build SVG
    const ns = "http://www.w3.org/2000/svg"
    const svg = document.createElementNS(ns, "svg")
    svg.setAttribute("width", "100%")
    svg.setAttribute("height", h)
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`)
    svg.style.display = "block"

    const defs = document.createElementNS(ns, "defs")
    svg.appendChild(defs)

    // Build spline path string
    const pathD = this._buildSpline(positions)

    // Shadow path
    const shadowPath = document.createElementNS(ns, "path")
    shadowPath.setAttribute("d", pathD)
    shadowPath.setAttribute("fill", "none")
    shadowPath.setAttribute("stroke", "rgba(28,24,18,0.03)")
    shadowPath.setAttribute("stroke-width", "8")
    shadowPath.setAttribute("stroke-linecap", "round")
    shadowPath.setAttribute("transform", "translate(1,1.5)")
    svg.appendChild(shadowPath)

    // Main path
    const mainPath = document.createElementNS(ns, "path")
    mainPath.setAttribute("d", pathD)
    mainPath.setAttribute("fill", "none")
    mainPath.setAttribute("stroke", color)
    mainPath.setAttribute("stroke-width", "3.5")
    mainPath.setAttribute("stroke-linecap", "round")
    mainPath.setAttribute("opacity", "0.35")
    svg.appendChild(mainPath)

    // Completed portion of path (overlay)
    const lastCompleted = this._lastCompletedIndex(positions)
    if (lastCompleted >= 0) {
      const completedPositions = positions.slice(0, lastCompleted + 1)
      // If there's a current (in_progress) node, include it partially
      const currentIdx = positions.findIndex(p => p.status === "in_progress" || p.status === "available")
      if (currentIdx > 0 && currentIdx > lastCompleted) {
        completedPositions.push(positions[currentIdx])
      }

      if (completedPositions.length >= 2) {
        const completedD = this._buildSpline(completedPositions)
        const completedPath = document.createElementNS(ns, "path")
        completedPath.setAttribute("d", completedD)
        completedPath.setAttribute("fill", "none")
        completedPath.setAttribute("stroke", color)
        completedPath.setAttribute("stroke-width", "3.5")
        completedPath.setAttribute("stroke-linecap", "round")
        completedPath.setAttribute("opacity", "0.8")
        svg.appendChild(completedPath)
      }
    }

    // Nodes
    const pulseElements = []
    positions.forEach((pos, i) => {
      const g = document.createElementNS(ns, "g")

      if (pos.status === "completed") {
        // Glow
        const glow = document.createElementNS(ns, "circle")
        glow.setAttribute("cx", pos.x)
        glow.setAttribute("cy", pos.y)
        glow.setAttribute("r", nodeR + 5)
        glow.setAttribute("fill", color)
        glow.setAttribute("opacity", "0.08")
        g.appendChild(glow)

        // Solid fill
        const circle = document.createElementNS(ns, "circle")
        circle.setAttribute("cx", pos.x)
        circle.setAttribute("cy", pos.y)
        circle.setAttribute("r", nodeR)
        circle.setAttribute("fill", color)
        g.appendChild(circle)

        // White highlight
        const highlight = document.createElementNS(ns, "circle")
        highlight.setAttribute("cx", pos.x - 1.5)
        highlight.setAttribute("cy", pos.y - 1.5)
        highlight.setAttribute("r", 2)
        highlight.setAttribute("fill", "white")
        highlight.setAttribute("opacity", "0.5")
        g.appendChild(highlight)

      } else if (pos.status === "in_progress") {
        // Filled node
        const circle = document.createElementNS(ns, "circle")
        circle.setAttribute("cx", pos.x)
        circle.setAttribute("cy", pos.y)
        circle.setAttribute("r", nodeR)
        circle.setAttribute("fill", color)
        g.appendChild(circle)

        // Pulsing ring
        const ring = document.createElementNS(ns, "circle")
        ring.setAttribute("cx", pos.x)
        ring.setAttribute("cy", pos.y)
        ring.setAttribute("r", nodeR + 4)
        ring.setAttribute("fill", "none")
        ring.setAttribute("stroke", color)
        ring.setAttribute("stroke-width", "1.5")
        ring.setAttribute("opacity", "0.4")
        g.appendChild(ring)
        pulseElements.push(ring)

        // White highlight
        const hl = document.createElementNS(ns, "circle")
        hl.setAttribute("cx", pos.x - 1.2)
        hl.setAttribute("cy", pos.y - 1.2)
        hl.setAttribute("r", 1.8)
        hl.setAttribute("fill", "white")
        hl.setAttribute("opacity", "0.45")
        g.appendChild(hl)

      } else if (pos.status === "available") {
        // Open circle, solid stroke
        const circle = document.createElementNS(ns, "circle")
        circle.setAttribute("cx", pos.x)
        circle.setAttribute("cy", pos.y)
        circle.setAttribute("r", nodeR)
        circle.setAttribute("fill", "#FEFDFB")
        circle.setAttribute("stroke", color)
        circle.setAttribute("stroke-width", "1.5")
        circle.setAttribute("opacity", "0.7")
        g.appendChild(circle)

      } else {
        // Locked: dashed stroke, low opacity
        const circle = document.createElementNS(ns, "circle")
        circle.setAttribute("cx", pos.x)
        circle.setAttribute("cy", pos.y)
        circle.setAttribute("r", nodeR)
        circle.setAttribute("fill", "none")
        circle.setAttribute("stroke", color)
        circle.setAttribute("stroke-width", "1.2")
        circle.setAttribute("stroke-dasharray", "3 3")
        circle.setAttribute("opacity", "0.25")
        g.appendChild(circle)
      }

      // Label below node
      if (pos.label && positions.length <= 12) {
        const text = document.createElementNS(ns, "text")
        text.setAttribute("x", pos.x)
        text.setAttribute("y", pos.y + nodeR + 12)
        text.setAttribute("text-anchor", "middle")
        text.setAttribute("fill", pos.status === "locked" ? "rgba(28,24,18,0.2)" : "#A09889")
        text.setAttribute("font-family", "'DM Sans', sans-serif")
        text.setAttribute("font-size", "8.5")
        text.setAttribute("font-weight", pos.status === "in_progress" ? "600" : "400")

        // Truncate long labels
        const maxLen = Math.max(4, Math.floor(usableW / positions.length / 7))
        const label = pos.label.length > maxLen ? pos.label.slice(0, maxLen - 1) + "…" : pos.label
        text.textContent = label
        g.appendChild(text)
      }

      svg.appendChild(g)
    })

    // Clear and insert
    this.element.innerHTML = ""
    this.element.appendChild(svg)

    // Animate pulse
    if (pulseElements.length > 0) {
      this._animatePulse(pulseElements)
    }
  }

  // --- Private helpers ---

  _buildSpline(pts) {
    if (pts.length < 2) return `M ${pts[0].x} ${pts[0].y}`
    if (pts.length === 2) {
      return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
    }

    // Catmull-Rom to Bézier
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(pts.length - 1, i + 2)]

      const tension = 0.35
      const cp1x = p1.x + (p2.x - p0.x) * tension
      const cp1y = p1.y + (p2.y - p0.y) * tension
      const cp2x = p2.x - (p3.x - p1.x) * tension
      const cp2y = p2.y - (p3.y - p1.y) * tension

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
    }
    return d
  }

  _lastCompletedIndex(positions) {
    let last = -1
    positions.forEach((p, i) => {
      if (p.status === "completed") last = i
    })
    return last
  }

  _seededRng(seed) {
    // Simple mulberry32 PRNG
    let s = seed | 0
    return () => {
      s = (s + 0x6D2B79F5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  _animatePulse(elements) {
    if (this._pulseFrame) cancelAnimationFrame(this._pulseFrame)
    const start = performance.now()
    const animate = (now) => {
      const t = ((now - start) % 2000) / 2000
      const scale = 1 + Math.sin(t * Math.PI * 2) * 0.15
      const opacity = 0.25 + Math.sin(t * Math.PI * 2) * 0.2

      elements.forEach(el => {
        const cx = parseFloat(el.getAttribute("cx"))
        const cy = parseFloat(el.getAttribute("cy"))
        const baseR = 9.5
        el.setAttribute("r", baseR * scale)
        el.setAttribute("opacity", opacity)
      })

      if (this._isConnected) this._pulseFrame = requestAnimationFrame(animate)
    }
    this._pulseFrame = requestAnimationFrame(animate)
  }
}
