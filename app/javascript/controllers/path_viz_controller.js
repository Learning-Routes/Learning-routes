import { Controller } from "@hotwired/stimulus"

// ─── Node data ───────────────────────────────────────────────────────────────
const DEFAULT_NODES = [
  {
    id: "n1", label: "Leveling", tag: "NV1", color: "#B0A898",
    side: "left", note: "Initial diagnosis", goal: false,
    sats: [
      { a: -52, d: 1.06, r: 40, topic: "Basics",      desc: "We start by mapping what you already know — no wasted time on things you've mastered." },
      { a: 0,   d: 1.24, r: 38, topic: "Concepts",    desc: "Core concepts are identified so your route focuses on what actually matters." },
      { a: 52,  d: 1.06, r: 40, topic: "Foundations",  desc: "Your foundational knowledge is assessed to build the rest of your route on solid ground." },
    ],
  },
  {
    id: "n2", label: "Assessment", tag: "NV2", color: "#B0A898",
    side: "right", note: "First checkpoint", goal: false,
    sats: [
      { a: -48, d: 1.1, r: 40, topic: "Quiz",     desc: "Short adaptive quizzes that adjust difficulty based on your answers in real time." },
      { a: 48,  d: 1.1, r: 42, topic: "Practice",  desc: "Hands-on exercises that test understanding, not just memorization." },
    ],
  },
  {
    id: "n3", label: "Deep Dive", tag: "MM", color: "#B0A898",
    side: "left", note: "Multi-model content", goal: false,
    sats: [
      { a: -52, d: 1.1,  r: 40, topic: "Theory",     desc: "AI-generated explanations tailored to your level and learning style." },
      { a: 0,   d: 1.28, r: 42, topic: "Examples",    desc: "Real-world examples and code snippets that make abstract concepts click." },
      { a: 52,  d: 1.06, r: 38, topic: "Exercises",   desc: "Progressive exercises that challenge you just enough to keep growing." },
    ],
  },
  {
    id: "n4", label: "Reinforcement", tag: "NV3", color: "#B0A898",
    side: "right", note: "Fill knowledge gaps", goal: false,
    sats: [
      { a: -48, d: 1.14, r: 40, topic: "Review",  desc: "Spaced repetition ensures you retain what you've learned over time." },
      { a: 48,  d: 1.14, r: 40, topic: "Gaps",     desc: "We ask what wasn't clear and generate new micro-routes to fill those gaps." },
    ],
  },
  {
    id: "n5", label: "Final Exam", tag: "EF", color: "#B0A898",
    side: "left", note: "Intensive review", goal: false,
    sats: [
      { a: -52, d: 1.06, r: 40, topic: "Mock",       desc: "Full-length practice exams that simulate the real thing." },
      { a: 0,   d: 1.24, r: 42, topic: "Summary",    desc: "A condensed review of everything you've covered — your personal study guide." },
      { a: 52,  d: 1.1,  r: 38, topic: "Key topics",  desc: "The most important topics highlighted so you know exactly where to focus." },
    ],
  },
  {
    id: "n6", label: "Your Goal", tag: null, color: "#B0A898",
    side: "right", note: "You made it", goal: true,
    sats: [
      { a: -48, d: 1.1,  r: 42, topic: "Mastery",     desc: "You've demonstrated real understanding — not just surface-level knowledge." },
      { a: 0,   d: 1.28, r: 40, topic: "Portfolio",    desc: "Your completed exercises and projects become proof of what you can do." },
      { a: 48,  d: 1.1,  r: 42, topic: "Next level",   desc: "Ready for more? Generate a new route that builds on everything you've achieved." },
    ],
  },
]

// ─── Constants ───────────────────────────────────────────────────────────────
const C    = { dkT: "#E8E4DC", dkM: "#605848", dkS: "#7A7264" }
const ROW  = 500
const FF   = "'DM Sans', sans-serif"
const FM   = "'DM Mono', monospace"
const FADE = "opacity 0.35s ease"

