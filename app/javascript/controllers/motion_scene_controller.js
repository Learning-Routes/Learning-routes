import { Controller } from "@hotwired/stimulus"

// Lazy, the way mermaid_diagram_controller.js:13 lazy-imports Mermaid: mc.js is
// ~186 KB and most lessons have no scene.
let mcModule = null

// WP-36 §16: the picture follows the voice. Wired here:
//   - `play` makes ONE status check against the same section-audio endpoint
//     `_section_audio_player` polls. Narration is either already there
//     (a previous visit, or — once Task 8 turns purchased-module prefetch
//     back on — MediaPrefetchJob) or it is not, and on a first visit it
//     almost never will be: ElevenLabs takes real seconds, and this click
//     must not make the student stare at a blank canvas for it. So a "pending"
//     narration kicks off generation in the background (fire-and-forget — no
//     poll, no await) and the scene mounts immediately on its OWN fixed
//     timings; a later replay, or the next visit, picks up the finished
//     narration and syncs for real. Blocking the very first mount on a
//     network+ElevenLabs round trip is exactly what turned
//     test/system/motion_scene_test.rb red while this was being built: the
//     canvas has to exist within its 10s wait, not within ElevenLabs' SLA.
//   - Once both are up, an <audio> element is ground truth: `timeupdate`
//     compares it against the player's clock and corrects drift through
//     `mc.driftSeek` (app/motion/src/lib/sync.ts, node-tested in isolation —
//     see test/javascript/motion_sync_test.rb). Pause/resume/replay on the
//     button just drive the audio; the audio's own play/pause/ended events
//     drive the player, so there is exactly one source of truth for "are we
//     playing" and it can never fall out of step with itself.
//   - Two failure states, both WP-35 "visible and local": a spend-guard
//     refusal shows the matching translated sentence and plays the scene on
//     its own fixed timings (no audio to sync to); mc.js failing to load
//     hides the canvas entirely and reveals the same narration as a plain
//     audio-only player (`_section_audio_player`, already built and tested).
export default class extends Controller {
  static targets = ["stage", "play", "note", "audioFallback"]
  static values = {
    scene: String, data: Object, narration: String, stepId: String, sectionIndex: Number,
    generateUrl: String, statusUrl: String,
    guardMessages: Object, genericError: String,
    playLabel: String, pauseLabel: String, replayLabel: String
  }

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

  connect() {
    this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    this._mc = null
    this._handle = null
    this._audio = null
    this._ended = false
    this._degraded = false
    this._loggedCueStats = false
  }

  disconnect() {
    this._teardownAudio()
    if (this._handle) {
      this._handle.destroy()
      this._handle = null
    }
  }

  // The single button toggles through every state: first click starts it,
  // a click while playing pauses both, a click while paused resumes both, and
  // a click after it ended replays both from the top.
  async play() {
    if (this._degraded) return // the fallback player below has its own button

    if (!this._handle) return this._start()
    if (this._ended) return this._replay()

    if (this._audio) {
      if (this._audio.paused) this._audio.play().catch(() => {})
      else this._audio.pause()
      return
    }

    // Fixed-timing path (no narration to sync to): replay the scene itself.
    this._handle.play()
  }

  async _start() {
    const mc = await this._loadRuntime()
    if (!mc) return this._degrade("runtime")
    this._mc = mc

    if (this.hasPlayTarget) this.playTarget.disabled = true
    const narration = await this._prepareNarration()
    if (this.hasPlayTarget) this.playTarget.disabled = false

    if (narration.status === "ready" && narration.audioUrl) {
      this._mountWithAudio(mc, narration.audioUrl, narration.words)
    } else {
      // "pending" is not a failure — narration was just kicked off in the
      // background — so it gets no note at all, only the fixed-timing scene.
      const noteKind = narration.status === "failed" ? (narration.kind || "generic") : null
      this._mountFixedTiming(mc, noteKind)
    }
  }

