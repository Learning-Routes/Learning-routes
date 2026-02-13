require_relative "lib/assessments/version"

Gem::Specification.new do |spec|
  spec.name        = "assessments"
  spec.version     = Assessments::VERSION
  spec.authors     = ["Learning Routes Team"]
  spec.email       = ["team@learning-routes.com"]
  spec.homepage    = "https://learning-routes.com"
  spec.summary     = "Assessments engine: exams, quizzes, and grading"
  spec.description = "Engine for managing assessments, questions, user answers, and grading with Bloom's Taxonomy alignment."

  spec.metadata["allowed_push_host"] = ""
  spec.metadata["homepage_uri"] = spec.homepage

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir["{app,config,db,lib}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
  end

  spec.add_dependency "rails", ">= 8.1.2"
  spec.add_dependency "core"
  spec.add_dependency "learning_routes_engine"
end
