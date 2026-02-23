import { Controller } from "@hotwired/stimulus"

// Audio Player Controller
// Manages HTML5 audio playback with custom UI for learning lessons
export default class extends Controller {
  static targets = [
    "playBtn", "playIcon", "pauseIcon",
    "progressBar", "progressFill", "bufferedFill",
    "currentTime", "totalTime",
    "speedBtn", "speedDisplay",
    "volumeSlider",
    "waveform",
    "loadingState", "playerState", "errorState"
  ]

  static values = {
    src: String,
    stepId: String,
    duration: Number,
    autoGenerate: { type: Boolean, default: false },
    generateUrl: String,
    statusUrl: String,
    pollInterval: { type: Number, default: 3000 }
  }

  connect() {
    this.audio = new Audio()
    this.isPlaying = false
    this.currentSpeed = 1.0
    this.speeds = [0.75, 1.0, 1.25, 1.5, 2.0]
    this.speedIndex = 1
    this.pollTimer = null

    this.bindAudioEvents()

    if (this.srcValue) {
      this.loadAudio(this.srcValue)
    } else if (this.autoGenerateValue) {
      this.triggerGeneration()
    }
  }

  disconnect() {
    if (this.audio) {
      this.audio.pause()
      this.audio.src = ""
    }
    this.stopPolling()
  }

  // --- Audio Events ---

  bindAudioEvents() {
    this.audio.addEventListener("loadedmetadata", () => {
      this.updateTotalTime()
      this.showPlayer()
    })

    this.audio.addEventListener("timeupdate", () => {
      this.updateProgress()
      this.updateCurrentTime()
    })

    this.audio.addEventListener("progress", () => {
      this.updateBuffered()
    })

    this.audio.addEventListener("ended", () => {
      this.isPlaying = false
      this.updatePlayButton()
      this.onAudioEnded()
    })

    this.audio.addEventListener("error", (e) => {
      console.error("[AudioPlayer] Error:", e)
      this.showError()
    })

    this.audio.addEventListener("canplay", () => {
      this.showPlayer()
    })
  }

  // --- Playback Controls ---

  togglePlay() {
    if (this.isPlaying) {
      this.pause()
    } else {
      this.play()
    }
  }

  play() {
    this.audio.play().then(() => {
      this.isPlaying = true
      this.updatePlayButton()
    }).catch(err => {
      console.error("[AudioPlayer] Play failed:", err)
    })
  }

  pause() {
    this.audio.pause()
    this.isPlaying = false
    this.updatePlayButton()
  }

  // --- Speed Control ---

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % this.speeds.length
    this.currentSpeed = this.speeds[this.speedIndex]
    this.audio.playbackRate = this.currentSpeed

    if (this.hasSpeedDisplayTarget) {
      this.speedDisplayTarget.textContent = `${this.currentSpeed}x`
    }
  }

  // --- Progress / Seek ---

  seek(event) {
    if (!this.audio.duration) return

    const bar = this.progressBarTarget
    const rect = bar.getBoundingClientRect()
    const x = event.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))

    this.audio.currentTime = percentage * this.audio.duration
    this.updateProgress()
  }

  skipBack() {
    this.audio.currentTime = Math.max(0, this.audio.currentTime - 10)
  }

  skipForward() {
    this.audio.currentTime = Math.min(this.audio.duration || 0, this.audio.currentTime + 10)
  }

  // --- Volume ---

  changeVolume(event) {
    this.audio.volume = parseFloat(event.target.value)
  }

  // --- On-demand Generation ---

  async triggerGeneration() {
    this.showLoading()

    try {
      const response = await fetch(this.generateUrlValue, {
        method: "POST",
        headers: {
          "X-CSRF-Token": this.csrfToken(),
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      })

      const data = await response.json()

      if (data.status === "ready" && data.audio_url) {
        this.loadAudio(data.audio_url)
      } else if (data.status === "generating") {
        this.startPolling()
      }
    } catch (err) {
      console.error("[AudioPlayer] Generation trigger failed:", err)
      this.showError()
    }
  }

  startPolling() {
    this.stopPolling()
    this.pollTimer = setInterval(() => this.checkStatus(), this.pollIntervalValue)
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  async checkStatus() {
    try {
      const response = await fetch(this.statusUrlValue, {
        headers: { "Accept": "application/json" }
      })
      const data = await response.json()

      if (data.status === "ready") {
        this.stopPolling()
        this.loadAudio(data.audio_url)
        if (data.transcript) {
          this.dispatch("transcriptReady", { detail: { transcript: data.transcript } })
        }
      } else if (data.status === "failed") {
        this.stopPolling()
        this.showError()
      }
    } catch (err) {
      console.error("[AudioPlayer] Status check failed:", err)
    }
  }

  // --- UI Updates ---

  loadAudio(src) {
    this.audio.src = src
    this.audio.load()
    this.srcValue = src
  }

  updatePlayButton() {
    if (this.hasPlayIconTarget && this.hasPauseIconTarget) {
      this.playIconTarget.classList.toggle("hidden", this.isPlaying)
      this.pauseIconTarget.classList.toggle("hidden", !this.isPlaying)
    }
  }

  updateProgress() {
    if (!this.audio.duration || !this.hasProgressFillTarget) return

    const pct = (this.audio.currentTime / this.audio.duration) * 100
    this.progressFillTarget.style.width = `${pct}%`
  }

  updateBuffered() {
    if (!this.audio.buffered.length || !this.hasBufferedFillTarget) return

    const bufferedEnd = this.audio.buffered.end(this.audio.buffered.length - 1)
    const pct = (bufferedEnd / this.audio.duration) * 100
    this.bufferedFillTarget.style.width = `${pct}%`
  }

  updateCurrentTime() {
    if (this.hasCurrentTimeTarget) {
      this.currentTimeTarget.textContent = this.formatTime(this.audio.currentTime)
    }
  }

  updateTotalTime() {
    if (this.hasTotalTimeTarget) {
      this.totalTimeTarget.textContent = this.formatTime(this.audio.duration)
    }
  }

  showLoading() {
    if (this.hasLoadingStateTarget) this.loadingStateTarget.classList.remove("hidden")
    if (this.hasPlayerStateTarget) this.playerStateTarget.classList.add("hidden")
    if (this.hasErrorStateTarget) this.errorStateTarget.classList.add("hidden")
  }

  showPlayer() {
    if (this.hasLoadingStateTarget) this.loadingStateTarget.classList.add("hidden")
    if (this.hasPlayerStateTarget) this.playerStateTarget.classList.remove("hidden")
    if (this.hasErrorStateTarget) this.errorStateTarget.classList.add("hidden")
  }

  showError() {
    if (this.hasLoadingStateTarget) this.loadingStateTarget.classList.add("hidden")
    if (this.hasPlayerStateTarget) this.playerStateTarget.classList.add("hidden")
    if (this.hasErrorStateTarget) this.errorStateTarget.classList.remove("hidden")
  }

  onAudioEnded() {
    // Dispatch event so other controllers (quiz, voice recorder) can react
    this.dispatch("ended", {
      detail: { stepId: this.stepIdValue }
    })
  }

  // --- Helpers ---

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]')
    return meta ? meta.content : ""
  }
}
