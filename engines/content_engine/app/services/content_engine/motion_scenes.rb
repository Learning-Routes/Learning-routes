require "json_schemer"

module ContentEngine
  # Discovers and validates the Motion Canvas scene vocabulary.
  #
  # The file set under DIR *is* the vocabulary: there is no second list of
  # scene names anywhere in Ruby to drift from it. Adding a scene later means
  # adding a `<name>.schema.json` and a matching `.tsx`, nothing else here.
  module MotionScenes
    DIR = Rails.root.join("app/motion/src/scenes")

    def self.schema_path(name) = DIR.join("#{name}.schema.json")

    # Memoised per process, not per call: the parser (Task 8) runs this inside
    # a job loop.
    def self.schemas
      @schemas ||= Dir[DIR.join("*.schema.json")].to_h do |path|
        [File.basename(path, ".schema.json"), JSON.parse(File.read(path))]
      end.freeze
    end

    def self.names = schemas.keys.sort
    def self.known?(name) = schemas.key?(name.to_s)
    def self.example(name) = schemas.fetch(name.to_s)["examples"].first.deep_dup

    # Returns [] when the data is valid, else an array of human-readable
    # messages. Never raises on bad model output — the caller (Task 8) turns
    # a non-empty result into a plain concept block instead of crashing the
    # lesson render.
    def self.validate(name, data)
      return ["unknown scene: #{name}"] unless known?(name)
      return ["data is not an object"] unless data.is_a?(Hash)

      schema = schemas.fetch(name.to_s)
      schema_errors = JSONSchemer.schema(schema).validate(data).map { |error| error["error"] }
      schema_errors + index_errors(schema, data)
    rescue StandardError => e
      ["#{name} failed validation: #{e.message}"]
    end

    # `x-index-into` is the one vendor keyword: JSON Schema cannot express
    # "this integer indexes that array". It is always resolved against the
    # CONTAINING object, never the document root.
    #
    # It can appear in two shapes:
    #   - directly on an integer property, e.g. agreement.schema.json's
    #     `subject`/`verb`, which index that same object's `tokens`;
    #   - on the `items` schema of an array-of-integers property, e.g.
    #     transform.schema.json's `hi`, where each element indexes the
    #     `tokens` of the very steps[] item that `hi` lives in — the
    #     containing object for `hi`'s indices is the step item, not the
    #     document root and not `hi` itself.
    def self.index_errors(schema, data, pointer = "")
      return [] unless data.is_a?(Hash)

      (schema["properties"] || {}).flat_map do |key, prop|
        value = data[key]
        next [] if value.nil?

        child_pointer = "#{pointer}/#{key}"

        if prop["x-index-into"]
          check_indices(Array(value), prop["x-index-into"], data, child_pointer)
        elsif prop["type"] == "array" && prop["items"].is_a?(Hash) && value.is_a?(Array)
          item_schema = prop["items"]
          if item_schema["x-index-into"]
            check_indices(value, item_schema["x-index-into"], data, child_pointer)
          else
            value.each_with_index.flat_map do |item, i|
              item.is_a?(Hash) ? index_errors(item_schema, item, "#{child_pointer}/#{i}") : []
            end
          end
        elsif prop["type"] == "object" && value.is_a?(Hash)
          index_errors(prop, value, child_pointer)
        else
          []
        end
      end
    end

    # `indices` are the candidate index values (already an array, even for a
    # single-integer property); `target_key` names the sibling array within
    # `containing_object` that each index must fall inside.
    def self.check_indices(indices, target_key, containing_object, pointer)
      target = containing_object[target_key]
      indices.filter_map do |i|
        next if target.is_a?(Array) && i.is_a?(Integer) && i.between?(0, target.size - 1)

        "#{pointer}: #{i.inspect} is out of range for `#{target_key}`"
      end
    end
    private_class_method :check_indices
  end
end
