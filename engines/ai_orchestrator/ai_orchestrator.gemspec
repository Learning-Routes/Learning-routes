require_relative "lib/ai_orchestrator/version"

Gem::Specification.new do |spec|
  spec.name        = "ai_orchestrator"
  spec.version     = AiOrchestrator::VERSION
  spec.authors     = ["Learning Routes Team"]
  spec.email       = ["team@learning-routes.com"]
  spec.homepage    = "https://learning-routes.com"
  spec.summary     = "AI Orchestrator: multi-model AI management"
  spec.description = "Engine for routing AI requests across multiple providers, tracking costs, and managing model configurations."

  spec.metadata["allowed_push_host"] = ""
  spec.metadata["homepage_uri"] = spec.homepage

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir["{app,config,db,lib}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
  end

  spec.add_dependency "rails", ">= 8.1.2"
  spec.add_dependency "core"
end
