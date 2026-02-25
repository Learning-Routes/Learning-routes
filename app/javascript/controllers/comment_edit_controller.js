import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    cancelText: { type: String, default: "Cancel" },
    saveText: { type: String, default: "Save" }
  }

  show(event) {
    event.preventDefault()
    const commentId = event.currentTarget.dataset.commentId
    const commentEl = document.getElementById(`comment_${commentId}`)
    if (!commentEl) return

    const body = commentEl.querySelector("[data-comment-body]")
    const editForm = commentEl.querySelector("[data-edit-form]")

    if (!body) return

    if (editForm) {
      const isHidden = editForm.style.display === "none"
      editForm.style.display = isHidden ? "block" : "none"
      body.style.display = isHidden ? "none" : ""
      if (isHidden) {
        const textarea = editForm.querySelector("textarea")
        if (textarea) textarea.focus()
      }
      return
    }

    // Build inline edit form
    const form = document.createElement("form")
    form.action = `/community_engine/comments/${commentId}`
    form.method = "post"
    form.dataset.editForm = ""
    form.style.marginBottom = "0.5rem"

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content

    form.innerHTML = `
      <input type="hidden" name="_method" value="patch">
      <input type="hidden" name="authenticity_token" value="${csrfToken}">
      <textarea name="comment[body]" rows="3"
        style="width:100%; box-sizing:border-box; padding:0.6rem 0.8rem; border-radius:11px; border:1px solid var(--color-faint, rgba(28,24,18,0.1));
               font-family:'DM Sans',sans-serif; font-size:0.82rem; color:var(--color-txt, #1C1812); background:var(--color-bg, #F5F1EB);
               resize:none; outline:none; margin-bottom:0.4rem;">${body.textContent.trim()}</textarea>
      <div style="display:flex; gap:0.4rem; justify-content:flex-end;">
        <button type="button" data-action="click->comment-edit#cancel" data-comment-id="${commentId}"
                style="padding:0.4rem 0.8rem; border-radius:11px; border:1px solid var(--color-faint, rgba(28,24,18,0.1)); background:transparent;
                       font-family:'DM Sans',sans-serif; font-size:0.75rem; color:var(--color-sub, #6D665B); cursor:pointer;">
          ${this.cancelTextValue}
        </button>
        <button type="submit"
                style="padding:0.4rem 0.8rem; border-radius:11px; border:none; background:var(--color-accent, #2C261E);
                       font-family:'DM Sans',sans-serif; font-size:0.75rem; font-weight:500; color:var(--color-accent-text, #F5F1EB); cursor:pointer;">
          ${this.saveTextValue}
        </button>
      </div>
    `

    body.style.display = "none"
    body.parentNode.insertBefore(form, body.nextSibling)
    form.querySelector("textarea").focus()
  }

  cancel(event) {
    event.preventDefault()
    const commentId = event.currentTarget.dataset.commentId
    const commentEl = document.getElementById(`comment_${commentId}`)
    if (!commentEl) return

    const body = commentEl.querySelector("[data-comment-body]")
    const editForm = commentEl.querySelector("[data-edit-form]")
    if (body) body.style.display = ""
    if (editForm) editForm.remove()
  }
}
