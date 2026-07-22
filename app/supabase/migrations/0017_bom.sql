-- =====================================================================
-- 0017_bom.sql  ·  Phase 3 — Bill of Materials / recipes  (§6.1)
--
-- The recipe tree for a manufactured item, decoupled from suppliers
-- (audit 2.5): BOM lines reference ITEMS (or an alternate group); category
-- is a reporting grouping only and is NEVER referenced by a BOM line.
--
-- This module is MASTER DATA — it has NO ledger impact and touches NO stock.
-- It only describes *what goes into what*. Actual consumption/valuation is the
-- production run (0018, WAC) and process costing (0019). BOM "standard cost" is
-- planning/estimation only and is independent of the weighted-average actuals
-- (kept, audit-consistent).
--
-- Versioning: a BOM is active for an item when today falls in its
-- [effective_from, effective_to) window; overlapping active windows for the
-- same parent item are rejected. Two-stage manufacture is modelled by giving
-- each stage's output item its own BOM (empty-bottle BOM consumes preforms;
-- filled-case BOM consumes empty bottles + caps + labels + water).
-- =====================================================================

-- ---------------------------------------------------------------------
-- alternate_groups — a swappable set of interchangeable components
-- (e.g. "28mm cap: vendor A / vendor B"). A BOM line points at EITHER a
-- concrete child item OR an alternate group (resolved to its default member).
-- ---------------------------------------------------------------------
create table alternate_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  notes       text,
  created_at  timestamptz not null default now()
);

create table alternate_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references alternate_groups(id) on delete cascade,
  item_id    uuid not null references items(id),
  priority   int  not null default 1,       -- lower = preferred
  is_default boolean not null default false,
  unique (group_id, item_id)
);
-- at most one default per group
create unique index alt_group_one_default on alternate_group_members (group_id) where is_default;

-- ---------------------------------------------------------------------
-- boms — one recipe version producing a given parent item
-- ---------------------------------------------------------------------
create table boms (
  id             uuid primary key default gen_random_uuid(),
  parent_item_id uuid not null references items(id),
  stage          int  not null default 1,          -- 1 blowing, 2 filling (informational)
  output_qty     numeric(14,3) not null default 1 check (output_qty > 0), -- yield per batch, base units
  effective_from date not null default current_date,
  effective_to   date,                              -- null = open-ended
  notes          text,
  status         text not null default 'active',
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  check (effective_to is null or effective_to > effective_from)
);
create index boms_parent_idx on boms (parent_item_id, effective_from);
comment on table boms is 'Recipe version for a manufactured item; output_qty units produced per batch of the lines below.';

create table bom_lines (
  id                 uuid primary key default gen_random_uuid(),
  bom_id             uuid not null references boms(id) on delete cascade,
  child_item_id      uuid references items(id),               -- either a concrete item...
  alternate_group_id uuid references alternate_groups(id),    -- ...or a swappable group
  quantity_per       numeric(14,4) not null check (quantity_per > 0),  -- per output_qty batch, base units
  scrap_percent      numeric(6,3) not null default 0 check (scrap_percent >= 0),
  line_no            int not null default 1,
  created_at         timestamptz not null default now(),
  check (child_item_id is not null or alternate_group_id is not null)
);
create index bom_lines_bom_idx   on bom_lines (bom_id);
create index bom_lines_child_idx on bom_lines (child_item_id);
comment on column bom_lines.quantity_per is 'Gross-of-scrap qty is quantity_per*(1+scrap_percent/100); child stock_uom (base) units.';

create trigger boms_touch before update on boms
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- resolve_bom_child(line) -> item id  (a group resolves to its default/lowest)
-- ---------------------------------------------------------------------
create or replace function resolve_bom_child(p_line bom_lines)
returns uuid
language sql stable
set search_path = public
as $$
  select case
    when p_line.child_item_id is not null then p_line.child_item_id
    else (select item_id from alternate_group_members
           where group_id = p_line.alternate_group_id
           order by is_default desc, priority asc, item_id limit 1)
  end;
$$;

-- ---------------------------------------------------------------------
-- active_bom_for(item, as_of) -> bom id  (the version whose window covers the date)
-- Raises if two active versions overlap (versioning must be unambiguous).
-- ---------------------------------------------------------------------
create or replace function active_bom_for(p_item uuid, p_as_of date default current_date)
returns uuid
language plpgsql stable
set search_path = public
as $$
declare v_bom uuid; v_n int;
begin
  select count(*) into v_n from boms
   where parent_item_id = p_item and status = 'active'
     and effective_from <= p_as_of
     and (effective_to is null or effective_to > p_as_of);
  if v_n = 0 then return null; end if;
  if v_n > 1 then
    raise exception 'active_bom_for: overlapping active BOMs for item % on %', p_item, p_as_of;
  end if;
  select id into v_bom from boms
   where parent_item_id = p_item and status = 'active'
     and effective_from <= p_as_of
     and (effective_to is null or effective_to > p_as_of);
  return v_bom;
end $$;

