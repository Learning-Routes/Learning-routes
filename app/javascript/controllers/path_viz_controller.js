import { Controller } from "@hotwired/stimulus"

// Node data — refined radii: pretty but not overwhelming
const NODES = [
  { id:"n1", label:"Leveling",  tag:"NV1", color:"#8B80C4", side:"left",  note:"Initial diagnosis",  goal:false, sats:[{a:-55,d:1.08,r:46},{a:0,d:1.28,r:44},{a:55,d:1.08,r:46}] },
  { id:"n2", label:"Assessment",  tag:"NV2", color:"#6E9BC8", side:"right", note:"Dynamic assessment",  goal:false, sats:[{a:-50,d:1.12,r:46},{a:50,d:1.12,r:48}] },
  { id:"n3", label:"Multi-Model",tag:"MM",  color:"#B5718E", side:"left",  note:"Multiple approaches",   goal:false, sats:[{a:-55,d:1.12,r:46},{a:0,d:1.3,r:48},{a:55,d:1.08,r:44}] },
  { id:"n4", label:"Reinforcement",    tag:"NV3", color:"#B09848", side:"right", note:"Adaptive",           goal:false, sats:[{a:-50,d:1.16,r:46},{a:50,d:1.16,r:46}] },
  { id:"n5", label:"Final Exam",tag:"EF",  color:"#B06050", side:"left",  note:null,                   goal:false, sats:[{a:-55,d:1.08,r:46},{a:0,d:1.28,r:48},{a:55,d:1.1,r:44}] },
  { id:"n6", label:"Your Goal", tag:null,  color:"#5BA880", side:"right", note:null,                   goal:true,  sats:[{a:-50,d:1.12,r:46},{a:0,d:1.3,r:46},{a:50,d:1.12,r:48}] },
]

const COLORS = { dkT: "#E8E4DC", dkM: "#605848" }
const ROW_H = 580
const FF = "'DM Sans', sans-serif"
const FM = "'DM Mono', monospace"

// Bézier curve between two points
function crv(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  if (Math.abs(dy) < 28)
    return `M${x1} ${y1}C${x1+dx*.3} ${y1+28},${x1+dx*.7} ${y2-26},${x2} ${y2}`
  if (dy < 0)
    return `M${x1} ${y1}C${x1+dx*.55} ${y1+10},${x2-dx*.1} ${y2+Math.abs(dy)*.32},${x2} ${y2}`
  return `M${x1} ${y1}C${x1+dx*.55} ${y1-10},${x2-dx*.1} ${y2-Math.abs(dy)*.32},${x2} ${y2}`
}

// SVG element helper
function el(tag, attrs = {}, children = []) {
  const ns = "http://www.w3.org/2000/svg"
  const e = document.createElementNS(ns, tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) e.setAttribute(k, v)
  }
  for (const c of children) {
    if (typeof c === "string") {
      e.textContent = c
    } else if (c) {
      e.appendChild(c)
    }
  }
  return e
}

// Easing functions
function easeOut(t) { return 1 - (1 - t) ** 3 }
function easeOutBack(t) {
  const c = 1.7
  return 1 + (c + 1) * ((t - 1) ** 3) + c * ((t - 1) ** 2)
}

export default class extends Controller {
  static targets = ["container"]

  connect() {
    this.rows = []
    this.revealed = new Set()
    this.pendingAnimations = new Set()
    this.onResize = this.handleResize.bind(this)
    this.onScroll = this.handleScroll.bind(this)
    window.addEventListener("resize", this.onResize)
    window.addEventListener("scroll", this.onScroll, { passive: true })
    this.buildRows()
    this.handleScroll()
  }

  disconnect() {
    window.removeEventListener("resize", this.onResize)
    window.removeEventListener("scroll", this.onScroll)
    this.pendingAnimations.forEach(id => cancelAnimationFrame(id))
  }

