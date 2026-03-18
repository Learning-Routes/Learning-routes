# frozen_string_literal: true

# Logs all email delivery attempts for debugging and monitoring.
class MailDeliveryLogger
  def self.delivered_email(message)
    Rails.logger.info(
      "[EMAIL DELIVERED] to=#{message.to&.join(', ')} " \
      "from=#{message.from&.join(', ')} " \
      "subject=\"#{message.subject}\""
    )
  end

  def self.delivering_email(message)
    Rails.logger.info(
      "[EMAIL SENDING] to=#{message.to&.join(', ')} " \
      "from=#{message.from&.join(', ')} " \
      "subject=\"#{message.subject}\""
    )
  end
end

ActionMailer::Base.register_observer(MailDeliveryLogger)
ActionMailer::Base.register_interceptor(MailDeliveryLogger)
