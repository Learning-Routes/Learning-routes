import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  show(event) {
    event.preventDefault()
    const commentId = event.currentTarget.dataset.commentId
    const form = document.getElementById(`reply_form_${commentId}`)
    if (!form) return

    const isHidden = form.style.display === "none" || form.classList.contains("hidden")
    if (isHidden) {
      form.classList.remove("hidden")
      form.style.display = "block"
      const textarea = form.querySelector("textarea")
      if (textarea) textarea.focus()
    } else {
      form.classList.add("hidden")
      form.style.display = "none"
    }
  }
}
