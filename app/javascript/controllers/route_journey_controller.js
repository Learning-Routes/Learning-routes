import { Controller } from "@hotwired/stimulus"

// -- Constants ----------------------------------------------------------------
const NS = "http://www.w3.org/2000/svg"
const FF = "'Manrope', sans-serif"
const FM = "'JetBrains Mono', monospace"
const FS = "'Instrument Serif', serif"

const STAGE_H = 650 // height per stage section
const CONN_H  = 180
const HEADER_H = 280
const VIEW_BOX = 480
const HALF     = VIEW_BOX / 2

// -- Math helpers -------------------------------------------------------------
function clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, v)) }
function lerp(a, b, t) { return a + (b - a) * clamp(t) }
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }

// Approximate cubic bezier path length via sampling
function bezierLength(x0, y0, cp1x, cp1y, cp2x, cp2y, x1, y1, steps = 32) {
  let len = 0, px = x0, py = y0
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    const x = u*u*u*x0 + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*x1
    const y = u*u*u*y0 + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*y1
    len += Math.sqrt((x - px) ** 2 + (y - py) ** 2)
    px = x; py = y
  }
  return len
}

// -- SVG factory --------------------------------------------------------------
function svg(tag, attrs = {}, children = []) {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue
    el.setAttribute(k, v)
  }
  for (const c of children) {
    if (typeof c === "string") el.appendChild(document.createTextNode(c))
    else if (c) el.appendChild(c)
  }
  return el
}

// -- Satellite positions ------------------------------------------------------
function getSatPositions(count, stageIdx) {
  const positions = []
  const arcSpan = Math.PI * 0.9
  const startAngle = -Math.PI / 2 - arcSpan / 2
  for (let i = 0; i < count; i++) {
    const angle = count === 1 ? -Math.PI / 2 : startAngle + (i / (count - 1)) * arcSpan
    const dist = 185 + (Math.sin(stageIdx * 3 + i * 7) * 0.5 + 0.5) * 30
    positions.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist })
  }
  return positions
}

// =============================================================================
export default class extends Controller {
  static targets = ["header", "stage", "stageGlow", "stageSvg", "lockedLabel",
                     "connector", "rail", "railDot"]
  static values  = { stages: Array }

  connect() {
    this._scrollEl = this.element
    this._raf = null
    this._loaded = false
    this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    this._stageSatellites = new Map()
    this._satListeners = [] // track satellite event listeners for cleanup

    // Read theme colors from CSS vars
    this._readThemeColors()

    // Build SVGs for each stage
    this._buildAllStages()
    // Build connector SVGs
    this._buildAllConnectors()

    // Scroll handler
    this._onScroll = this._handleScroll.bind(this)
    this._scrollEl.addEventListener("scroll", this._onScroll, { passive: true })

    // Initial render
    requestAnimationFrame(() => {
      this._loaded = true
      this._handleScroll()
    })

    // Responsive: hide rail on small screens
    this._mql = window.matchMedia("(max-width: 640px)")
    this._onMediaChange = () => { if (this.hasRailTarget) this.railTarget.style.display = this._mql.matches ? "none" : "flex" }
    this._mql.addEventListener("change", this._onMediaChange)
    this._onMediaChange()
  }

  disconnect() {
    this._scrollEl.removeEventListener("scroll", this._onScroll)
    if (this._raf) cancelAnimationFrame(this._raf)
    this._mql.removeEventListener("change", this._onMediaChange)
    // Clean up satellite event listeners
    for (const { el, event, fn } of this._satListeners) {
      el.removeEventListener(event, fn)
    }
    this._satListeners = []
    this._stageSatellites.clear()
  }

