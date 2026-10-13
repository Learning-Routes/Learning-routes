import { Controller } from "@hotwired/stimulus"
import { buildTree, layoutJourney, DEFAULTS } from "journey_map_layout"
import { safeRect, fitCamera, centerOn, zoomAbout, ensureVisible, initialCamera } from "journey_camera"
import { buildPaths } from "journey_map_paths"
import { contours } from "journey_terrain"

// WP-37 / WP-37b — the journey as a pannable, zoomable map. Geometry lives in
// journey_map_layout.js, what is drawn in journey_map_paths.js, the contours in
// journey_terrain.js and camera math in journey_camera.js, all pure and tested
// under node; this controller renders their output and wires events, nothing else.
//
// Colours are CSS custom properties (var(--…)), never values read once at
// mount: a theme toggle repaints with no re-render.

// Brief §2.4: the prototype's options. labelLines is 2, the prototype's value:
// at 3 the production shape's title and first module no longer open together
// at 1440 × 1000 above the legible floor (§5.4), and the popover carries every
// full title (census in WP37B_HANDOFF.md).
const OPTIONS = Object.freeze({
  ...DEFAULTS,
  labelWidth: 124, labelLineHeight: 16, labelLines: 2, labelGap: 8, moduleLabelWidth: 160,
  rootWidth: 420, rootHeight: 64, rootGap: 52, rootX: 18,
  moduleDiameter: 52, stepDiameter: 44, reinforcementDiameter: 28,
  cellGap: 16, rowGap: 36, gutter: 84, moduleGap: 76,
  fanGutter: 20, fanGap: 8, fanRowGap: 20, rowSize: 4, fanRowSize: 3, wave: 16
})
const PANEL_PAD = 18
const TERRAIN_PAD = 700
const MIN_LABEL_PX = 12
const SVG_NS = "http://www.w3.org/2000/svg"
const DRAG_THRESHOLD = 4
const KEY_PAN = 60
const KEY_ZOOM = 1.2
const HOVER_OPEN_MS = 90
const HOVER_CLOSE_MS = 120
const ENTRANCE_MS = 2600
const DIAMETER = { module: OPTIONS.moduleDiameter, step: OPTIONS.stepDiameter, reinforcement: OPTIONS.reinforcementDiameter }

const ICON = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" data-lock-glyph><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
}

const levelVar = (level) => `var(--color-node-${level || "nv1"})`
const fill = (template, values) => String(template).replace(/%\{(\w+)\}/g, (_, k) => (k in values ? values[k] : ""))
const inflate = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p })

export default class extends Controller {
  static targets = ["viewport", "world", "terrain", "edges", "nodes", "root", "pop", "card"]
  static values = { stages: Array, root: Object, labels: Object, unlockPath: String }

  connect() {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    // Turbo restores a CACHED copy of this page on Back, already marked ready and
    // with the elements this controller built last time still in it. Clear before
    // drawing, or the map is drawn twice; and do not replay the entrance.
    const restored = this.element.dataset.journeyReady === "true"
    this.tree = buildTree(this.rootValue, this.stagesValue)
    this.layout = layoutJourney(this.tree, OPTIONS)
    this.nodeById = new Map(this.layout.nodes.map((n) => [n.id, n]))
    this.current = this.layout.nodes.find((n) => n.topic && n.topic.current) || null
    this.paths = buildPaths(this.layout, this.tree, this.current ? this.current.topic.id : null,
                            { gutter: OPTIONS.gutter, reinforcementDiameter: OPTIONS.reinforcementDiameter, panelPad: PANEL_PAD })
    this.worldTarget.style.setProperty("--jm-lines", OPTIONS.labelLines)

    this.terrainTarget.replaceChildren()
    this.edgesTarget.replaceChildren()
    this.nodesTarget.querySelectorAll(".jm-node, .jm-chip, .jm-unlock").forEach((el) => el.remove())
    this._renderTerrain()
    this._renderEdges()
    this._renderNodes()

    const safe = this._safe()
    this.minScale = MIN_LABEL_PX / OPTIONS.labelFontPx
    this._updateZoomRange(safe)
    this.camera = this._initialCamera(safe)
    this.userMoved = false
    this._apply(false)

    const enter = !restored && !this.reduced.matches
    this.worldTarget.classList.toggle("jm-world--enter", enter)
    if (enter) this.enterTimer = setTimeout(() => this.worldTarget.classList.remove("jm-world--enter"), ENTRANCE_MS)

    this._bind()
    this.resizeObserver = new ResizeObserver(() => this._onResize())
    this.resizeObserver.observe(this.viewportTarget)
    this.element.dataset.journeyReady = "true"
  }

