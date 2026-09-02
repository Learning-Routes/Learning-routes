# frozen_string_literal: true

module Commerce
  # Enqueued the moment a purchase is marked paid. Body filled in by Task 8:
  # generating the paid modules is not part of verifying and recording the
  # payment itself, so this job intentionally does nothing yet.
  class PaidModuleGenerationJob < ApplicationJob
    queue_as :default

    def perform(purchase_id)
    end
  end
end
