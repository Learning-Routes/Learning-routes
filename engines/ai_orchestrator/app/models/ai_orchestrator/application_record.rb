module AiOrchestrator
  class ApplicationRecord < ActiveRecord::Base
    self.abstract_class = true
    self.table_name_prefix = "ai_orchestrator_"
  end
end
