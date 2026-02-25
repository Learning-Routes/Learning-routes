module CommunityEngine
  class Engine < ::Rails::Engine
    isolate_namespace CommunityEngine

    initializer "community_engine.append_migrations" do |app|
      unless app.root.to_s.match?(root.to_s)
        config.paths["db/migrate"].expanded.each do |expanded_path|
          app.config.paths["db/migrate"] << expanded_path
        end
      end
    end

    config.generators do |g|
      g.test_framework :test_unit
      g.orm :active_record, primary_key_type: :uuid
    end
  end
end
