import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["editor", "textarea", "output", "runBtn"]
  static values = { language: String, initialCode: String }

  connect() {
    // Use textarea as fallback - Monaco can be loaded lazily later
    this.running = false
  }

  async run() {
    if (this.running) return
    this.running = true
    this.runBtnTarget.textContent = "Running..."
    this.runBtnTarget.style.opacity = "0.6"

    const code = this.textareaTarget.value
    const lang = this.languageValue || "python"

    try {
      if (lang === "javascript" || lang === "js") {
        this.runJavaScript(code)
      } else if (lang === "python") {
        await this.runPython(code)
      } else {
        this.outputTarget.textContent = "Language " + lang + " is not supported in the browser sandbox."
        this.outputTarget.style.color = "#f59e0b"
      }
    } catch (e) {
      this.outputTarget.textContent = "Error: " + e.message
      this.outputTarget.style.color = "#ef4444"
    } finally {
      this.running = false
      this.runBtnTarget.textContent = "Run ▶"
      this.runBtnTarget.style.opacity = "1"
    }
  }

  runJavaScript(code) {
    const logs = []
    const sandbox = { console: { log: function() { logs.push(Array.from(arguments).join(" ")) } } }

    try {
      const fn = new Function("console", code)
      fn(sandbox.console)
      this.outputTarget.textContent = logs.join("\n") || "(no output)"
      this.outputTarget.style.color = "#10b981"
    } catch (e) {
      this.outputTarget.textContent = "Error: " + e.message
      this.outputTarget.style.color = "#ef4444"
    }
  }

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
}
