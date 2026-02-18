import { Controller } from "@hotwired/stimulus"

// Simple mobile menu toggle for the authenticated app navbar.
export default class extends Controller {
  static targets = ["menu", "menuBtn"]

  toggleMenu() {
    const isOpen = this.menuTarget.style.display === "none"
    this.menuTarget.style.display = isOpen ? "block" : "none"
    this.menuBtnTarget.setAttribute("aria-expanded", isOpen)
  }
}
