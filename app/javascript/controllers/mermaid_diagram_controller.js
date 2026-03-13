import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["chart"]

  async connect() {
    const mermaid = (await import("mermaid")).default

    const isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
                   document.querySelector('[data-layout="learning"]') !== null

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
      themeVariables: isDark ? {
        primaryColor: "#6366f1",
        primaryTextColor: "#E8E4DC",
        primaryBorderColor: "#4f46e5",
        lineColor: "#8b5cf6",
        secondaryColor: "#1e1b4b",
        tertiaryColor: "#312e81",
        background: "#0f0f23",
        mainBkg: "#1e1b4b",
        nodeBorder: "#6366f1",
        clusterBkg: "#1e1b4b",
        titleColor: "#E8E4DC",
        edgeLabelBackground: "#1e1b4b"
      } : {
        primaryColor: "#6366f1",
        primaryTextColor: "#1C1812",
        primaryBorderColor: "#4f46e5",
        lineColor: "#8b5cf6",
        secondaryColor: "#f5f3ff",
        tertiaryColor: "#ede9fe",
        background: "#F5F1EB",
        mainBkg: "#f5f3ff",
        nodeBorder: "#6366f1",
        clusterBkg: "#f5f3ff",
        titleColor: "#1C1812",
        edgeLabelBackground: "#F5F1EB"
      },
      flowchart: { curve: "basis", padding: 15 },
      fontFamily: "'DM Sans', sans-serif"
    })

    await mermaid.run({ nodes: this.chartTargets })
  }
}
