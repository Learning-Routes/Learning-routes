import { Controller } from "@hotwired/stimulus"

/**
 * section-audio controller
 *
 * Per-section audio player with on-demand ElevenLabs TTS generation.
 * Supports inline mini-player (concept sections) and full waveform player.
 *
 * Targets:
 *   generateBtn   — "Generar audio" button (shown when no audio)
 *   playerWrap    — player container (hidden until audio ready)
 *   playBtn       — play/pause button
 *   playIcon      — play SVG icon
 *   pauseIcon     — pause SVG icon
 *   progressBar   — clickable progress track
 *   progressFill  — filled portion of progress bar
 *   currentTime   — elapsed time display
 *   totalTime     — total duration display
 *   speedBtn      — speed cycle button
 *   waveformBar   — individual waveform bars (multiple)
 *   loadingState  — loading spinner shown during generation
 *   errorState    — error message container
 *
 * Values:
 *   url           — pre-existing audio URL (if cached)
 *   stepId        — route step ID
 *   sectionIndex  — section index within the lesson
 *   sectionText   — raw section text for TTS generation
 *   generateUrl   — POST endpoint to trigger generation
 *   statusUrl     — GET endpoint to poll generation status
 *   mode          — "mini" (inline in concept) or "full" (waveform player)
 */
export default class extends Controller {
  static targets = [
    "generateBtn", "playerWrap",
    "playBtn", "playIcon", "pauseIcon",
    "progressBar", "progressFill",
    "currentTime", "totalTime",
    "speedBtn",
    "waveformBar",
    "loadingState", "errorState"
  ]

  static values = {
    url: String,
    stepId: String,
    sectionIndex: Number,
    sectionText: String,
    generateUrl: String,
    statusUrl: String,
    mode: { type: String, default: "mini" }
  }

  connect() {
    this.audio = new Audio()
    this.isPlaying = false
    this.speeds = [0.75, 1.0, 1.25, 1.5, 2.0]
    this.speedIndex = 1
    this._pollTimer = null
    this._timers = []
    this._rafId = null
    this._loadFailed = false
    this._audioLoaded = false

    this._bindAudioEvents()

    if (this.urlValue) {
      // Show player UI optimistically but don't auto-load audio
      // Audio will load on first play to avoid "Error" on expired/invalid URLs
      this._showPlayer()
    } else {
      this._showGenerate()
    }
  }

  disconnect() {
    this._stopPolling()
    this._timers.forEach(id => clearTimeout(id))
    this._timers = []
    if (this._rafId) cancelAnimationFrame(this._rafId)
    if (this.audio) {
      this.audio.pause()
      this.audio.src = ""
    }
    this._unbindAudioEvents()
  }

  // ── Actions ──────────────────────────────────────────────────