  disconnect() {
    this.resizeObserver?.disconnect()
    clearTimeout(this.enterTimer)
    clearTimeout(this.popTimer)
    this.worldTarget.classList.remove("jm-world--enter")
    this._hidePop()
    const vp = this.viewportTarget
    vp.removeEventListener("pointerdown", this.onPointerDown)
    vp.removeEventListener("pointermove", this.onPointerMove)
    vp.removeEventListener("pointerup", this.onPointerUp)
    vp.removeEventListener("pointercancel", this.onPointerUp)
    vp.removeEventListener("wheel", this.onWheel)
    vp.removeEventListener("keydown", this.onKeyDown)
    vp.removeEventListener("focusin", this.onFocusIn)
    vp.removeEventListener("focusout", this.onFocusOut)
    vp.removeEventListener("click", this.onClickCapture, true)
    vp.removeEventListener("click", this.onClick)
    vp.removeEventListener("dblclick", this.onDoubleClick)
    vp.removeEventListener("pointerover", this.onPointerOver)
    vp.removeEventListener("pointerout", this.onPointerOut)
  }

  // ── Actions ──────────────────────────────────────────────────────────
  // Fit means the WHOLE route in the viewport it has now — never clamped by a
  // zoom floor computed for a different viewport.
  fit() {
    const safe = this._safe()
    this._updateZoomRange(safe)
    this._userMove(fitCamera(this.layout.bounds, safe, { padding: 32, min: 0.01, max: 1 }), true)
  }

  zoomIn() { this._zoomCenter(KEY_ZOOM) }
  zoomOut() { this._zoomCenter(1 / KEY_ZOOM) }

  // Brief §5.1: centre the current step, never zoomed out past 1.
  locate() {
    if (!this.current) return
    this._userMove(centerOn({ x: this.current.cx, y: this.current.cy }, this._safe(), Math.max(this.camera.k, 1)), true)
  }

  _focusModule(moduleNodeId) {
    const mod = this.layout.modules.find((m) => m.id === moduleNodeId)
    if (!mod) return
    this._userMove(fitCamera(inflate(mod.box, PANEL_PAD), this._safe(), { padding: 32, min: this.zoomRange.min, max: 1 }), true)
  }

  // ── Rendering ────────────────────────────────────────────────────────
  _svg(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    if (parent) parent.appendChild(el)
    return el
  }

