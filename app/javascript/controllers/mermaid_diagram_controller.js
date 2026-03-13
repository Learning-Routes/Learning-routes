import { Controller } from "@hotwired/stimulus"

// Track global init state so Mermaid.initialize is called exactly once
let mermaidInitialized = false
let mermaidModule = null

export default class extends Controller {
  static targets = ["chart"]

  async connect() {
    if (!mermaidModule) {
      mermaidModule = (await import("mermaid")).default
    }
    this._mermaid = mermaidModule

    if (!mermaidInitialized) {
      const isDark = this._isDarkMode()

      this._mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: isDark ? this._darkTheme() : this._lightTheme(),
        flowchart: { curve: "basis", padding: 15, htmlLabels: true },
        sequence: { mirrorActors: false, bottomMarginAdj: 1 },
        fontFamily: "'DM Sans', sans-serif",
        securityLevel: "strict"
      })
      mermaidInitialized = true
    }

    await this._renderAll()
  }

  async _renderAll() {
    for (const el of this.chartTargets) {
      await this._renderChart(el)
    }
  }

  async _renderChart(el) {
    const code = el.textContent.trim()
    if (!code) return

    const id = `mermaid-${crypto.randomUUID().slice(0, 8)}`

    try {
      const { svg } = await this._mermaid.render(id, code)
      el.innerHTML = svg

      // Make SVG responsive
      const svgEl = el.querySelector("svg")
      if (svgEl) {
        svgEl.removeAttribute("height")
        svgEl.style.maxWidth = "100%"
        svgEl.style.height = "auto"
      }

      el.classList.add("mermaid--rendered")

      // Enable pinch-to-zoom on touch devices
      this._enableTouchZoom(el)
    } catch (err) {
      console.warn("[mermaid-diagram] Render failed:", err.message)
      this._showFallback(el, code)
    }
  }

  _enableTouchZoom(el) {
    let scale = 1
    let startDist = 0

    el.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        startDist = this._getTouchDistance(e.touches)
      }
    }, { passive: false })

    el.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dist = this._getTouchDistance(e.touches)
        const newScale = Math.min(Math.max(scale * (dist / startDist), 0.5), 3)
        const svgEl = el.querySelector("svg")
        if (svgEl) {
          svgEl.style.transform = `scale(${newScale})`
          svgEl.style.transformOrigin = "center center"
        }
        startDist = dist
        scale = newScale
      }
    }, { passive: false })

    el.addEventListener("touchend", () => {
      if (scale < 0.8) {
        scale = 1
        const svgEl = el.querySelector("svg")
        if (svgEl) svgEl.style.transform = "scale(1)"
      }
    })
  }

  _getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  _showFallback(el, code) {
    el.classList.add("mermaid--error")
    el.innerHTML = `
      <div class="mermaid-fallback">
        <div class="mermaid-fallback__header">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>Diagram could not be rendered</span>
        </div>
        <pre class="mermaid-fallback__code"><code>${this._escapeHtml(code)}</code></pre>
      </div>
    `
  }

  _escapeHtml(str) {
    const div = document.createElement("div")
    div.textContent = str
    return div.innerHTML
  }

  _isDarkMode() {
    return document.documentElement.getAttribute("data-theme") === "dark" ||
           document.querySelector('[data-layout="learning"]') !== null
  }

  _darkTheme() {
    return {
      primaryColor: "#2C261E",
      primaryTextColor: "#E8E4DC",
      primaryBorderColor: "#5BA880",
      lineColor: "#6E9BC8",
      secondaryColor: "#1C1812",
      tertiaryColor: "#2C261E",
      background: "#111111",
      mainBkg: "#2C261E",
      nodeBorder: "#5BA880",
      clusterBkg: "#1C1812",
      clusterBorder: "#5BA880",
      titleColor: "#E8E4DC",
      edgeLabelBackground: "#1C1812",
      nodeTextColor: "#E8E4DC",
      actorTextColor: "#E8E4DC",
      actorBorder: "#6E9BC8",
      actorBkg: "#2C261E",
      activationBorderColor: "#5BA880",
      activationBkgColor: "#1C1812",
      signalColor: "#E8E4DC",
      labelBoxBkgColor: "#2C261E",
      labelBoxBorderColor: "#5BA880",
      labelTextColor: "#E8E4DC",
      noteBkgColor: "#2C261E",
      noteBorderColor: "#B09848",
      noteTextColor: "#E8E4DC",
      sectionBkgColor: "#2C261E",
      sectionBkgColor2: "#1C1812",
      altSectionBkgColor: "#1C1812",
      taskBkgColor: "#5BA880",
      taskTextColor: "#1C1812",
      taskBorderColor: "#5BA880",
      gridColor: "#3a3428",
      doneTaskBkgColor: "#6E9BC8",
      cScale0: "#5BA880",
      cScale1: "#6E9BC8",
      cScale2: "#B09848",
      cScale3: "#8B80C4",
      cScale4: "#C87E6E",
      cScale5: "#5BA880"
    }
  }

  _lightTheme() {
    return {
      primaryColor: "#F5F1EB",
      primaryTextColor: "#1C1812",
      primaryBorderColor: "#5BA880",
      lineColor: "#6E9BC8",
      secondaryColor: "#EDE8E0",
      tertiaryColor: "#F5F1EB",
      background: "#FFFFFF",
      mainBkg: "#F5F1EB",
      nodeBorder: "#5BA880",
      clusterBkg: "#F5F1EB",
      clusterBorder: "#5BA880",
      titleColor: "#1C1812",
      edgeLabelBackground: "#F5F1EB",
      nodeTextColor: "#1C1812",
      actorTextColor: "#1C1812",
      actorBorder: "#6E9BC8",
      actorBkg: "#F5F1EB",
      activationBorderColor: "#5BA880",
      activationBkgColor: "#EDE8E0",
      signalColor: "#1C1812",
      labelBoxBkgColor: "#F5F1EB",
      labelBoxBorderColor: "#5BA880",
      labelTextColor: "#1C1812",
      noteBkgColor: "#FFF9E6",
      noteBorderColor: "#B09848",
      noteTextColor: "#1C1812",
      sectionBkgColor: "#F5F1EB",
      sectionBkgColor2: "#EDE8E0",
      altSectionBkgColor: "#EDE8E0",
      taskBkgColor: "#5BA880",
      taskTextColor: "#FFFFFF",
      taskBorderColor: "#5BA880",
      gridColor: "#d9d3c9",
      doneTaskBkgColor: "#6E9BC8",
      cScale0: "#5BA880",
      cScale1: "#6E9BC8",
      cScale2: "#B09848",
      cScale3: "#8B80C4",
      cScale4: "#C87E6E",
      cScale5: "#5BA880"
    }
  }
}
