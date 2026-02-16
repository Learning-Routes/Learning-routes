import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["svg", "tooltip", "detailPanel"]

  async connect() {
    // Mind map will be implemented with D3.js in a future iteration
    // For now, the review partial shows a grid of completed steps
  }
}
