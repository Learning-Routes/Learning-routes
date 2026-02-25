require_relative "lib/community_engine/version"

Gem::Specification.new do |spec|
  spec.name        = "community_engine"
  spec.version     = CommunityEngine::VERSION
  spec.authors     = ["Learning Routes Team"]
  spec.email       = ["team@learning-routes.com"]
  spec.homepage    = "https://learning-routes.com"
  spec.summary     = "Community Engine: Social features for Learning Routes"
  spec.description = "Engine for managing community features including discussions, study groups, and social learning."

  spec.metadata["allowed_push_host"] = ""
  spec.metadata["homepage_uri"] = spec.homepage

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir["{app,config,db,lib}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
  end

  spec.add_dependency "rails", ">= 8.1.2"
  spec.add_dependency "core"
  spec.add_dependency "learning_routes_engine"
end
