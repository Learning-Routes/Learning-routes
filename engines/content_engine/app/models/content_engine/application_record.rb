module ContentEngine
  class ApplicationRecord < ActiveRecord::Base
    self.abstract_class = true
    self.table_name_prefix = "content_engine_"
  end
end
