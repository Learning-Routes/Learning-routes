#!/usr/bin/env ruby
# The public-repository rules for workflows (platform/docs/WORKING_AGREEMENT.md):
# every action is pinned by full commit SHA with its version in a comment, and
# every workflow declares permissions at the top, contents: read at most, with a
# comment above any job that widens them. No workflow uses pull_request_target,
# which runs a fork's pull request with this repository's token and secrets.
# Prints each breach and exits 1 if there is any.

require "yaml"

PINNED = /\A[\w.\/-]+@[0-9a-f]{40} # v\d/
READ_ONLY = [{ "contents" => "read" }, {}, "read-all"].freeze

problems = []
Dir[File.join(__dir__, "..", "workflows", "*.{yml,yaml}")].sort.each do |path|
  name = File.basename(path)
  File.readlines(path, chomp: true).each_with_index do |line, index|
    next unless (match = line.match(/\A\s*(?:-\s*)?uses:\s*(.+?)\s*\z/))

    ref = match[1]
    next if ref.start_with?("./") # an action in this repository

    problems << "#{name}:#{index + 1}: #{ref} is not pinned by commit SHA with its version in a comment" unless ref.match?(PINNED)
  end

  lines = File.readlines(path, chomp: true)
  workflow = YAML.safe_load_file(path, aliases: true)
  # YAML reads the key `on` as true.
  triggers = workflow[true] || workflow["on"]
  uses_target = Array(triggers.is_a?(Hash) ? triggers.keys : triggers).map(&:to_s).include?("pull_request_target")
  problems << "#{name}: uses pull_request_target" if uses_target
  if !workflow.key?("permissions")
    problems << "#{name}: declares no permissions at the top"
  elsif !READ_ONLY.include?(workflow["permissions"])
    problems << "#{name}: the top-level permissions are wider than contents: read"
  end
  # The comment line above each job's own permissions: key.
  job = nil
  comment_above = {}
  lines.each_with_index do |line, index|
    job = Regexp.last_match(1) if line.match(/\A  ([\w-]+):\s*\z/)
    comment_above[job] = lines[index - 1].strip.start_with?("#") if job && line.match?(/\A    permissions:/)
  end
  workflow.fetch("jobs", {}).each do |name_of_job, spec|
    next unless spec.is_a?(Hash) && spec.key?("permissions") && !READ_ONLY.include?(spec["permissions"])

    problems << "#{name}: #{name_of_job} widens its permissions without a comment saying why" unless comment_above[name_of_job]
  end
end

puts problems
exit(problems.empty? ? 0 : 1)
