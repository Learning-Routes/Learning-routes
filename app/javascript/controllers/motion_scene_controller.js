import { Controller } from "@hotwired/stimulus"

// Lazy, the way mermaid_diagram_controller.js:13 lazy-imports Mermaid: mc.js is
// ~186 KB and most lessons have no scene.
let mcModule = null

export default class extends Controller {
  static targets = ["stage", "play", "note"]
  static values = { scene: String, data: Object, narration: String, stepId: String, sectionIndex: Number }

  // The scene has no colours of its own (WP-36 Checkpoint 2). Every colour it
  // paints with is a page token, read here at mount and handed over in the
  // `theme` bag — so the SAME compiled scene is legible on the light theme and
  // on the dark one. `hi`/`hi2` are the two chip fills; the rest are the app's
  // own text and semantic tokens, which the scene must not restate.
  static THEME_TOKENS = {
    ink: "--color-txt",
    sub: "--color-sub",
    muted: "--color-muted",
    ok: "--color-positive",
    bad: "--color-negative",
    hi: "--color-motion-hi",
    hi2: "--color-motion-hi2",
    okWash: "--color-positive-bg",
    badWash: "--color-negative-bg"
  }

  async play() {
    const mc = await this._loadRuntime()
    if (!mc) return this._degrade("runtime")   // _degrade is written in Task 16 Step 5;
                                                // until then it may be a console.error stub

    this._handle = mc.mount(this.stageTarget, this.sceneValue, {
      data: this.dataValue,
      theme: this._readTheme(),
      words: null,
      onToken: (i) => this._reportToken(i)
    })
    this._handle.play()
  }

  // Reads the page's tokens off <html>, the pattern at
  // route_journey_controller.js:104-114: one getComputedStyle, one trimmed
  // getter per custom property.
  //
  // The FALLBACK differs from that one on purpose. route_journey names a literal
  // per token (`get("--color-txt") || "#F0EDE6"`); nine of those here would be
  // the light palette compiled into JavaScript, which is the very thing the
  // ruling deleted from the two .tsx files — moved one file across, and just as
  // invisible. So the fallback is all-or-nothing instead: if any token reads
  // empty (no stylesheet yet, a token renamed away), this returns null, `theme`
  // never reaches the scene, and the scene falls back to app/motion's single
  // light bag (lib/theme.ts FALLBACK_THEME). One fallback palette, in one place,
  // and a loud console error naming the token that went missing.
  _readTheme() {
    const style = getComputedStyle(document.documentElement)
    const get = (prop) => style.getPropertyValue(prop).trim()

    const theme = {}
    for (const [key, prop] of Object.entries(this.constructor.THEME_TOKENS)) {
      const value = get(prop)
      if (!value) {
        console.error(`[motion-scene] ${prop} is not defined on the page; the scene falls back to its own light palette`)
        return null
      }
      theme[key] = value
    }
    return theme
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
