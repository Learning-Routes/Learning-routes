# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"

# === Content Delivery ===

# KaTeX - math formula rendering
pin "katex", to: "https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.mjs"

# Ace Editor - code editor for exercises
pin "ace-builds", to: "https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-min-noconflict/ace.js"

# === Diagram Rendering ===
pin "mermaid", to: "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"

# === Celebration System ===
pin "canvas-confetti", to: "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.module.mjs"
