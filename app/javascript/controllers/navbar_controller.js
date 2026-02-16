import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["bar", "menu"]

  connect() {
    this.scrolled = false
    this.menuOpen = false
    this.onScroll = this.handleScroll.bind(this)
    window.addEventListener("scroll", this.onScroll, { passive: true })
    this.handleScroll()
  }

  disconnect() {
    window.removeEventListener("scroll", this.onScroll)
  }

  handleScroll() {
    const scrolled = window.scrollY > 20
    if (scrolled === this.scrolled) return
    this.scrolled = scrolled
    this.barTarget.classList.toggle("nav-scrolled", scrolled)
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen
    this.menuTarget.classList.toggle("hidden", !this.menuOpen)
  }

  closeMenu() {
    this.menuOpen = false
    this.menuTarget.classList.add("hidden")
  }
}
