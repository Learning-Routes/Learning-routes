# frozen_string_literal: true

namespace :wp40 do
  desc "Count, per funnel stage, the users with evidence and the rows missing a timestamp (read-only)."
  # READ-ONLY, and counts only: no id, no name, no email is printed. It decides
  # nothing. The owner runs it in production and spec §3 (docs/superpowers/specs/
  # 2026-10-09-wp40-owner-panel-design.md) is confirmed or switched from the output.
  #
  #   bin/kamal app exec -r job "bin/rails wp40:funnel_census"
  #
  # Rulings R2–R7 in that spec say which column each line reads. Every statement is
  # a SELECT; test/tasks/wp40_funnel_census_test.rb fails on any other.
  task funnel_census: :environment do
    connection = ActiveRecord::Base.connection
    count = ->(sql) { connection.select_value(sql).to_i }
    day = ->(sql) { connection.select_value(sql) || "none" }
    # R4: every assessment type but step_quiz (4) and diagnostic (0) is an exam.
    exam_types = "(1, 2, 3)"
    live_paid = "state IN ('paid', 'refunded') AND test_mode = false AND paid_at IS NOT NULL"
    route_users = <<~SQL
      learning_routes_engine_learning_routes r
      JOIN learning_routes_engine_learning_profiles p ON p.id = r.learning_profile_id
    SQL

    puts "[wp40:funnel_census] read-only; counts only."
    puts "accounts: total=#{count.('SELECT COUNT(*) FROM core_users')} " \
         "owner=#{count.('SELECT COUNT(*) FROM core_users WHERE role = 2')} " \
         "teacher=#{count.('SELECT COUNT(*) FROM core_users WHERE role = 1')}"

    puts "1 registered: users=#{count.('SELECT COUNT(*) FROM core_users')}"
    puts "  provider: google_oauth2=#{count.("SELECT COUNT(*) FROM core_users WHERE provider = 'google_oauth2'")} " \
         "password=#{count.('SELECT COUNT(*) FROM core_users WHERE provider IS NULL')} " \
         "other=#{count.("SELECT COUNT(*) FROM core_users WHERE provider IS NOT NULL AND provider <> 'google_oauth2'")}"
    locales = connection.select_rows("SELECT locale, COUNT(*) FROM core_users GROUP BY locale ORDER BY locale")
    puts "  locale: #{locales.map { |locale, n| "#{locale}=#{n}" }.join(' ')}"
    # R2: a Google signup is verified in the same request that creates it; a linked
    # password account was verified later by email, or never.
    linked = count.(<<~SQL)
      SELECT COUNT(*) FROM core_users WHERE provider IS NOT NULL
        AND (email_verified_at IS NULL OR email_verified_at > created_at + interval '1 minute')
    SQL
    puts "  linked: #{linked} (provider set, verified more than 1 minute after signup or never)"

    puts "2 verified: users=#{count.('SELECT COUNT(*) FROM core_users WHERE email_verified_at IS NOT NULL')} " \
         "google_unverified=#{count.('SELECT COUNT(*) FROM core_users WHERE provider IS NOT NULL AND email_verified_at IS NULL')}"

    profile = "EXISTS (SELECT 1 FROM learning_routes_engine_learning_profiles p WHERE p.user_id = u.id)"
    puts "3 onboarded: flag=#{count.('SELECT COUNT(*) FROM core_users WHERE onboarding_completed')} " \
         "profile=#{count.('SELECT COUNT(*) FROM learning_routes_engine_learning_profiles')} " \
         "flag_without_profile=#{count.("SELECT COUNT(*) FROM core_users u WHERE onboarding_completed AND NOT #{profile}")} " \
         "profile_without_flag=#{count.("SELECT COUNT(*) FROM core_users u WHERE NOT onboarding_completed AND #{profile}")}"

    statuses = connection.select_rows("SELECT status, COUNT(*) FROM route_requests GROUP BY status").to_h
    puts "4 route_requested: users=#{count.('SELECT COUNT(DISTINCT user_id) FROM route_requests')} " +
         %w[pending generating completed failed].map { |status| "#{status}=#{statuses.fetch(status, 0)}" }.join(" ") +
         " failed_without_message=#{count.("SELECT COUNT(*) FROM route_requests WHERE status = 'failed' AND error_message IS NULL")}"

    generation = connection.select_rows(
      "SELECT COALESCE(generation_status, 'null'), COUNT(*) FROM learning_routes_engine_learning_routes GROUP BY 1"
    ).to_h
    # R6: a clone keeps the original's generated_at and gets a new created_at.
    puts "5 route_generated: users=#{count.("SELECT COUNT(DISTINCT p.user_id) FROM #{route_users} WHERE r.generation_status = 'completed'")} " +
         %w[completed generating failed null].map { |status| "#{status}=#{generation.fetch(status, 0)}" }.join(" ") +
         " completed_without_generated_at=#{count.("SELECT COUNT(*) FROM learning_routes_engine_learning_routes WHERE generation_status = 'completed' AND generated_at IS NULL")}" \
         " clones=#{count.("SELECT COUNT(*) FROM learning_routes_engine_learning_routes WHERE generation_status = 'completed' AND generated_at < created_at")}"

    # R7: steps#show creates a study session on every view. A step the student
    # opened (in progress or completed) with no session for its route's user is a
    # view the table did not record. Counted again for steps touched since the
    # first session, in case the writer is younger than the data.
    oldest_session = "(SELECT MIN(started_at) FROM analytics_study_sessions)"
    opened = <<~SQL
      learning_routes_engine_route_steps s
      JOIN #{route_users} ON r.id = s.learning_route_id
      WHERE s.status IN (2, 3)
    SQL
    unrecorded = "NOT EXISTS (SELECT 1 FROM analytics_study_sessions a WHERE a.route_step_id = s.id AND a.user_id = p.user_id)"
    puts "6 lesson_opened: users=#{count.('SELECT COUNT(DISTINCT user_id) FROM analytics_study_sessions')} " \
         "sessions=#{count.('SELECT COUNT(*) FROM analytics_study_sessions')} " \
         "without_step=#{count.('SELECT COUNT(*) FROM analytics_study_sessions WHERE route_step_id IS NULL')} " \
         "oldest_started_at=#{day.("SELECT to_char(MIN(started_at), 'YYYY-MM-DD') FROM analytics_study_sessions")}"
    puts "  writer: steps_opened_without_session=#{count.("SELECT COUNT(*) FROM #{opened} AND #{unrecorded}")} " \
         "of #{count.("SELECT COUNT(*) FROM #{opened}")} " \
         "since_first_session=#{count.("SELECT COUNT(*) FROM #{opened} AND s.updated_at >= #{oldest_session} AND #{unrecorded}")} " \
         "of #{count.("SELECT COUNT(*) FROM #{opened} AND s.updated_at >= #{oldest_session}")}"

    puts "7 step_completed: users=#{count.("SELECT COUNT(DISTINCT p.user_id) FROM learning_routes_engine_route_steps s JOIN #{route_users} ON r.id = s.learning_route_id WHERE s.status = 3 AND s.completed_at IS NOT NULL")} " \
         "completed=#{count.('SELECT COUNT(*) FROM learning_routes_engine_route_steps WHERE status = 3')} " \
         "completed_without_completed_at=#{count.('SELECT COUNT(*) FROM learning_routes_engine_route_steps WHERE status = 3 AND completed_at IS NULL')} " \
         "completed_at_without_completed=#{count.('SELECT COUNT(*) FROM learning_routes_engine_route_steps WHERE status <> 3 AND completed_at IS NOT NULL')}"

    puts "8 exam_passed: users=#{count.("SELECT COUNT(DISTINCT res.user_id) FROM assessments_assessment_results res JOIN assessments_assessments a ON a.id = res.assessment_id WHERE res.passed AND a.assessment_type IN #{exam_types}")}"
    # R4: a NULL score is an open attempt, neither passed nor failed.
    outcomes = connection.select_rows(<<~SQL).to_h { |type, *counts| [type.to_i, counts.map(&:to_i)] }
      SELECT a.assessment_type,
        COUNT(*) FILTER (WHERE res.score IS NOT NULL AND res.passed),
        COUNT(*) FILTER (WHERE res.score IS NOT NULL AND NOT res.passed),
        COUNT(*) FILTER (WHERE res.score IS NULL)
      FROM assessments_assessment_results res JOIN assessments_assessments a ON a.id = res.assessment_id
      GROUP BY a.assessment_type
    SQL
    Assessments::Assessment.assessment_types.each do |name, value|
      passed, failed, open = outcomes.fetch(value, [0, 0, 0])
      puts "  #{name}: passed=#{passed} failed=#{failed} open=#{open}"
    end

    # R3: a conversion is a live payment; a refund is shown beside it, never instead.
    puts "9 paid: users=#{count.("SELECT COUNT(DISTINCT user_id) FROM commerce_route_purchases WHERE #{live_paid}")} " \
         "refunded_users=#{count.("SELECT COUNT(DISTINCT user_id) FROM commerce_route_purchases WHERE state = 'refunded' AND test_mode = false")}"
    purchases = connection.select_rows(<<~SQL).to_h { |state, live, test| [state, [live.to_i, test.to_i]] }
      SELECT state, COUNT(*) FILTER (WHERE NOT test_mode), COUNT(*) FILTER (WHERE test_mode)
      FROM commerce_route_purchases GROUP BY state
    SQL
    %w[pending paid failed refunded].each do |state|
      live, test = purchases.fetch(state, [0, 0])
      puts "  #{state}: live=#{live} test=#{test}"
    end

    # R5: any of five sources at least 24 h after signup. Sessions idle for 30 days
    # are deleted daily (Core::SessionCleanupJob), so the session source undercounts.
    returned = {
      "session" => "SELECT user_id, created_at AS at FROM core_sessions",
      "study_session" => "SELECT user_id, created_at AS at FROM analytics_study_sessions",
      "step" => "SELECT p.user_id, s.completed_at AS at FROM learning_routes_engine_route_steps s " \
                "JOIN #{route_users} ON r.id = s.learning_route_id WHERE s.completed_at IS NOT NULL",
      "result" => "SELECT user_id, created_at AS at FROM assessments_assessment_results",
      "purchase" => "SELECT user_id, created_at AS at FROM commerce_route_purchases"
    }
    came_back = ->(sources) do
      count.(<<~SQL)
        SELECT COUNT(DISTINCT u.id) FROM core_users u
        JOIN (#{sources.join(' UNION ALL ')}) e ON e.user_id = u.id
        WHERE e.at >= u.created_at + interval '24 hours'
      SQL
    end
    puts "10 came_back: users=#{came_back.(returned.values)} " +
         returned.map { |name, sql| "#{name}=#{came_back.([sql])}" }.join(" ")
    puts "  core_sessions: rows=#{count.('SELECT COUNT(*) FROM core_sessions')} " \
         "oldest_created_at=#{day.("SELECT to_char(MIN(created_at), 'YYYY-MM-DD') FROM core_sessions")}"
  end
end
