import { Controller } from "@hotwired/stimulus"

/**
 * Expanded Route Overlay Controller
 *
 * Full-screen dark overlay with interactive SVG node visualization.
 * Opens when clicking a route card. Left column shows all steps,
 * center shows selected step large with orbital ring, right shows satellites.
 * ESC / click-outside to close.
 */

const NS = "http://www.w3.org/2000/svg"
const FF = "'DM Sans', sans-serif"
const FM = "'DM Mono', monospace"

// Flowing S-curve between two points. `sway` controls how much the curve bows out (0–1).
function crv(x1, y1, x2, y2, sway = 0.55) {
  const dx = x2 - x1, dy = y2 - y1
  const sign = dy >= 0 ? 1 : -1
  const ady = Math.abs(dy)
  // Control points sweep outward for a smooth S-shape
  const cx1 = x1 + dx * 0.42
  const cy1 = y1 + sign * ady * sway * 0.1
  const cx2 = x2 - dx * 0.25
  const cy2 = y2 - sign * ady * sway * 0.35
  return `M${x1} ${y1}C${cx1} ${cy1},${cx2} ${cy2},${x2} ${y2}`
}

function svg(tag, attrs = {}, children = []) {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) e.setAttribute(k, v)
  }
  for (const c of children) {
    if (typeof c === "string") e.textContent = c
    else if (c) e.appendChild(c)
  }
  return e
}

function esc(str) {
  const d = document.createElement("div")
  d.textContent = str || ""
  return d.innerHTML
}

function trunc(str, max) {
  if (!str) return ""
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str
}

export default class extends Controller {
  static targets = ["overlay", "backdrop", "content", "headerText", "svgWrap", "footerText", "actionBtn"]
  static values = { i18n: { type: Object, default: {} } }

  connect() {
    this._onEsc = (e) => { if (e.key === "Escape") this.close() }
    this._isOpen = false
    this._pendingTimeouts = new Set()
    this._svgRoot = null
  }

  disconnect() {
    document.removeEventListener("keydown", this._onEsc)
    document.body.style.overflow = ""
    this._pendingTimeouts.forEach(id => clearTimeout(id))
    if (this._svgRoot && this._onNodeClick) {
      this._svgRoot.removeEventListener("click", this._onNodeClick)
    }
    this._svgRoot = null
    // Restore navbar and main z-index if overlay was open when disconnected
    if (this._isOpen) {
      const navbar = document.querySelector("nav[data-controller='app-nav']")
      if (navbar) navbar.style.display = ""
      const main = document.getElementById("main-content")
      if (main && this._mainZIndex !== undefined) main.style.zIndex = this._mainZIndex
    }
  }

  _setTimeout(fn, delay) {
    const id = setTimeout(() => { this._pendingTimeouts.delete(id); fn() }, delay)
    this._pendingTimeouts.add(id)
    return id
  }

  // --- Actions ---

  open(event) {
    event.preventDefault()
    event.stopPropagation()
    const json = event.currentTarget.dataset.route
    if (!json) return

    this.routeData = JSON.parse(json)
    this.selectedIndex = this._initialIndex()
    if (this.hasActionBtnTarget && this.routeData.route_path) {
      this.actionBtnTarget.href = this.routeData.route_path
    }
    this._show()
    document.addEventListener("keydown", this._onEsc)
    document.body.style.overflow = "hidden"
  }

  close() {
    if (!this._isOpen) return
    this._hide()
    document.removeEventListener("keydown", this._onEsc)
    document.body.style.overflow = ""
  }

  clickBackdrop(event) {
    if (event.target === this.backdropTarget) this.close()
  }

  // --- Open / Close animation ---

  _show() {
    const overlay = this.overlayTarget
    const backdrop = this.backdropTarget
    const content = this.contentTarget

    // Hide the navbar so the overlay gets full screen
    const navbar = document.querySelector("nav[data-controller='app-nav']")
    if (navbar) navbar.style.display = "none"

    // Remove <main> z-index so the fixed overlay escapes its stacking context
    const main = document.getElementById("main-content")
    if (main) { this._mainZIndex = main.style.zIndex; main.style.zIndex = "auto" }

    overlay.style.display = "block"
    this._renderAll()

    requestAnimationFrame(() => {
      backdrop.style.transition = "background 0.4s ease"
      backdrop.style.background = "rgba(28,25,18,0.97)"
      content.style.transition = "opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s"
      content.style.opacity = "1"
      content.style.transform = "translateY(0)"
    })
    this._isOpen = true
  }

