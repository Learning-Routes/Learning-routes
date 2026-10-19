# ruby_llm 2 reports the tokens written to the prompt cache (tokens.cache_write)
# apart from input; they are recorded here and priced at each model's
# cache-write rate, or at input where the provider charges no cache-write fee.
class AddCacheWriteTokensToAiInteractions < ActiveRecord::Migration[8.1]
  def change
    add_column :ai_orchestrator_ai_interactions, :cache_write_tokens, :integer, default: 0
  end
end