  // -- Read theme colors from CSS custom properties ---------------------------
  _readThemeColors() {
    const style = getComputedStyle(document.documentElement)
    const get = (prop) => style.getPropertyValue(prop).trim()

    this._C = {
      text: get("--color-txt") || "#F0EDE6",
      muted: get("--color-muted") || "#6B6560",
      faint: get("--color-faint") || "#2E2B27",
    }

    // Contrast RGB for semi-transparent overlays (white in dark, dark in light)
    this._contrastRgb = get("--journey-contrast-rgb") || "255, 255, 255"
    // Alpha multiplier: light theme needs ~5x stronger alphas for visibility
    this._alphaMult = parseFloat(get("--journey-alpha-mult")) || 1
    // Opacity multiplier: for accent-colored SVG elements (light needs ~2.5x)
    this._opMult = parseFloat(get("--journey-opacity-mult")) || 1
  }

  // Helper: rgba using contrast color (applies theme-aware alpha multiplier)
  _rgba(alpha) {
    const a = Math.min(alpha * this._alphaMult, 0.85)
    return `rgba(${this._contrastRgb}, ${a})`
  }

  // Helper: opacity for accent-colored elements (applies theme-aware multiplier)
  _op(val) {
    return Math.min(val * this._opMult, 0.85)
  }

  // -- Build stage SVGs -------------------------------------------------------
  _buildAllStages() {
    const stages = this.stagesValue
    this.stageSvgTargets.forEach((wrapper, i) => {
      const stage = stages[i]
      if (!stage) return
      this._buildStageSvg(wrapper, stage, i)
    })
  }

  _buildStageSvg(wrapper, stage, stageIdx) {
    const locked = stage.status === "locked"
    const isCurrent = stage.status === "current"
    const topics = stage.topics || []
    const satPositions = getSatPositions(topics.length, stageIdx)
    const color = stage.color || "#B0A898"

    // Create SVG element
    const svgEl = svg("svg", {
      width: VIEW_BOX, height: VIEW_BOX,
      viewBox: `${-HALF} ${-HALF} ${VIEW_BOX} ${VIEW_BOX}`,
      style: "position:absolute; inset:0; overflow:visible; max-width:100%;",
    })

    // Defs: radial gradient
    const gradId = `sg-${stageIdx}`
    const defs = svg("defs", {}, [
      svg("radialGradient", { id: gradId }, [
        svg("stop", { offset: "0%", "stop-color": color, "stop-opacity": locked ? 0.015 : 0.05 }),
        svg("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0" }),
      ]),
    ])
    svgEl.appendChild(defs)

    // Background glow circle
    svgEl.appendChild(svg("circle", { cx: 0, cy: 0, r: 160, fill: `url(#${gradId})` }))

    // Rotating dashed orbit ring (only if unlocked)
    if (!locked) {
      const orbit = svg("circle", {
        cx: 0, cy: 0, r: 62, fill: "none", stroke: color, "stroke-width": "0.3",
        opacity: isCurrent ? this._op(0.1) : this._op(0.04), "stroke-dasharray": "2 7",
      })
      if (!this._reducedMotion) {
        const anim = svg("animateTransform", {
          attributeName: "transform", type: "rotate",
          values: `0 0 0;${stageIdx % 2 === 0 ? 360 : -360} 0 0`,
          dur: "40s", repeatCount: "indefinite",
        })
        orbit.appendChild(anim)
      }
      svgEl.appendChild(orbit)
    }

    // Main center circle
    svgEl.appendChild(svg("circle", {
      cx: 0, cy: 0, r: 52,
      fill: isCurrent ? this._rgba(0.008) : this._rgba(0.003),
      stroke: locked ? this._rgba(0.03) : color,
      "stroke-width": isCurrent ? 1.2 : (locked ? 0.4 : 0.7),
      "stroke-dasharray": locked ? "5 7" : "",
      opacity: locked ? this._op(0.1) : (isCurrent ? this._op(0.5) : this._op(0.25)),
    }))

