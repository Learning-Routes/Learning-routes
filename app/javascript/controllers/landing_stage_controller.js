import { Controller } from "@hotwired/stimulus"
import {
  buildModel, camFor, restFor, layoutChapter, layFor, textWidth, anchorOf, isPhone,
  WEIGHTS, CHAPTERS, FOV, SHEET_X, T
} from "landing_placement"

// STEP 41 §2 — the landing is the annotated map. The approved reference
// (tmp/redesign/mapa-anotado) ported onto three.js's module build: a scale model
// of WP-37b's map you travel by scrolling, with each chapter's text — server
// HTML, painted before three.js loads — pinned flat to a free spot of the map
// (landing_placement.js finds it). Without WebGL the chapters stack as text.
const NAV = 64
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const LOCK_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const fill = (template, values) => String(template).replace(/%\{(\w+)\}/g, (_, k) => (k in values ? values[k] : ""))

export default class extends Controller {
  static targets = ["stage", "canvas", "labels", "ann", "top", "dots", "tab"]
  static values = { routes: Object, labels: Object }

  connect() {
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    this.model = buildModel()
    this.topic = "pt"
    this.active = -2
    this.paintText()
    this.onJump = (e) => {
      const a = e.target.closest?.("[data-landing-jump]")
      if (!a || !this.started) return
      e.preventDefault()
      this.goChapter(+a.dataset.landingJump)
    }
    document.addEventListener("click", this.onJump)
    if (!this.hasWebGL()) { this.noGL(); return }
    import("three").then((THREE) => { if (this.element.isConnected) this.start(THREE) }).catch(() => this.noGL())
  }

  disconnect() {
    document.removeEventListener("click", this.onJump)
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.io?.disconnect()
    this.themeObserver?.disconnect()
    window.removeEventListener("resize", this.onResize)
    window.removeEventListener("scroll", this.onScroll)
    document.removeEventListener("visibilitychange", this.onVisibility)
    this.renderer?.dispose()
  }

  // The hero shows at its designed spot at once: the text never waits for three.js.
  paintText() {
    const Wd = this.stageTarget.clientWidth
    const H = this.stageTarget.clientHeight
    const L = layFor(0, isPhone(Wd))
    const hero = this.annTargets[0]
    hero.style.width = `${textWidth(0, Wd)}px`
    hero.style.transform = `translate(${isPhone(Wd) ? 20 : Math.round(L.r[0] * Wd)}px, ${Math.round(Math.max(20, L.r[1] * H))}px)`
    hero.classList.add("lp-on")
  }

  hasWebGL() {
    try {
      const c = document.createElement("canvas")
      return !!(c.getContext("webgl2") || c.getContext("webgl"))
    } catch (e) {
      return false
    }
  }

  noGL() {
    this.element.classList.add("lp-no-gl")
    this.annTargets.forEach((a) => {
      a.classList.add("lp-on")
      a.style.transform = ""
      a.style.width = ""
      a.querySelectorAll("a").forEach((l) => l.removeAttribute("tabindex"))
    })
  }

