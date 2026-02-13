require_relative "lib/core/version"

Gem::Specification.new do |spec|
  spec.name        = "core"
  spec.version     = Core::VERSION
  spec.authors     = ["Learning Routes Team"]
  spec.email       = ["team@learning-routes.com"]
  spec.homepage    = "https://learning-routes.com"
  spec.summary     = "Core engine: shared models, auth concerns, base controllers"
  spec.description = "Core engine providing User model, authentication/authorization concerns, and base classes for the Learning Routes platform."

  spec.metadata["allowed_push_host"] = ""
  spec.metadata["homepage_uri"] = spec.homepage

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir["{app,config,db,lib}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
  end

  spec.add_dependency "rails", ">= 8.1.2"
  spec.add_dependency "bcrypt", "~> 3.1"
end
