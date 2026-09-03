class CreateCommerceRoutePurchases < ActiveRecord::Migration[8.1]
  def up
    create_table :commerce_route_purchases, id: :uuid do |t|
      t.references :user, type: :uuid, null: false,
                   foreign_key: { to_table: :core_users, on_delete: :restrict }
      t.references :learning_route, type: :uuid, null: false,
                   foreign_key: { to_table: :learning_routes_engine_learning_routes, on_delete: :restrict }
      t.references :route_quote, type: :uuid, null: false,
                   foreign_key: { to_table: :commerce_route_quotes, on_delete: :restrict }
      t.string  :state, null: false, default: "pending"
      t.string  :provider, null: false
      t.boolean :test_mode, null: false, default: true
      t.string  :provider_checkout_id
      t.string  :provider_order_id
      t.string  :provider_store_id
      t.string  :provider_product_id
      t.string  :provider_variant_id
      t.bigint  :amount_cents, null: false
      t.string  :currency, null: false
      t.bigint  :estimated_ai_cost_microcents, null: false
      t.bigint  :estimated_fee_cents, null: false
      t.bigint  :actual_fee_cents
      t.bigint  :refunded_amount_cents
      t.string  :failure_reason
      t.datetime :paid_at
      t.datetime :refunded_at
      t.timestamps
    end

    # At most ONE paid purchase per route. A pending or failed retry is allowed
    # to repeat, which is exactly what the spec asks for.
    add_index :commerce_route_purchases, :learning_route_id,
              unique: true, where: "state = 'paid'", name: "idx_route_purchases_single_paid"
    add_index :commerce_route_purchases, [:provider, :provider_order_id],
              unique: true, where: "provider_order_id IS NOT NULL", name: "idx_route_purchases_provider_order"
    add_index :commerce_route_purchases, [:learning_route_id, :state], name: "idx_route_purchases_route_state"

    execute <<~SQL
      ALTER TABLE commerce_route_purchases
        ADD CONSTRAINT route_purchases_state CHECK (state IN ('pending','paid','failed','refunded')),
        ADD CONSTRAINT route_purchases_usd_only CHECK (currency = 'USD'),
        ADD CONSTRAINT route_purchases_nonnegative_money CHECK (
          amount_cents >= 0 AND estimated_ai_cost_microcents >= 0 AND estimated_fee_cents >= 0
          AND (actual_fee_cents IS NULL OR actual_fee_cents >= 0)
          AND (refunded_amount_cents IS NULL OR refunded_amount_cents >= 0)
        ),
        ADD CONSTRAINT route_purchases_paid_needs_order CHECK (
          state <> 'paid' OR (provider_order_id IS NOT NULL AND paid_at IS NOT NULL)
        ),
        ADD CONSTRAINT route_purchases_refund_needs_timestamp CHECK (
          state <> 'refunded' OR refunded_at IS NOT NULL
        );
    SQL

    # The database, not the application, is the final word on who may buy what.
    execute <<~SQL
      CREATE FUNCTION commerce_route_purchase_owner_guard() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM learning_routes_engine_learning_routes r
          JOIN learning_routes_engine_learning_profiles p ON p.id = r.learning_profile_id
          WHERE r.id = NEW.learning_route_id AND p.user_id = NEW.user_id
        ) THEN
          RAISE EXCEPTION 'route purchase user must own the learning route'
            USING ERRCODE = '23514';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM commerce_route_quotes q
          WHERE q.id = NEW.route_quote_id
            AND q.learning_route_id = NEW.learning_route_id
            AND q.user_id = NEW.user_id
            AND q.final_price_cents = NEW.amount_cents
            AND q.currency = NEW.currency
        ) THEN
          RAISE EXCEPTION 'route purchase must match its quote owner, route, amount and currency'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER commerce_route_purchases_owner_guard
        BEFORE INSERT OR UPDATE OF user_id, learning_route_id, route_quote_id, amount_cents, currency
        ON commerce_route_purchases
        FOR EACH ROW EXECUTE FUNCTION commerce_route_purchase_owner_guard();
    SQL
  end

  def down
    execute "DROP TRIGGER IF EXISTS commerce_route_purchases_owner_guard ON commerce_route_purchases;"
    execute "DROP FUNCTION IF EXISTS commerce_route_purchase_owner_guard();"
    drop_table :commerce_route_purchases
  end
end