  buildRows() {
    const container = this.containerTarget
    container.innerHTML = ""
    this.rows = []

    NODES.forEach((node, i) => {
      const wrapper = document.createElement("div")
      wrapper.style.cssText = `width:100%;position:relative;height:${ROW_H}px;`
      wrapper.dataset.rowIndex = i

      const svg = el("svg", {
        width: "100%", height: "100%",
        style: "position:absolute;inset:0;overflow:visible",
      })
      wrapper.appendChild(svg)
      container.appendChild(wrapper)
      this.rows.push({ wrapper, svg, node, index: i })
    })

    this.renderAll()
  }

  handleResize() {
    this.renderAll()
    this.rows.forEach((rowData, i) => {
      if (this.revealed.has(i)) this.showInstant(rowData.svg)
    })
  }

  handleScroll() {
    const viewH = window.innerHeight
    this.rows.forEach((rowData, i) => {
      if (this.revealed.has(i)) return
      const rect = rowData.wrapper.getBoundingClientRect()
      if (rect.top < viewH * 0.82) {
        this.revealed.add(i)
        this.animateRow(rowData)
      }
    })
  }

  renderAll() {
    const total = NODES.length
    this.rows.forEach(({ svg, node, index }) => {
      this.renderRow(svg, node, index, total)
    })
  }

  // Layout constants — refined proportions
  layout(svg, node) {
    const w = svg.parentElement.getBoundingClientRect().width || 1200
    const h = ROW_H
    const nr = node.goal ? 76 : 70
    const dir = node.side === "left" ? -1 : 1
    const cx = w / 2
    const cy = h / 2
    const fd = Math.min(w * 0.19, 250)
    const ss = Math.min(w * 0.23, 320)
    const fx = cx + dir * fd
    const fy = cy

    const pts = node.sats.map(s => {
      const rad = s.a * Math.PI / 180
      return {
        x: fx + dir * Math.cos(rad) * ss * s.d,
        y: fy + Math.sin(rad) * ss * s.d,
        r: s.r,
      }
    })

    return { w, h, nr, dir, cx, cy, fx, fy, pts }
  }

