# frozen_string_literal: true

class CreateCommerceRouteQuotes < ActiveRecord::Migration[8.1]
  IMMUTABLE_COLUMNS = %w[
    user_id learning_route_id currency total_module_count paid_module_count
    estimated_ai_cost_microcents estimated_fee_cents markup_basis_points
    minimum_price_per_paid_module_cents cost_based_price_cents minimum_price_cents
    final_price_cents estimator_version provider_rate_versions fee_version image_quality
    route_shape_assumptions provider_rate_assumptions fee_assumptions expires_at created_at
  ].freeze

  def up
    create_table :commerce_route_quotes, id: :uuid do |t|
      t.references :user, null: false, type: :uuid, foreign_key: { to_table: :core_users, on_delete: :restrict }
      t.references :learning_route, null: false, type: :uuid,
        foreign_key: { to_table: :learning_routes_engine_learning_routes, on_delete: :restrict }
      t.string :currency, null: false
      t.integer :total_module_count, null: false
      t.integer :paid_module_count, null: false
      t.bigint :estimated_ai_cost_microcents, null: false
      t.bigint :estimated_fee_cents, null: false
      t.integer :markup_basis_points, null: false
      t.integer :minimum_price_per_paid_module_cents, null: false
      t.bigint :cost_based_price_cents, null: false
      t.bigint :minimum_price_cents, null: false
      t.bigint :final_price_cents, null: false
      t.string :estimator_version, null: false
      t.jsonb :provider_rate_versions, null: false, default: {}
      t.string :fee_version, null: false
      t.string :image_quality, null: false
      t.jsonb :route_shape_assumptions, null: false, default: {}
      t.jsonb :provider_rate_assumptions, null: false, default: {}
      t.jsonb :fee_assumptions, null: false, default: {}
      t.datetime :expires_at, null: false
      t.datetime :superseded_at
      t.string :attachment_state, null: false, default: "unattached"
      t.timestamps
    end

    add_index :commerce_route_quotes, %i[learning_route_id created_at], name: "idx_route_quotes_route_created"
    add_index :commerce_route_quotes, %i[user_id learning_route_id], name: "idx_route_quotes_owner_route"
    add_constraints
    add_triggers
  end

  def down
    drop_table :commerce_route_quotes
    execute "DROP FUNCTION IF EXISTS commerce_route_quote_immutable_guard()"
    execute "DROP FUNCTION IF EXISTS commerce_route_quote_owner_guard()"
  end

  private

  def add_constraints
    add_check_constraint :commerce_route_quotes, "currency = 'USD'", name: "route_quotes_usd_only"
    add_check_constraint :commerce_route_quotes, "total_module_count >= 1", name: "route_quotes_positive_modules"
    add_check_constraint :commerce_route_quotes, "paid_module_count = total_module_count - 1",
      name: "route_quotes_paid_module_count"
    add_check_constraint :commerce_route_quotes,
      "estimated_ai_cost_microcents >= 0 AND estimated_fee_cents >= 0 AND cost_based_price_cents >= 0 AND minimum_price_cents >= 0 AND final_price_cents >= 0",
      name: "route_quotes_nonnegative_money"
    add_check_constraint :commerce_route_quotes, "markup_basis_points = 5000", name: "route_quotes_approved_markup"
    add_check_constraint :commerce_route_quotes, "minimum_price_per_paid_module_cents = 299",
      name: "route_quotes_approved_minimum"
    add_check_constraint :commerce_route_quotes,
      "minimum_price_cents = paid_module_count * minimum_price_per_paid_module_cents",
      name: "route_quotes_minimum_formula"
    add_check_constraint :commerce_route_quotes,
      "final_price_cents = GREATEST(cost_based_price_cents, minimum_price_cents)",
      name: "route_quotes_final_formula"
    add_check_constraint :commerce_route_quotes, "expires_at > created_at", name: "route_quotes_future_expiration"
    add_check_constraint :commerce_route_quotes, "attachment_state IN ('unattached', 'checkout', 'purchase')",
      name: "route_quotes_attachment_state"
  end

  def add_triggers
    execute ownership_function_sql
    execute <<~SQL
      CREATE TRIGGER commerce_route_quotes_owner_guard
      BEFORE INSERT OR UPDATE OF user_id, learning_route_id ON commerce_route_quotes
      FOR EACH ROW EXECUTE FUNCTION commerce_route_quote_owner_guard();
    SQL
    execute immutability_function_sql
    execute <<~SQL
      CREATE TRIGGER commerce_route_quotes_immutable_guard
      BEFORE UPDATE ON commerce_route_quotes
      FOR EACH ROW EXECUTE FUNCTION commerce_route_quote_immutable_guard();
    SQL
  end

  def ownership_function_sql
    <<~SQL
      CREATE FUNCTION commerce_route_quote_owner_guard() RETURNS trigger AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM learning_routes_engine_learning_routes routes
          JOIN learning_routes_engine_learning_profiles profiles ON profiles.id = routes.learning_profile_id
          WHERE routes.id = NEW.learning_route_id AND profiles.user_id = NEW.user_id
        ) THEN
          RAISE EXCEPTION 'route quote owner must own learning route' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    SQL
  end

  def immutability_function_sql
    old_values = IMMUTABLE_COLUMNS.map { |column| "OLD.#{column}" }.join(", ")
    new_values = IMMUTABLE_COLUMNS.map { |column| "NEW.#{column}" }.join(", ")
    <<~SQL
      CREATE FUNCTION commerce_route_quote_immutable_guard() RETURNS trigger AS $$
      BEGIN
        IF ROW(#{old_values}) IS DISTINCT FROM ROW(#{new_values}) THEN
          RAISE EXCEPTION 'route quote pricing snapshots are immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    SQL
  end
end
