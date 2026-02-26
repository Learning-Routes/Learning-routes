module CommunityEngine
  class PostsController < ApplicationController
    def create
      @post = Post.new(post_params)
      @post.user = current_user

      if @post.save
        ActivityTracker.track!(user: current_user, action: "posted", trackable: @post, metadata: { preview: @post.body.truncate(80) })

        respond_to do |format|
          format.turbo_stream do
            render turbo_stream: [
              turbo_stream.prepend("posts_list", partial: "community_engine/posts/post", locals: { post: @post }),
              turbo_stream.replace("post_form_container", partial: "community_engine/posts/post_form")
            ]
          end
          format.html { redirect_to community_engine.feed_path, notice: t("community_engine.posts.created") }
        end
      else
        respond_to do |format|
          format.turbo_stream do
            render turbo_stream: turbo_stream.replace(
              "post_form_errors",
              html: content_tag(:p, @post.errors.full_messages.join(", "),
                style: "font-family:'DM Sans',sans-serif; font-size:0.75rem; color:var(--color-error, #B06050); margin:0 0 0.5rem;")
            )
          end
          format.html { redirect_to community_engine.feed_path, alert: @post.errors.full_messages.join(", ") }
        end
      end
    end

    def destroy
      @post = Post.find(params[:id])

      unless @post.owned_by?(current_user)
        return redirect_to community_engine.feed_path, alert: t("community_engine.posts.unauthorized")
      end

      @post.destroy

      respond_to do |format|
        format.turbo_stream { render turbo_stream: turbo_stream.remove("post_#{@post.id}") }
        format.html { redirect_to community_engine.feed_path, notice: t("community_engine.posts.deleted") }
      end
    end

    private

    def post_params
      params.require(:post).permit(:body)
    end
  end
end
