module AiOrchestrator
  class Orchestrate
    # Main entry point for AI requests.
    # Can be called synchronously or asynchronously (via background job).
    #
    # Usage:
    #   # Async (recommended) - returns the AiInteraction record immediately
    #   interaction = AiOrchestrator::Orchestrate.call(
    #     task_type: :route_generation,
    #     variables: { topic: "Ruby on Rails", goal: "Build web apps" },
    #     user: current_user,
    #     async: true
    #   )
    #
    #   # Sync - waits for completion, returns the AiInteraction record
    #   interaction = AiOrchestrator::Orchestrate.call(
    #     task_type: :quick_grading,
    #     variables: { question: "...", student_answer: "..." },
    #     user: current_user,
    #     async: false
    #   )

    def self.call(task_type:, variables: {}, user: nil, async: true, params: {})
      new(task_type: task_type, variables: variables, user: user, params: params).call(async: async)
    end

    def initialize(task_type:, variables: {}, user: nil, params: {})
      @task_type = task_type.to_s
      @variables = variables
      @user = user
      @params = params
    end

    def call(async: true)
      # Build prompt
      builder = PromptBuilder.new(task_type: @task_type, variables: @variables, user: @user)
      prompts = builder.build

      # Resolve model
      model = ModelRouter.model_for(@task_type)

      # Create interaction record
      interaction = AiInteraction.create!(
        user: @user,
        model: model,
        task_type: @task_type,
        prompt: prompts[:user],
        status: :pending,
        metadata: { variables: @variables, system_prompt_length: prompts[:system].length }
      )

      if async
        AiRequestJob.perform_later(
          interaction_id: interaction.id,
          task_type: @task_type,
          prompt: prompts[:user],
          system_prompt: prompts[:system],
          user_id: @user&.id,
          params: prompts[:model_params].merge(@params)
        )
      else
        execute_sync(interaction, prompts)
      end

      interaction
    end

    private

    def execute_sync(interaction, prompts)
      interaction.update!(status: :processing)

      # Check cache
      cached = CacheService.fetch(task_type: @task_type, prompt: prompts[:user], model: interaction.model)
      if cached
        interaction.update!(
          status: :completed,
          response: cached[:content],
          cached: true,
          latency_ms: 0,
          cost_cents: 0
        )
        return
      end

      router = ModelRouter.new(task_type: @task_type, user: @user)
      result = router.execute do |model, model_params|
        merged = model_params.merge(prompts[:model_params]).merge(@params.symbolize_keys)
        client = AiClient.new(model: model, task_type: @task_type, user: @user)
        client.chat(prompt: prompts[:user], system_prompt: prompts[:system], params: merged)
      end

      interaction.mark_completed!(
        response_text: result[:content],
        input_tokens: result[:input_tokens],
        output_tokens: result[:output_tokens],
        latency_ms: result[:latency_ms]
      )

      CacheService.store(
        task_type: @task_type,
        prompt: prompts[:user],
        model: interaction.model,
        response: result[:content]
      )
    rescue => e
      interaction.mark_failed!(error: e)
    end
  end
end
