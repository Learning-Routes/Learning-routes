#!/usr/bin/env ruby
# The public-repository rules for workflows (platform/docs/WORKING_AGREEMENT.md):
# every action is pinned by full commit SHA with its version in a comment.
# Prints each breach and exits 1 if there is any.

PINNED = /\A[\w.\/-]+@[0-9a-f]{40} # v\d/

problems = []
Dir[File.join(__dir__, "..", "workflows", "*.{yml,yaml}")].sort.each do |path|
  name = File.basename(path)
  File.readlines(path, chomp: true).each_with_index do |line, index|
    next unless (match = line.match(/\A\s*(?:-\s*)?uses:\s*(.+?)\s*\z/))

    ref = match[1]
    next if ref.start_with?("./") # an action in this repository

    problems << "#{name}:#{index + 1}: #{ref} is not pinned by commit SHA with its version in a comment" unless ref.match?(PINNED)
  end
end

puts problems
exit(problems.empty? ? 0 : 1)