  renderRow(svg, node, i, total) {
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const { w, h, nr, dir, cx, cy, fx, fy, pts } = this.layout(svg, node)
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`)

    // --- Defs ---
    const defs = el("defs")

    const blurFilter = el("filter", { id: `b-${node.id}`, x: "-100%", y: "-100%", width: "300%", height: "300%" })
    blurFilter.appendChild(el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "20" }))
    defs.appendChild(blurFilter)

    const innerBlur = el("filter", { id: `ib-${node.id}`, x: "-50%", y: "-50%", width: "200%", height: "200%" })
    innerBlur.appendChild(el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "7" }))
    defs.appendChild(innerBlur)

    const ng = el("radialGradient", { id: `nf-${node.id}`, cx: "50%", cy: "50%" })
    ng.appendChild(el("stop", { offset: "0%", "stop-color": node.color, "stop-opacity": "0.1" }))
    ng.appendChild(el("stop", { offset: "70%", "stop-color": node.color, "stop-opacity": "0.04" }))
    ng.appendChild(el("stop", { offset: "100%", "stop-color": node.color, "stop-opacity": "0" }))
    defs.appendChild(ng)

    pts.forEach((_, j) => {
      const sg = el("radialGradient", { id: `sf-${node.id}-${j}`, cx: "50%", cy: "50%" })
      sg.appendChild(el("stop", { offset: "0%", "stop-color": node.color, "stop-opacity": "0.08" }))
      sg.appendChild(el("stop", { offset: "70%", "stop-color": node.color, "stop-opacity": "0.03" }))
      sg.appendChild(el("stop", { offset: "100%", "stop-color": node.color, "stop-opacity": "0" }))
      defs.appendChild(sg)
    })

    svg.appendChild(defs)

    // --- Spine lines ---
    if (i > 0) {
      svg.appendChild(el("line", {
        x1: cx, y1: 0, x2: cx, y2: cy - nr - 16,
        stroke: COLORS.dkT, "stroke-width": "1", opacity: "0",
        "data-anim": "spine",
      }))
    }
    if (i < total - 1) {
      svg.appendChild(el("line", {
        x1: cx, y1: cy + nr + 16, x2: cx, y2: h,
        stroke: COLORS.dkT, "stroke-width": "1", opacity: "0",
        "data-anim": "spine",
      }))
    }

    // === MAIN NODE — layered for depth ===

    // Ambient glow
    svg.appendChild(el("circle", {
      cx, cy, r: 0,
      fill: node.color, opacity: "0.025", filter: `url(#b-${node.id})`,
      "data-anim": "main-glow", "data-r": nr + 24,
    }))

    // Outer decorative ring (dashed)
    svg.appendChild(el("circle", {
      cx, cy, r: 0,
      fill: "none", stroke: node.color, "stroke-width": "0.6",
      "stroke-dasharray": "4 6", opacity: "0.15",
      "data-anim": "outer-ring", "data-r": nr + 12,
    }))

    // Main circle
    svg.appendChild(el("circle", {
      cx, cy, r: 0,
      fill: `url(#nf-${node.id})`, stroke: node.color,
      "stroke-width": node.goal ? "2" : "1.4",
      "data-anim": "main-circle", "data-r": nr,
    }))

    // Inner glow ring
    svg.appendChild(el("circle", {
      cx, cy, r: 0,
      fill: "none", stroke: node.color, "stroke-width": "0.5",
      opacity: "0.12", filter: `url(#ib-${node.id})`,
      "data-anim": "inner-glow", "data-r": nr - 8,
    }))

    // Inner decorative ring
    svg.appendChild(el("circle", {
      cx, cy, r: 0,
      fill: "none", stroke: node.color, "stroke-width": "0.4",
      opacity: "0.08",
      "data-anim": "inner-ring", "data-r": nr - 16,
    }))

    // Center dot (goal node only)
    if (node.goal) {
      svg.appendChild(el("circle", {
        cx, cy, r: 0,
        fill: node.color, opacity: "0.2",
        "data-anim": "center-dot", "data-r": "4",
      }))
    }

    // Tick marks around outer ring
    const tickCount = node.goal ? 24 : 16
    for (let t = 0; t < tickCount; t++) {
      const angle = (t / tickCount) * Math.PI * 2
      const tickInner = nr + 8
      const tickOuter = nr + 12
      svg.appendChild(el("line", {
        x1: cx + Math.cos(angle) * tickInner,
        y1: cy + Math.sin(angle) * tickInner,
        x2: cx + Math.cos(angle) * tickOuter,
        y2: cy + Math.sin(angle) * tickOuter,
        stroke: node.color, "stroke-width": "0.5", opacity: "0",
        "data-anim": "tick",
      }))
    }

    // Label
    svg.appendChild(el("text", {
      x: cx, y: cy + (node.tag ? -6 : 0),
      "text-anchor": "middle", "dominant-baseline": "central",
      fill: COLORS.dkT, "font-family": FF, "font-weight": "600",
      "font-size": node.goal ? "15" : "12.5", "letter-spacing": "0.3",
      opacity: "0", "data-anim": "label",
    }, [node.label]))

    // Tag
    if (node.tag) {
      svg.appendChild(el("text", {
        x: cx, y: cy + 13,
        "text-anchor": "middle", "dominant-baseline": "central",
        fill: COLORS.dkM, "font-family": FM, "font-size": "8.5", "letter-spacing": "0.5",
        opacity: "0", "data-anim": "label",
      }, [node.tag]))
    }

    // Step number
    svg.appendChild(el("text", {
      x: cx - dir * (nr + 46), y: cy,
      "text-anchor": "middle", "dominant-baseline": "central",
      fill: COLORS.dkM, "font-family": FM, "font-weight": "400", "font-size": "9.5",
      opacity: "0", "data-anim": "step-num",
    }, [String(i + 1).padStart(2, "0")]))

    // Note
    if (node.note) {
      svg.appendChild(el("text", {
        x: cx, y: cy + nr + 32,
        "text-anchor": "middle", "dominant-baseline": "central",
        fill: node.color, "font-family": FM, "font-size": "7.5",
        "letter-spacing": "0.5", opacity: "0", "data-anim": "note",
      }, [node.note]))
    }

    // Connection path
    const ex = cx + dir * (nr + 2)
    const tp = `M${ex} ${cy}C${ex+(fx-ex)*.35} ${cy+8},${ex+(fx-ex)*.65} ${fy-6},${fx} ${fy}`
    svg.appendChild(el("path", {
      d: tp, fill: "none", stroke: node.color, "stroke-width": "1.2", opacity: "0.26",
      "data-anim": "conn-path",
    }))

    // Focal point
    svg.appendChild(el("circle", {
      cx: fx, cy: fy, r: 0,
      fill: node.color, opacity: "0.4",
      "data-anim": "focal", "data-r": "3.5",
    }))

    // === SATELLITES ===
    pts.forEach((p, j) => {
      const pathD = crv(fx, fy, p.x, p.y)

      svg.appendChild(el("path", {
        d: pathD, fill: "none", stroke: node.color, "stroke-width": "1", opacity: "0.2",
        "data-anim": "sat-path", "data-sat": j,
      }))

      svg.appendChild(el("circle", {
        cx: p.x, cy: p.y, r: 0,
        fill: node.color, opacity: "0.02", filter: `url(#b-${node.id})`,
        "data-anim": "sat-glow", "data-sat": j, "data-r": p.r + 14,
      }))

      svg.appendChild(el("circle", {
        cx: p.x, cy: p.y, r: 0,
        fill: "none", stroke: node.color, "stroke-width": "0.5",
        "stroke-dasharray": "3 5", opacity: "0.12",
        "data-anim": "sat-outer-ring", "data-sat": j, "data-r": p.r + 8,
      }))

      svg.appendChild(el("circle", {
        cx: p.x, cy: p.y, r: 0,
        fill: `url(#sf-${node.id}-${j})`, stroke: node.color,
        "stroke-width": "1", opacity: "0.65",
        "data-anim": "sat-circle", "data-sat": j, "data-r": p.r,
      }))

      svg.appendChild(el("circle", {
        cx: p.x, cy: p.y, r: 0,
        fill: "none", stroke: node.color, "stroke-width": "0.3",
        opacity: "0.08",
        "data-anim": "sat-inner-ring", "data-sat": j, "data-r": p.r - 10,
      }))
    })
  }

  // ── Animation sequence ──
  animateRow({ svg }) {
    svg.querySelectorAll("[data-anim='conn-path'], [data-anim='sat-path']").forEach(p => {
      const len = p.getTotalLength()
      p.style.strokeDasharray = len
      p.style.strokeDashoffset = len
    })
    svg.getBoundingClientRect()

    // Main node grows
    this.growRadius(svg.querySelector("[data-anim='main-glow']"), 600, 0)
    this.growRadius(svg.querySelector("[data-anim='outer-ring']"), 550, 40, easeOutBack)
    this.growRadius(svg.querySelector("[data-anim='main-circle']"), 520, 0, easeOutBack)
    this.growRadius(svg.querySelector("[data-anim='inner-glow']"), 480, 60)
    this.growRadius(svg.querySelector("[data-anim='inner-ring']"), 460, 100)
    this.growRadius(svg.querySelector("[data-anim='center-dot']"), 300, 180, easeOutBack)

    // Spine lines
    svg.querySelectorAll("[data-anim='spine']").forEach(s => {
      s.style.transition = "opacity 0.9s ease"
      s.setAttribute("opacity", "0.06")
    })

    // Ticks stagger
    svg.querySelectorAll("[data-anim='tick']").forEach((tick, idx) => {
      setTimeout(() => {
        tick.style.transition = "opacity 0.4s ease"
        tick.setAttribute("opacity", "0.1")
      }, 200 + idx * 15)
    })

    // Labels
    setTimeout(() => {
      svg.querySelectorAll("[data-anim='label']").forEach(t => {
        t.style.transition = "opacity 0.5s ease"
        t.setAttribute("opacity", "1")
      })
    }, 300)

    // Step number
    setTimeout(() => {
      const sn = svg.querySelector("[data-anim='step-num']")
      if (sn) { sn.style.transition = "opacity 0.45s ease"; sn.setAttribute("opacity", "1") }
    }, 380)

    // Connection path draws
    setTimeout(() => {
      const conn = svg.querySelector("[data-anim='conn-path']")
      if (conn) {
        conn.style.transition = "stroke-dashoffset 0.55s cubic-bezier(0.25, 0.1, 0.25, 1)"
        conn.style.strokeDashoffset = "0"
      }
    }, 400)

    // Focal point
    setTimeout(() => {
      this.growRadius(svg.querySelector("[data-anim='focal']"), 200, 0, easeOutBack)
    }, 720)

    // Satellites
    const satPaths = svg.querySelectorAll("[data-anim='sat-path']")
    const satGlows = svg.querySelectorAll("[data-anim='sat-glow']")
    const satOuterRings = svg.querySelectorAll("[data-anim='sat-outer-ring']")
    const satCircles = svg.querySelectorAll("[data-anim='sat-circle']")
    const satInnerRings = svg.querySelectorAll("[data-anim='sat-inner-ring']")

    satPaths.forEach((p, j) => {
      const pathDelay = 780 + j * 180

      setTimeout(() => {
        p.style.transition = "stroke-dashoffset 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)"
        p.style.strokeDashoffset = "0"
      }, pathDelay)

      setTimeout(() => {
        if (satGlows[j]) this.growRadius(satGlows[j], 400, 0)
        if (satOuterRings[j]) this.growRadius(satOuterRings[j], 360, 20, easeOutBack)
        if (satCircles[j]) this.growRadius(satCircles[j], 380, 0, easeOutBack)
        if (satInnerRings[j]) this.growRadius(satInnerRings[j], 340, 60)
      }, pathDelay + 400)
    })

    // Note
    setTimeout(() => {
      const note = svg.querySelector("[data-anim='note']")
      if (note) { note.style.transition = "opacity 0.5s ease"; note.setAttribute("opacity", "0.35") }
    }, 550)
  }

  growRadius(element, duration, delay = 0, easeFn = easeOut) {
    if (!element) return
    const target = +element.dataset.r
    const start = performance.now() + delay

    const tick = (now) => {
      if (now < start) {
        const id = requestAnimationFrame(tick)
        this.pendingAnimations.add(id)
        return
      }
      const t = Math.min((now - start) / duration, 1)
      element.setAttribute("r", Math.max(0, target * easeFn(t)))
      if (t < 1) {
        const id = requestAnimationFrame(tick)
        this.pendingAnimations.add(id)
      }
    }
    const id = requestAnimationFrame(tick)
    this.pendingAnimations.add(id)
  }

  showInstant(svg) {
    svg.querySelectorAll("[data-anim='spine']").forEach(s => s.setAttribute("opacity", "0.06"))
    svg.querySelectorAll("[data-anim='label']").forEach(t => t.setAttribute("opacity", "1"))
    svg.querySelectorAll("[data-anim='tick']").forEach(t => t.setAttribute("opacity", "0.1"))

    const sn = svg.querySelector("[data-anim='step-num']")
    if (sn) sn.setAttribute("opacity", "1")

    const note = svg.querySelector("[data-anim='note']")
    if (note) note.setAttribute("opacity", "0.35")

    ;["main-glow", "main-circle", "outer-ring", "inner-glow", "inner-ring", "center-dot", "focal"].forEach(key => {
      const c = svg.querySelector(`[data-anim='${key}']`)
      if (c) c.setAttribute("r", c.dataset.r)
    })

    svg.querySelectorAll("[data-anim='conn-path'], [data-anim='sat-path']").forEach(p => {
      p.style.strokeDasharray = "none"
      p.style.strokeDashoffset = "0"
    })

    svg.querySelectorAll("[data-anim='sat-glow'], [data-anim='sat-outer-ring'], [data-anim='sat-circle'], [data-anim='sat-inner-ring']").forEach(c => {
      c.setAttribute("r", c.dataset.r)
    })
  }
}