-- ---------------------------------------------------------------------
-- upsert_bom(header jsonb, lines jsonb) -> bom id
--   header: { parent_item_id, stage?, output_qty?, effective_from?, effective_to?, notes? }
--   lines : [ { child_item_id?|alternate_group_id?, quantity_per, scrap_percent?, line_no? } ]
-- Validations: parent must exist; no self-reference / immediate cycle; no
-- date-range overlap with another active version of the same parent.
-- Master-data write (audited); no ledger, no stock.
-- ---------------------------------------------------------------------
create or replace function upsert_bom(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid := (p_header->>'parent_item_id')::uuid;
  v_from   date := coalesce((p_header->>'effective_from')::date, current_date);
  v_to     date := nullif(p_header->>'effective_to','')::date;
  v_bom    uuid;
  v_line   jsonb;
  v_child  uuid; v_grp uuid; v_ln int := 0;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_parent is null then raise exception 'upsert_bom: parent_item_id required'; end if;
  if not exists (select 1 from items where id = v_parent) then
    raise exception 'upsert_bom: unknown parent item %', v_parent;
  end if;

  -- overlap guard: reject a new active window that intersects an existing one
  if exists (
    select 1 from boms b
     where b.parent_item_id = v_parent and b.status = 'active'
       and daterange(b.effective_from, b.effective_to, '[)')
         && daterange(v_from, v_to, '[)')
  ) then
    raise exception 'upsert_bom: effective window overlaps an existing active BOM for item %', v_parent;
  end if;

  insert into boms (parent_item_id, stage, output_qty, effective_from, effective_to, notes, created_by)
  values (v_parent,
          coalesce((p_header->>'stage')::int, 1),
          coalesce((p_header->>'output_qty')::numeric, 1),
          v_from, v_to, p_header->>'notes', v_actor)
  returning id into v_bom;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_child := nullif(v_line->>'child_item_id','')::uuid;
    v_grp   := nullif(v_line->>'alternate_group_id','')::uuid;
    if v_child is null and v_grp is null then
      raise exception 'upsert_bom: each line needs child_item_id or alternate_group_id';
    end if;
    if v_child = v_parent then
      raise exception 'upsert_bom: BOM line cannot reference its own parent item (cycle)';
    end if;
    v_ln := v_ln + 1;
    insert into bom_lines (bom_id, child_item_id, alternate_group_id, quantity_per, scrap_percent, line_no)
      values (v_bom, v_child, v_grp,
              (v_line->>'quantity_per')::numeric,
              coalesce((v_line->>'scrap_percent')::numeric, 0), v_ln);
  end loop;

  if v_ln = 0 then raise exception 'upsert_bom: at least one line required'; end if;

  perform write_audit('insert','boms', v_bom::text,
            format('BOM for item %s (%s lines)', v_parent, v_ln),
            jsonb_build_object('parent_item_id', v_parent, 'effective_from', v_from), v_actor);
  return v_bom;
end $$;

-- ---------------------------------------------------------------------
-- explode_bom(item, output_units, as_of) -> table of gross component demand
-- One level down (the two-stage model uses one BOM per stage, so a single
-- level is the natural granularity for planning + the production run). Applies
-- scrap and scales by the requested output vs the BOM batch yield.
-- ---------------------------------------------------------------------
create or replace function explode_bom(
  p_item uuid, p_output_units numeric default 1, p_as_of date default current_date)
returns table (child_item_id uuid, gross_qty numeric)
language plpgsql stable
set search_path = public
as $$
declare v_bom uuid; v_yield numeric(14,3);
begin
  v_bom := active_bom_for(p_item, p_as_of);
  if v_bom is null then
    raise exception 'explode_bom: no active BOM for item % on %', p_item, p_as_of;
  end if;
  select output_qty into v_yield from boms where id = v_bom;

  return query
  select resolve_bom_child(l.*) as child_item_id,
         round( (l.quantity_per * (1 + l.scrap_percent/100.0))
                * (p_output_units / v_yield), 4) as gross_qty
    from bom_lines l
   where l.bom_id = v_bom
   order by l.line_no;
end $$;
comment on function explode_bom is 'Single-level component demand for producing p_output_units, scrap + batch-yield applied.';

-- ---------------------------------------------------------------------
-- bom_standard_cost(item, output_units, as_of) -> numeric
-- Planning estimate only: values exploded components at their CURRENT WAC
-- (avg_cost across branches). Independent of the WA production actuals (0018).
-- AVL pricing (§5.3) is not built yet; WAC is the live valuation stand-in and
-- the RPC swaps to AVL preferred/lowest when that module lands.
-- ---------------------------------------------------------------------
create or replace function bom_standard_cost(
  p_item uuid, p_output_units numeric default 1, p_as_of date default current_date)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(sum(
           e.gross_qty * coalesce(
             (select round(sum(s.qty_on_hand*s.avg_cost)/nullif(sum(s.qty_on_hand),0),4)
                from stock s where s.item_id = e.child_item_id), 0)
         ), 0)
    from explode_bom(p_item, p_output_units, p_as_of) e;
$$;
comment on function bom_standard_cost is 'Planning estimate: components at current WAC. Not used for inventory valuation (that is WA, 0018).';

-- ---------------------------------------------------------------------
-- RLS: recipes are readable by any authenticated user; writable only with
-- purchase.manage (admin/procurement per §6.1) — mirrors PO master tables.
-- ---------------------------------------------------------------------
alter table alternate_groups        enable row level security;
alter table alternate_group_members enable row level security;
alter table boms                    enable row level security;
alter table bom_lines               enable row level security;

create policy read_all_auth on alternate_groups        for select to authenticated using (true);
create policy read_all_auth on alternate_group_members for select to authenticated using (true);
create policy read_all_auth on boms                    for select to authenticated using (true);
create policy read_all_auth on bom_lines               for select to authenticated using (true);

create policy manage_alt_groups on alternate_groups for all to authenticated
  using (has_permission('purchase.manage')) with check (has_permission('purchase.manage'));
create policy manage_alt_members on alternate_group_members for all to authenticated
  using (has_permission('purchase.manage')) with check (has_permission('purchase.manage'));
create policy manage_boms on boms for all to authenticated
  using (has_permission('purchase.manage')) with check (has_permission('purchase.manage'));
create policy manage_bom_lines on bom_lines for all to authenticated
  using (has_permission('purchase.manage')) with check (has_permission('purchase.manage'));