  _mountWithAudio(mc, audioUrl, words) {
    this._audio = new Audio(audioUrl)
    this._handle = mc.mount(this.stageTarget, this.sceneValue, {
      data: this.dataValue,
      theme: this._readTheme(),
      words: words ?? null,
      onToken: (i) => this._reportToken(i)
    })

    if (this._reducedMotion) {
      this._holdAtFinalFrame(this._handle)
    } else {
      this._onTimeUpdate = () => this._syncToAudio()
      this._audio.addEventListener("timeupdate", this._onTimeUpdate)
    }

    // The audio is the one source of truth for "are we playing"; the player
    // only ever follows it, so pause/resume can never desync the two.
    this._onAudioPlay = () => { this._handle.player.togglePlayback(true); this._setLabel("pause") }
    this._onAudioPause = () => {
      if (this._ended) return // 'pause' fires just before 'ended' in most browsers; _finish() owns that transition
      this._handle.player.togglePlayback(false)
      this._setLabel("play")
    }
    this._onAudioEnded = () => this._finish()
    this._audio.addEventListener("play", this._onAudioPlay)
    this._audio.addEventListener("pause", this._onAudioPause)
    this._audio.addEventListener("ended", this._onAudioEnded)

    this._ended = false
    this._setLabel("pause")
    // Both start together: mount() already put the player in motion; the
    // audio joins it in the same tick rather than the next.
    this._audio.play().catch(() => {})
  }

  _mountFixedTiming(mc, kind) {
    if (kind) this._showNote(kind === "generic" ? null : kind)
    this._handle = mc.mount(this.stageTarget, this.sceneValue, {
      data: this.dataValue,
      theme: this._readTheme(),
      words: null,
      onToken: (i) => this._reportToken(i)
    })

    if (this._reducedMotion) {
      this._holdAtFinalFrame(this._handle)
    } else {
      this._handle.play()
      this._logCueFallbackRateOnceFinished(this._handle)
    }
    this._ended = false
    this._setLabel("play")
  }

  // Compares the audio (ground truth) against the player's own clock and
  // seeks the picture when they have drifted past `mc.driftSeek`'s threshold.
  // `player.status` is Motion Canvas's own public read-only view of the
  // playback clock (time in SECONDS, plus the seconds<->frames conversion);
  // `player.requestSeek` is the public, queued seek API — see
  // Player.d.ts: it clamps and defers to the run loop, unlike the lower-level
  // `playback.seek(frame)` (marked @internal on PlaybackManager) which the
  // run loop itself calls and which would race it if called directly here.
  _syncToAudio() {
    const status = this._handle.player.status
    const target = this._mc.driftSeek(status.time, this._audio.currentTime)
    if (target !== null) {
      this._handle.player.requestSeek(status.secondsToFrames(target))
    }
  }

  _finish() {
    this._ended = true
    this._holdAtFinalFrame(this._handle)
    this._setLabel("replay")
    this._logCueFallbackRate()
  }

  _replay() {
    this._ended = false
    if (this._audio) {
      this._audio.currentTime = 0
      // Reduced motion never leaves the final frame in the first place — only
      // the audio restarts. Otherwise, hand the player back to frame 0; the
      // audio's own 'play' listener re-starts it a moment later.
      if (!this._reducedMotion) this._handle.player.requestReset()
      this._audio.play().catch(() => {})
    } else {
      this._handle.play()
    }
  }

  // Reduced motion (§16 step 4, same media query as route_journey_controller.js:64):
  // the picture renders its FINAL frame from the start and never animates: pause
  // immediately (mount() already started it), then take the first duration this
  // scene reports and seek there once. Reused for "ended", too — Motion Canvas's
  // own default when a non-looping animation finishes naturally is to pause AND
  // rewind to frame 0 (Player.js `prepare()`), which is the opposite of what WP-36
  // §16 wants at the end of the narration, so every path that must land ON the
  // final frame goes through this instead of that default.
  _holdAtFinalFrame(handle) {
    handle.player.togglePlayback(false)
    const off = handle.player.onDurationChanged.subscribe((frames) => {
      if (frames > 0) {
        handle.player.requestSeek(frames)
        off()
      }
    })
  }

