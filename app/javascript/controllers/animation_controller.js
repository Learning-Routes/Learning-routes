import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target
            const delay = el.dataset.delay || "0"
            el.style.animationDelay = `${delay}s`
            el.classList.add("animate-enter")
            this.observer.unobserve(el)
          }
        })
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    )

    this.elements = this.element.querySelectorAll("[data-animate]")
    this.elements.forEach((el) => this.observer.observe(el))
  }

  disconnect() {
    if (this.observer) this.observer.disconnect()
  }
}
