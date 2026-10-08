import { Controller } from "@hotwired/stimulus"
import { buildTree, layoutJourney, DEFAULTS } from "journey_map_layout"
import { safeRect, fitCamera, centerOn, zoomAbout, ensureVisible, initialCamera } from "journey_camera"

// WP-37 — the journey as a pannable, zoomable map. Geometry lives in
// journey_map_layout.js and camera math in journey_camera.js, both pure and
// tested under node; this controller renders and wires events, nothing else.
//
// Colours are CSS custom properties (var(--color-…)), never values read once at
// mount: a theme toggle repaints with no re-render.
const MIN_LABEL_PX = 12
const SVG_NS = "http://www.w3.org/2000/svg"
const DRAG_THRESHOLD = 4
const KEY_PAN = 60
const KEY_ZOOM = 1.2

export default class extends Controller {
  static targets = ["viewport", "world", "edges", "nodes", "root", "railDot"]
  static values = { stages: Array, root: Object, labels: Object }

  connect() {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    this.layout = layoutJourney(buildTree(this.rootValue, this.stagesValue), DEFAULTS)
    this.nodeById = new Map(this.layout.nodes.map((n) => [n.id, n]))
    // Turbo restores a CACHED copy of this page on Back, with the nodes this
    // controller built last time still in it. Clear before drawing, or the map
    // is drawn twice (every node a Tab stop twice).
    this.edgesTarget.replaceChildren()
    this.nodesTarget.querySelectorAll(".jm-node").forEach((el) => el.remove())
    this._renderEdges()
    this._renderNodes()

    const safe = this._safe()
    this.minScale = MIN_LABEL_PX / DEFAULTS.labelFontPx
    this._updateZoomRange(safe)
    this.camera = this._initialCamera(safe)
    this.userMoved = false
    this._apply(false)

    this._bind()
    this.resizeObserver = new ResizeObserver(() => this._onResize())
    this.resizeObserver.observe(this.viewportTarget)
    this.element.dataset.journeyReady = "true"
  }