  _hide() {
    const backdrop = this.backdropTarget
    const content = this.contentTarget

    backdrop.style.transition = "background 0.3s ease"
    backdrop.style.background = "rgba(28,25,18,0)"
    content.style.transition = "opacity 0.25s ease, transform 0.25s ease"
    content.style.opacity = "0"
    content.style.transform = "translateY(12px)"

    // Show the navbar again
    const navbar = document.querySelector("nav[data-controller='app-nav']")
    if (navbar) navbar.style.display = ""

    // Restore <main> z-index
    const main = document.getElementById("main-content")
    if (main && this._mainZIndex !== undefined) main.style.zIndex = this._mainZIndex

    this._setTimeout(() => {
      this.overlayTarget.style.display = "none"
      this.svgWrapTarget.innerHTML = ""
    }, 350)
    this._isOpen = false
  }

  // --- Initial selected index ---

  _initialIndex() {
    const nodes = this.routeData.nodes
    let idx = nodes.findIndex(n => n.status === "in_progress")
    if (idx >= 0) return idx
    idx = nodes.findIndex(n => n.status === "available")
    if (idx >= 0) return idx
    return 0
  }

  // --- Render all sections ---

  _renderAll() {
    this._renderHeader()
    this._renderSVG()
    this._renderFooter()
  }

  _renderHeader() {
    const i18n = this.i18nValue || {}
    const d = this.routeData
    const completed = d.nodes.filter(n => n.status === "completed").length
    this.headerTextTarget.innerHTML =
      `<span style="font-family:${FM};font-size:0.65rem;font-weight:600;color:#B09848;text-transform:uppercase;letter-spacing:0.15em;">${esc(i18n.label || "ROUTE")}</span>` +
      `<h2 style="font-family:${FF};font-weight:700;font-size:2rem;color:#E8E4DC;margin:0.3rem 0 0.4rem;letter-spacing:-0.3px;">${esc(d.title)}</h2>` +
      `<p style="font-family:${FF};font-size:0.82rem;color:#908880;margin:0;">${esc(d.subject_area)} &middot; ${(i18n.steps_of || "__completed__ of __total__ steps").replace("__completed__", completed).replace("__total__", d.total_steps)}</p>`
  }

  _renderFooter() {
    const i18n = this.i18nValue || {}
    const node = this.routeData.nodes[this.selectedIndex]
    if (!node) return
    const sameLevel = this.routeData.nodes.filter(n => n.level === node.level).length
    let h = ""
    if (node.status === "completed")
      h += `<span style="font-family:${FM};font-size:0.72rem;color:#5BA880;margin-right:1.5rem;">\u2713 ${esc(i18n.step_completed || "Step completed")}</span>`
    h += `<span style="font-family:${FM};font-size:0.68rem;color:rgba(255,255,255,0.15);">${(i18n.topics_at_level || "__count__ topics at this level").replace("__count__", sameLevel)}</span>`
    h += `<span style="font-family:${FM};font-size:0.68rem;color:rgba(255,255,255,0.15);margin-left:1.5rem;">${esc(i18n.click_to_navigate || "Click nodes to navigate")}</span>`
    this.footerTextTarget.innerHTML = h
  }

  // --- SVG Rendering ---