  // An svg covering `box` in world coordinates, drawing 1:1 with the nodes layer.
  _frame(svg, box) {
    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`)
    svg.setAttribute("width", box.w)
    svg.setAttribute("height", box.h)
    Object.assign(svg.style, { left: `${box.x}px`, top: `${box.y}px` })
  }

  _renderTerrain() {
    const rect = inflate(this.layout.bounds, TERRAIN_PAD)
    this._frame(this.terrainTarget, rect)
    for (const d of contours(rect)) if (d) this._svg("path", { d }, this.terrainTarget)
  }

  _renderEdges() {
    const svg = this.edgesTarget
    const p = this.paths
    this._frame(svg, inflate(this.layout.bounds, PANEL_PAD * 2))

    for (const panel of p.panels) {
      const b = panel.box
      this._svg("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 22, class: "jm-panel" }, svg)
      if (panel.locked) continue
      const t = 12
      const o = 7
      for (const [x, y, sx, sy] of [[b.x + o, b.y + o, 1, 1], [b.x + b.w - o, b.y + o, -1, 1],
                                    [b.x + o, b.y + b.h - o, 1, -1], [b.x + b.w - o, b.y + b.h - o, -1, -1]]) {
        this._svg("path", { d: `M ${x} ${y + sy * t} L ${x} ${y} L ${x + sx * t} ${y}`, class: "jm-tick",
                            style: `--jm-line: ${levelVar(panel.level)}` }, svg)
      }
    }

    if (this.current) {
      const defs = this._svg("defs", {}, svg)
      const grad = this._svg("radialGradient", { id: "jm-curglow" }, defs)
      const line = `--jm-line: ${levelVar(this.current.level)}`
      this._svg("stop", { offset: "0", class: "jm-curglow-stop", style: line }, grad)
      this._svg("stop", { offset: "1", class: "jm-curglow-stop jm-curglow-stop--end", style: line }, grad)
      this._svg("circle", { cx: this.current.cx, cy: this.current.cy, r: 150, fill: "url(#jm-curglow)", class: "jm-curglow" }, svg)
    }

    for (const s of p.spine) this._svg("path", { d: s.d, class: "jm-track" }, svg)
    for (const r of p.routeLocked) this._svg("path", { d: r.d, class: "jm-track jm-track--locked", "data-module-id": r.moduleId }, svg)
    for (const r of p.route) this._svg("path", { d: r.d, class: "jm-track", "data-module-id": r.moduleId }, svg)
    for (const c of p.chevrons) {
      this._svg("path", { d: "M -3 -4 L 2 0 L -3 4", class: "jm-chevron", transform: `translate(${c.x} ${c.y}) rotate(${c.angle})` }, svg)
    }
    for (const b of p.branch) this._svg("path", { d: b.d, class: "jm-branch" }, svg)
    for (const b of p.branchOn) this._svg("path", { d: b.d, class: "jm-branch jm-branch--on" }, svg)
    for (const t of p.trunk) this._svg("path", { d: t.d, class: "jm-trunk" }, svg)
    const travelled = [...p.spineTravelled, ...p.travelled]
    for (const t of travelled) {
      this._svg("path", { d: t.d, class: "jm-glow", pathLength: "1", style: `--jm-line: ${levelVar(t.level)}` }, svg)
    }
    for (const t of travelled) {
      this._svg("path", { d: t.d, class: "jm-travelled", pathLength: "1", style: `--jm-line: ${levelVar(t.level)}` }, svg)
    }
    const { x, y } = p.origin
    this._svg("path", { d: `M ${x} ${y} l 6 6 l -6 6 l -6 -6 Z`, class: "jm-origin" }, svg)
  }

  _renderNodes() {
    const layer = this.nodesTarget
    let i = 0
    for (const node of this.layout.nodes) {
      if (node.kind === "root") { this._place(this.rootTarget, node); continue }
      if (node.kind === "anchor") continue
      if (node.kind === "module") {
        const el = this._moduleNode(node)
        this._place(el, node)
        el.style.setProperty("--jm-i", i++)
        layer.appendChild(el)
        this._moduleChrome(node, i).forEach((c) => layer.appendChild(c))
        continue
      }
      const el = this._topicNode(node)
      this._place(el, node)
      el.style.setProperty("--jm-i", i++)
      layer.appendChild(el)
    }
  }

  _place(el, node) {
    Object.assign(el.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.w}px`, height: `${node.h}px` })
    if (node.kind !== "root") {
      el.style.setProperty("--jm-line", levelVar(node.level))
      el.style.setProperty("--jm-d", `${DIAMETER[node.kind]}px`)
    }
  }

  _moduleNode(node) {
    const el = document.createElement("div")
    el.className = `jm-node jm-node--module${node.readable ? "" : " jm-node--locked"}`
    el.dataset.nodeId = node.id
    const dot = this._dot()
    if (!node.readable) dot.innerHTML = ICON.lock.replace("<svg", '<svg width="16" height="16"')
    el.appendChild(dot)
    el.appendChild(this._label(node.stage.label))
    return el
  }

  // Brief §4.2: a chip on the panel's top edge (and the unlock pill for a locked
  // module). Both jump to the module, as the rail did.
  _moduleChrome(node, i) {
    const index = this.layout.modules.findIndex((m) => m.id === node.id)
    const panel = this.paths.panels[index]
    const stage = node.stage
    const level = (node.level || "nv1").toUpperCase()
    const num = String(index + 1).padStart(2, "0")
    const chip = document.createElement("button")
    chip.type = "button"
    chip.className = `jm-chip${node.readable ? "" : " jm-chip--locked"}`
    chip.dataset.moduleNodeId = node.id
    Object.assign(chip.style, { left: `${node.cx}px`, top: `${panel.box.y}px` })
    chip.style.setProperty("--jm-line", levelVar(node.level))
    chip.style.setProperty("--jm-i", i)
    const sep = () => this._span("·")
    if (node.readable) {
      const primaries = stage.topics.filter((t) => !t.reinforcement)
      const done = primaries.filter((t) => t.status === "completed").length
      chip.append(this._bold(num), sep(), this._bold(level), sep(),
                  this._span(fill(this.labelsValue.chip_progress, { done, total: primaries.length })))
    } else {
      const count = stage.topics.length
      const lock = document.createElement("span")
      lock.innerHTML = ICON.lock
      chip.append(this._bold(num), sep(), this._bold(level), sep(), lock.firstChild,
                  this._span(fill(count === 1 ? this.labelsValue.topic_count_one : this.labelsValue.topic_count_other, { count })))
    }
    chip.setAttribute("aria-label", `${num} · ${stage.label} · ${chip.textContent.replace(/\s+/g, " ").trim()}`)
    if (node.readable) return [chip]

    const unlock = document.createElement("a")
    unlock.className = "jm-unlock"
    unlock.href = this.unlockPathValue
    unlock.draggable = false
    Object.assign(unlock.style, { left: `${panel.box.x + panel.box.w - 22}px`, top: `${panel.box.y}px` })
    unlock.style.setProperty("--jm-line", levelVar(node.level))
    unlock.style.setProperty("--jm-i", i)
    unlock.innerHTML = ICON.lock
    unlock.append(this.labelsValue.unlock_module)
    return [chip, unlock]
  }

  _topicNode(node) {
    const topic = node.topic
    const masked = !node.readable
    // Done wins: a finished preview leaves the current step on one already done.
    const status = topic.status === "completed" ? "completed"
      : (topic.current ? "current" : (topic.status === "locked" ? "locked" : "available"))
    const el = document.createElement(topic.path ? "a" : "div")
    if (topic.path) {
      el.href = topic.path
      // A native link drag would fire pointercancel and steal the pan.
      el.draggable = false
    }
    el.className = [
      "jm-node", `jm-node--${node.kind}`, `jm-node--${status}`,
      topic.current && status !== "current" ? "jm-node--current" : "", masked ? "jm-node--masked" : ""
    ].filter(Boolean).join(" ")
    el.dataset.nodeId = node.id
    const parts = [topic.name, this.labelsValue[status] || "", node.kind === "reinforcement" ? this.labelsValue.reinforcement : null]
    el.setAttribute("aria-label", parts.filter(Boolean).join(", "))
    if (masked) el.setAttribute("role", "img")

    const dot = this._dot()
    if (topic.current) {
      dot.appendChild(this._decor("jm-node__orbit"))
      dot.appendChild(this._decor("jm-node__ping"))
    }
    if (masked) {
      dot.insertAdjacentHTML("beforeend", ICON.lock.replace("<svg", '<svg width="14" height="14"'))
    } else if (status === "completed" && node.kind === "step") {
      dot.insertAdjacentHTML("beforeend", ICON.check)
    } else if (node.kind === "step") {
      // The direction cue: a right-to-left row still counts forward.
      const num = document.createElement("span")
      num.className = "jm-node__num"
      num.textContent = node.ordinal
      dot.appendChild(num)
    }
    el.appendChild(dot)
    el.appendChild(this._label(topic.short_name || topic.name))
    return el
  }

  _dot() {
    const dot = document.createElement("span")
    dot.className = "jm-node__dot"
    dot.setAttribute("aria-hidden", "true")
    return dot
  }

  _decor(className) {
    const el = document.createElement("span")
    el.className = className
    el.setAttribute("aria-hidden", "true")
    return el
  }

  _label(text) {
    const label = document.createElement("span")
    label.className = "jm-node__label"
    label.textContent = text
    return label
  }

  _span(text) { const s = document.createElement("span"); s.textContent = text; return s }
  _bold(text) { const b = document.createElement("b"); b.textContent = text; return b }

  // ── Popover (brief §5.2) ─────────────────────────────────────────────
  _popFor(node) {
    const topic = node.topic
    const L = this.labelsValue
    const masked = !node.readable
    const mod = this.layout.modules.find((m) => m.id === node.moduleId)
    const stage = this.nodeById.get(node.moduleId).stage
    const heads = mod.rows.flatMap((r) => r.heads).filter((h) => h.startsWith("s:"))
    const fan = this.layout.edges.find((e) => e.kind === "fan" && e.to === node.id)
    const step = heads.indexOf(fan ? fan.from : node.id) + 1
    // An orphan reinforcement hangs from its module's anchor, which has no title.
    const parent = fan && this.nodeById.get(fan.from)?.topic ? this.nodeById.get(fan.from) : null
    const eyebrow = node.kind === "reinforcement" && parent
      ? fill(L.pop_reinforcement, { parent: parent.topic.name })
      : fill(L.pop_step, { module: stage.label, step: Math.max(step, 1), total: heads.length })
    const status = masked ? L.locked
      : (topic.current && topic.status !== "completed" ? L.current
        : (topic.status === "completed" ? L.completed : (node.kind === "reinforcement" ? L.reinforcement : L.available)))
    const action = masked ? L.act_masked
      : (topic.current && topic.status !== "completed" ? L.act_continue
        : (topic.status === "completed" ? L.act_review
          : (topic.status === "locked" ? L.act_locked
            : (node.kind === "reinforcement" ? L.act_reinforcement : L.act_open))))
    const live = !masked && topic.status !== "locked" && topic.path
    return { eyebrow, title: masked ? L.pop_masked_title : topic.name, status,
             minutes: masked || topic.minutes == null ? null : fill(L.pop_minutes, { count: topic.minutes }),
             action, path: live ? topic.path : null }
  }

  _showPop(el, { touch = false } = {}) {
    const node = this.nodeById.get(el.dataset.nodeId)
    if (!node || !node.topic) return
    const c = this._popFor(node)
    const pop = this.popTarget
    pop.replaceChildren()
    const div = (cls, text) => { const d = document.createElement("div"); d.className = cls; if (text != null) d.textContent = text; return d }
    pop.appendChild(div("jm-pop__eyebrow", c.eyebrow))
    pop.appendChild(div("jm-pop__title", c.title))
    const meta = div("jm-pop__meta")
    meta.appendChild(this._bold(c.status))
    if (c.minutes) meta.append(` · ${c.minutes}`)
    pop.appendChild(meta)
    // On touch the action is the way in (a tap previews; the popover's link goes).
    const act = document.createElement(c.path ? "a" : "div")
    act.className = "jm-pop__act"
    if (c.path) { act.href = c.path; act.tabIndex = -1 }
    act.textContent = c.action
    if (c.path) act.insertAdjacentHTML("beforeend", ICON.arrow)
    pop.appendChild(act)
    pop.style.setProperty("--jm-line", levelVar(node.level))
    pop.classList.toggle("jm-pop--touch", touch)
    pop.setAttribute("aria-hidden", "false")
    this.nodesTarget.querySelectorAll(".jm-node--hot").forEach((n) => n.classList.remove("jm-node--hot"))
    el.classList.add("jm-node--hot")
    el.setAttribute("aria-describedby", pop.id)
    this.popNode = node
    this.popEl = el
    this._placePop()
    pop.classList.add("jm-pop--show")
  }

  // Screen space, above the disc; below it when there is no room above; clamped
  // inside the viewport horizontally.
  _placePop() {
    if (!this.popNode) return
    const pop = this.popTarget
    const n = this.popNode
    const vp = this.viewportTarget.getBoundingClientRect()
    const d = DIAMETER[n.kind] || OPTIONS.stepDiameter
    const k = this.camera.k
    const top = { x: vp.left + n.cx * k + this.camera.x, y: vp.top + (n.cy - d / 2) * k + this.camera.y }
    const bottom = vp.top + (n.y + n.h) * k + this.camera.y
    const w = pop.offsetWidth
    const h = pop.offsetHeight
    const topbar = document.getElementById("journey-topbar")
    const ceiling = topbar ? topbar.getBoundingClientRect().bottom : vp.top
    const below = top.y - h - 14 < ceiling + 4
    pop.classList.toggle("jm-pop--below", below)
    const x = Math.max(vp.left + w / 2 + 8, Math.min(vp.right - w / 2 - 8, top.x))
    pop.style.left = `${x}px`
    pop.style.top = `${below ? bottom + 14 : top.y - h - 14}px`
  }

  _hidePop() {
    if (!this.hasPopTarget) return
    clearTimeout(this.popTimer)
    this.popTarget.classList.remove("jm-pop--show", "jm-pop--touch")
    this.popTarget.setAttribute("aria-hidden", "true")
    if (this.popEl) {
      this.popEl.classList.remove("jm-node--hot")
      this.popEl.removeAttribute("aria-describedby")
    }
    this.popNode = null
    this.popEl = null
  }

  _popCandidate(target) {
    const el = target.closest?.(".jm-node[data-node-id]")
    return el && !el.classList.contains("jm-node--module") ? el : null
  }

  // ── Camera ───────────────────────────────────────────────────────────
  _safe() {
    const vp = this.viewportTarget.getBoundingClientRect()
    const overlays = [...document.querySelectorAll("#journey-topbar, [data-journey-overlay]")].map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left - vp.left, top: r.top - vp.top, width: r.width, height: r.height }
    })
    this.lastSafe = safeRect({ left: 0, top: 0, width: vp.width, height: vp.height }, overlays)
    return this.lastSafe
  }

  // Brief §5.4: the current module's panel with the route's title when both fit
  // at the legible floor; otherwise the module, otherwise the current step.
  _initialCamera(safe) {
    const current = this.current
    const mod = current ? this.layout.modules.find((m) => m.id === current.moduleId) : null
    const root = this.nodeById.get("root")
    return initialCamera({ moduleBox: mod ? inflate(mod.box, PANEL_PAD) : null,
                           alsoBox: { x: root.x, y: root.y, w: root.w, h: root.h },
                           node: current || root, safe, minScale: this.minScale, padding: 24 })
  }

  // The zoom-out floor is "fit-all or the legible floor, whichever is smaller",
  // so it depends on the viewport: recomputed on every resize.
  _updateZoomRange(safe) {
    const fitAll = fitCamera(this.layout.bounds, safe, { padding: 32, min: 0.01, max: 1 })
    this.zoomRange = { min: Math.min(fitAll.k, this.minScale), max: 2 }
  }

  _apply(animate) {
    const { x, y, k } = this.camera
    this.worldTarget.classList.toggle("jm-world--animate", animate && !this.reduced.matches)
    this.worldTarget.style.transform = `translate(${x}px, ${y}px) scale(${k})`
    this.worldTarget.dataset.lod = k < 0.5 ? "far" : (k < 0.75 ? "mid" : "near")
    if (this.popNode) {
      // The popover follows the node once the camera has settled.
      if (animate && !this.reduced.matches) setTimeout(() => this._placePop(), 460)
      else this._placePop()
    }
  }

  _zoomCenter(factor) {
    const s = this._safe()
    this._userMove(zoomAbout(this.camera, { x: s.left + s.width / 2, y: s.top + s.height / 2 }, factor, this.zoomRange), true)
  }

  _onResize() {
    if (!this.lastSafe || !this.camera) return
    const old = this.lastSafe
    const world = { x: (old.left + old.width / 2 - this.camera.x) / this.camera.k,
                    y: (old.top + old.height / 2 - this.camera.y) / this.camera.k }
    const safe = this._safe()
    this._updateZoomRange(safe)
    this.camera = centerOn(world, safe, this.camera.k)
    // Until the student moves the map, the current step stays in view; after,
    // what they chose to look at stays put (§3.3).
    if (!this.userMoved) this._keepCurrentVisible()
    this._apply(false)
  }

  _userMove(camera, animate) {
    this.userMoved = true
    this.camera = camera
    this._apply(animate)
  }

  _keepCurrentVisible() {
    if (this.current) this.camera = ensureVisible(this.camera, this.current, this.lastSafe, 24)
  }

  // ── Events ───────────────────────────────────────────────────────────
  _bind() {
    const vp = this.viewportTarget
    this.pointers = new Map()
    this.onPointerDown = (e) => this._onPointerDown(e)
    this.onPointerMove = (e) => this._onPointerMove(e)
    this.onPointerUp = (e) => this._onPointerUp(e)
    this.onWheel = (e) => this._onWheel(e)
    this.onKeyDown = (e) => this._onKeyDown(e)
    this.onFocusIn = (e) => this._onFocusIn(e)
    this.onFocusOut = (e) => this._onFocusOut(e)
    this.onClickCapture = (e) => this._onClickCapture(e)
    this.onClick = (e) => this._onClick(e)
    this.onDoubleClick = (e) => this._onDoubleClick(e)
    this.onPointerOver = (e) => this._onPointerOver(e)
    this.onPointerOut = (e) => this._onPointerOut(e)
    vp.addEventListener("pointerdown", this.onPointerDown)
    vp.addEventListener("pointermove", this.onPointerMove)
    vp.addEventListener("pointerup", this.onPointerUp)
    vp.addEventListener("pointercancel", this.onPointerUp)
    vp.addEventListener("wheel", this.onWheel, { passive: false })
    vp.addEventListener("keydown", this.onKeyDown)
    vp.addEventListener("focusin", this.onFocusIn)
    vp.addEventListener("focusout", this.onFocusOut)
    vp.addEventListener("click", this.onClickCapture, true)
    vp.addEventListener("click", this.onClick)
    vp.addEventListener("dblclick", this.onDoubleClick)
    vp.addEventListener("pointerover", this.onPointerOver)
    vp.addEventListener("pointerout", this.onPointerOut)
  }

  _local(e) {
    const r = this.viewportTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  _onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return
    this.lastPointerType = e.pointerType
    this.pointers.set(e.pointerId, this._local(e))
    this.dragged = false
    this.dragStart = { point: this._local(e), camera: { ...this.camera } }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                     camera: { ...this.camera } }
    }
  }

  _onPointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return
    const p = this._local(e)
    this.pointers.set(e.pointerId, p)
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const zoomed = zoomAbout(this.pinch.camera, this.pinch.mid, Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.dist,
                               this.zoomRange)
      this.dragged = true
      this._hidePop()
      this._userMove({ ...zoomed, x: zoomed.x + mid.x - this.pinch.mid.x, y: zoomed.y + mid.y - this.pinch.mid.y }, false)
      return
    }
    const dx = p.x - this.dragStart.point.x
    const dy = p.y - this.dragStart.point.y
    if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!this.dragged) {
      this.dragged = true
      this._hidePop()
      this.viewportTarget.classList.add("jm-viewport--dragging")
      this.viewportTarget.setPointerCapture(e.pointerId)
    }
    this._userMove({ ...this.dragStart.camera, x: this.dragStart.camera.x + dx, y: this.dragStart.camera.y + dy }, false)
  }

  _onPointerUp(e) {
    this.pointers.delete(e.pointerId)
    this.viewportTarget.classList.remove("jm-viewport--dragging")
    if (this.pointers.size < 2) this.pinch = null
    if (this.pointers.size === 1) {
      const [remaining] = [...this.pointers.values()]
      this.dragStart = { point: remaining, camera: { ...this.camera } }
    }
  }

  // A drag that began on a node link must not navigate; a plain click still does.
  // On touch, a tap on a node opens its popover (a second tap closes it); the
  // popover's action is the way in.
  _onClickCapture(e) {
    if (this.dragged) {
      e.preventDefault()
      e.stopPropagation()
      this.dragged = false
      return
    }
    const el = this.lastPointerType === "touch" && this._popCandidate(e.target)
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    if (this.popEl === el) this._hidePop()
    else this._showPop(el, { touch: true })
  }

  _onClick(e) {
    const target = e.target.closest?.(".jm-chip, .jm-node--module")
    if (!target) return
    this._focusModule(target.dataset.moduleNodeId || target.dataset.nodeId)
  }

  // Brief §5.3: on a node, centre it at ≥ 1.2; on empty canvas, zoom ×1.6 there.
  // A step is a link, so a mouse click on one navigates before a double-click
  // exists: this reaches the module disc, masked nodes and the canvas.
  _onDoubleClick(e) {
    if (e.target.closest?.(".jm-chip, .jm-unlock")) return
    const el = e.target.closest?.(".jm-node[data-node-id]")
    const node = el && this.nodeById.get(el.dataset.nodeId)
    if (node) {
      this._userMove(centerOn({ x: node.cx, y: node.cy }, this._safe(), Math.max(this.camera.k, 1.2)), true)
    } else {
      this._userMove(zoomAbout(this.camera, this._local(e), 1.6, this.zoomRange), true)
    }
  }

  _onPointerOver(e) {
    if (e.pointerType === "touch") return
    const el = this._popCandidate(e.target)
    if (!el) return
    clearTimeout(this.popTimer)
    if (this.popEl === el) return
    this.popTimer = setTimeout(() => this._showPop(el), HOVER_OPEN_MS)
  }

  _onPointerOut(e) {
    if (e.pointerType === "touch") return
    const el = this._popCandidate(e.target)
    if (!el || el.contains(e.relatedTarget)) return
    clearTimeout(this.popTimer)
    if (document.activeElement !== el) this.popTimer = setTimeout(() => this._hidePop(), HOVER_CLOSE_MS)
  }

  _onWheel(e) {
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? this.viewportTarget.clientHeight : 1)
    if (e.ctrlKey) {
      this._userMove(zoomAbout(this.camera, this._local(e), Math.exp(-e.deltaY * unit * 0.01), this.zoomRange), false)
    } else {
      // A plain wheel PANS: a page that does not scroll must not trap a mouse user.
      this._userMove({ ...this.camera, x: this.camera.x - e.deltaX * unit, y: this.camera.y - e.deltaY * unit }, false)
    }
  }

  _onKeyDown(e) {
    // Ctrl/Cmd with = - 0 is the browser's page zoom and Alt+Arrow is history:
    // leave them to the browser, or low-vision users lose page zoom on the map.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === "Escape") {
      if (!this.popNode) return
      this._hidePop()
      e.preventDefault()
      return
    }
    if (e.target !== this.viewportTarget) return
    const pan = (dx, dy) => this._userMove({ ...this.camera, x: this.camera.x + dx, y: this.camera.y + dy }, true)
    switch (e.key) {
      case "ArrowLeft": pan(KEY_PAN, 0); break
      case "ArrowRight": pan(-KEY_PAN, 0); break
      case "ArrowUp": pan(0, KEY_PAN); break
      case "ArrowDown": pan(0, -KEY_PAN); break
      case "+": case "=": this.zoomIn(); break
      case "-": case "_": this.zoomOut(); break
      case "0": this.fit(); break
      case "i": case "I": this.locate(); break
      default: return
    }
    e.preventDefault()
  }

  // Focus follows the camera: Tab onto a node outside the safe area brings it
  // in; a focused step shows its popover.
  _onFocusIn(e) {
    const el = e.target.closest?.(".jm-node, .jm-chip, .jm-unlock")
    if (!el) return
    const node = el.dataset.nodeId ? this.nodeById.get(el.dataset.nodeId) : null
    if (node) this._userMove(ensureVisible(this.camera, node, this._safe(), 24), true)
    const pop = this._popCandidate(e.target)
    if (pop) { clearTimeout(this.popTimer); this._showPop(pop) }
  }

  _onFocusOut(e) {
    if (!this._popCandidate(e.target)) return
    clearTimeout(this.popTimer)
    this.popTimer = setTimeout(() => {
      if (!this.popEl || document.activeElement !== this.popEl) this._hidePop()
    }, HOVER_CLOSE_MS)
  }
}
