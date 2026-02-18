import { Controller } from "@hotwired/stimulus"

// Canvas 2D particle system for auth pages
// Floating colored particles, breathing ring circles, connection lines, mouse repulsion
export default class extends Controller {
  connect() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    this.canvas = this.element
    this.ctx = this.canvas.getContext("2d")
    this.dpr = window.devicePixelRatio || 1
    this.particles = []
    this.circles = []
    this.animId = null
    this.mouse = { x: -9999, y: -9999 }

    this.nodeColors = [
      "#8B80C4", "#6E9BC8", "#B5718E",
      "#B09848", "#B06050", "#5BA880"
    ]

    this.resize()
    this.initParticles()
    this.initCircles()
    this.loop()

    this._onResize = this.resize.bind(this)
    this._onMouseMove = this.onMouseMove.bind(this)
    this._onMouseLeave = this.onMouseLeave.bind(this)
    window.addEventListener("resize", this._onResize)
    window.addEventListener("mousemove", this._onMouseMove)
    window.addEventListener("mouseleave", this._onMouseLeave)
  }

  disconnect() {
    if (this.animId) cancelAnimationFrame(this.animId)
    window.removeEventListener("resize", this._onResize)
    window.removeEventListener("mousemove", this._onMouseMove)
    window.removeEventListener("mouseleave", this._onMouseLeave)
  }

  onMouseMove(e) {
    this.mouse.x = e.clientX
    this.mouse.y = e.clientY
  }

  onMouseLeave() {
    this.mouse.x = -9999
    this.mouse.y = -9999
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.w = w
    this.h = h
    this.canvas.width = w * this.dpr
    this.canvas.height = h * this.dpr
    this.canvas.style.width = w + "px"
    this.canvas.style.height = h + "px"
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  initParticles() {
    this.particles = []
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 1.5 + Math.random() * 3,
        color: this.nodeColors[i % this.nodeColors.length],
        vx: (Math.random() - 0.5) * 0.44,
        vy: (Math.random() - 0.5) * 0.44,
        baseVx: 0,
        baseVy: 0,
        opacity: 0.35 + Math.random() * 0.35
      })
    }
    // Store base velocities
    for (const p of this.particles) {
      p.baseVx = p.vx
      p.baseVy = p.vy
    }
  }

  initCircles() {
    this.circles = []
    for (let i = 0; i < 5; i++) {
      this.circles.push({
        x: 0.1 * this.w + Math.random() * 0.8 * this.w,
        y: 0.1 * this.h + Math.random() * 0.8 * this.h,
        baseR: 28 + Math.random() * 50,
        color: this.nodeColors[i % this.nodeColors.length],
        phase: Math.random() * Math.PI * 2,
        speed: 0.004 + Math.random() * 0.006,
        opacity: 0.12 + Math.random() * 0.1
      })
    }
  }

  loop() {
    this.update()
    this.draw()
    this.animId = requestAnimationFrame(this.loop.bind(this))
  }

  update() {
    const repulseRadius = 120
    const repulseStrength = 1.8

    for (const p of this.particles) {
      // Mouse repulsion
      const dx = p.x - this.mouse.x
      const dy = p.y - this.mouse.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < repulseRadius && dist > 0) {
        const force = (1 - dist / repulseRadius) * repulseStrength
        const ax = (dx / dist) * force
        const ay = (dy / dist) * force
        p.vx += ax * 0.08
        p.vy += ay * 0.08
      }

      // Ease velocity back to base drift
      p.vx += (p.baseVx - p.vx) * 0.03
      p.vy += (p.baseVy - p.vy) * 0.03

      p.x += p.vx
      p.y += p.vy

      // Wrap around edges
      if (p.x < -10) p.x = this.w + 10
      if (p.x > this.w + 10) p.x = -10
      if (p.y < -10) p.y = this.h + 10
      if (p.y > this.h + 10) p.y = -10
    }

    for (const c of this.circles) {
      c.phase += c.speed
    }
  }

  draw() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.w, this.h)

    // Breathing ring circles (stroke only)
    for (const c of this.circles) {
      const scale = 1 + Math.sin(c.phase) * 0.08
      const r = c.baseR * scale
      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = this.withAlpha(c.color, c.opacity)
      ctx.lineWidth = 1.2
      ctx.stroke()
    }

    // Connection lines between particles
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i]
        const b = this.particles[j]
        const dist = this.distance(a, b)
        if (dist < 110) {
          const alpha = (1 - dist / 110) * 0.18
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = this.withAlpha(a.color, alpha)
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }
    }

    // Particle-to-circle lines
    for (const p of this.particles) {
      for (const c of this.circles) {
        const dist = this.distance(p, c)
        if (dist < 140) {
          const alpha = (1 - dist / 140) * 0.12
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(c.x, c.y)
          ctx.strokeStyle = this.withAlpha(p.color, alpha)
          ctx.lineWidth = 0.4
          ctx.stroke()
        }
      }
    }

    // Particles (small dots)
    for (const p of this.particles) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = this.withAlpha(p.color, p.opacity)
      ctx.fill()
    }
  }

  distance(a, b) {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  withAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
}
