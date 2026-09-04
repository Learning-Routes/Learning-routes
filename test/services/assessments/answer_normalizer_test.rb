require "test_helper"

# THE CLASS: one answer vocabulary, two graders, and only one of them normalized.
#
# The sixth instance of that shape here (LessonBlocks was the first four, the
# voice mime types the fifth). `answers_controller` compared the radio's value —
# the option verbatim, "A) Subject + Verb + Object" — against the stored
# `correct_answer` "A", downcased. `"a) subject + verb + object" == "a"` is false,
# always, so NO multiple-choice answer had ever graded correct on an assessment.
#
# Both stored formats are real, because the two generator prompts disagree:
#   assessment_questions.yml:29  "correct_answer": "A"
#   exam_questions.yml:29        "correct_answer": "The correct answer"
class Assessments::AnswerNormalizerTest < ActiveSupport::TestCase
  N = Assessments::AnswerNormalizer

  # ── the exact pair captured in the browser on 4 September ────────────────

  test "the production pair grades correct" do
    assert N.correct?(given: "A) Subject + Verb + Object", expected: "A"),
      "this is the answer the owner selected and the server marked wrong"
  end

  test "the wrong option on the production pair still grades wrong" do
    assert_not N.correct?(given: "B) He is happy.", expected: "A")
  end

  # ── assessment_questions.yml: correct_answer is a bare letter ────────────

  test "a bare letter matches its lettered option" do
    assert N.correct?(given: "C) A sentence using the verb 'to be'", expected: "C")
    assert N.correct?(given: "d) something", expected: "D")
    assert_not N.correct?(given: "C) A sentence", expected: "D")
  end

  # ── exam_questions.yml: correct_answer is the full text ──────────────────

  test "full option text matches a lettered option" do
    assert N.correct?(given: "A) Subject + Verb + Object", expected: "Subject + Verb + Object"),
      "exam_questions.yml stores the answer in full; the old normalizer mapped the " \
      "option to 'a', which never equals the text, so this would still have failed"
    assert_not N.correct?(given: "B) He is happy.", expected: "Subject + Verb + Object")
  end

  test "full text on both sides matches" do
    assert N.correct?(given: "A) Subject + Verb + Object", expected: "A) Subject + Verb + Object")
    assert N.correct?(given: "Subject + Verb + Object", expected: "Subject + Verb + Object")
  end

  # ── the shapes that used to slip through ─────────────────────────────────

  test "case, whitespace and surrounding quotes do not decide a grade" do
    assert N.correct?(given: "  a) SUBJECT + verb + Object ", expected: "A")
    assert N.correct?(given: "A) Subject + Verb + Object", expected: '"A"')
  end

  test "a dotted or colonned prefix is still a prefix" do
    assert N.correct?(given: "A. Subject + Verb + Object", expected: "A")
    assert N.correct?(given: "A: Subject + Verb + Object", expected: "A")
  end

  test "blank input is never correct" do
    assert_not N.correct?(given: "", expected: "A")
    assert_not N.correct?(given: "A", expected: "")
    assert_not N.correct?(given: nil, expected: nil)
  end

  # ── answerable?: §3's twin ───────────────────────────────────────────────

  test "a question whose answer matches no option is unanswerable" do
    assert_not N.answerable?(options: ["A) one", "B) two"], correct_answer: "C"),
      "this is the check that would have caught the grader bug: a stored answer " \
      "no option can satisfy must never gate a student"
    assert_not N.answerable?(options: [], correct_answer: "A")
    assert_not N.answerable?(options: ["A) one"], correct_answer: "")
  end

  test "a well-formed question is answerable in both stored formats" do
    assert N.answerable?(options: ["A) one", "B) two"], correct_answer: "B")
    assert N.answerable?(options: ["A) one", "B) two"], correct_answer: "two")
  end

  # ── the class: no grader may compare correct_answer itself ───────────────

  test "every grading site goes through this normalizer" do
    offenders = Dir[Rails.root.join("{app,engines/*/app}/**/*.rb")]
      .reject { |path| path.end_with?("answer_normalizer.rb") }
      .select do |path|
        File.readlines(path).any? do |line|
          line.include?("correct_answer") && line.match?(/==|\.include\?|\.match/)
        end
      end
      .map { |path| Pathname.new(path).relative_path_from(Rails.root).to_s }

    assert_empty offenders,
      "these compare correct_answer directly instead of using AnswerNormalizer, " \
      "which is how one grader normalized the 'A)' prefix and the other did not:\n  " +
      offenders.join("\n  ")
  end
end