  // ── the scene ──────────────────────────────────────────────────────────
  start(THREE) {
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas: this.canvasTarget, antialias: true, alpha: true })
    } catch (e) {
      this.noGL()
      return
    }
    this.THREE = THREE
    this.renderer = renderer
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2))
    this.buildScene()
    this.buildLabels()
    this.buildDots()
    this.setTopic("pt")

    this.lastT = performance.now()
    this.prevQ = 0
    this.ringT = -1
    this.visible = true
    this.started = true
    const journey = this.element
    this.io = new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; if (this.visible && !this.raf) this.loop() })
    this.io.observe(journey)
    this.onVisibility = () => { if (!document.hidden && !this.raf) { this.lastT = performance.now(); this.loop() } }
    document.addEventListener("visibilitychange", this.onVisibility)
    let rt
    this.onResize = () => { clearTimeout(rt); rt = setTimeout(() => this.resize(), 120) }
    window.addEventListener("resize", this.onResize)
    // Restart on scroll without waiting for the observer: jumping back to the top
    // must never find the hero empty (the reference's bug, §2.5).
    this.onScroll = () => {
      if (this.raf) return
      const r = journey.getBoundingClientRect()
      this.visible = r.bottom > 0 && r.top < window.innerHeight
      if (this.visible) this.loop()
    }
    window.addEventListener("scroll", this.onScroll, { passive: true })
    this.themeObserver = new MutationObserver(() => { this.applyTheme(); this.frame() })
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

    this.measure()
    renderer.setSize(this.stageTarget.clientWidth, this.stageTarget.clientHeight, false)
    this.sSmooth = this.exactS()
    this.applyTheme()
    this.layoutAnns()
    this.frame()
    this.loop()
    document.fonts?.ready.then(() => { if (this.started) { this.measure(); this.layoutAnns(); this.frame() } })
  }

  buildScene() {
    const THREE = this.THREE
    const model = this.model
    const [M1, M2, M3] = model.mods
    const V = (x, y, z) => new THREE.Vector3(x, y, z)
    // The module's curves, drawn by three.js: one geometry for the page and its tests.
    class Of extends THREE.Curve {
      constructor(c) { super(); this.c = c }
      getPoint(t, target = new THREE.Vector3()) { const p = this.c.getPoint(t); return target.set(p.x, p.y, p.z) }
    }
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 600)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 1)
    key.position.set(-14, 30, 16)
    key.target.position.set(9.6, 0, 12)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    Object.assign(key.shadow.camera, { left: -27, right: 27, top: 27, bottom: -27, near: 1, far: 100 })
    key.shadow.bias = -0.0005
    key.shadow.normalBias = 0.03
    scene.add(key, key.target)
    scene.fog = new THREE.Fog(0xffffff, 110, 230)
    const lam = (o = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...o })
    const basic = (o = {}) => new THREE.MeshBasicMaterial({ color: 0xffffff, ...o })
    const M = {
      panel: lam(), panelLocked: lam({ transparent: true, opacity: 0.72 }), track: lam(), node: lam(), ring: lam(), lock: lam(),
      check: basic(), reinf: lam(), route: lam(), glow: basic({ transparent: true, opacity: 0.08, depthWrite: false }),
      signal: lam(), signalFlat: basic({ transparent: true, opacity: 0.5, depthWrite: false }), ink: lam(),
      shadow: new THREE.ShadowMaterial({ opacity: 0.15 })
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), M.shadow)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(9.6, -1.4, 12)
    ground.receiveShadow = true
    scene.add(ground)
    const rounded = (w, h, r) => {
      const s = new THREE.Shape()
      s.moveTo(r, 0); s.lineTo(w - r, 0); s.quadraticCurveTo(w, 0, w, r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h)
      s.lineTo(r, h); s.quadraticCurveTo(0, h, 0, h - r); s.lineTo(0, r); s.quadraticCurveTo(0, 0, r, 0)
      return s
    }
    // Three sheets with thickness and corner ticks; the last one locked and translucent.
    model.mods.forEach((md) => {
      const [x0, x1] = SHEET_X
      const g = new THREE.ExtrudeGeometry(rounded(x1 - x0, md.bottom - md.top, 0.9),
        { depth: T, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2, curveSegments: 10 })
      const mesh = new THREE.Mesh(g, md.locked ? M.panelLocked : M.panel)
      mesh.rotation.x = Math.PI / 2
      mesh.position.set(x0, md.y + T, md.top)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      if (md.locked) return
      const a = new THREE.BoxGeometry(0.8, 0.02, 0.05)
      const b = new THREE.BoxGeometry(0.05, 0.02, 0.8)
      ;[[x0 + 0.45, md.top + 0.45, 1, 1], [x1 - 0.45, md.top + 0.45, -1, 1], [x0 + 0.45, md.bottom - 0.45, 1, -1], [x1 - 0.45, md.bottom - 0.45, -1, -1]]
        .forEach(([x, z, sx, sz]) => {
          const p = new THREE.Mesh(a, M.route); p.position.set(x + sx * 0.375, md.topY + 0.015, z)
          const q = new THREE.Mesh(b, M.route); q.position.set(x, md.topY + 0.015, z + sz * 0.375)
          scene.add(p, q)
        })
    })
    const tube = (curve, radius, mat, perUnit = 9) => {
      const c = new Of(curve)
      const L = curve.getLength()
      const seg = Math.max(8, Math.ceil(L * perUnit))
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(c, seg, radius, 8, false), mat)
      mesh.userData = { seg, L }
      scene.add(mesh)
      return mesh
    }
    const frac = (mesh, a, b) => {
      const seg = mesh.userData.seg
      const i0 = Math.floor(clamp(a) * seg)
      const i1 = Math.ceil(clamp(b) * seg)
      mesh.visible = i1 > i0
      mesh.geometry.setDrawRange(i0 * 48, Math.max(0, i1 - i0) * 48)
    }
    // The route: a track, the bright line that draws over it, and its glow.
    const R = { spine: [], m: [[], [], []] }
    const ROUTE = model.route.map((r) => {
      const leg = { curve: r.curve, m: r.m, track: tube(r.curve, 0.035, M.track), bright: tube(r.curve, 0.075, M.route), glow: tube(r.curve, 0.24, M.glow, 4) }
      leg.bright.castShadow = true
      frac(leg.bright, 0, 0)
      frac(leg.glow, 0, 0)
      leg.L = leg.bright.userData.L
      ;(r.spine ? R.spine : R.m[r.m]).push(leg)
      return leg
    })
    let acc = 0
    ROUTE.forEach((r) => { r.start = acc; acc += r.L })
    const dotGeo = new THREE.SphereGeometry(0.05, 8, 6)
    const dotted = (curve, gap, mat, lift) => {
      const n = Math.max(2, Math.floor(curve.getLength() / gap))
      const im = new THREE.InstancedMesh(dotGeo, mat, n + 1)
      const o = new THREE.Object3D()
      for (let i = 0; i <= n; i++) { const p = curve.getPointAt(i / n); o.position.set(p.x, p.y + lift, p.z); o.updateMatrix(); im.setMatrixAt(i, o.matrix) }
      scene.add(im)
      return im
    }
    const dots3 = M1.fan.traces.map((t) => dotted(t, 0.24, M.reinf, 0.04))
    const fanOn = M1.fan.traces.map((t) => { const m = tube(t, 0.055, M.reinf); m.visible = false; return m })
    R.m[2].forEach((r) => { r.track.visible = false; dotted(r.curve, 0.4, M.lock, 0.04) })
    const chevGeo = new THREE.ConeGeometry(0.1, 0.28, 10)
    chevGeo.rotateZ(-Math.PI / 2)
    const chevrons = []
    ;[...R.m[0], ...R.m[1]].forEach((r) => {
      if (r.curve === M1.legs[0] || r.curve === M2.legs[0]) return
      const p = r.curve.getPointAt(0.5)
      const t = r.curve.getTangentAt(0.5)
      const c = new THREE.Mesh(chevGeo, M.track)
      c.position.set(p.x, p.y + 0.05, p.z)
      c.rotation.y = Math.atan2(-t.z, t.x)
      scene.add(c)
      chevrons.push({ mesh: c, leg: r })
    })
    const cyl = (r, h, seg = 48) => new THREE.CylinderGeometry(r, r, h, seg)
    const tor = (r, t, arc) => { const g = new THREE.TorusGeometry(r, t, 8, 64, arc); g.rotateX(Math.PI / 2); return g }
    const checkPath = new THREE.CurvePath()
    checkPath.add(new THREE.LineCurve3(V(-0.19, 0, 0.01), V(-0.06, 0, 0.14)))
    checkPath.add(new THREE.LineCurve3(V(-0.06, 0, 0.14), V(0.2, 0, -0.13)))
    const checkGeo = new THREE.TubeGeometry(checkPath, 8, 0.04, 6, false)
    const NODES = []
    const mkStep = (pos, m, kind) => {
      const g = new THREE.Group(); g.position.set(pos.x, pos.y, pos.z)
      const exam = kind === "exam"
      const H = 0.16
      const body = exam ? new THREE.Mesh(new THREE.BoxGeometry(0.92, H, 0.92), M.node) : new THREE.Mesh(cyl(0.55, H), M.node)
      if (exam) body.rotation.y = Math.PI / 4
      body.position.y = H / 2; body.castShadow = true; body.receiveShadow = true
      const ring = exam ? new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 1.0), M.ring) : new THREE.Mesh(tor(0.55, 0.032), M.ring)
      if (exam) ring.rotation.y = Math.PI / 4
      ring.position.y = exam ? H - 0.01 : H + 0.005
      const fillM = exam ? new THREE.Mesh(new THREE.BoxGeometry(0.96, H + 0.03, 0.96), M.route) : new THREE.Mesh(cyl(0.57, H + 0.03), M.route)
      if (exam) fillM.rotation.y = Math.PI / 4
      fillM.position.y = (H + 0.03) / 2; fillM.castShadow = true; fillM.visible = false
      const chk = new THREE.Mesh(checkGeo, M.check); chk.position.y = H + 0.05; chk.visible = false
      const cur = exam ? new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.06, 1.08), M.signal) : new THREE.Mesh(tor(0.6, 0.055), M.signal)
      if (exam) cur.rotation.y = Math.PI / 4
      cur.position.y = H + 0.01; cur.visible = false
      g.add(body, ring, fillM, chk, cur); scene.add(g)
      const n = { kind, m, pos, ring, fill: fillM, chk, cur, state: "" }
      NODES.push(n)
      return n
    }
    const mkReinf = (pos) => {
      const g = new THREE.Group(); g.position.set(pos.x, pos.y, pos.z)
      const body = new THREE.Mesh(cyl(0.32, 0.1), M.node); body.position.y = 0.05; body.castShadow = true
      const rd = new THREE.Group()
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const d = new THREE.Mesh(dotGeo, M.reinf); d.position.set(Math.cos(a) * 0.33, 0.11, Math.sin(a) * 0.33); rd.add(d) }
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), M.reinf); dot.position.y = 0.12
      const fillM = new THREE.Mesh(cyl(0.34, 0.13), M.reinf); fillM.position.y = 0.065; fillM.visible = false
      g.add(body, rd, dot, fillM); scene.add(g)
      return { g, fill: fillM, pos }
    }
    const mkModule = (md) => {
      const g = new THREE.Group(); g.position.set(md.disc.x, md.disc.y, md.disc.z)
      const body = new THREE.Mesh(cyl(0.82, 0.22), M.node); body.position.y = 0.11; body.castShadow = true
      const r1 = new THREE.Mesh(tor(0.82, 0.04), md.locked ? M.lock : M.route); r1.position.y = 0.225
      const r2 = new THREE.Mesh(tor(0.56, 0.03), md.locked ? M.lock : M.route); r2.position.y = 0.225
      g.add(body, r1, r2); scene.add(g)
    }
    const mkMask = (pos) => {
      const g = new THREE.Group(); g.position.set(pos.x, pos.y, pos.z)
      const body = new THREE.Mesh(cyl(0.48, 0.1), M.node); body.position.y = 0.05
      const rd = new THREE.Group()
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const d = new THREE.Mesh(dotGeo, M.lock); d.position.set(Math.cos(a) * 0.5, 0.11, Math.sin(a) * 0.5); rd.add(d) }
      g.add(body, rd); scene.add(g)
    }
    const originMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), M.route)
    originMesh.scale.set(1, 1.25, 1)
    originMesh.position.set(model.origin.x, model.origin.y + 0.42, model.origin.z)
    originMesh.castShadow = true
    scene.add(originMesh)
    model.mods.forEach(mkModule)
    M1.heads.forEach((p, i) => mkStep(p, 0, i === 5 ? "exam" : "step"))
    M2.heads.forEach((p, i) => mkStep(p, 1, i === 4 ? "exam" : "step"))
    M3.heads.forEach(mkMask)
    const KIDS = M1.fan.kids.map(mkReinf)
    const pin = new THREE.Group()
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8), M.ink); stem.position.y = 0.31
    const headS = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), M.signal); headS.position.y = 0.76; headS.castShadow = true
    const pulse = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 48), M.signalFlat); pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.02
    pin.add(stem, headS, pulse); scene.add(pin)
    const doneRingMat = basic({ transparent: true, opacity: 0, depthWrite: false })
    const doneRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.78, 64), doneRingMat)
    doneRing.rotation.x = -Math.PI / 2
    doneRing.position.set(model.examPos.x, model.examPos.y + 0.05, model.examPos.z)
    scene.add(doneRing)
    Object.assign(this, { scene, camera, hemi, key, M, R, ROUTE, ROUTE_LEN: acc, frac, dots3, fanOn, chevrons, NODES, KIDS, pin, pulse, doneRing, doneRingMat })
    this.tmpV = new THREE.Vector3()
  }

  // Tones from the tokens, read again on every theme switch.
  applyTheme() {
    if (!this.M) return
    const THREE = this.THREE
    const cs = getComputedStyle(this.element)
    const g = (k) => cs.getPropertyValue(k).trim()
    const C = (k) => new THREE.Color(g(k))
    const M = this.M
    // r155+ lights are physical: ×π keeps r128's legacy look.
    this.hemi.color.copy(C("--lp-sky")); this.hemi.groundColor.copy(C("--lp-ground")); this.hemi.intensity = parseFloat(g("--lp-hemi")) * Math.PI
    this.key.intensity = parseFloat(g("--lp-key")) * Math.PI
    this.scene.fog.color.copy(C("--color-bg"))
    M.panel.color.copy(C("--color-card")); M.panelLocked.color.copy(C("--color-card")); M.track.color.copy(C("--lp-track"))
    M.node.color.copy(C("--color-card")); M.ring.color.copy(C("--lp-ring")); M.lock.color.copy(C("--lp-lock"))
    M.check.color.copy(C("--color-accent-text")); M.reinf.color.copy(C("--color-reinforce"))
    M.route.color.copy(C("--color-accent")); M.glow.color.copy(C("--color-accent")); M.glow.opacity = parseFloat(g("--lp-glow"))
    M.signal.color.copy(C("--color-highlight")); M.signalFlat.color.copy(C("--color-highlight")); M.ink.color.copy(C("--color-txt"))
    this.doneRingMat.color.copy(C("--color-accent"))
    M.shadow.opacity = parseFloat(g("--lp-shadow"))
  }

  // ── names on the map ───────────────────────────────────────────────────
  buildLabels() {
    const mk = (cls, html) => { const d = document.createElement("div"); d.className = cls; if (html) d.innerHTML = html; this.labelsTarget.appendChild(d); return d }
    const [M1, M2] = this.model.mods
    this.rootL = mk("lp-mr")
    this.chipL = this.model.mods.map(() => mk("lp-mc"))
    this.stepL = [...M1.heads.map((_, i) => ({ m: 0, i })), ...M2.heads.map((_, i) => ({ m: 1, i }))]
      .map((o) => ({ ...o, el: mk("lp-ml"), num: mk("lp-mn") }))
    this.kidL = this.labelsValue.reinforcement_names.map((t) => mk("lp-ml lp-r", esc(t)))
    this.modL = [0, 1].map(() => mk("lp-ml"))
  }

  pick(e) { this.setTopic(e.currentTarget.dataset.topic) }

  setTopic(k) {
    this.topic = k
    const t = this.routesValue[k]
    if (!this.rootL) return
    this.rootL.innerHTML = `<small>${esc(this.labelsValue.your_route)}</small><b>${esc(t.title)}</b>`
    this.modL.forEach((l, m) => { l.innerHTML = `<b>${esc(t.modules[m][0])}</b>` })
    this.stepL.forEach((s) => { s.name = t.modules[s.m][1][s.i]; s.key = "" })
    this.tabTargets.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.topic === k)))
    this.chipL.forEach((c) => { c._k = "" })
  }

  buildDots() {
    this.dots = []
    for (let i = 1; i < CHAPTERS; i++) {
      const li = document.createElement("li")
      const b = document.createElement("button")
      b.type = "button"
      b.setAttribute("aria-label", this.annTargets[i].querySelector("h2").textContent)
      b.addEventListener("click", () => this.goChapter(i))
      li.appendChild(b)
      this.dotsTarget.querySelector("ol").appendChild(li)
      this.dots.push(b)
    }
  }

  // ── chapters and scroll ────────────────────────────────────────────────
  measure() {
    this.sh = window.innerHeight - NAV
    this.total = WEIGHTS.reduce((a, b) => a + b, 0)
    this.element.style.height = `${this.total * this.sh + this.sh}px`
    this.pinTop = this.element.getBoundingClientRect().top + window.scrollY - NAV
  }

  exactS() {
    let y = (window.scrollY - this.pinTop) / this.sh
    if (y <= 0) return 0
    for (let i = 0; i < WEIGHTS.length; i++) { if (y < WEIGHTS[i]) return i + y / WEIGHTS[i]; y -= WEIGHTS[i] }
    return WEIGHTS.length - 0.001
  }

  pinned() { return window.scrollY >= this.pinTop - 2 && window.scrollY <= this.pinTop + this.total * this.sh }

  scrollForChapter(i) {
    let y = 0
    for (let k = 0; k < i; k++) y += WEIGHTS[k]
    return this.pinTop + (y + (i ? 0.12 : 0) * WEIGHTS[i]) * this.sh
  }

  goChapter(i) { window.scrollTo({ top: this.scrollForChapter(i), behavior: this.reduce ? "auto" : "smooth" }) }

  resize() {
    this.measure()
    this.renderer.setSize(this.stageTarget.clientWidth, this.stageTarget.clientHeight, false)
    this.layoutAnns()
    this.frame()
  }

  // Each chapter's text, measured as a headline over a narrower body, gets its
  // camera and slot from landing_placement.js; it then rides with that spot.
  layoutAnns() {
    const Wd = this.stageTarget.clientWidth
    const H = this.stageTarget.clientHeight
    this.rest = []
    this.A = this.annTargets.map((el, i) => {
      el.style.width = `${textWidth(i, Wd)}px`
      el.style.transform = "translate(0px,0px)"
      const w = el.offsetWidth
      const h = el.offsetHeight
      const hd = el.querySelector("h1,h2")
      const e0 = el.getBoundingClientRect()
      const extent = (node) => { const r = document.createRange(); r.selectNodeContents(node); return Math.max(0, ...[...r.getClientRects()].map((c) => c.right - e0.left)) }
      const right = extent(hd)
      let bw = 0
      el.querySelectorAll(":scope > p").forEach((p) => { bw = Math.max(bw, extent(p)) })
      el.querySelectorAll(".lp-acts > *").forEach((c) => { bw = Math.max(bw, c.getBoundingClientRect().right - e0.left) })
      const hh = hd.offsetHeight + 4
      const shape = [[0, 0, Math.ceil(right), hh], [0, hh, Math.ceil(bw || right), h]]
      const lay = layoutChapter(this.model, i, Wd, H, w, h, shape)
      this.rest[i] = lay.rest
      el.dataset.lay = JSON.stringify({ x: lay.slot.x, y: lay.slot.y, w, h, hits: lay.slot.hits, d: +lay.d.toFixed(2), shape })
      return { el, i, w, h, tw: right, hm: hd.offsetHeight / 2, anchor: lay.anchor, lead: el.querySelector(".lp-lead"), x: 0, y: 0 }
    })
  }

  project(p) {
    const v = this.tmpV.set(p.x, p.y, p.z).project(this.camera)
    return { x: (v.x + 1) / 2 * this.stageTarget.clientWidth, y: (1 - v.y) / 2 * this.stageTarget.clientHeight, vis: v.z < 1 && v.z > -1 }
  }

  pxR(p, r) {
    const a = this.project(p)
    const b = this.project({ x: p.x + r, y: p.y, z: p.z })
    const c = this.project({ x: p.x, y: p.y, z: p.z + r })
    return Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y))
  }

  drawLead(a, tok) {
    const L = layFor(a.i, isPhone(this.stageTarget.clientWidth))
    if (!L.a || !a.lead) return
    const q = this.project(anchorOf(this.model, L.a, tok))
    const ax = q.x - a.x
    const ay = q.y - a.y
    let sx, sy, d
    if (ax > a.tw + 60) { sx = a.tw + 22; sy = a.hm; const k = (ax - sx) * 0.55; d = `M${sx} ${sy}C${sx + k} ${sy} ${ax - k} ${ay} ${ax} ${ay}` }
    else if (ay > a.h + 30) { sx = Math.max(12, Math.min(ax, a.w * 0.3)); sy = a.h + 18; const k = (ay - sy) * 0.55; d = `M${sx} ${sy}C${sx} ${sy + k} ${ax} ${ay - k} ${ax} ${ay}` }
    else if (ay < -30) { sx = Math.max(12, Math.min(ax, a.tw - 12)); sy = -18; const k = (ay - sy) * 0.55; d = `M${sx} ${sy}C${sx} ${sy + k} ${ax} ${ay - k} ${ax} ${ay}` }
    else { sx = -22; sy = a.hm; const k = (ax - sx) * 0.55; d = `M${sx} ${sy}C${sx + k} ${sy} ${ax - k} ${ay} ${ax} ${ay}` }
    a.lead.querySelector("path").setAttribute("d", d)
    a.lead.querySelectorAll("circle").forEach((c) => { c.setAttribute("cx", ax.toFixed(1)); c.setAttribute("cy", ay.toFixed(1)) })
  }

  // ── the story, a pure function of the scroll ───────────────────────────
  tokenU(q) {
    const i = Math.floor(q)
    const t = q - i
    if (q < 1) return 0
    if (i === 1) return lerp(0, 2, ease(clamp((t - 0.08) / 0.62)))
    if (i === 2) return lerp(2, 4, ease(clamp((t - 0.32) / 0.42)))
    if (i === 3) return lerp(4, 9, clamp((t - 0.05) / 0.7))
    return 9
  }

  tokenPos(u) {
    const itin = this.model.itinerary
    const k = Math.min(itin.length - 1, Math.floor(u))
    const f = u >= itin.length ? 1 : u - k
    return itin[k].getPointAt(clamp(this.reduce ? f : ease(clamp(f))))
  }

  place(el, p, o, mode, r, solid = true) {
    const q = this.project(p)
    const w = el.offsetWidth
    const h = el.offsetHeight
    const Wd = this.stageTarget.clientWidth
    let x, y
    if (mode === "center") { x = q.x - w / 2; y = q.y - h / 2 }
    else if (mode === "left") { x = q.x - 10; y = q.y - h / 2 }
    else if (mode === "above") { x = q.x - w * 0.2; y = q.y - h - 14 }
    else { x = Math.min(Wd - w - 6, Math.max(6, q.x - w / 2)); y = q.y + (r ? this.pxR(p, r) * 0.72 + 5 : 0) }
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    let show = o > 0 && q.vis && !this.BLK.some((b) => q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1)
    if (show && solid) {
      const R0 = { x0: x - 4, y0: y - 2, x1: x + w + 4, y1: y + h + 2 }
      if (this.PLACED.some((b) => b.x1 > R0.x0 && b.x0 < R0.x1 && b.y1 > R0.y0 && b.y0 < R0.y1)) show = false
      else this.PLACED.push(R0)
    }
    el.style.opacity = show ? o : 0
  }

  setNode(n, st) {
    if (n.state === st) return
    n.state = st
    const done = st === "done"
    const cur = st === "cur"
    n.fill.visible = done; n.chk.visible = done; n.cur.visible = cur; n.ring.visible = !done && !cur
  }

  loop() {
    this.raf = 0
    if (!this.visible || document.hidden) return
    this.frame()
    this.raf = requestAnimationFrame(() => this.loop())
  }

  frame() {
    if (!this.started) return
    const { model, R, ROUTE, M, NODES, KIDS, reduce } = this
    const [M1, M2] = model.mods
    const now = performance.now()
    const dt = Math.min(1 / 30, (now - this.lastT) / 1000)
    this.lastT = now
    const se = this.exactS()
    const isPinned = this.pinned()
    const target = reduce ? (se < 1 ? 0 : Math.floor(se) + 0.5) : se
    this.sSmooth = reduce ? target : lerp(this.sSmooth, target, 1 - Math.exp(-5.2 * dt))
    if (Math.abs(this.sSmooth - target) < 1e-4) this.sSmooth = target
    const s = this.sSmooth
    const q = Math.max(0, s - 1)
    const u = this.tokenU(reduce && q >= 1 ? Math.floor(q) + 0.9 : q)
    const tok = this.tokenPos(u)
    const sweepOn = q > 0.02 && q < 1
    const head = sweepOn ? lerp(-6, this.ROUTE_LEN + 4, clamp(((reduce ? 0.75 : q) - 0.1) / 0.6)) : -1
    const order = [[R.m[0][1], 0], [R.m[0][2], 1], [R.m[0][3], 4], [R.m[0][4], 5], [R.m[0][5], 6], [R.spine[1], 7], [R.m[1][0], 8]]
    const legFrac = (r) => {
      if (r === R.spine[0] || r === R.m[0][0]) return 1
      for (const [leg, k] of order) if (leg === r) return clamp(u - k)
      return 0
    }
    ROUTE.forEach((r) => {
      const f = legFrac(r)
      if (sweepOn && f < 1 && r.m < 2) {
        const a = (head - 8 - r.start) / r.L
        const b = (head - r.start) / r.L
        this.frac(r.bright, a, b); this.frac(r.glow, a, b)
      } else { this.frac(r.bright, 0, f); this.frac(r.glow, 0, f) }
    })
    const fr = q >= 3 ? 1 : q < 2 ? 0 : (reduce ? 1 : ss(0.02, 0.26, q - 2))
    this.dots3.forEach((im) => { im.visible = fr > 0.02 })
    KIDS.forEach((kd, k) => { const r = clamp(fr * 1.4 - k * 0.2); kd.g.visible = r > 0.01; kd.g.scale.setScalar(reduce ? 1 : Math.max(0.001, r)) })
    KIDS[0].fill.visible = u >= 2.5
    this.fanOn[0].visible = u >= 2.05 && fr > 0.5
    if (this.fanOn[0].visible) this.frac(this.fanOn[0], 0, clamp(u - 2))
    const VIS = [[0], [1], [2, 4], [5], [6], [7]]
    const doneM1 = [0, 1, 2, 3, 4, 5].map((i) => u >= [0, 1, 4, 5, 6, 7][i] + 0.5)
    const nodeOf = (m, i) => NODES.filter((n) => n.m === m)[i]
    M1.heads.forEach((_, i) => this.setNode(nodeOf(0, i), doneM1[i] ? "done" : VIS[i].some((x) => Math.abs(u - x) < 0.5) ? "cur" : "todo"))
    M2.heads.forEach((_, i) => this.setNode(nodeOf(1, i), i === 0 && u >= 8.5 ? "cur" : "todo"))
    this.chevrons.forEach((c) => { c.mesh.visible = legFrac(c.leg) < 0.5 })
    this.pin.visible = s >= 0.9
    this.pin.position.set(tok.x, tok.y + 0.06, tok.z)
    if (!reduce) { const ph = (now % 1600) / 1600; this.pulse.scale.setScalar(1 + ph * 1.6); M.signalFlat.opacity = 0.45 * (1 - ph) }
    else { this.pulse.scale.setScalar(1); M.signalFlat.opacity = 0.3 }
    if (!reduce && this.prevQ < 3.47 && q >= 3.47) this.ringT = 0
    this.prevQ = q
    if (this.ringT >= 0) {
      this.ringT += dt
      const k = clamp(this.ringT / 1.1)
      this.doneRing.scale.setScalar(1 + k * 2.2)
      this.doneRingMat.opacity = 0.6 * (1 - k)
      if (k >= 1) this.ringT = -1
    }
    // Camera: rest at the chapter's camera; move only in its last 28%.
    const i = Math.min(CHAPTERS - 1, Math.floor(s))
    const j = Math.min(CHAPTERS - 1, i + 1)
    const k = i === j ? 0 : ss(0.72, 1, s - i)
    const a = this.rest[i]
    const b = this.rest[j]
    this.camera.aspect = this.stageTarget.clientWidth / this.stageTarget.clientHeight
    this.camera.updateProjectionMatrix()
    this.camera.position.set(lerp(a.pos.x, b.pos.x, k), lerp(a.pos.y, b.pos.y, k), lerp(a.pos.z, b.pos.z, k))
    this.camera.lookAt(lerp(a.tgt.x, b.tgt.x, k), lerp(a.tgt.y, b.tgt.y, k), lerp(a.tgt.z, b.tgt.z, k))
    this.camera.updateMatrixWorld()
    this.renderer.render(this.scene, this.camera)

    // The chapter text rides with its spot on the map.
    this.A.forEach((t) => { const p = this.project(t.anchor); t.x = p.x; t.y = p.y; t.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)` })
    const chap = Math.min(CHAPTERS - 1, Math.floor(se))
    const tIn = se - chap
    const now0 = !isPinned ? -1 : chap === 0 ? (tIn < 0.86 ? 0 : -1) : (tIn > 0.03 && (tIn < 0.86 || chap === CHAPTERS - 1)) ? chap : -1
    if (now0 !== this.active) {
      this.active = now0
      this.A.forEach((t) => {
        t.el.classList.toggle("lp-on", t.i === this.active)
        t.el.querySelectorAll("a").forEach((l) => { l.tabIndex = t.i === this.active ? 0 : -1 })
      })
    }
    if (this.active > 0) this.drawLead(this.A[this.active], tok)
    this.topTarget.classList.toggle("lp-on", isPinned && s >= 0.9)
    this.dotsTarget.classList.toggle("lp-on", isPinned && s >= 0.9)
    this.dots.forEach((btn, n) => (n + 1 === chap ? btn.setAttribute("aria-current", "step") : btn.removeAttribute("aria-current")))

    // Names: by priority, never under the controls or the text, never on each other.
    const Wd = this.stageTarget.clientWidth
    const Hs = this.stageTarget.clientHeight
    const mob = isPhone(Wd)
    const L = this.labelsValue
    this.BLK = [mob ? { x0: 0, y0: Hs - 70, x1: Wd, y1: Hs } : { x0: 0, y0: 0, x1: Wd, y1: 66 }]
    const act = this.A[this.active]
    if (act) this.BLK.push({ x0: act.x - 24, y0: act.y - 18, x1: act.x + act.w + 24, y1: act.y + act.h + 18 })
    this.PLACED = act ? [{ x0: act.x - 12, y0: act.y - 10, x1: act.x + act.w + 12, y1: act.y + act.h + 10 }] : []
    const overview = q < 0.9 || q >= 4
    const close = q >= 0.9 && q < 4
    const hero = s < 0.9
    const steps = this.stepL.map((sl) => {
      const n = nodeOf(sl.m, sl.i)
      const leg = R.m[sl.m][sl.i]
      const gpos = leg.start + leg.L
      let o = 0
      if (sweepOn) o = head >= gpos ? (mob ? (head < gpos + 7 ? 1 : 0) : 1) : 0
      else if (close) o = sl.m === 0 ? (u < 7.6 ? 1 : 0.5) : (u >= 7.6 ? 1 : 0)
      const isCur = n.state === "cur" && q >= 0.9
      if (mob && o > 0 && !isCur && !sweepOn) o = 0
      if (mob && sweepOn && sl.m === 1) o = 0
      const ex = sl.i === (sl.m === 0 ? 5 : 4)
      const html = isCur ? `<small>${esc(L.here)}</small><b>${esc(sl.name)}</b>` : esc(sl.name)
      if (sl.key !== html) { sl.el.innerHTML = html; sl.key = html }
      return { sl, n, o, isCur, ex }
    })
    steps.filter((t) => t.isCur).forEach((t) => this.place(t.sl.el, t.n.pos, t.o, "below", t.ex ? 0.72 : 0.62))
    model.mods.forEach((md, m) => {
      const done = m === 0 ? doneM1.filter(Boolean).length : 0
      const n = md.heads.length
      const name = esc(fill(L.module, { n: m + 1 }))
      const html = md.locked
        ? `${LOCK_SVG}${name}<span>${esc(fill(L.topics, { count: n }))}</span>`
        : `<i></i>${name}<span>${esc(fill(L.progress, { done, total: n }))}</span>${m === 0 ? `<em>${esc(L.free)}</em>` : ""}`
      if (this.chipL[m]._k !== html) { this.chipL[m].innerHTML = html; this.chipL[m]._k = html }
      this.place(this.chipL[m], { x: -0.6, y: md.topY, z: md.top + 0.2 }, overview ? 1 : 0, "left")
    })
    this.place(this.rootL, { x: model.origin.x, y: model.origin.y + 0.7, z: model.origin.z }, overview && !mob && !hero ? 1 : 0, "above")
    this.modL.forEach((l, m) => this.place(l, model.mods[m].disc, overview && !mob && !hero ? 1 : 0, "below", 0.9))
    steps.filter((t) => !t.isCur).forEach((t) => this.place(t.sl.el, t.n.pos, t.o, "below", t.ex ? 0.72 : 0.62))
    this.kidL.forEach((l, n) => this.place(l, M1.fan.kids[n], fr > 0.6 && q < 4 && !(mob && n) ? 1 : 0, "below", 0.4))
    steps.forEach((t) => {
      t.sl.num.textContent = t.sl.i + 1
      this.place(t.sl.num, { x: t.n.pos.x, y: t.n.pos.y + 0.17, z: t.n.pos.z }, t.o > 0 && t.n.state === "todo" && !t.ex ? t.o : 0, "center", 0, false)
    })
  }
}
