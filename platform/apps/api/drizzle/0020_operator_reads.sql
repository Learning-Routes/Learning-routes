-- An operator decides on a route without being a member of its space, so they read what
-- they decide on: which route, its latest version, whose it is (Platform STEP 4 §3, §6.4).
-- Reading only. A draft stays its members'; their blocks and their students stay theirs.
create policy spaces_select_operator on spaces for select to lr_app
  using ((select app.is_operator()));
--> statement-breakpoint
create policy routes_select_operator on routes for select to lr_app
  using ((select app.is_operator()));
--> statement-breakpoint
create policy route_versions_select_operator on route_versions for select to lr_app
  using ((select app.is_operator()));
