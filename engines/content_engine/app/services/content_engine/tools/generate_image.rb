# frozen_string_literal: true

module ContentEngine
  module Tools
    class GenerateImage < RubyLLM::Tool
      description "Generates an educational image using AI image generation. " \
                  "Use this when the user needs a visual representation that cannot be expressed " \
                  "as a diagram -- e.g., real-world scenes, analogies, comparisons, or artistic illustrations."

      param :description, desc: "Detailed description of what the image should show"
      param :style, desc: "Image style: educational, diagram, comparison, analogy, realistic", required: false

      def execute(description:, style: "educational")
        prompt = "Educational illustration: #{description}. " \
                 "Style: #{style}. Clean, modern, suitable for a learning platform. No text overlays."

        client = AiOrchestrator::AiClient.new(
          model: "gpt-image-1",
          task_type: :quick_images,
          user: Thread.current[:lesson_agent_user]
        )

        result = client.chat(prompt: prompt)
        unless result[:content].present?
          return "Image generation returned empty result."
        end

        image_data = result[:content]
        mime = result[:content_type] || "image/png"
        unless image_data.start_with?("http")
          image_data = "data:#{mime};base64,#{image_data}"
        end

        alt = description.gsub('"', "&quot;")
        halt "![#{alt}](#{image_data})"
      rescue => e
        "Could not generate image: #{e.message}"
      end
    end
  end
end
