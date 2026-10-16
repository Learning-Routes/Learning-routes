# Since ruby_llm 1.15, OpenAI input_tokens excludes the cached prompt tokens;
# they are recorded here and priced at each model's cached-input rate.
class AddCachedTokensToAiInteractions < ActiveRecord::Migration[8.1]
  def change
    add_column :ai_orchestrator_ai_interactions, :cached_tokens, :integer, default: 0
  end
end