  generate() {
    if (this._generating) return
    this._generating = true
    this._showLoading()

    fetch(this.generateUrlValue, {
      method: "POST",
      headers: {
        "X-CSRF-Token": this._csrfToken(),
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ section_text: this.sectionTextValue })
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === "ready" && data.audio_url) {
          this._generating = false
          this._loadAudio(data.audio_url)
          this._showPlayer()
        } else if (data.status === "generating") {
          this._startPolling()
        } else if (data.status === "error") {
          this._generating = false
          this._showError()
        }
      })
      .catch(() => {
        this._generating = false
        this._showError()
      })
  }

  playPause() {
    if (this.isPlaying) {
      this.audio.pause()
      this.isPlaying = false
    } else {
      // Lazy-load audio on first play to avoid errors from expired URLs
      if (this.urlValue && !this._audioLoaded) {
        this._audioLoaded = true
        this._loadAudio(this.urlValue)
      }
      this.audio.play().then(() => {
        this.isPlaying = true
        this._startWaveformAnimation()
      }).catch(() => {})
    }
    this._updatePlayIcon()
  }

  seek(event) {
    if (!this.audio.duration || !this.hasProgressBarTarget) return
    const rect = this.progressBarTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    this.audio.currentTime = pct * this.audio.duration
  }

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % this.speeds.length
    const speed = this.speeds[this.speedIndex]
    this.audio.playbackRate = speed
    if (this.hasSpeedBtnTarget) {
      this.speedBtnTarget.textContent = `${speed}x`
    }
  }

  // ── Audio events ─────────────────────────────────────────────

  _bindAudioEvents() {
    this._onLoadedMetadata = () => {
      if (this.hasTotalTimeTarget) {
        this.totalTimeTarget.textContent = this._formatTime(this.audio.duration)
      }
      this._showPlayer()
    }
    this._onTimeUpdate = () => {
      this._updateProgress()
      this._updateCurrentTime()
    }
    this._onEnded = () => {
      this.isPlaying = false
      this._updatePlayIcon()
      this._stopWaveformAnimation()
      this._resetWaveformBars()
    }
    this._onError = () => {
      // If audio fails to load (expired URL, 404, etc.), fall back to generate button
      // instead of showing a scary error — user can re-generate
      if (!this._generating) {
        this.urlValue = ""
        this._audioLoaded = false
        this._showGenerate()
      } else {
        this._showError()
      }
    }
    this._onPause = () => {
      this.isPlaying = false
      this._updatePlayIcon()
      this._stopWaveformAnimation()
    }
    this._onPlay = () => {
      this.isPlaying = true
      this._updatePlayIcon()
      this._startWaveformAnimation()
    }

    this.audio.addEventListener("loadedmetadata", this._onLoadedMetadata)
    this.audio.addEventListener("timeupdate", this._onTimeUpdate)
    this.audio.addEventListener("ended", this._onEnded)
    this.audio.addEventListener("error", this._onError)
    this.audio.addEventListener("pause", this._onPause)
    this.audio.addEventListener("play", this._onPlay)
  }

  _unbindAudioEvents() {
    if (!this.audio) return
    this.audio.removeEventListener("loadedmetadata", this._onLoadedMetadata)
    this.audio.removeEventListener("timeupdate", this._onTimeUpdate)
    this.audio.removeEventListener("ended", this._onEnded)
    this.audio.removeEventListener("error", this._onError)
    this.audio.removeEventListener("pause", this._onPause)
    this.audio.removeEventListener("play", this._onPlay)
  }

  // ── Polling ──────────────────────────────────────────────────

  _startPolling() {
    this._stopPolling()
    this._pollAttempts = 0
    this._pollTimer = setInterval(() => this._checkStatus(), 2000)
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  }

  _checkStatus() {
    this._pollAttempts++
    // Timeout after 60 seconds (30 polls × 2s)
    if (this._pollAttempts > 30) {
      this._stopPolling()
      this._generating = false
      this._showError()
      return
    }

    fetch(this.statusUrlValue, { headers: { "Accept": "application/json" } })
      .then(res => res.json())
      .then(data => {
        if (data.status === "ready") {
          this._stopPolling()
          this._generating = false
          this._loadAudio(data.audio_url)
          this._showPlayer()
        } else if (data.status === "failed") {
          this._stopPolling()
          this._generating = false
          this._showError()
        }
      })
      .catch(() => {})
  }

  // ── UI updates ───────────────────────────────────────────────

  _loadAudio(src) {
    this._audioLoaded = true
    this.audio.src = src
    this.audio.load()
    this.urlValue = src
  }

  _updateProgress() {
    if (!this.audio.duration || !this.hasProgressFillTarget) return
    const pct = (this.audio.currentTime / this.audio.duration) * 100
    this.progressFillTarget.style.width = `${pct}%`
  }

  _updateCurrentTime() {
    if (this.hasCurrentTimeTarget) {
      this.currentTimeTarget.textContent = this._formatTime(this.audio.currentTime)
    }
  }

  _updatePlayIcon() {
    if (this.hasPlayIconTarget) {
      this.playIconTarget.style.display = this.isPlaying ? "none" : ""
    }
    if (this.hasPauseIconTarget) {
      this.pauseIconTarget.style.display = this.isPlaying ? "" : "none"
    }
  }

  _showGenerate() {
    if (this.hasGenerateBtnTarget) this.generateBtnTarget.style.display = ""
    if (this.hasPlayerWrapTarget) this.playerWrapTarget.style.display = "none"
    if (this.hasLoadingStateTarget) this.loadingStateTarget.style.display = "none"
    if (this.hasErrorStateTarget) this.errorStateTarget.style.display = "none"
  }

  _showLoading() {
    if (this.hasGenerateBtnTarget) this.generateBtnTarget.style.display = "none"
    if (this.hasPlayerWrapTarget) this.playerWrapTarget.style.display = "none"
    if (this.hasLoadingStateTarget) this.loadingStateTarget.style.display = ""
    if (this.hasErrorStateTarget) this.errorStateTarget.style.display = "none"
  }

  _showPlayer() {
    if (this.hasGenerateBtnTarget) this.generateBtnTarget.style.display = "none"
    if (this.hasPlayerWrapTarget) this.playerWrapTarget.style.display = ""
    if (this.hasLoadingStateTarget) this.loadingStateTarget.style.display = "none"
    if (this.hasErrorStateTarget) this.errorStateTarget.style.display = "none"
  }

  _showError() {
    if (this.hasGenerateBtnTarget) this.generateBtnTarget.style.display = "none"
    if (this.hasPlayerWrapTarget) this.playerWrapTarget.style.display = "none"
    if (this.hasLoadingStateTarget) this.loadingStateTarget.style.display = "none"
    if (this.hasErrorStateTarget) this.errorStateTarget.style.display = ""
  }

  // ── Waveform animation ───────────────────────────────────────

  _startWaveformAnimation() {
    if (!this.hasWaveformBarTarget) return
    this._stopWaveformAnimation()

    const animate = () => {
      if (!this.isPlaying || !this.audio.duration) return
      const pct = this.audio.currentTime / this.audio.duration
      const total = this.waveformBarTargets.length
      const filledCount = Math.floor(pct * total)

      this.waveformBarTargets.forEach((bar, i) => {
        if (i < filledCount) {
          bar.style.background = "var(--color-section-audio-active, #6366f1)"
          bar.style.opacity = "1"
        } else if (i === filledCount) {
          bar.style.background = "var(--color-section-audio-active, #6366f1)"
          bar.style.opacity = "0.6"
        } else {
          bar.style.background = "var(--color-accent, #2C261E)"
          bar.style.opacity = "0.25"
        }
      })

      this._rafId = requestAnimationFrame(animate)
    }

    this._rafId = requestAnimationFrame(animate)
  }

  _stopWaveformAnimation() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  _resetWaveformBars() {
    this.waveformBarTargets.forEach(bar => {
      bar.style.background = "var(--color-accent, #2C261E)"
      bar.style.opacity = "0.25"
    })
  }

  // ── Helpers ──────────────────────────────────────────────────

  _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  _csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]')
    return meta ? meta.content : ""
  }
}
