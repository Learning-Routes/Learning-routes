# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"

# WP-37: the journey map's pure geometry and camera (no DOM), tested under node
# by test/javascript/journey_map_layout_test.rb and journey_camera_test.rb.
pin "journey_map_layout", to: "lib/journey_map_layout.js"
pin "journey_camera", to: "lib/journey_camera.js"

# Motion Canvas runtime — built by bin/motion-build, committed because the image
# has no node. Lazy-imported (the mermaid_diagram_controller.js:13 idiom,
# `await import(...)`) by whichever controller mounts a narrated scene, so a
# lesson with no scene never fetches the ~186 KB. `vendor/javascript` is :self
# under CSP.
pin "mc", to: "mc.js", preload: false

# === Content Delivery ===

# KaTeX - math formula rendering
pin "katex", to: "https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.mjs"

# Ace Editor - code editor for exercises
pin "ace-builds", to: "https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-min-noconflict/ace.js"

# === Diagram Rendering ===
# Exact patch pin — a major-only (@11) pin auto-upgrades and could pull a
# compromised release.
pin "mermaid", to: "https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.esm.min.mjs"

# === Client-side HTML sanitization (defense-in-depth) ===
pin "dompurify", to: "https://cdn.jsdelivr.net/npm/dompurify@3.4.12/dist/purify.es.mjs"

# === Celebration System ===
pin "canvas-confetti", to: "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.module.mjs"
