import { Controller } from "@hotwired/stimulus"

// Lazy, the way mermaid_diagram_controller.js:13 lazy-imports Mermaid: mc.js is
// ~186 KB and most lessons have no scene.
let mcModule = null

export default class extends Controller {
  static targets = ["stage", "play", "note"]
  static values = { scene: String, data: Object, narration: String, stepId: String, sectionIndex: Number }

  async play() {
    const mc = await this._loadRuntime()
    if (!mc) return this._degrade("runtime")   // _degrade is written in Task 16 Step 5;
                                                // until then it may be a console.error stub

    this._handle = mc.mount(this.stageTarget, this.sceneValue, {
      data: this.dataValue,
      words: null,
      onToken: (i) => this._reportToken(i)
    })
    this._handle.play()
  }

  // The only thing a test can read off a canvas.
  _reportToken(i) {
    if (i === null || i === undefined) this.element.removeAttribute("data-motion-active-token")
    else this.element.setAttribute("data-motion-active-token", String(i))
  }

  async _loadRuntime() {
    try {
      mcModule ??= await import("mc")
      return window.mc
    } catch (e) {
      console.error("[motion-scene] runtime failed to load", e)
      return null
    }
  }

  // A stub until Task 16 wires the guard-refused and reduced-motion states: the
  // narration above already renders unconditionally, so a failed mount here
  // leaves the student with the content rather than a blank block.
  _degrade(reason) {
    console.error(`[motion-scene] degraded: ${reason}`)
  }
}