    // Progress arc on center (current stage only)
    if (isCurrent && topics.some(t => t.progress > 0)) {
      const avg = Math.round(topics.reduce((a, t) => a + t.progress, 0) / topics.length)
      const circ = 2 * Math.PI * 52
      svgEl.appendChild(svg("circle", {
        cx: 0, cy: 0, r: 52, fill: "none", stroke: color, "stroke-width": "2",
        "stroke-dasharray": `${(avg / 100) * circ} ${circ}`,
        "stroke-linecap": "round", opacity: this._op(0.22), transform: "rotate(-90)",
      }))
    }

    // Pulsing ring (current stage only)
    if (isCurrent && !this._reducedMotion) {
      const pulse = svg("circle", {
        cx: 0, cy: 0, r: 55, fill: "none", stroke: color,
        "stroke-width": "0.5", opacity: this._op(0.1),
      })
      pulse.appendChild(svg("animate", { attributeName: "r", values: "54;62;54", dur: "3.5s", repeatCount: "indefinite" }))
      pulse.appendChild(svg("animate", { attributeName: "opacity", values: `${this._op(0.1)};${this._op(0.02)};${this._op(0.1)}`, dur: "3.5s", repeatCount: "indefinite" }))
      svgEl.appendChild(pulse)
    }

    // Curves from center to satellites
    satPositions.forEach((pos, j) => {
      const len = Math.sqrt(pos.x * pos.x + pos.y * pos.y)
      const ex = (pos.x / len) * 52
      const ey = (pos.y / len) * 52
      const cp1x = ex + (pos.x - ex) * 0.28 + (pos.y > 0 ? 18 : -18)
      const cp1y = ey + (pos.y - ey) * 0.28
      const cp2x = ex + (pos.x - ex) * 0.62
      const cp2y = ey + (pos.y - ey) * 0.62

      svgEl.appendChild(svg("path", {
        d: `M ${ex} ${ey} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pos.x} ${pos.y}`,
        stroke: locked ? this._rgba(0.012) : this._rgba(0.04),
        "stroke-width": "0.6", fill: "none", "stroke-linecap": "round",
        "data-curve-idx": j,
        style: "transition: stroke 0.3s, stroke-width 0.3s;",
      }))
    })

    wrapper.appendChild(svgEl)

    // Center label (HTML overlay)
    const centerLabel = document.createElement("div")
    centerLabel.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; z-index:5; pointer-events:none;"

