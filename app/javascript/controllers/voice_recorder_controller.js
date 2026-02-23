import { Controller } from "@hotwired/stimulus"

// Voice Recorder Controller
// Records user audio responses using MediaRecorder API
export default class extends Controller {
  static targets = [
    "recordBtn", "stopBtn", "submitBtn",
    "preview", "previewAudio",
    "timer", "status",
    "idleState", "recordingState", "previewState", "submittingState",
    "evaluatingState", "resultState"
  ]

  static values = {
    stepId: String,
    submitUrl: String,
    maxDuration: { type: Number, default: 180 } // 3 minutes max
  }

  connect() {
    this.mediaRecorder = null
    this.audioChunks = []
    this.recordingBlob = null
    this.timerInterval = null
    this.elapsedSeconds = 0
    this.stream = null
  }

  disconnect() {
    if (this.evalPollTimer) clearInterval(this.evalPollTimer)
    this.stopRecording()
    this.releaseStream()
  }

  // --- Recording ---

  async startRecording() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      })

      this.audioChunks = []
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.getSupportedMimeType()
      })

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = () => {
        this.recordingBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType })
        this.showPreview()
      }

      this.mediaRecorder.start(100) // collect data every 100ms
      this.showRecording()
      this.startTimer()

      // Auto-stop after max duration
      this.maxDurationTimeout = setTimeout(() => {
        this.stopRecording()
      }, this.maxDurationValue * 1000)

    } catch (err) {
      console.error("[VoiceRecorder] Microphone access denied:", err)
      this.showMicError()
    }
  }

  stopRecording() {
    if (this.maxDurationTimeout) {
      clearTimeout(this.maxDurationTimeout)
    }

    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.stop()
    }

    this.stopTimer()
  }

  // --- Preview ---

  showPreview() {
    if (this.recordingBlob && this.hasPreviewAudioTarget) {
      const url = URL.createObjectURL(this.recordingBlob)
      this.previewAudioTarget.src = url
    }

    this.showState("preview")
    this.releaseStream()
  }

  reRecord() {
    this.recordingBlob = null
    this.audioChunks = []
    this.showState("idle")
  }

  // --- Submit ---

  async submitRecording() {
    if (!this.recordingBlob) return

    this.showState("submitting")

    try {
      const formData = new FormData()
      formData.append("audio_file", this.recordingBlob, `voice_response_${this.stepIdValue}.webm`)
      formData.append("step_id", this.stepIdValue)

      const response = await fetch(this.submitUrlValue, {
        method: "POST",
        headers: {
          "X-CSRF-Token": this.csrfToken(),
          "Accept": "application/json"
        },
        body: formData
      })

      const data = await response.json()

      if (data.status === "evaluating") {
        this.showState("evaluating")
        this.startEvaluationPolling(data.voice_response_id)
      } else {
        this.showState("idle")
      }
    } catch (err) {
      console.error("[VoiceRecorder] Submit failed:", err)
      this.showState("idle")
    }
  }

  // --- Evaluation Polling ---

  startEvaluationPolling(responseId) {
    this.evalPollTimer = setInterval(async () => {
      try {
        const response = await fetch(`/assessments/voice_responses/${responseId}`, {
          headers: { "Accept": "application/json" }
        })
        const data = await response.json()

        if (data.status === "completed") {
          clearInterval(this.evalPollTimer)
          this.showEvaluationResult(data)
        } else if (data.status === "failed") {
          clearInterval(this.evalPollTimer)
          this.showState("idle")
        }
      } catch (err) {
        console.error("[VoiceRecorder] Poll failed:", err)
      }
    }, 3000)
  }

  showEvaluationResult(data) {
    this.showState("result")

    if (this.hasResultStateTarget) {
      const el = this.resultStateTarget
      const scoreEl = el.querySelector("[data-score]")
      const feedbackEl = el.querySelector("[data-feedback]")
      const transcriptEl = el.querySelector("[data-transcript]")

      if (scoreEl) scoreEl.textContent = `${data.score}/100`
      if (feedbackEl) feedbackEl.textContent = data.evaluation?.feedback || ""
      if (transcriptEl) transcriptEl.textContent = data.transcription || ""
    }
  }

  // --- Timer ---

  startTimer() {
    this.elapsedSeconds = 0
    this.updateTimerDisplay()

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++
      this.updateTimerDisplay()

      if (this.elapsedSeconds >= this.maxDurationValue) {
        this.stopRecording()
      }
    }, 1000)
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  updateTimerDisplay() {
    if (this.hasTimerTarget) {
      const mins = Math.floor(this.elapsedSeconds / 60)
      const secs = this.elapsedSeconds % 60
      this.timerTarget.textContent = `${mins}:${secs.toString().padStart(2, "0")}`
    }
  }

  // --- State Management ---

  showState(state) {
    const states = ["idle", "recording", "preview", "submitting", "evaluating", "result"]

    states.forEach(s => {
      const target = `${s}StateTarget`
      const hasTarget = `has${s.charAt(0).toUpperCase() + s.slice(1)}StateTarget`

      if (this[hasTarget] && this[target]) {
        this[target].classList.toggle("hidden", s !== state)
      }
    })
  }

  showMicError() {
    if (this.hasStatusTarget) {
      this.statusTarget.textContent = "No se pudo acceder al micrófono. Verifica los permisos."
      this.statusTarget.classList.remove("hidden")
    }
  }

  showRecording() {
    this.showState("recording")
  }

  // --- Helpers ---

  getSupportedMimeType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4"
    ]

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type
    }

    return "audio/webm"
  }

  releaseStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
  }

  csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]')
    return meta ? meta.content : ""
  }
}