// ─── Helpers ─────────────────────────────────────────────────────────────────
function crv(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  if (Math.abs(dy) < 28)
    return `M${x1} ${y1}C${x1+dx*.3} ${y1+28},${x1+dx*.7} ${y2-26},${x2} ${y2}`
  if (dy < 0)
    return `M${x1} ${y1}C${x1+dx*.55} ${y1+10},${x2-dx*.1} ${y2+Math.abs(dy)*.32},${x2} ${y2}`
  return `M${x1} ${y1}C${x1+dx*.55} ${y1-10},${x2-dx*.1} ${y2-Math.abs(dy)*.32},${x2} ${y2}`
}

function svg(tag, attrs = {}, children = []) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag)
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v)
  for (const c of children) { if (typeof c === "string") e.textContent = c; else if (c) e.appendChild(c) }
  return e
}

function easeOut(t) { return 1 - (1 - t) ** 3 }
function easeOutBack(t) {
  const c = 1.7; return 1 + (c + 1) * ((t - 1) ** 3) + c * ((t - 1) ** 2)
}

// ─── Controller ──────────────────────────────────────────────────────────────
export default class extends Controller {
  static targets = ["container"]
  static values  = { nodes: { type: Array, default: [] }, backLabel: { type: String, default: "Back to satellites" } }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  connect() {
    this.rows = []
    this.revealed = new Set()
    this.rafs = new Set()
    this.timers = new Set()
    this.focusedRow = null           // { rowIndex, satIndex, cardEl }
    this._onResize = this._handleResize.bind(this)
    this._onScroll = this._handleScroll.bind(this)
    window.addEventListener("resize", this._onResize)
    window.addEventListener("scroll", this._onScroll, { passive: true })
    this._buildRows()
    this._handleScroll()
  }

  disconnect() {
    window.removeEventListener("resize", this._onResize)
    window.removeEventListener("scroll", this._onScroll)
    this.rafs.forEach(id => cancelAnimationFrame(id))
    this.timers.forEach(id => clearTimeout(id))
  }

  get nodes() { return this.nodesValue.length ? this.nodesValue : DEFAULT_NODES }

