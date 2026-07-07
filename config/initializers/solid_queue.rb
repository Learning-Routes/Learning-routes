# frozen_string_literal: true

# The app enables `config.active_record.strict_loading_by_default = true`
# (config/application.rb) as an N+1 guard for OUR models. Solid Queue / Cache /
# Cable ship their own internal models that legitimately lazy-load associations
# (e.g. SolidQueue::ClaimedExecution -> :job when the supervisor claims work),
# so under the global default they raise StrictLoadingViolationError on their
# normal polling loop — surfacing as a recurring error roughly every polling
# interval.
#
# Disabling strict loading on each gem's base record class exempts the whole
# internal hierarchy at once while leaving the guard fully in place for
# application models. Guarded by `defined?` so this stays correct if any of the
# adapters is swapped out.
Rails.application.config.after_initialize do
  [
    ("SolidQueue::Record" if defined?(SolidQueue::Record)),
    ("SolidCache::Record" if defined?(SolidCache::Record)),
    ("SolidCable::Record" if defined?(SolidCable::Record))
  ].compact.each do |const_name|
    const_name.constantize.strict_loading_by_default = false
  end
end
