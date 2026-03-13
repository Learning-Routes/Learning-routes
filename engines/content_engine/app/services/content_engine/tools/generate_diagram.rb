# frozen_string_literal: true

module ContentEngine
  module Tools
    class GenerateDiagram < RubyLLM::Tool
      description "Generates a Mermaid diagram to visually explain a concept. " \
                  "Use this when the user needs a visual explanation, asks for a diagram, " \
                  "or when a concept would benefit from a flowchart, sequence diagram, or mind map."

      param :description, desc: "What the diagram should illustrate"
      param :diagram_type, desc: "Type of Mermaid diagram: flowchart, sequence, mindmap, classDiagram, stateDiagram, erDiagram", required: false

      def execute(description:, diagram_type: "flowchart")
        # Use the LLM to generate valid Mermaid syntax
        chat = RubyLLM.chat(model: "gpt-4.1-mini")
        prompt = <<~PROMPT
          Generate a Mermaid #{diagram_type} diagram for: #{description}

          Rules:
          - Return ONLY the Mermaid code, no explanation, no markdown fences
          - Use #{diagram_type} syntax (e.g., "flowchart TD" for flowchart)
          - Keep it clean: max 15 nodes, clear labels
          - Use descriptive node labels, not single letters
          - Ensure valid Mermaid syntax
        PROMPT

        response = chat.ask(prompt)
        mermaid_code = response.content.strip
          .gsub(/\A```\w*\n?/, "")
          .gsub(/\n?```\z/, "")
          .strip

        { type: "diagram", content: mermaid_code, diagram_type: diagram_type }
      rescue => e
        { type: "error", content: "Could not generate diagram: #{e.message}" }
      end
    end
  end
end
