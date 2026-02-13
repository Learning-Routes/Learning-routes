require_relative "lib/learning_routes_engine/version"

Gem::Specification.new do |spec|
  spec.name        = "learning_routes_engine"
  spec.version     = LearningRoutesEngine::VERSION
  spec.authors     = ["Learning Routes Team"]
  spec.email       = ["team@learning-routes.com"]
  spec.homepage    = "https://learning-routes.com"
  spec.summary     = "Learning Routes engine: route generation, progression, and tracking"
  spec.description = "Engine for procedural learning route generation, step management, knowledge gap analysis, and spaced repetition."

  spec.metadata["allowed_push_host"] = ""
  spec.metadata["homepage_uri"] = spec.homepage

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir["{app,config,db,lib}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
  end

  spec.add_dependency "rails", ">= 8.1.2"
  spec.add_dependency "core"
end