    if (locked) {
      centerLabel.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="opacity:0.6" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="${this._rgba(0.07)}" stroke-width="1.5"/>
        <path d="M8 11V7a4 4 0 118 0v4" stroke="${this._rgba(0.07)}" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`
    } else {
      centerLabel.innerHTML = `
        <div style="font-family:${FS}; font-size:1.05rem; font-style:italic; color:${this._C.text};">${this._escHtml(stage.label || "")}</div>
        <div style="font-family:${FM}; font-size:0.48rem; color:${color}; opacity:${this._op(0.4)}; margin-top:3px;">${this._escHtml(stage.tag || "")}</div>
      `
    }
    wrapper.appendChild(centerLabel)

    // Satellite topic circles (HTML overlays for clickability)
    satPositions.forEach((pos, j) => {
      const topic = topics[j]
      if (!topic) return
      const done = topic.progress === 100
      const inProg = topic.progress > 0 && topic.progress < 100
      const r = 40 + (Math.sin(stageIdx * 5 + j * 9) * 0.5 + 0.5) * 8

      // Outer container
      const sat = document.createElement(locked ? "div" : "a")
      if (!locked && topic.path) sat.href = topic.path
      sat.setAttribute("data-sat-idx", j)
      sat.setAttribute("data-stage-idx", stageIdx)
      sat.style.cssText = `position:absolute; left:calc(50% + ${pos.x}px - ${r}px); top:calc(50% + ${pos.y}px - ${r}px); width:${r * 2}px; height:${r * 2}px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:${locked ? "default" : "pointer"}; z-index:10; text-decoration:none; opacity:0; transform:scale(0.5); transition:opacity 0.4s, transform 0.4s;`
      sat.setAttribute("aria-label", topic.name)

      // Rings SVG
      const ringSize = r * 2 + 10
      const ringSvg = svg("svg", {
        width: ringSize, height: ringSize,
        viewBox: `0 0 ${ringSize} ${ringSize}`,
        style: "position:absolute; inset:-5px; overflow:visible;",
      })

      if (!locked && done) {
        ringSvg.appendChild(svg("circle", {
          cx: r + 5, cy: r + 5, r: r, fill: "none",
          stroke: color, "stroke-width": "1.2", opacity: this._op(0.14),
        }))
      }
      if (!locked && inProg) {
        const circ = 2 * Math.PI * r
        ringSvg.appendChild(svg("circle", {
          cx: r + 5, cy: r + 5, r: r, fill: "none",
          stroke: color, "stroke-width": "2",
          "stroke-dasharray": `${(topic.progress / 100) * circ} ${circ}`,
          "stroke-linecap": "round", opacity: this._op(0.3),
          transform: `rotate(-90 ${r + 5} ${r + 5})`,
        }))
      }
      sat.appendChild(ringSvg)

      // Background circle
      const bgDiv = document.createElement("div")
      bgDiv.style.cssText = `position:absolute; inset:0; border-radius:50%; background:${this._rgba(0.004)}; border:1px solid ${locked ? this._rgba(0.02) : this._rgba(0.045)}; transition:all 0.3s;`
      bgDiv.setAttribute("data-sat-bg", "")
      sat.appendChild(bgDiv)

      // Content
      const content = document.createElement("div")
      content.style.cssText = "position:relative; z-index:2; text-align:center; display:flex; flex-direction:column; align-items:center; gap:3px; padding:0 8px;"

      const nameSpan = document.createElement("span")
      nameSpan.style.cssText = `font-family:${FF}; font-size:0.7rem; font-weight:600; color:${locked ? this._rgba(0.06) : this._rgba(0.3)}; line-height:1.2; transition:color 0.3s; max-width:${r * 2 - 16}px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;`
      nameSpan.textContent = topic.name
      content.appendChild(nameSpan)

      if (!locked && inProg) {
        const progSpan = document.createElement("span")
        progSpan.style.cssText = `font-family:${FM}; font-size:0.5rem; font-weight:500; color:${color}; opacity:${this._op(0.35)}; transition:opacity 0.3s;`
        progSpan.textContent = `${topic.progress}%`
        content.appendChild(progSpan)
      }

      if (!locked && done) {
        const check = document.createElementNS(NS, "svg")
        check.setAttribute("width", "12")
        check.setAttribute("height", "12")
        check.setAttribute("viewBox", "0 0 16 16")
        check.setAttribute("fill", "none")
        check.style.cssText = `opacity:${this._op(0.25)}; transition:opacity 0.3s;`
        const path = document.createElementNS(NS, "path")
        path.setAttribute("d", "M3 8.5L6.5 12L13 4")
        path.setAttribute("stroke", color)
        path.setAttribute("stroke-width", "2")
        path.setAttribute("stroke-linecap", "round")
        path.setAttribute("stroke-linejoin", "round")
        check.appendChild(path)
        content.appendChild(check)
      }

      sat.appendChild(content)

      // Hover + focus effects
      if (!locked) {
        const defaultBg = this._rgba(0.004)
        const defaultBorder = this._rgba(0.045)
        const defaultNameColor = this._rgba(0.3)
        const defaultCurveStroke = this._rgba(0.04)
        const highlight = () => {
          bgDiv.style.background = this._rgba(0.018)
          bgDiv.style.borderColor = `${color}30`
          nameSpan.style.color = this._C.text
          const curve = wrapper.querySelector(`[data-curve-idx="${j}"]`)
          if (curve) { curve.setAttribute("stroke", color); curve.setAttribute("stroke-width", "1.2") }
        }
        const unhighlight = () => {
          bgDiv.style.background = defaultBg
          bgDiv.style.borderColor = defaultBorder
          nameSpan.style.color = defaultNameColor
          const curve = wrapper.querySelector(`[data-curve-idx="${j}"]`)
          if (curve) { curve.setAttribute("stroke", defaultCurveStroke); curve.setAttribute("stroke-width", "0.6") }
        }
        sat.addEventListener("mouseenter", highlight)
        sat.addEventListener("mouseleave", unhighlight)
        sat.addEventListener("focus", highlight)
        sat.addEventListener("blur", unhighlight)
        this._satListeners.push(
          { el: sat, event: "mouseenter", fn: highlight },
          { el: sat, event: "mouseleave", fn: unhighlight },
          { el: sat, event: "focus", fn: highlight },
          { el: sat, event: "blur", fn: unhighlight },
        )
      }

      wrapper.appendChild(sat)
    })

    // Store satellite refs for scroll-based visibility
    this._stageSatellites.set(stageIdx, wrapper.querySelectorAll("[data-sat-idx]"))
  }

  // -- Build connector SVGs ---------------------------------------------------
  _buildAllConnectors() {
    this._connectorLengths = []
    this.connectorTargets.forEach((el, i) => {
      const color = el.dataset.connectorColor
      const locked = el.dataset.connectorLocked === "true"
      const h = CONN_H

      // Compute actual bezier path length
      const cp1x = 12, cp1y = h * 0.3, cp2x = 48, cp2y = h * 0.7
      const pathLen = bezierLength(30, 0, cp1x, cp1y, cp2x, cp2y, 30, h)
      this._connectorLengths.push(pathLen)

      const svgEl = svg("svg", { width: 60, height: h, viewBox: `0 0 60 ${h}`, style: "overflow:visible;" })
      const pathD = `M 30 0 C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, 30 ${h}`

      // Background dashed path
      svgEl.appendChild(svg("path", {
        d: pathD, stroke: this._rgba(0.02), "stroke-width": "1",
        fill: "none", "stroke-dasharray": "4 6",
      }))

      // Progress path
      const progPath = svg("path", {
        d: pathD,
        stroke: locked ? this._rgba(0.015) : color,
        "stroke-width": "1.5", fill: "none", "stroke-linecap": "round",
        opacity: locked ? this._op(0.15) : this._op(0.22),
        "stroke-dasharray": `0 ${pathLen}`,
      })
      progPath.setAttribute("data-connector-progress", "")
      svgEl.appendChild(progPath)

      // Moving dot (only for active connectors)
      if (!locked) {
        const dot = svg("circle", { r: 2, fill: color, opacity: "0" })
        dot.setAttribute("data-connector-dot", "")
        if (!this._reducedMotion) {
          dot.appendChild(svg("animateMotion", { dur: "3.5s", repeatCount: "indefinite", path: pathD }))
        }
        svgEl.appendChild(dot)
      }

      el.appendChild(svgEl)
    })
  }

  // -- Scroll handler ---------------------------------------------------------
  _handleScroll() {
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = requestAnimationFrame(() => this._updateScroll())
  }

  _updateScroll() {
    const scrollY = this._scrollEl.scrollTop
    const vh = window.innerHeight
    const vc = scrollY + vh * 0.44
    const stages = this.stagesValue

    // Header parallax
    if (this.hasHeaderTarget) {
      const headerOpacity = this._loaded ? lerp(1, 0, clamp(scrollY / 180)) : 0
      const headerY = this._loaded ? -scrollY * 0.25 : 16
      this.headerTarget.style.opacity = headerOpacity
      if (!this._reducedMotion) {
        this.headerTarget.style.transform = `translateY(${headerY}px)`
      }
    }

    // Per-stage transforms (fixed position math, no getBoundingClientRect)
    this.stageTargets.forEach((stageEl, i) => {
      const stageStart = HEADER_H + i * (STAGE_H + CONN_H)
      const stageEnd = stageStart + STAGE_H

      const approachT = clamp((vc - (stageStart - 200)) / 400)
      const leaveT = clamp((vc - stageEnd) / 280)
      const inView = vc > stageStart - 200 && vc < stageEnd + 220
      const scale = inView ? lerp(0.6, 1, ease(approachT)) * lerp(1, 0.75, ease(leaveT)) : 0.6
      const opacity = inView ? lerp(0, 1, ease(approachT)) * lerp(1, 0.1, ease(leaveT)) : 0

      // SVG wrapper
      const svgWrapper = this.stageSvgTargets[i]
      if (svgWrapper) {
        const locked = stages[i]?.status === "locked"
        if (!this._reducedMotion) {
          svgWrapper.style.transform = `scale(${scale})`
        }
        svgWrapper.style.opacity = opacity
        svgWrapper.style.filter = locked ? "saturate(0.06)" : "none"

        // Satellite visibility
        const sats = this._stageSatellites.get(i)
        if (sats) {
          sats.forEach(sat => {
            const show = opacity > 0.25
            sat.style.opacity = show ? 1 : 0
            sat.style.transform = `scale(${show ? 1 : 0.5})`
          })
        }
      }

      // Glow
      if (this.stageGlowTargets[i]) {
        this.stageGlowTargets[i].style.opacity = opacity
      }

      // Locked label
      const lockedLabels = this.lockedLabelTargets
      const stageData = stages[i]
      if (stageData?.status === "locked") {
        const labelIdx = stages.slice(0, i + 1).filter(s => s.status === "locked").length - 1
        if (lockedLabels[labelIdx]) {
          lockedLabels[labelIdx].style.opacity = opacity * 0.4
        }
      }

      // Connector progress
      if (i < this.connectorTargets.length) {
        const connEl = this.connectorTargets[i]
        const connectorProgress = clamp((vc - stageEnd) / CONN_H)
        const pathLen = this._connectorLengths[i] || 190
        const progPath = connEl.querySelector("[data-connector-progress]")
        if (progPath) {
          progPath.setAttribute("stroke-dasharray", `${connectorProgress * pathLen} ${pathLen}`)
        }
        const dot = connEl.querySelector("[data-connector-dot]")
        if (dot) {
          dot.setAttribute("opacity", connectorProgress > 0.1 && connectorProgress < 0.95 ? this._op(0.35) : "0")
        }
      }

      // Rail dots
      if (this.railDotTargets[i]) {
        const active = inView && opacity > 0.45
        const dotEl = this.railDotTargets[i]
        dotEl.style.width = active ? "9px" : "5px"
        dotEl.style.height = active ? "9px" : "5px"
        dotEl.style.opacity = active ? this._op(0.7) : (stages[i]?.status === "locked" ? this._op(0.06) : this._op(0.15))
        dotEl.style.boxShadow = active ? `0 0 8px ${stages[i]?.color}28` : "none"
        if (active) dotEl.setAttribute("aria-current", "true")
        else dotEl.removeAttribute("aria-current")
      }
    })
  }

  // -- Rail dot click -> scroll to stage --------------------------------------
  scrollToStage(event) {
    const idx = parseInt(event.currentTarget.dataset.stageIndex, 10)
    if (isNaN(idx)) return
    const target = this.stageTargets[idx]
    if (target) {
      target.scrollIntoView({ behavior: this._reducedMotion ? "auto" : "smooth", block: "center" })
      target.setAttribute("tabindex", "-1")
      target.focus({ preventScroll: true })
    }
  }

  // -- Utility ----------------------------------------------------------------
  _escHtml(str) {
    const d = document.createElement("div")
    d.textContent = str
    return d.innerHTML
  }
}