  // Task 19's handoff reads the fallback rate off this line: how often a cue
  // the scene named could not be found in the narration and fell back to its
  // fixed duration instead. See app/motion/src/lib/cues.ts cueStats().
  _logCueFallbackRate() {
    if (!this._handle) return
    const { asked, missed } = this._handle.cueStats()
    const rate = asked > 0 ? Math.round((missed / asked) * 1000) / 10 : 0
    console.info(`[motion-scene] cue fallback rate: ${rate}% (${missed}/${asked} cues missed)`)
  }

  // The fixed-timing path has no 'ended' event to hang this off (there is no
  // audio), so it logs once the player pauses on its own for the first time —
  // which, on this path, only ever happens when the scene finishes, since
  // nothing here ever calls togglePlayback(false) itself.
  _logCueFallbackRateOnceFinished(handle) {
    const off = handle.player.onStateChanged.subscribe((state) => {
      if (state.paused && !this._loggedCueStats) {
        this._loggedCueStats = true
        this._logCueFallbackRate()
        off()
      }
    })
  }

  // ONE status check — never a blocking poll; see the class comment above for
  // why. Resolves to exactly one of:
  //   {status: "ready", audioUrl, words}
  //   {status: "failed", kind}    — a spend-guard refusal (kind is one of
  //                                 daily_budget/user_budget/rate_limit)
  //   {status: "failed"}          — any other already-recorded failure
  //   {status: "pending"}         — nothing generated yet; generation is
  //                                 kicked off in the background (fire and
  //                                 forget) for a later replay or visit to
  //                                 pick up, and this call does not wait on it
  async _prepareNarration() {
    const status = await this._fetchStatus()

    if (status.status === "pending" || status.status === "generating") {
      if (status.status === "pending") this._triggerGenerate() // no await: never blocks this mount
      return { status: "pending" }
    }
    if (status.status === "ready" && status.audio_url) {
      return { status: "ready", audioUrl: status.audio_url, words: status.words ?? null }
    }
    return { status: "failed", kind: status.kind }
  }

  async _fetchStatus() {
    try {
      const res = await fetch(this.statusUrlValue, { headers: { Accept: "application/json" } })
      return await res.json()
    } catch (e) {
      console.error("[motion-scene] narration status check failed", e)
      return { status: "failed" }
    }
  }

  _triggerGenerate() {
    fetch(this.generateUrlValue, {
      method: "POST",
      headers: {
        "X-CSRF-Token": this._csrfToken(),
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ section_text: this.narrationValue })
    }).catch((e) => console.error("[motion-scene] narration generation request failed", e))
  }

  _showNote(kind) {
    if (!this.hasNoteTarget) return
    const message = (kind && this.guardMessagesValue[kind]) || this.genericErrorValue
    this.noteTarget.textContent = message
    this.noteTarget.hidden = false
  }

  _setLabel(kind) {
    if (!this.hasPlayTarget) return
    const label = kind === "pause" ? this.pauseLabelValue
      : kind === "replay" ? this.replayLabelValue
      : this.playLabelValue
    this.playTarget.textContent = label
  }

  _teardownAudio() {
    if (!this._audio) return
    this._audio.removeEventListener("timeupdate", this._onTimeUpdate)
    this._audio.removeEventListener("play", this._onAudioPlay)
    this._audio.removeEventListener("pause", this._onAudioPause)
    this._audio.removeEventListener("ended", this._onAudioEnded)
    this._audio.pause()
    this._audio.src = ""
    this._audio = null
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

  // mc.js unavailable (§16 step 5): hide the canvas and its play button, and
  // reveal the same narration as a plain audio-only player — the already-built,
  // already-tested `section-audio` controller, mode "mini" — rather than
  // reimplementing generate/poll a second time for a degraded path.
  _degrade(reason) {
    console.error(`[motion-scene] degraded: ${reason}`)
    this._degraded = true
    if (this.hasStageTarget) this.stageTarget.hidden = true
    if (this.hasPlayTarget) this.playTarget.hidden = true
    if (this.hasAudioFallbackTarget) this.audioFallbackTarget.hidden = false
  }

  _csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]')
    return meta ? meta.content : ""
  }
}
