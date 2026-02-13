module LearningRoutesEngine
  class ApplicationRecord < ActiveRecord::Base
    self.abstract_class = true
    self.table_name_prefix = "learning_routes_engine_"
  end
end
