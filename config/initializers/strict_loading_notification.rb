# frozen_string_literal: true

# Make strict-loading violations visible when the app is configured to :log.
#
# With `action_on_strict_loading_violation = :log`, ActiveRecord instruments
# "strict_loading_violation.active_record" (active_record/core.rb:257-259) and its
# built-in LogSubscriber renders it at DEBUG level
# (active_record/log_subscriber.rb:16, `subscribe_log_level :strict_loading_violation, :debug`).
#
# Production runs at RAILS_LOG_LEVEL=info, so those violations are dropped before
# they reach the log — :log would silently mean :ignore, and we would have traded a
# 500 for no signal at all. Re-emit at WARN so the violations actually show up in
# `kamal app logs` and in Sentry breadcrumbs.
#
# Only subscribe when we are in :log mode; under :raise the exception is the signal.
Rails.application.config.after_initialize do
  next unless ActiveRecord.action_on_strict_loading_violation == :log

  ActiveSupport::Notifications.subscribe("strict_loading_violation.active_record") do |event|
    owner = event.payload[:owner]
    reflection = event.payload[:reflection]

    Rails.logger.warn(
      "[StrictLoading] #{owner.class.name}##{reflection.name} was lazily loaded — " \
      "add it to the query's `includes`/`preload`, or query it directly. " \
      "(#{reflection.strict_loading_violation_message(owner)})"
    )
  end
end
