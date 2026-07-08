import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["editor", "textarea", "output", "runBtn"]
  static values = { language: String, initialCode: String }

  connect() {
    this.running = false
    this._pendingCode = null
    this._sandboxReady = false
    this._execTimeout = null
    this._messageHandler = this._handleSandboxMessage.bind(this)
    window.addEventListener("message", this._messageHandler)
    this._createSandbox()
  }

  disconnect() {
    if (this._messageHandler) {
      window.removeEventListener("message", this._messageHandler)
      this._messageHandler = null
    }
    this._clearExecTimeout()
    if (this._sandbox) {
      this._sandbox.remove()
      this._sandbox = null
    }
    this._sandboxReady = false
  }

  async run() {
    if (this.running) return
    this.running = true
    this._setRunning(true)

    const code = this.textareaTarget.value
    const lang = this.languageValue || "python"

    try {
      if (lang === "javascript" || lang === "js") {
        // Async: runs in the sandboxed iframe; the button is reset when the
        // 'result' message comes back (or on timeout), not here.
        this._runJavaScript(code)
        return
      } else if (lang === "python") {
        await this.runPython(code)
      } else {
        this.outputTarget.textContent = "Language " + lang + " is not supported in the browser sandbox."
        this.outputTarget.style.color = "#f59e0b"
      }
    } catch (e) {
      this.outputTarget.textContent = "Error: " + e.message
      this.outputTarget.style.color = "#ef4444"
    }

    this._finishRun()
  }

  // === Sandboxed JavaScript execution =======================================
  // User JS is executed inside an <iframe sandbox="allow-scripts"> (no
  // allow-same-origin), so it runs at an opaque origin with no access to the
  // app's cookies, DOM, or storage. This replaces the previous dynamic
  // Function-constructor call, which ran user code directly in the page context.

  _runJavaScript(code) {
    this.outputTarget.textContent = ""
    this.outputTarget.style.color = ""

    if (!code.trim()) {
      this._finishRun()
      return
    }

    if (!this._sandboxReady) {
      // Sandbox iframe hasn't reported ready yet — queue and run on 'ready'.
      this._pendingCode = code
      this._armExecTimeout()
      return
    }

    this._armExecTimeout()
    this._sandbox.contentWindow.postMessage({ type: "execute", code }, "*")
  }

  _createSandbox() {
    if (this._sandbox) this._sandbox.remove()

    this._sandbox = document.createElement("iframe")
    this._sandbox.src = "/sandbox.html"
    // CRITICAL: allow-scripts WITHOUT allow-same-origin.
    this._sandbox.setAttribute("sandbox", "allow-scripts")
    this._sandbox.style.cssText = "width:0;height:0;border:none;position:absolute;left:-9999px;"
    this._sandboxReady = false
    document.body.appendChild(this._sandbox)
  }

  _handleSandboxMessage(event) {
    // Only accept messages from THIS controller's sandbox iframe.
    if (!this._sandbox || event.source !== this._sandbox.contentWindow) return

    const data = event.data || {}
    switch (data.type) {
      case "ready":
        this._sandboxReady = true
        if (this._pendingCode) {
          const code = this._pendingCode
          this._pendingCode = null
          this._sandbox.contentWindow.postMessage({ type: "execute", code }, "*")
        }
        break

      case "console":
        this._appendOutput(data.text, data.method)
        break

      case "result":
        this._clearExecTimeout()
        if (!data.success && data.error) this._appendOutput(data.error, "error")
        // Fresh sandbox for the next run (clean global state).
        this._createSandbox()
        this._finishRun()
        break
    }
  }

  _armExecTimeout() {
    this._clearExecTimeout()
    // Runaway user code (e.g. `while(true){}`) only freezes the sandbox iframe,
    // not the page. Tear it down after 5s so the UI recovers.
    this._execTimeout = setTimeout(() => {
      this._appendOutput("Execution timed out after 5s.", "error")
      this._pendingCode = null
      this._createSandbox()
      this._finishRun()
    }, 5000)
  }

  _clearExecTimeout() {
    if (this._execTimeout) {
      clearTimeout(this._execTimeout)
      this._execTimeout = null
    }
  }

  _appendOutput(text, method = "log") {
    const color = method === "error" ? "#ef4444" : method === "warn" ? "#f59e0b" : method === "info" ? "#3b82f6" : "#10b981"
    const line = document.createElement("div")
    line.className = "console-line"
    line.style.color = color
    line.textContent = text
    this.outputTarget.appendChild(line)
    this.outputTarget.scrollTop = this.outputTarget.scrollHeight
  }

  // === Python execution (Pyodide / WASM, unchanged) =========================
  // Python runs in Pyodide's WebAssembly interpreter. NOTE: the Pyodide runtime
  // still loads in the page context; sandboxing it in the iframe as well is a
  // sensible follow-up.

  async runPython(code) {
    if (typeof loadPyodide === "undefined") {
      this.outputTarget.textContent = "Loading Python runtime..."
      this.outputTarget.style.color = "#f59e0b"

      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js"
      document.head.appendChild(script)

      await new Promise((resolve, reject) => {
        script.onload = resolve
        script.onerror = reject
      })
    }

    if (!this.pyodide) {
      this.outputTarget.textContent = "Initializing Python..."
      this.pyodide = await loadPyodide()
    }

    try {
      this.pyodide.runPython("import io, sys; sys.stdout = io.StringIO()")
      this.pyodide.runPython(code)
      const output = this.pyodide.runPython("sys.stdout.getvalue()")
      this.outputTarget.textContent = output || "(no output)"
      this.outputTarget.style.color = "#10b981"
    } catch (e) {
      this.outputTarget.textContent = "Error: " + e.message
      this.outputTarget.style.color = "#ef4444"
    }
  }

  reset() {
    this.textareaTarget.value = this.initialCodeValue || ""
    this.outputTarget.textContent = "Click Run to execute..."
    this.outputTarget.style.color = "#10b981"
  }

  _setRunning(isRunning) {
    if (!this.hasRunBtnTarget) return
    this.runBtnTarget.textContent = isRunning ? "Running..." : "Run ▶"
    this.runBtnTarget.style.opacity = isRunning ? "0.6" : "1"
  }

  _finishRun() {
    this.running = false
    this._setRunning(false)
  }
}
