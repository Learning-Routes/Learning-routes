require_relative "lib/content_engine/version"

Gem::Specification.new do |spec|
  spec.name        = "content_engine"
  spec.version     = ContentEngine::VERSION
  spec.authors     = ["Learning Routes Team"]
  spec.email       = ["team@learning-routes.com"]
  spec.homepage    = "https://learning-routes.com"
  spec.summary     = "Content Engine: AI-generated content management"
  spec.description = "Engine for managing AI-generated learning content including text, code, audio, and images."

  spec.metadata["allowed_push_host"] = ""
  spec.metadata["homepage_uri"] = spec.homepage

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir["{app,config,db,lib}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
  end

  spec.add_dependency "rails", ">= 8.1.2"
  spec.add_dependency "core"
  spec.add_dependency "learning_routes_engine"
end
