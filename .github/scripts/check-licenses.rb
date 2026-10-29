# Every source package declares the repository's license (LICENSE.md, FSL-1.1-ALv2):
# each package.json tracked by git, the Rails app's and the platform's alike, must
# say "license": "SEE LICENSE IN LICENSE.md". Run on every pull request.
require "json"

EXPECTED = "SEE LICENSE IN LICENSE.md"

files = `git ls-files -- '*package.json'`.split("\n")
abort "no package.json found: is this the repository root?" if files.empty?

missing = files.reject do |file|
  JSON.parse(File.read(file))["license"] == EXPECTED
end

if missing.empty?
  puts "#{files.size} packages declare #{EXPECTED}"
else
  missing.each { |file| puts "#{file}: \"license\" must be \"#{EXPECTED}\"" }
  exit 1
end
