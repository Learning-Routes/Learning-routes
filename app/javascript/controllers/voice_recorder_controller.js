import { Controller } from "@hotwired/stimulus"

// Voice Recorder Controller
// State machine: idle → recording → preview → submitting → evaluating → result
export default class extends Controller {
  static targets = [
    "recordButton", "stopButton", "previewButton", "submitButton",
    "timer", "waveform",
    "stateIdle", "stateRecording", "statePreview",
    "stateSubmitting", "stateEvaluating", "stateResult"
  ]

  static values = {
    submitUrl: String,
    stepId: String,
    evaluationUrl: String,
    maxDuration: { type: Number, default: 120 }
  }

  connect() {
    this.mediaRecorder = null
    this.audioChunks = []
    this.recordingBlob = null
    this.previewAudio = null
    this.timerInterval = null
    this.elapsedSeconds = 0
    this.pollTimer = null
    this.stream = null
    this.showState("idle")
  }

  disconnect() {
    this.cleanup()
  }

  // ── Recording ──

  async startRecording() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
      })

      this.audioChunks = []
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this._supportedMimeType()
      })

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data)
      }

      this.mediaRecorder.onstop = () => {
        this.recordingBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType })
        this.showState("preview")
      }

      this.mediaRecorder.start(100)
      this.showState("recording")
      this._startTimer()

      this._maxTimeout = setTimeout(() => this.stopRecording(), this.maxDurationValue * 1000)
    } catch (err) {
      console.error("[VoiceRecorder] Mic access denied:", err)
    }
  }

  stopRecording() {
    clearTimeout(this._maxTimeout)

    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.stop()
    }

    this._stopTimer()
    this._releaseStream()
  }

  // ── Preview ──

  playPreview() {
    if (!this.recordingBlob) return

    if (this.previewAudio) {
      this.previewAudio.pause()
      URL.revokeObjectURL(this.previewAudio.src)
    }

    const url = URL.createObjectURL(this.recordingBlob)
    this.previewAudio = new Audio(url)
    this.previewAudio.play().catch(err => {
      console.error("[VoiceRecorder] Preview playback failed:", err)
    })
  }

  // ── Submit ──

  async submit() {
    if (!this.recordingBlob) return

    this.showState("submitting")

    try {
      const formData = new FormData()
      formData.append("audio", this.recordingBlob, `voice_${this.stepIdValue}.webm`)
      formData.append("route_step_id", this.stepIdValue)

      const response = await fetch(this.submitUrlValue, {
        method: "POST",
        headers: {
          "X-CSRF-Token": this._csrfToken(),
          "Accept": "application/json"
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      const data = await response.json()
      this.showState("evaluating")
      this.pollEvaluation(data.id)
    } catch (err) {
      console.error("[VoiceRecorder] Submit failed:", err)
      this.showState("idle")
    }
  }

  // ── Evaluation Polling ──

  pollEvaluation(voiceResponseId) {
    this.pollTimer = setInterval(async () => {
      try {
        const url = `${this.evaluationUrlValue}/${voiceResponseId}`
        const response = await fetch(url, { headers: { "Accept": "application/json" } })
        const data = await response.json()

        if (data.status === "completed") {
          clearInterval(this.pollTimer)
          this.showResult(data)
        } else if (data.status === "failed") {
          clearInterval(this.pollTimer)
          this.showState("idle")
        }
      } catch (err) {
        console.error("[VoiceRecorder] Poll failed:", err)
      }
    }, 3000)
  }

  // ── Result ──

  showResult(data) {
    this.showState("result")

    if (!this.hasStateResultTarget) return

    const el = this.stateResultTarget
    const scoreEl = el.querySelector("[data-score]")
    const feedbackEl = el.querySelector("[data-feedback]")
    const transcriptEl = el.querySelector("[data-transcript]")
    const strengthsEl = el.querySelector("[data-strengths]")
    const improvementsEl = el.querySelector("[data-improvements]")

    if (scoreEl) scoreEl.textContent = `${data.score ?? 0}/100`
    if (feedbackEl) feedbackEl.textContent = data.ai_evaluation?.feedback || ""
    if (transcriptEl) transcriptEl.textContent = data.transcription || ""

    if (strengthsEl && data.ai_evaluation?.strengths) {
      strengthsEl.innerHTML = data.ai_evaluation.strengths
        .map(s => `<li class="text-sm text-gray-300">+ ${this._escapeHtml(s)}</li>`)
        .join("")
    }

    if (improvementsEl && data.ai_evaluation?.improvements) {
      improvementsEl.innerHTML = data.ai_evaluation.improvements
        .map(s => `<li class="text-sm text-gray-300">&rarr; ${this._escapeHtml(s)}</li>`)
        .join("")
    }
  }

  // ── Retry ──

  retry() {
    this.recordingBlob = null
    this.audioChunks = []

    if (this.previewAudio) {
      this.previewAudio.pause()
      URL.revokeObjectURL(this.previewAudio.src)
      this.previewAudio = null
    }

    this.showState("idle")
  }

  // ── Timer ──

  updateTimer() {
    if (!this.hasTimerTarget) return
    const remaining = Math.max(0, this.maxDurationValue - this.elapsedSeconds)
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    this.timerTarget.textContent = `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // ── State Management ──

  showState(state) {
    const states = ["idle", "recording", "preview", "submitting", "evaluating", "result"]

    states.forEach(s => {
      const hasMethod = `hasState${s.charAt(0).toUpperCase() + s.slice(1)}Target`
      const targetMethod = `state${s.charAt(0).toUpperCase() + s.slice(1)}Target`

      if (this[hasMethod]) {
        this[targetMethod].classList.toggle("hidden", s !== state)
      }
    })
  }

  // ── Private ──

  _startTimer() {
    this.elapsedSeconds = 0
    this.updateTimer()
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++
      this.updateTimer()
      if (this.elapsedSeconds >= this.maxDurationValue) this.stopRecording()
    }, 1000)
  }

  _stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  _releaseStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
  }

  cleanup() {
    clearTimeout(this._maxTimeout)
    clearInterval(this.pollTimer)
    this._stopTimer()
    this._releaseStream()

    if (this.previewAudio) {
      this.previewAudio.pause()
      URL.revokeObjectURL(this.previewAudio.src)
    }
  }

  _supportedMimeType() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type
    }
    return "audio/webm"
  }

  _csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || ""
  }

  _escapeHtml(str) {
    const div = document.createElement("div")
    div.textContent = str
    return div.innerHTML
  }
}