  _timer(fn, ms) {
    const id = setTimeout(() => { this.timers.delete(id); fn() }, ms)
    this.timers.add(id); return id
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  _buildRows() {
    const ct = this.containerTarget; ct.innerHTML = ""; this.rows = []
    this.nodes.forEach((node, i) => {
      const wrap = document.createElement("div")
      wrap.style.cssText = `width:100%;position:relative;height:${ROW}px;`
      wrap.dataset.rowIndex = i
      const s = svg("svg", { width: "100%", height: "100%", style: "position:absolute;inset:0;overflow:visible" })
      wrap.appendChild(s); ct.appendChild(wrap)
      this.rows.push({ wrap, svg: s, node, index: i })
    })
    this._renderAll()
  }

  _handleResize() {
    this._unfocus()
    this._renderAll()
    this.rows.forEach((r, i) => { if (this.revealed.has(i)) this._showInstant(r) })
  }

  _handleScroll() {
    const vh = window.innerHeight
    this.rows.forEach((r, i) => {
      if (this.revealed.has(i)) return
      if (r.wrap.getBoundingClientRect().top < vh * 0.82) { this.revealed.add(i); this._animateRow(r) }
    })
  }

  _renderAll() {
    const total = this.nodes.length
    this.rows.forEach(r => this._renderRow(r, total))
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  _layout(s, node) {
    const w  = s.parentElement.getBoundingClientRect().width || 900
    const nr = node.goal ? 66 : 60
    const dir = node.side === "left" ? -1 : 1
    const cx = w / 2, cy = ROW / 2
    const fx = cx + dir * Math.min(w * 0.15, 180)
    const ss = Math.min(w * 0.18, 220)
    const pts = node.sats.map(sat => {
      const rad = sat.a * Math.PI / 180
      return {
        x: fx + dir * Math.cos(rad) * ss * sat.d,
        y: cy + Math.sin(rad) * ss * sat.d,
        r: sat.r, topic: sat.topic, desc: sat.desc,
      }
    })
    return { w, nr, dir, cx, cy, fx, fy: cy, pts }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  _renderRow(rowData, total) {
    const { svg: s, node, index: i } = rowData
    while (s.firstChild) s.removeChild(s.firstChild)
    const { w, nr, dir, cx, cy, fx, fy, pts } = this._layout(s, node)
    s.setAttribute("viewBox", `0 0 ${w} ${ROW}`)

    // Store layout for focus mode positioning
    rowData.pts = pts
    rowData.layout = { w, nr, dir, cx, cy, fx, fy }

    // ── Defs ──
    const defs = svg("defs")
    const blur = svg("filter", { id: `b-${node.id}`, x: "-100%", y: "-100%", width: "300%", height: "300%" })
    blur.appendChild(svg("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "18" })); defs.appendChild(blur)
    const iblur = svg("filter", { id: `ib-${node.id}`, x: "-50%", y: "-50%", width: "200%", height: "200%" })
    iblur.appendChild(svg("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "7" })); defs.appendChild(iblur)
    const ng = svg("radialGradient", { id: `nf-${node.id}`, cx: "50%", cy: "50%" })
    ng.appendChild(svg("stop", { offset: "0%", "stop-color": node.color, "stop-opacity": "0.1" }))
    ng.appendChild(svg("stop", { offset: "70%", "stop-color": node.color, "stop-opacity": "0.04" }))
    ng.appendChild(svg("stop", { offset: "100%", "stop-color": node.color, "stop-opacity": "0" }))
    defs.appendChild(ng)
    pts.forEach((_, j) => {
      const sg = svg("radialGradient", { id: `sf-${node.id}-${j}`, cx: "50%", cy: "50%" })
      sg.appendChild(svg("stop", { offset: "0%", "stop-color": node.color, "stop-opacity": "0.08" }))
      sg.appendChild(svg("stop", { offset: "70%", "stop-color": node.color, "stop-opacity": "0.03" }))
      sg.appendChild(svg("stop", { offset: "100%", "stop-color": node.color, "stop-opacity": "0" }))
      defs.appendChild(sg)
    })
    s.appendChild(defs)

    // ── Spine ──
    if (i > 0)          s.appendChild(svg("line", { x1: cx, y1: 0, x2: cx, y2: cy - nr - 14, stroke: C.dkT, "stroke-width": "1", opacity: "0", "data-anim": "spine" }))
    if (i < total - 1)  s.appendChild(svg("line", { x1: cx, y1: cy + nr + 14, x2: cx, y2: ROW, stroke: C.dkT, "stroke-width": "1", opacity: "0", "data-anim": "spine" }))

    // ── Main node ──
    s.appendChild(svg("circle", { cx, cy, r: 0, fill: node.color, opacity: "0.025", filter: `url(#b-${node.id})`, "data-anim": "main-glow", "data-r": nr + 22 }))
    s.appendChild(svg("circle", { cx, cy, r: 0, fill: "none", stroke: node.color, "stroke-width": "0.6", "stroke-dasharray": "4 6", opacity: "0.15", "data-anim": "outer-ring", "data-r": nr + 12 }))
    s.appendChild(svg("circle", { cx, cy, r: 0, fill: `url(#nf-${node.id})`, stroke: node.color, "stroke-width": node.goal ? "2" : "1.4", "data-anim": "main-circle", "data-r": nr }))
    s.appendChild(svg("circle", { cx, cy, r: 0, fill: "none", stroke: node.color, "stroke-width": "0.5", opacity: "0.12", filter: `url(#ib-${node.id})`, "data-anim": "inner-glow", "data-r": nr - 8 }))
    s.appendChild(svg("circle", { cx, cy, r: 0, fill: "none", stroke: node.color, "stroke-width": "0.4", opacity: "0.08", "data-anim": "inner-ring", "data-r": nr - 16 }))
    if (node.goal) s.appendChild(svg("circle", { cx, cy, r: 0, fill: node.color, opacity: "0.2", "data-anim": "center-dot", "data-r": "3.5" }))

    // ── Ticks ──
    const tc = node.goal ? 24 : 16
    for (let t = 0; t < tc; t++) {
      const a = (t / tc) * Math.PI * 2, ti = nr + 8, to = nr + 12
      s.appendChild(svg("line", { x1: cx + Math.cos(a)*ti, y1: cy + Math.sin(a)*ti, x2: cx + Math.cos(a)*to, y2: cy + Math.sin(a)*to, stroke: node.color, "stroke-width": "0.5", opacity: "0", "data-anim": "tick" }))
    }

    // ── Labels ──
    s.appendChild(svg("text", { x: cx, y: cy + (node.tag ? -5 : 0), "text-anchor": "middle", "dominant-baseline": "central", fill: C.dkT, "font-family": FF, "font-weight": "600", "font-size": node.goal ? "14" : "12", "letter-spacing": "0.3", opacity: "0", "data-anim": "label" }, [node.label]))
    if (node.tag) s.appendChild(svg("text", { x: cx, y: cy + 12, "text-anchor": "middle", "dominant-baseline": "central", fill: C.dkM, "font-family": FM, "font-size": "8", "letter-spacing": "0.5", opacity: "0", "data-anim": "label" }, [node.tag]))
    s.appendChild(svg("text", { x: cx - dir * (nr + 42), y: cy, "text-anchor": "middle", "dominant-baseline": "central", fill: C.dkM, "font-family": FM, "font-weight": "400", "font-size": "9", opacity: "0", "data-anim": "step-num" }, [String(i + 1).padStart(2, "0")]))
    if (node.note) s.appendChild(svg("text", { x: cx, y: cy + nr + 28, "text-anchor": "middle", "dominant-baseline": "central", fill: node.color, "font-family": FM, "font-size": "7", "letter-spacing": "0.5", opacity: "0", "data-anim": "note" }, [node.note]))

    // ── Connection path → focal ──
    const ex = cx + dir * (nr + 2)
    s.appendChild(svg("path", { d: `M${ex} ${cy}C${ex+(fx-ex)*.35} ${cy+8},${ex+(fx-ex)*.65} ${fy-6},${fx} ${fy}`, fill: "none", stroke: node.color, "stroke-width": "1.2", opacity: "0.25", "data-anim": "conn-path" }))
    s.appendChild(svg("circle", { cx: fx, cy: fy, r: 0, fill: node.color, opacity: "0.4", "data-anim": "focal", "data-r": "3.5" }))

    // ── Satellites ──
    pts.forEach((p, j) => {
      const angle = Math.atan2(fy - p.y, fx - p.x)
      const edgeX = p.x + Math.cos(angle) * p.r
      const edgeY = p.y + Math.sin(angle) * p.r

      // Group all satellite elements so we can fade them as a unit
      const g = svg("g", { "data-sat-group": j })

      g.appendChild(svg("path",   { d: crv(fx, fy, edgeX, edgeY), fill: "none", stroke: node.color, "stroke-width": "1", opacity: "0.2", "data-anim": "sat-path", "data-sat": j }))
      g.appendChild(svg("circle", { cx: p.x, cy: p.y, r: 0, fill: node.color, opacity: "0.02", filter: `url(#b-${node.id})`, "data-anim": "sat-glow", "data-sat": j, "data-r": p.r + 12 }))
      g.appendChild(svg("circle", { cx: p.x, cy: p.y, r: 0, fill: "none", stroke: node.color, "stroke-width": "0.5", "stroke-dasharray": "3 5", opacity: "0.12", "data-anim": "sat-outer-ring", "data-sat": j, "data-r": p.r + 7 }))
      g.appendChild(svg("circle", { cx: p.x, cy: p.y, r: 0, fill: `url(#sf-${node.id}-${j})`, stroke: node.color, "stroke-width": "1", opacity: "0.65", "data-anim": "sat-circle", "data-sat": j, "data-r": p.r }))
      g.appendChild(svg("circle", { cx: p.x, cy: p.y, r: 0, fill: "none", stroke: node.color, "stroke-width": "0.3", opacity: "0.08", "data-anim": "sat-inner-ring", "data-sat": j, "data-r": p.r - 9 }))
      if (p.topic) {
        g.appendChild(svg("text", { x: p.x, y: p.y, "text-anchor": "middle", "dominant-baseline": "central", fill: C.dkS, "font-family": FM, "font-size": "7", "letter-spacing": "0.3", opacity: "0", "data-anim": "sat-label", "data-sat": j }, [p.topic]))
      }

      // Hit area
      const hit = svg("circle", { cx: p.x, cy: p.y, r: p.r + 5, fill: "transparent", cursor: "pointer", "data-anim": "sat-hit", "data-sat": j })
      hit.addEventListener("click", (e) => { e.stopPropagation(); this._focusSatellite(rowData, j) })
      hit.addEventListener("mouseenter", () => this._hoverSat(s, j, true))
      hit.addEventListener("mouseleave", () => this._hoverSat(s, j, false))
      g.appendChild(hit)

      s.appendChild(g)
    })
  }

  // ── Hover effect ──────────────────────────────────────────────────────────
  _hoverSat(s, j, on) {
    if (this.focusedRow) return // no hover while focused
    const ring  = s.querySelector(`[data-anim='sat-circle'][data-sat='${j}']`)
    const label = s.querySelector(`[data-anim='sat-label'][data-sat='${j}']`)
    if (ring) {
      ring.style.transition = "stroke-width 0.2s ease, opacity 0.2s ease"
      ring.setAttribute("stroke-width", on ? "1.8" : "1")
      ring.setAttribute("opacity", on ? "0.85" : "0.65")
    }
    if (label) {
      label.style.transition = "opacity 0.2s ease"
      label.setAttribute("opacity", on ? "0.9" : "0.55")
    }
  }

  // ── Focus mode: click a satellite → isolate it + show info card ───────────
  _focusSatellite(rowData, satIndex) {
    // If already focused on this one, unfocus
    if (this.focusedRow && this.focusedRow.rowIndex === rowData.index && this.focusedRow.satIndex === satIndex) {
      this._unfocus(); return
    }
    this._unfocus() // clear any prior focus

    const { svg: s, node, pts, wrap, layout } = rowData
    const p = pts[satIndex]
    const satCount = node.sats.length

    // 1. Dim non-focused satellites
    for (let j = 0; j < satCount; j++) {
      const g = s.querySelector(`[data-sat-group='${j}']`)
      if (!g) continue
      g.style.transition = FADE
      g.style.opacity = j === satIndex ? "1" : "0.08"
    }

    // 2. Brighten the focused satellite
    const ring  = s.querySelector(`[data-anim='sat-circle'][data-sat='${satIndex}']`)
    const label = s.querySelector(`[data-anim='sat-label'][data-sat='${satIndex}']`)
    if (ring) { ring.style.transition = FADE; ring.setAttribute("stroke-width", "1.8"); ring.setAttribute("opacity", "0.9") }
    if (label) { label.style.transition = FADE; label.setAttribute("opacity", "1") }

    // 3. Create the info card as HTML inside the wrapper
    const card = this._createInfoCard(p, node.color, layout, s, rowData)
    wrap.appendChild(card)

    // 4. Trigger enter animation on next frame
    requestAnimationFrame(() => {
      card.style.opacity = "1"
      card.style.transform = "translateY(0)"
    })

    this.focusedRow = { rowIndex: rowData.index, satIndex, cardEl: card, rowData }
  }

  _unfocus() {
    if (!this.focusedRow) return
    const { rowData, cardEl, satIndex } = this.focusedRow
    const { svg: s, node } = rowData

    // Restore all satellite groups
    const satCount = node.sats.length
    for (let j = 0; j < satCount; j++) {
      const g = s.querySelector(`[data-sat-group='${j}']`)
      if (!g) continue
      g.style.transition = FADE
      g.style.opacity = "1"
    }

    // Reset the focused satellite's highlight
    const ring  = s.querySelector(`[data-anim='sat-circle'][data-sat='${satIndex}']`)
    const label = s.querySelector(`[data-anim='sat-label'][data-sat='${satIndex}']`)
    if (ring) { ring.setAttribute("stroke-width", "1"); ring.setAttribute("opacity", "0.65") }
    if (label) { label.setAttribute("opacity", "0.55") }

    // Animate card out then remove
    if (cardEl) {
      cardEl.style.transition = "opacity 0.25s ease, transform 0.25s ease"
      cardEl.style.opacity = "0"
      cardEl.style.transform = "translateY(8px)"
      setTimeout(() => cardEl.remove(), 260)
    }

    this.focusedRow = null
  }

  _createInfoCard(point, color, layout, svgEl, rowData) {
    const svgRect = svgEl.getBoundingClientRect()
    const wrapRect = rowData.wrap.getBoundingClientRect()
    const svgW = svgEl.viewBox.baseVal.width || svgRect.width
    const scale = svgRect.width / svgW

    // Convert SVG coords → wrapper-relative pixel coords
    const pxX = (point.x * scale) + (svgRect.left - wrapRect.left)
    const pxY = (point.y * scale) + (svgRect.top - wrapRect.top)
    const pxR = point.r * scale

    // Decide card placement: position below satellite, centered
    const card = document.createElement("div")
    card.style.cssText = `
      position: absolute;
      left: ${pxX}px;
      top: ${pxY + pxR + 16}px;
      transform: translateY(8px);
      opacity: 0;
      transition: opacity 0.35s cubic-bezier(0.16,1,0.3,1), transform 0.35s cubic-bezier(0.16,1,0.3,1);
      z-index: 20;
      pointer-events: auto;
      width: 260px;
      margin-left: -130px;
    `

    card.innerHTML = `
      <div style="
        background: rgba(30,26,20,0.96);
        border: 1px solid rgba(176,168,152,0.12);
        border-radius: 14px;
        padding: 1.25rem 1.35rem 1rem;
        backdrop-filter: blur(16px);
        box-shadow: 0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,250,240,0.02);
      ">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.6rem;">
          <span style="
            font-family: ${FM}; font-size: 0.62rem; letter-spacing: 1.2px;
            text-transform: uppercase; color: ${color}; opacity: 0.6;
          ">${rowData.node.label}</span>
          <span style="
            font-family: ${FM}; font-size: 0.58rem; letter-spacing: 0.5px;
            color: ${C.dkM};
          ">${rowData.node.tag || ''}</span>
        </div>
        <p style="
          font-family: ${FF}; font-weight: 600; font-size: 0.88rem;
          color: #E8E4DC; margin: 0 0 0.5rem 0; letter-spacing: -0.2px;
          line-height: 1.3;
        ">${point.topic}</p>
        <p style="
          font-family: ${FF}; font-size: 0.78rem; line-height: 1.65;
          color: #A09889; margin: 0 0 1rem 0;
        ">${point.desc}</p>
        <button data-back style="
          display: inline-flex; align-items: center; gap: 0.4rem;
          font-family: ${FM}; font-size: 0.65rem; letter-spacing: 0.5px;
          color: ${C.dkS}; background: rgba(176,168,152,0.08);
          border: 1px solid rgba(176,168,152,0.1); border-radius: 8px;
          padding: 0.4rem 0.85rem; cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease;
        ">
          <span style="font-size:0.8rem;">&#8592;</span> ${this.backLabelValue}
        </button>
      </div>
    `

    // Back button handler
    card.querySelector("[data-back]").addEventListener("click", (e) => {
      e.stopPropagation()
      this._unfocus()
    })

    // Hover effect on back button
    const btn = card.querySelector("[data-back]")
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(176,168,152,0.15)"; btn.style.color = "#E8E4DC" })
    btn.addEventListener("mouseleave", () => { btn.style.background = "rgba(176,168,152,0.08)"; btn.style.color = C.dkS })

    return card
  }

  // ── Entry animation ───────────────────────────────────────────────────────
  _animateRow(rowData) {
    const s = rowData.svg

    // Prepare path strokes
    s.querySelectorAll("[data-anim='conn-path'], [data-anim='sat-path']").forEach(p => {
      const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len
    })
    s.getBoundingClientRect()

    // Main node
    this._grow(s.querySelector("[data-anim='main-glow']"), 600, 0)
    this._grow(s.querySelector("[data-anim='outer-ring']"), 550, 40, easeOutBack)
    this._grow(s.querySelector("[data-anim='main-circle']"), 520, 0, easeOutBack)
    this._grow(s.querySelector("[data-anim='inner-glow']"), 480, 60)
    this._grow(s.querySelector("[data-anim='inner-ring']"), 460, 100)
    this._grow(s.querySelector("[data-anim='center-dot']"), 300, 180, easeOutBack)

    // Spine
    s.querySelectorAll("[data-anim='spine']").forEach(l => { l.style.transition = "opacity 0.9s ease"; l.setAttribute("opacity", "0.06") })

    // Ticks
    s.querySelectorAll("[data-anim='tick']").forEach((t, i) => {
      this._timer(() => { t.style.transition = "opacity 0.4s ease"; t.setAttribute("opacity", "0.1") }, 200 + i * 15)
    })

    // Labels
    this._timer(() => { s.querySelectorAll("[data-anim='label']").forEach(t => { t.style.transition = "opacity 0.5s ease"; t.setAttribute("opacity", "1") }) }, 300)
    this._timer(() => { const sn = s.querySelector("[data-anim='step-num']"); if (sn) { sn.style.transition = "opacity 0.45s ease"; sn.setAttribute("opacity", "1") } }, 380)

    // Connection → focal
    this._timer(() => { const c = s.querySelector("[data-anim='conn-path']"); if (c) { c.style.transition = "stroke-dashoffset 0.55s cubic-bezier(0.25,0.1,0.25,1)"; c.style.strokeDashoffset = "0" } }, 400)
    this._timer(() => { this._grow(s.querySelector("[data-anim='focal']"), 200, 0, easeOutBack) }, 720)

    // Satellites
    const sp  = s.querySelectorAll("[data-anim='sat-path']")
    const sg  = s.querySelectorAll("[data-anim='sat-glow']")
    const sor = s.querySelectorAll("[data-anim='sat-outer-ring']")
    const sc  = s.querySelectorAll("[data-anim='sat-circle']")
    const sir = s.querySelectorAll("[data-anim='sat-inner-ring']")
    const sl  = s.querySelectorAll("[data-anim='sat-label']")

    sp.forEach((p, j) => {
      const d = 780 + j * 180
      this._timer(() => { p.style.transition = "stroke-dashoffset 0.6s cubic-bezier(0.25,0.1,0.25,1)"; p.style.strokeDashoffset = "0" }, d)
      this._timer(() => {
        if (sg[j])  this._grow(sg[j], 400, 0)
        if (sor[j]) this._grow(sor[j], 360, 20, easeOutBack)
        if (sc[j])  this._grow(sc[j], 380, 0, easeOutBack)
        if (sir[j]) this._grow(sir[j], 340, 60)
      }, d + 400)
      this._timer(() => { if (sl[j]) { sl[j].style.transition = "opacity 0.45s ease"; sl[j].setAttribute("opacity", "0.55") } }, d + 650)
    })

    // Note
    this._timer(() => { const n = s.querySelector("[data-anim='note']"); if (n) { n.style.transition = "opacity 0.5s ease"; n.setAttribute("opacity", "0.35") } }, 550)
  }

  _grow(el, dur, delay = 0, ease = easeOut) {
    if (!el) return
    const target = +el.dataset.r, start = performance.now() + delay
    const tick = (now) => {
      if (now < start) { const id = requestAnimationFrame(tick); this.rafs.add(id); return }
      const t = Math.min((now - start) / dur, 1)
      el.setAttribute("r", Math.max(0, target * ease(t)))
      if (t < 1) { const id = requestAnimationFrame(tick); this.rafs.add(id) }
    }
    const id = requestAnimationFrame(tick); this.rafs.add(id)
  }

  _showInstant(rowData) {
    const s = rowData.svg
    s.querySelectorAll("[data-anim='spine']").forEach(l => l.setAttribute("opacity", "0.06"))
    s.querySelectorAll("[data-anim='label']").forEach(t => t.setAttribute("opacity", "1"))
    s.querySelectorAll("[data-anim='tick']").forEach(t => t.setAttribute("opacity", "0.1"))
    const sn = s.querySelector("[data-anim='step-num']"); if (sn) sn.setAttribute("opacity", "1")
    const note = s.querySelector("[data-anim='note']"); if (note) note.setAttribute("opacity", "0.35")
    ;["main-glow","main-circle","outer-ring","inner-glow","inner-ring","center-dot","focal"].forEach(k => {
      const c = s.querySelector(`[data-anim='${k}']`); if (c) c.setAttribute("r", c.dataset.r)
    })
    s.querySelectorAll("[data-anim='conn-path'], [data-anim='sat-path']").forEach(p => { p.style.strokeDasharray = "none"; p.style.strokeDashoffset = "0" })
    s.querySelectorAll("[data-anim='sat-glow'], [data-anim='sat-outer-ring'], [data-anim='sat-circle'], [data-anim='sat-inner-ring']").forEach(c => c.setAttribute("r", c.dataset.r))
    s.querySelectorAll("[data-anim='sat-label']").forEach(t => t.setAttribute("opacity", "0.55"))
  }
}
