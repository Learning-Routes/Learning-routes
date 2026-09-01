# frozen_string_literal: true

class CreateRouteModules < ActiveRecord::Migration[8.1]
  TABLE = :learning_routes_engine_route_modules

  def up
    create_table TABLE, id: :uuid do |t|
      t.references :learning_route, type: :uuid, null: false,
                   foreign_key: { to_table: :learning_routes_engine_learning_routes, on_delete: :cascade },
                   index: false
      t.integer :position, null: false
      t.string :title, null: false
      t.text :description
      t.jsonb :translations, default: {}, null: false
      t.integer :access_state, default: 1, null: false
      t.integer :generation_state, default: 0, null: false
      t.jsonb :metadata, default: {}, null: false
      t.timestamps
    end

    add_index TABLE, %i[learning_route_id position], unique: true,
              name: "idx_route_modules_route_position"
    add_index TABLE, :learning_route_id, unique: true, where: "access_state = 0",
              name: "idx_route_modules_single_preview"
    add_index TABLE, %i[learning_route_id access_state generation_state],
              name: "idx_route_modules_route_states"

    add_check_constraint TABLE, "position > 0", name: "route_modules_positive_position"
    add_check_constraint TABLE, "access_state IN (0, 1, 2)", name: "route_modules_access_state"
    add_check_constraint TABLE, "generation_state IN (0, 1, 2, 3)", name: "route_modules_generation_state"
    add_check_constraint TABLE, "access_state <> 0 OR position = 1", name: "route_modules_preview_first"

    execute <<~SQL
      CREATE FUNCTION learning_routes_engine_check_route_preview()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        checked_route_id uuid;
        preview_count integer;
      BEGIN
        IF TG_TABLE_NAME = 'learning_routes_engine_learning_routes' THEN
          checked_route_id := COALESCE(NEW.id, OLD.id);
        ELSE
          checked_route_id := COALESCE(NEW.learning_route_id, OLD.learning_route_id);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM learning_routes_engine_learning_routes WHERE id = checked_route_id
        ) THEN
          RETURN NULL;
        END IF;

        SELECT COUNT(*) INTO preview_count
        FROM learning_routes_engine_route_modules
        WHERE learning_route_id = checked_route_id AND access_state = 0 AND position = 1;

        IF preview_count <> 1 THEN
          RAISE EXCEPTION 'learning route % must have exactly one permanent preview module at position 1', checked_route_id
            USING ERRCODE = '23514';
        END IF;

        RETURN NULL;
      END;
      $function$;

      CREATE CONSTRAINT TRIGGER route_modules_exactly_one_preview
      AFTER INSERT OR UPDATE OR DELETE ON learning_routes_engine_route_modules
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION learning_routes_engine_check_route_preview();

      CREATE CONSTRAINT TRIGGER learning_routes_exactly_one_preview
      AFTER INSERT OR UPDATE ON learning_routes_engine_learning_routes
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION learning_routes_engine_check_route_preview();
    SQL

    execute <<~SQL
      CREATE FUNCTION learning_routes_engine_preserve_preview()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        IF OLD.access_state = 0 AND (
          TG_OP = 'DELETE' OR NEW.access_state <> 0 OR
          NEW.learning_route_id <> OLD.learning_route_id OR NEW.position <> 1
        ) AND EXISTS (
          SELECT 1 FROM learning_routes_engine_learning_routes WHERE id = OLD.learning_route_id
        ) THEN
          RAISE EXCEPTION 'the permanent preview module cannot be removed or reassigned'
            USING ERRCODE = '23514';
        END IF;

        RETURN COALESCE(NEW, OLD);
      END;
      $function$;

      CREATE TRIGGER route_modules_preserve_preview
      BEFORE UPDATE OR DELETE ON learning_routes_engine_route_modules
      FOR EACH ROW EXECUTE FUNCTION learning_routes_engine_preserve_preview();
    SQL
  end

  def down
    execute "DROP TRIGGER IF EXISTS learning_routes_exactly_one_preview ON learning_routes_engine_learning_routes"
    execute "DROP TRIGGER IF EXISTS route_modules_exactly_one_preview ON learning_routes_engine_route_modules"
    execute "DROP TRIGGER IF EXISTS route_modules_preserve_preview ON learning_routes_engine_route_modules"
    execute "DROP FUNCTION IF EXISTS learning_routes_engine_check_route_preview()"
    execute "DROP FUNCTION IF EXISTS learning_routes_engine_preserve_preview()"
    drop_table TABLE
  end
end