  disconnect() {
    this.resizeObserver?.disconnect()
    const vp = this.viewportTarget
    vp.removeEventListener("pointerdown", this.onPointerDown)
    vp.removeEventListener("pointermove", this.onPointerMove)
    vp.removeEventListener("pointerup", this.onPointerUp)
    vp.removeEventListener("pointercancel", this.onPointerUp)
    vp.removeEventListener("wheel", this.onWheel)
    vp.removeEventListener("keydown", this.onKeyDown)
    vp.removeEventListener("focusin", this.onFocusIn)
    vp.removeEventListener("click", this.onClickCapture, true)
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

  focusModule(event) {
    const stage = this.stagesValue[Number(event.currentTarget.dataset.stageIndex)]
    const mod = stage && this.layout.modules.find((m) => m.moduleId === stage.module_id)
    if (!mod) return
    this._userMove(fitCamera(mod.box, this._safe(), { padding: 32, min: this.zoomRange.min, max: 1 }), true)
  }

  // ── Rendering ────────────────────────────────────────────────────────
  _renderEdges() {
    const { x, y, w, h } = this.layout.bounds
    const svg = this.edgesTarget
    svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`)
    svg.setAttribute("width", w)
    svg.setAttribute("height", h)
    Object.assign(svg.style, { left: `${x}px`, top: `${y}px` })
    for (const edge of this.layout.edges) {
      const path = document.createElementNS(SVG_NS, "path")
      path.setAttribute("d", edge.points.map(([px, py], i) => `${i ? "L" : "M"}${px} ${py}`).join(" "))
      path.setAttribute("class", `jm-edge jm-edge--${edge.kind}${edge.locked ? " jm-edge--locked" : ""}`)
      svg.appendChild(path)
    }
  }

  _renderNodes() {
    const layer = this.nodesTarget
    for (const node of this.layout.nodes) {
      if (node.kind === "root") { this._place(this.rootTarget, node); continue }
      if (node.kind === "anchor") continue
      const el = node.kind === "module" ? this._moduleNode(node) : this._topicNode(node)
      this._place(el, node)
      layer.appendChild(el)
    }
  }

  _place(el, node) {
    Object.assign(el.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.w}px`, height: `${node.h}px` })
    el.style.setProperty("--jm-level", `var(--color-node-${node.level || "nv1"})`)
  }

  _moduleNode(node) {
    const el = document.createElement("div")
    el.className = `jm-node jm-node--module${node.readable ? "" : " jm-node--locked"}`
    el.dataset.nodeId = node.id
    el.appendChild(this._dot(null))
    const label = document.createElement("span")
    label.className = "jm-node__label"
    const tag = document.createElement("span")
    tag.className = "jm-node__tag"
    tag.textContent = node.stage.tag
    label.append(tag, document.createTextNode(node.stage.label))
    el.appendChild(label)
    return el
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
    const statusText = this.labelsValue[status] || ""
    const parts = [topic.name, statusText, node.kind === "reinforcement" ? this.labelsValue.reinforcement : null]
    el.setAttribute("aria-label", parts.filter(Boolean).join(", "))
    if (!masked) el.title = topic.name
    if (masked) el.setAttribute("role", "img")

    const dot = this._dot(masked ? "lock" : (status === "completed" ? "check" : null), topic.progress)
    // The direction cue: a right-to-left row still counts forward.
    if (node.kind === "step" && !masked && status !== "completed") {
      const num = document.createElement("span")
      num.className = "jm-node__num"
      num.textContent = node.ordinal
      dot.appendChild(num)
    }
    el.appendChild(dot)
    const label = document.createElement("span")
    label.className = "jm-node__label"
    label.textContent = topic.name
    el.appendChild(label)
    return el
  }

  _dot(glyph, progress = 0) {
    const dot = document.createElement("span")
    dot.className = "jm-node__dot"
    dot.setAttribute("aria-hidden", "true")
    if (progress > 0 && progress < 100) {
      const ring = document.createElementNS(SVG_NS, "svg")
      ring.setAttribute("class", "jm-node__ring")
      ring.setAttribute("viewBox", "0 0 36 36")
      const c = document.createElementNS(SVG_NS, "circle")
      c.setAttribute("cx", "18"); c.setAttribute("cy", "18"); c.setAttribute("r", "16")
      c.setAttribute("pathLength", "100")
      c.setAttribute("stroke-dasharray", `${progress} 100`)
      ring.appendChild(c)
      dot.appendChild(ring)
    }
    if (glyph) {
      const svg = document.createElementNS(SVG_NS, "svg")
      svg.setAttribute("width", "14"); svg.setAttribute("height", "14"); svg.setAttribute("viewBox", "0 0 16 16")
      if (glyph === "lock") svg.dataset.lockGlyph = ""
      const path = document.createElementNS(SVG_NS, "path")
      path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor")
      path.setAttribute("stroke-width", "1.6"); path.setAttribute("stroke-linecap", "round")
      path.setAttribute("d", glyph === "lock" ? "M4 7h8v6H4zM6 7V5a2 2 0 0 1 4 0v2" : "M3.5 8.5l3 3 6-7")
      svg.appendChild(path)
      dot.appendChild(svg)
    }
    return dot
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

  _initialCamera(safe) {
    const current = this.layout.nodes.find((n) => n.topic && n.topic.current)
    const moduleBox = current ? this.layout.modules.find((m) => m.id === current.moduleId)?.box : null
    return initialCamera({ moduleBox, node: current || this.nodeById.get("root"), safe,
                           minScale: this.minScale, padding: 24 })
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
    const current = this.layout.nodes.find((n) => n.topic && n.topic.current)
    if (current) this.camera = ensureVisible(this.camera, current, this.lastSafe, 24)
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
    this.onClickCapture = (e) => this._onClickCapture(e)
    vp.addEventListener("pointerdown", this.onPointerDown)
    vp.addEventListener("pointermove", this.onPointerMove)
    vp.addEventListener("pointerup", this.onPointerUp)
    vp.addEventListener("pointercancel", this.onPointerUp)
    vp.addEventListener("wheel", this.onWheel, { passive: false })
    vp.addEventListener("keydown", this.onKeyDown)
    vp.addEventListener("focusin", this.onFocusIn)
    vp.addEventListener("click", this.onClickCapture, true)
  }

  _local(e) {
    const r = this.viewportTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  _onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return
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
      this._userMove({ ...zoomed, x: zoomed.x + mid.x - this.pinch.mid.x, y: zoomed.y + mid.y - this.pinch.mid.y }, false)
      return
    }
    const dx = p.x - this.dragStart.point.x
    const dy = p.y - this.dragStart.point.y
    if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!this.dragged) {
      this.dragged = true
      this.viewportTarget.setPointerCapture(e.pointerId)
    }
    this._userMove({ ...this.dragStart.camera, x: this.dragStart.camera.x + dx, y: this.dragStart.camera.y + dy }, false)
  }

  _onPointerUp(e) {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size < 2) this.pinch = null
    if (this.pointers.size === 1) {
      const [remaining] = [...this.pointers.values()]
      this.dragStart = { point: remaining, camera: { ...this.camera } }
    }
  }

  // A drag that began on a node link must not navigate; a plain click still does.
  _onClickCapture(e) {
    if (!this.dragged) return
    e.preventDefault()
    e.stopPropagation()
    this.dragged = false
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
    if (e.target !== this.viewportTarget) return
    // Ctrl/Cmd with = - 0 is the browser's page zoom and Alt+Arrow is history:
    // leave them to the browser, or low-vision users lose page zoom on the map.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const pan = (dx, dy) => this._userMove({ ...this.camera, x: this.camera.x + dx, y: this.camera.y + dy }, true)
    switch (e.key) {
      case "ArrowLeft": pan(KEY_PAN, 0); break
      case "ArrowRight": pan(-KEY_PAN, 0); break
      case "ArrowUp": pan(0, KEY_PAN); break
      case "ArrowDown": pan(0, -KEY_PAN); break
      case "+": case "=": this.zoomIn(); break
      case "-": case "_": this.zoomOut(); break
      case "0": this.fit(); break
      default: return
    }
    e.preventDefault()
  }

  // Focus follows the camera: Tab onto a node outside the safe area brings it in.
  _onFocusIn(e) {
    const el = e.target.closest?.(".jm-node")
    const node = el && this.nodeById.get(el.dataset.nodeId)
    if (!node) return
    this._userMove(ensureVisible(this.camera, node, this._safe(), 24), true)
  }
}
