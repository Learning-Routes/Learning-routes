module LearningRoutesEngine
  class GapAnalyzer
    class AnalysisError < StandardError; end

    def initialize(route:, assessment_result: nil, user_feedback: nil)
      @route = route
      @result = assessment_result
      @user_feedback = user_feedback
      @user = route.learning_profile.user
    end

    def analyze!
      gaps_data = gather_gap_sources
      return [] if gaps_data.empty?

      ai_gaps = call_ai(gaps_data)
      create_gap_records!(ai_gaps)
    end

    private

    def gather_gap_sources
      sources = {}

      # From assessment results
      if @result
        identified = if @result.respond_to?(:knowledge_gaps_identified)
                       @result.knowledge_gaps_identified
                     elsif @result.respond_to?(:[])
                       @result[:knowledge_gaps_identified] || @result["knowledge_gaps_identified"]
                     end
        sources[:assessment_gaps] = Array(identified) if identified.present?

        sources[:score] = if @result.respond_to?(:score)
                            @result.score
                          elsif @result.respond_to?(:[])
                            @result[:score] || @result["score"]
                          end
      end

      # From user-reported difficulties
      sources[:user_feedback] = @user_feedback if @user_feedback.present?

      sources
    end

    def call_ai(gaps_data)
      missed_questions = Array(gaps_data[:assessment_gaps]).map { |g|
        g.is_a?(Hash) ? g.to_json : g.to_s
      }.join("\n")

      interaction = AiOrchestrator::Orchestrate.call(
        task_type: :gap_analysis,
        variables: {
          topic: @route.topic,
          score: gaps_data[:score].to_s,
          missed_questions: missed_questions,
          user_feedback: gaps_data[:user_feedback].to_s
        },
        user: @user,
        async: false
      )

      raise AnalysisError, "AI gap analysis failed: #{interaction.status}" unless interaction.completed?

      parser = AiOrchestrator::ResponseParser.new(
        interaction.response,
        expected_format: :json,
        task_type: "gap_analysis"
      )
      parsed = parser.parse!
      parsed["gaps"] || []
    rescue => e
      Rails.logger.error("[GapAnalyzer] AI analysis failed: #{e.message}")
      # Fall back to basic gap extraction from assessment data
      extract_basic_gaps(gaps_data)
    end

    def extract_basic_gaps(gaps_data)
      gaps = []

      Array(gaps_data[:assessment_gaps]).each do |gap|
        if gap.is_a?(Hash)
          gaps << gap.stringify_keys
        else
          gaps << { "topic" => gap.to_s, "severity" => "medium", "description" => gap.to_s }
        end
      end

      if gaps_data[:user_feedback].present?
        gaps << { "topic" => "Self-reported difficulty", "severity" => "medium",
                  "description" => gaps_data[:user_feedback] }
      end

      gaps
    end

    def create_gap_records!(gaps_data)
      # Deduplicate by topic, keeping highest severity
      deduped = deduplicate(gaps_data)

      deduped.map do |gap_data|
        KnowledgeGap.create!(
          user: @user,
          learning_route: @route,
          topic: gap_data["topic"],
          description: gap_data["description"],
          severity: map_severity(gap_data["severity"]),
          identified_from: gap_source_label,
          resolved: false
        )
      end
    end

    def deduplicate(gaps)
      severity_order = { "high" => 3, "medium" => 2, "low" => 1 }

      gaps.group_by { |g| g["topic"]&.downcase&.strip }
          .map do |_topic, group|
            group.max_by { |g| severity_order[g["severity"].to_s.downcase] || 0 }
          end
    end

    def map_severity(severity_str)
      case severity_str.to_s.downcase
      when "high" then :high
      when "medium" then :medium
      else :low
      end
    end

    def gap_source_label
      parts = []
      parts << "assessment" if @result
      parts << "user_feedback" if @user_feedback.present?
      parts.join("+")
    end
  end
end
