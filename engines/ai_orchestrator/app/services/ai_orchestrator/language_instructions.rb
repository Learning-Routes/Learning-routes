module AiOrchestrator
  # Single source of truth for "what language should the LLM write in?".
  #
  # Monolingual routes (e.g. "Ruby programming" for a Spanish speaker) → one directive:
  # write everything in the student's locale.
  #
  # Bilingual language-learning routes (e.g. Spanish speaker learning Portuguese) →
  # a split directive: explanations in the student's locale, vocabulary / examples /
  # exercises in the target language. Without this split the model defaults to writing
  # the entire lesson in the student's locale and treats target_locale as metadata.
  module LanguageInstructions
    LANGUAGE_NAMES = {
      "en" => "English",
      "es" => "Spanish",
      "fr" => "French",
      "pt" => "Portuguese",
      "de" => "German",
      "it" => "Italian",
      "ja" => "Japanese",
      "zh" => "Chinese",
      "ko" => "Korean",
      "ru" => "Russian",
      "ar" => "Arabic"
    }.freeze

    module_function

    def directive(content_locale:, target_locale: nil)
      content_name = language_name(content_locale)

      if bilingual?(content_locale: content_locale, target_locale: target_locale)
        bilingual_directive(content_name: content_name, target_name: language_name(target_locale))
      else
        monolingual_directive(content_name: content_name)
      end
    end

    def bilingual?(content_locale:, target_locale:)
      target_locale.to_s.present? && target_locale.to_s != content_locale.to_s
    end

    def language_name(locale_code)
      LANGUAGE_NAMES[locale_code.to_s] || locale_code.to_s.upcase.presence || "English"
    end

    def monolingual_directive(content_name:)
      <<~DIR.strip
        LANGUAGE MODE — MONOLINGUAL.
        Write the ENTIRE lesson in #{content_name}: concepts, examples, questions, visuals, interactive blocks, mermaid labels, summaries. No other language.
      DIR
    end

    def bilingual_directive(content_name:, target_name:)
      <<~DIR.strip
        LANGUAGE MODE — BILINGUAL LANGUAGE-LEARNING LESSON.
        The student's native language is #{content_name}. They are learning #{target_name}.

        This is NOT a lesson written entirely in #{content_name}. Split every piece of output by purpose:

        Write in #{content_name}:
        - Explanations, grammar rules, instructional prose, scaffolding
        - "Concepto" section bodies (explain the concept IN #{content_name})
        - "Tip" section bodies
        - "Resumen" summary bullets
        - Question stems for knowledge checks
        - Option labels when testing translation ("Which means 'good morning'?")

        Write in #{target_name}:
        - Vocabulary lists, example phrases, dialogues
        - "Ejemplo" section bodies (the target-language examples being taught)
        - Interactive block content: Match pairs (at least one side in #{target_name}), Complete sentences to fill in, Flashcard fronts, Scenario dialogues
        - Audio narration scripts (when audio is for listening practice)
        - Visual section labels (labels on images/diagrams should be in #{target_name})

        Bilingual formatting rules:
        - After each #{target_name} phrase in explanatory prose, add a parenthetical #{content_name} gloss: "Bom dia (Good morning)". This does NOT apply inside interactive blocks where the student has to produce the translation themselves.
        - For non-obvious pronunciation, add IPA or phonetic hint in square brackets: "obrigado [obriˈɡadu]".
        - Lesson title format: "#{target_name} headline — #{content_name} gloss". Example: "Saudações Básicas — Saludos básicos".
        - Knowledge-check questions must test #{target_name} comprehension or production (recognize, translate, fill the blank, choose correct form). Do NOT ask purely theoretical questions about #{target_name} in #{content_name}.
        - Mermaid diagrams: node labels in #{target_name} for vocabulary/flow diagrams, in #{content_name} only when diagramming a meta-concept (e.g. grammar tree of explanation).

        The finished lesson should feel like an immersive #{target_name} class where the teacher explains in #{content_name}. NEVER produce a lesson that contains no #{target_name} content — that is the primary failure mode to avoid.
      DIR
    end
  end
end
