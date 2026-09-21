module LearningRoutesEngine
  # The film and its captions, served by the app instead of by Active Storage.
  #
  # WHY THIS EXISTS
  #
  # `rails_storage_proxy_path` answers to anyone who has the URL. Active Storage
  # says so in the warning above its own ProxyController: "All Active Storage
  # controllers are publicly accessible by default. The generated URLs are hard to
  # guess, but permanent by design." The lesson PAGE is entitlement-gated
  # (steps_controller.rb:173 → ModuleAccessPolicy → Commerce::RoutePurchase.entitled?);
  # a proxy URL for the video on that page was not gated by anything. One student
  # copying `<source src>` out of devtools published a paid film to everyone,
  # permanently, with no purchase and no session.
  #
  # WHY IT SUBCLASSES StepsController RATHER THAN REPEATING ITS CALLBACKS
  #
  # The requirement is "the same before_action chain as steps#show", and the only
  # way to hold that under maintenance is to inherit the chain rather than to copy
  # it: `authenticate_user!`, `authorize_module_access!`, `set_route_and_step` and
  # `ensure_step_accessible!` are the parent's own methods, so a change to the read
  # gate reaches this controller on the same commit. A copy would drift, and the
  # thing it would drift away from is the paywall.
  #
  # `ensure_step_accessible!` is re-registered below because the parent scopes it to
  # `only: [:show]`. A locked step's page cannot be opened; its film must not be
  # streamable either.
  #
  # WHY A SUBCLASS AND NOT TWO MEMBER ACTIONS ON StepsController
  #
  # `ActiveStorage::Streaming` includes `ActionController::Live`, and `Live` is not
  # per-action: it overrides `process` so that EVERY action on the controller runs in
  # its own thread with a streaming response. Putting it on StepsController would
  # move `show`, `complete` and `content_status` — flash, redirects, Turbo Streams
  # and all — onto that machinery for no reason. Here it reaches two actions that
  # genuinely stream and nothing else.
  class StepMediaController < StepsController
    include ActiveStorage::Streaming

    before_action :ensure_step_accessible!, only: [:video, :subtitles]

    def video = stream(@step.lesson_video)

    def subtitles = stream(@step.lesson_subtitles)

    private

    def stream(attached)
      # `set_route_and_step` loads the step through `@route.route_steps`, so it
      # carries `strict_loading_by_default` (application.rb:48) and reading the
      # attachment off it is a violation — a raise in test, a WARN line in
      # production (production.rb:102). One step and one blob per request: this is
      # the documented opt-out, not an N+1 hidden behind a flag.
      @step.strict_loading!(false)
      return head(:not_found) unless attached.attached?

      blob = attached.blob
      secure_media_response!

      if request.headers["Range"].present?
        # The reason to reuse Active Storage's own helper rather than send_data: a
        # <video> element seeks by asking for byte ranges, and this answers 206 with
        # Content-Range, validates the range against the blob's byte_size, and caps
        # both the count and the size of the ranges it will serve.
        send_blob_byte_range_data(blob, request.headers["Range"], disposition: "inline")
      else
        response.headers["Accept-Ranges"] = "bytes"
        response.headers["Content-Length"] = blob.byte_size.to_s
        send_blob_stream(blob, disposition: "inline")
      end
    end

    # DELIBERATELY NOT `http_cache_forever public: true`, which is what Active
    # Storage's ProxyController does here. That directive invites any shared cache
    # on the path to keep the film and hand it to the next person who asks for the
    # URL — which would re-open, one layer out, exactly the hole this controller was
    # written to close. The response is entitled content keyed to a session, so it
    # is private and uncacheable, and the bandwidth is the price of the gate.
    #
    # `no-transform` is not decoration either. `config.middleware.use Rack::Deflater`
    # (application.rb:45) is mounted app-wide with no type filter, and a real browser
    # sends `Accept-Encoding: gzip`, so without this the mp4 would be gzipped on the
    # way out: Rack::Deflater drops Content-Length when it compresses, which breaks
    # the byte-range seeking the 206 branch above exists to support. `no-transform`
    # is the directive Deflater itself checks for (rack-3.2.6 deflater.rb:140), and
    # it says the same thing to any proxy on the path.
    #
    # THROUGH `response.cache_control`, AND NOT BY SETTING THE HEADER STRING.
    # ActionDispatch re-composes Cache-Control from parsed directives on commit, and
    # its `no_store` branch emits `private, no-store` and nothing else — it never
    # concats `extras` (actionpack cache.rb:331-334), so a hand-written
    # "private, no-store, no-transform" reached the client as "private, no-store"
    # and the film was gzipped anyway. Measured. The branch below (cache.rb:339-352)
    # is the one that keeps extras, so the directives are handed over structured and
    # Rails composes them: `max-age=0, private, must-revalidate, no-transform`.
    #
    # `private` is the load-bearing word — a shared cache or CDN must never hold
    # entitled content and hand it to the next person who asks for the URL, which
    # would re-open one layer out exactly the hole this controller closes. Active
    # Storage'''s own proxy says `public` here.
    def secure_media_response!
      response.cache_control.merge!(
        public: false, max_age: 0, must_revalidate: true, extras: ["no-transform"]
      )
      response.headers["X-Robots-Tag"] = "noindex, nofollow"
    end
  end
end