  _renderSVG() {
    const i18n = this.i18nValue || {}
    const wrap = this.svgWrapTarget
    wrap.innerHTML = ""

    const d = this.routeData
    const nodes = d.nodes
    const color = d.color
    const sel = this.selectedIndex

    if (!nodes || nodes.length === 0) return

    const rect = wrap.getBoundingClientRect()
    const W = Math.max(rect.width || 900, 600)
    const H = Math.max(rect.height || 500, 380)

    const leftX = W * 0.13
    const cX = W * 0.46
    const cY = H * 0.5
    const cR = Math.min(W * 0.09, H * 0.14, 80)
    const satBase = cR * 2.4

    const root = svg("svg", { width: "100%", height: "100%", viewBox: `0 0 ${W} ${H}`, style: "display:block;" })

    // --- Defs ---
    const defs = svg("defs")
    const cGlow = svg("radialGradient", { id: "er-cg", cx: "50%", cy: "50%", r: "50%" })
    cGlow.appendChild(svg("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.12" }))
    cGlow.appendChild(svg("stop", { offset: "70%", "stop-color": color, "stop-opacity": "0.03" }))
    cGlow.appendChild(svg("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0" }))
    defs.appendChild(cGlow)
    const blur = svg("filter", { id: "er-bl", x: "-100%", y: "-100%", width: "300%", height: "300%" })
    blur.appendChild(svg("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "12" }))
    defs.appendChild(blur)
    root.appendChild(defs)

    // --- Left node positions ---
    const padY = H * 0.08
    const leftPos = nodes.map((n, i) => ({
      x: leftX,
      y: nodes.length === 1 ? H / 2 : padY + (i / (nodes.length - 1)) * (H - padY * 2),
      ...n, index: i
    }))

    // --- Satellite positions ---
    const selNode = nodes[sel] || nodes[0]
    const sats = selNode.satellites || []
    const spread = Math.PI * 0.7
    const startA = -spread / 2
    const satPos = sats.map((label, i) => {
      const a = sats.length === 1 ? 0 : startA + (i / (sats.length - 1)) * spread
      const dist = satBase + (i % 2 === 0 ? 0 : satBase * 0.12)
      const r = 38 + (i % 3) * 8
      return { x: cX + Math.cos(a) * dist, y: cY + Math.sin(a) * dist, r, label }
    })

    // === CONNECTIONS (back layer) ===

    // Left → Center: each connection arrives at a different angle around the center circle
    leftPos.forEach((lp, i) => {
      const active = i === sel
      const nodeR = active ? 28 : 16
      // Spread arrival angles around left hemisphere of center circle (-110° to -250°)
      const t = nodes.length === 1 ? 0.5 : i / (nodes.length - 1)
      const arrivalAngle = Math.PI + (t - 0.5) * Math.PI * 0.8 // ~144° to ~216°
      const ax = cX + Math.cos(arrivalAngle) * (cR + 6)
      const ay = cY + Math.sin(arrivalAngle) * (cR + 6)
      const startX = lp.x + nodeR + 4
      // Vary sway per node for organic feel
      const sway = 0.4 + (i % 3) * 0.15
      root.appendChild(svg("path", {
        d: crv(startX, lp.y, ax, ay, sway),
        fill: "none",
        stroke: active ? color : "white",
        "stroke-width": active ? "1.5" : "0.8",
        opacity: active ? "0.35" : "0.06",
        "data-anim": "conn",
        "data-delay": String(0.3 + i * 0.04)
      }))
    })

    // Center → Satellites: organic curves that bow outward
    satPos.forEach((sp, i) => {
      // Departure point on center circle toward satellite
      const angle = Math.atan2(sp.y - cY, sp.x - cX)
      const sx = cX + Math.cos(angle) * (cR + 4)
      const sy = cY + Math.sin(angle) * (cR + 4)
      // Arrival point on satellite circle
      const backAngle = Math.atan2(cY - sp.y, cX - sp.x)
      const ex = sp.x + Math.cos(backAngle) * (sp.r + 2)
      const ey = sp.y + Math.sin(backAngle) * (sp.r + 2)
      // Perpendicular bow for curvature
      const mx = (sx + ex) / 2, my = (sy + ey) / 2
      const perpX = -(ey - sy), perpY = ex - sx
      const pLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1
      const bow = 25 + (i % 2) * 15
      const sign = i % 2 === 0 ? 1 : -1
      const cx1 = mx + (perpX / pLen) * bow * sign
      const cy1 = my + (perpY / pLen) * bow * sign
      root.appendChild(svg("path", {
        d: `M${sx} ${sy}Q${cx1} ${cy1},${ex} ${ey}`,
        fill: "none", stroke: "white", "stroke-width": "0.8", opacity: "0.08",
        "data-anim": "conn", "data-delay": String(0.5 + i * 0.06)
      }))
      // Midpoint dot along the curve
      const dotX = 0.25 * sx + 0.5 * cx1 + 0.25 * ex
      const dotY = 0.25 * sy + 0.5 * cy1 + 0.25 * ey
      root.appendChild(svg("circle", { cx: dotX, cy: dotY, r: "2", fill: color, opacity: "0.2", "data-anim": "dot" }))
    })

    // === CENTER NODE ===
    // Radial glow
    root.appendChild(svg("circle", { cx: cX, cy: cY, r: cR + 35, fill: "url(#er-cg)", "data-anim": "cfade" }))

    // Rotating orbital
    const orbG = svg("g")
    const orb = svg("circle", {
      cx: cX, cy: cY, r: cR + 16, fill: "none",
      stroke: color, "stroke-width": "0.6", "stroke-dasharray": "4 6", opacity: "0.2"
    })
    orb.appendChild(svg("animateTransform", {
      attributeName: "transform", type: "rotate",
      from: `0 ${cX} ${cY}`, to: `360 ${cX} ${cY}`, dur: "40s", repeatCount: "indefinite"
    }))
    orbG.appendChild(orb)
    root.appendChild(orbG)

    // Main circle
    root.appendChild(svg("circle", {
      cx: cX, cy: cY, r: cR,
      fill: `${color}0A`, stroke: color, "stroke-width": "1.5", "data-anim": "cfade"
    }))

    // Center label
    root.appendChild(svg("text", {
      x: cX, y: cY - (selNode.level ? 6 : 0),
      "text-anchor": "middle", "dominant-baseline": "central",
      fill: "#E8E4DC", "font-family": FF, "font-weight": "700", "font-size": "16",
      "data-anim": "cfade"
    }, [trunc(selNode.label, 22)]))

    // NV tag
    if (selNode.level) {
      const lvl = selNode.level.replace("nv", "")
      root.appendChild(svg("text", {
        x: cX, y: cY + 14, "text-anchor": "middle", "dominant-baseline": "central",
        fill: color, "font-family": FM, "font-size": "10", "letter-spacing": "0.5", opacity: "0.7",
        "data-anim": "cfade"
      }, [`NV${lvl}`]))
    }

    // "Etapa actual" label
    if (selNode.status === "in_progress") {
      root.appendChild(svg("text", {
        x: cX, y: cY + 30, "text-anchor": "middle", "dominant-baseline": "central",
        fill: "rgba(255,255,255,0.3)", "font-family": FM, "font-size": "10",
        "data-anim": "cfade"
      }, [i18n.current_step || "Current step"]))
    }

    // Content type tag below center
    if (selNode.content_type) {
      root.appendChild(svg("text", {
        x: cX, y: cY + cR + 24, "text-anchor": "middle", "dominant-baseline": "central",
        fill: "rgba(255,255,255,0.12)", "font-family": FM, "font-size": "9", "letter-spacing": "0.8",
        "data-anim": "cfade"
      }, [selNode.content_type.toUpperCase()]))
    }

    // === SATELLITES ===
    satPos.forEach((sp, i) => {
      // Glow
      root.appendChild(svg("circle", {
        cx: sp.x, cy: sp.y, r: sp.r + 10,
        fill: color, opacity: "0.025", filter: "url(#er-bl)",
        "data-anim": "sfade", "data-delay": String(0.6 + i * 0.08)
      }))
      // Circle
      root.appendChild(svg("circle", {
        cx: sp.x, cy: sp.y, r: sp.r,
        fill: `${color}06`, stroke: color, "stroke-width": "0.7", opacity: "0.35",
        "data-anim": "sfade", "data-delay": String(0.6 + i * 0.08)
      }))
      // Label
      root.appendChild(svg("text", {
        x: sp.x, y: sp.y, "text-anchor": "middle", "dominant-baseline": "central",
        fill: "rgba(255,255,255,0.45)", "font-family": FF, "font-weight": "500", "font-size": "10.5",
        "data-anim": "sfade", "data-delay": String(0.7 + i * 0.08)
      }, [trunc(sp.label, 15)]))
    })

    // === LEFT COLUMN NODES ===
    leftPos.forEach((lp, i) => {
      const isSel = i === sel
      const isComp = lp.status === "completed"
      const isLocked = lp.status === "locked"
      const isIP = lp.status === "in_progress"
      const nR = isSel ? 28 : 16

      const g = svg("g", { style: "cursor:pointer;", "data-node-index": i })

      if (isSel) {
        // Active glow
        g.appendChild(svg("circle", { cx: lp.x, cy: lp.y, r: nR + 10, fill: color, opacity: "0.04" }))
        // Main circle
        g.appendChild(svg("circle", { cx: lp.x, cy: lp.y, r: nR, fill: `${color}0A`, stroke: color, "stroke-width": "2" }))
        // Orbital
        const so = svg("circle", {
          cx: lp.x, cy: lp.y, r: nR + 6, fill: "none",
          stroke: color, "stroke-width": "0.5", "stroke-dasharray": "3 4", opacity: "0.3"
        })
        so.appendChild(svg("animateTransform", {
          attributeName: "transform", type: "rotate",
          from: `0 ${lp.x} ${lp.y}`, to: `360 ${lp.x} ${lp.y}`, dur: "30s", repeatCount: "indefinite"
        }))
        g.appendChild(so)
        // Number
        g.appendChild(svg("text", {
          x: lp.x, y: lp.y, "text-anchor": "middle", "dominant-baseline": "central",
          fill: color, "font-family": FM, "font-size": "11", "font-weight": "500"
        }, [String(i + 1)]))

      } else if (isComp) {
        g.appendChild(svg("circle", { cx: lp.x, cy: lp.y, r: nR, fill: "none", stroke: color, "stroke-width": "1.5", opacity: "0.5" }))
        // Checkmark
        const s = 5
        g.appendChild(svg("path", {
          d: `M${lp.x - s} ${lp.y}L${lp.x - s / 3} ${lp.y + s * .7}L${lp.x + s} ${lp.y - s * .5}`,
          fill: "none", stroke: color, "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", opacity: "0.5"
        }))

      } else if (isLocked) {
        g.appendChild(svg("circle", {
          cx: lp.x, cy: lp.y, r: nR, fill: "none",
          stroke: color, "stroke-width": "1", "stroke-dasharray": "3 3", opacity: "0.25"
        }))
        g.appendChild(svg("text", {
          x: lp.x, y: lp.y, "text-anchor": "middle", "dominant-baseline": "central",
          fill: "rgba(255,255,255,0.15)", "font-family": FM, "font-size": "9"
        }, [String(i + 1)]))

      } else {
        // Available / in_progress (not selected)
        g.appendChild(svg("circle", {
          cx: lp.x, cy: lp.y, r: nR, fill: isIP ? `${color}0A` : "none",
          stroke: color, "stroke-width": "1.5", opacity: "0.6"
        }))
        g.appendChild(svg("text", {
          x: lp.x, y: lp.y, "text-anchor": "middle", "dominant-baseline": "central",
          fill: "rgba(255,255,255,0.3)", "font-family": FM, "font-size": "9"
        }, [String(i + 1)]))
      }

      // Label below node
      g.appendChild(svg("text", {
        x: lp.x, y: lp.y + nR + 14, "text-anchor": "middle",
        fill: isSel ? "#E8E4DC" : (isLocked ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.4)"),
        "font-family": FF, "font-size": "10", "font-weight": isSel ? "600" : "400"
      }, [trunc(lp.label, 13)]))

      root.appendChild(g)
    })

    this._svgRoot = root
    wrap.appendChild(root)

    // Event delegation for node clicks
    this._onNodeClick = (e) => {
      let t = e.target
      while (t && t !== root) {
        if (t.dataset && t.dataset.nodeIndex !== undefined) {
          const idx = parseInt(t.dataset.nodeIndex, 10)
          if (!isNaN(idx) && idx !== this.selectedIndex) {
            this.selectedIndex = idx
            this._renderAll()
          }
          return
        }
        t = t.parentElement
      }
    }
    root.addEventListener("click", this._onNodeClick)

    // Staggered enter animations
    this._animateEnter(root)
  }

  _animateEnter(root) {
    // Connection lines: draw in
    root.querySelectorAll("[data-anim='conn']").forEach(path => {
      try {
        const len = path.getTotalLength()
        path.style.strokeDasharray = len
        path.style.strokeDashoffset = len
        const delay = parseFloat(path.dataset.delay || 0) * 1000
        this._setTimeout(() => {
          path.style.transition = "stroke-dashoffset 0.6s cubic-bezier(0.25,0.1,0.25,1)"
          path.style.strokeDashoffset = "0"
        }, delay)
      } catch (_) { /* path may have zero length */ }
    })

    // Center elements: fade in
    root.querySelectorAll("[data-anim='cfade']").forEach(el => {
      const orig = el.getAttribute("opacity") || "1"
      el.style.opacity = "0"
      this._setTimeout(() => {
        el.style.transition = "opacity 0.5s ease"
        el.style.opacity = orig === "1" ? "" : orig
        if (orig === "1") el.style.removeProperty("opacity")
      }, 280)
    })

    // Satellites: fade in with stagger
    root.querySelectorAll("[data-anim='sfade']").forEach(el => {
      const orig = el.getAttribute("opacity") || "1"
      el.setAttribute("opacity", "0")
      const delay = parseFloat(el.dataset.delay || 0) * 1000
      this._setTimeout(() => {
        el.style.transition = "opacity 0.45s ease"
        el.setAttribute("opacity", orig)
      }, delay)
    })

    // Dots: pop in
    root.querySelectorAll("[data-anim='dot']").forEach(el => {
      el.setAttribute("opacity", "0")
      this._setTimeout(() => {
        el.style.transition = "opacity 0.4s ease"
        el.setAttribute("opacity", "0.2")
      }, 600)
    })
  }
}
