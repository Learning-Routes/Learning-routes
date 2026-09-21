# frozen_string_literal: true

# Serve lesson media INLINE.
#
# `ActiveStorage::Blob#forced_disposition_for_serving` overrides whatever a
# controller asks for and answers :attachment unless the blob's content type is in
# `content_types_allowed_inline`. The Rails default list is images plus PDF, so
# `send_blob_stream(blob, disposition: "inline")` for a video/mp4 was answering
# `Content-Disposition: attachment` — measured. A lesson video is meant to play in
# the page, not to land in the student's Downloads folder.
#
# THE CONFIG, NOT THE MODULE ATTRIBUTE. `ActiveStorage.content_types_allowed_inline`
# is ASSIGNED from this config inside Active Storage's own `config.after_initialize`
# (activestorage engine.rb:148), so setting the module attribute from an initializer
# is a coin toss on callback ordering — and it loses. Measured: the attribute was
# still the stock list at runtime. Mutating the config is order-independent, because
# engine.rb:148 reads it whenever it runs.
#
# Only the three types LearningRoutesEngine::StepMediaController serves are added,
# and none is script-executable in a browsing context, so this does not widen the
# reason the default list is conservative — `content_types_to_serve_as_binary` still
# forces text/html, SVG and the rest to attachment. These blobs are written only by
# the authenticated studio endpoint, never by a student upload.
Rails.application.config.active_storage.content_types_allowed_inline |= %w[
  video/mp4
  text/vtt
  application/x-subrip
]
