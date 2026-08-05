# Production Job Cards + Run Reversal — Design Spec

**Date:** 2026-08-05
**Module:** Production (Runs `0018`, wastage/BOA in current live schema)
**Status:** Draft

---

## 1. Purpose

Extend the Production module with two deferred capabilities from
`docs/production-runs-implementation-plan.md`:

1. **Job cards (planning)** — an operational planning board where a
   production job (stage, output item, target qty, device, operator,
   planned window, instructions) is scheduled by day, then *completed* by
   posting a real production run that auto-resolves its inputs from the BOM.
2. **Run reversal** — a compensating-entry reversal of an already-posted
   production run, restoring stock and zeroing the WIP clearing account.

Guiding invariant (matches existing production design): the immutable
`post_production_run` source-line output in `production_runs` + the journal is
the **source of truth for accounting**; job cards are the mutable operational
front-end, never touched in the accounting ledger.

---

## 2. Current state (verified against live DB)

- `production_runs`: id, run_no, fy_id, branch_id, run_date, stage,
  output_item_id, output_qty, output_unit_cost, input_value,
  abnormal_wastage_value, journal_run_id, status (`posted` | `reversed`),
  notes, created_by, created_at. RLS: **read-only** `read_all_auth`; writes
  only via `post_production_run` (SECURITY DEFINER).
- `production_run_inputs`: id, run_id, item_id, qty, unit_cost, value, line_no.
  RLS: `read_all_auth`.
- `production_device_config`: id, device_id, device_index, item_id,
  created_at, updated_at.
- `users`: full_name (operator display).
- Reversal primitives already live:
  - `reverse_journal(p_entry_id uuid, p_reason text)` — mirrors a posted
    journal entry: swaps debit↔credit and **negates `stock_qty`**, re-posts
    via `post_journal`, sets `reverses_id`. (migration `0003`)
  - `fy_for_date(date)`, `has_permission(text)`, `next_number(text,date)`,
    `write_audit(...)`, `current_app_user()`.
- Posting RPC `post_production_run(p_header jsonb, p_inputs jsonb)`: for each
  input calls `post_stock_move(..., 'production_out', -qty, wac, '1225',
  'production', v_run, date)`; posts abnormal-wastage and rounding-true-up
  journals all with `source='production'`, `source_id = v_run`; posts the
  output `production_in`. So **every stock move + journal line for a run
  carries `source='production'`, `source_id' = run id`** on 1225 (WIP clearing).
- `number_series` / `issued_numbers` support arbitrary `doc_type`.
  `next_number('prun', date)` yields `PRUN░░░░25601`-style tokens (random
  4-digit); `next_number('job', date)` works the same (prefix falls back to
  `upper(left('job',3))` = `JOB`).

---

## 3. Implementation design

### 3.1 Job cards — new table `production_job_cards` (migration `0090_job_cards_reversal.sql`)

```sql
create type job_card_status as enum ('planned','in_progress','completed','cancelled');

create table production_job_cards (
  id               uuid primary key default gen_random_uuid(),
  job_no           text not null unique,
  fy_id            uuid not null references financial_years(id),
  branch_id        uuid not null default (select id from branches where code='HO'),
  card_date        date not null,
  stage            int  not null check (stage in (1,2)),
  output_item_id   uuid not null references items(id),
  target_qty       numeric(14,3) not null check (target_qty > 0),
  device_id        uuid references production_device_config(id),
  assigned_to      uuid references users(id),
  planned_start_at timestamptz,
  planned_end_at   timestamptz,
  instructions     text,
  status           job_card_status not null default 'planned',
  run_id           uuid references production_runs(id),   -- set on completion
  created_by       uuid not null references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```

- RLS: **read-only** `read_all_auth` (SELECT true) only — mirrors PRODUCE table
  convention. All mutations go through a SECURITY DEFINER RPC (below).
- `run_id` is set exactly once when a card's run posts; a `completed` +
  `run_id` card may not re-post (RPC guard).
- `cancelled` lets an operator retire an unwanted planned card without
  posting.

### 3.2 Job card RPC — `upsert_job_card(p_card jsonb)`, `set_job_card_status(p_id, p_status)`

`SECURITY DEFINER`, `SET search_path = public`. Both check
`has_permission('production.run')`. `upsert` inserts (or updates) a card from
a JSON payload; allocates `job_no` via `next_number('job', card_date)` on
insert; writes `write_audit`. `set_job_card_status` transitions
`planned → in_progress → completed |cancelled`; moving to `completed` without a
`run_id` is rejected (must post the run first).

**Completing = two server-action calls done in sequence by the UI:**
1. `postProductionRun(...)` (existing RPC `post_production_run`).
2. on success `set_job_card_status(cardId, 'completed')` +
   link-`run_id` (pass `p_run_id` when status = `completed`).

### 3.3 Run reversal — `reverse_production_run(p_run_id uuid, p_reason text) -> uuid`

`SECURITY DEFINER`, `SET search_path = public`, `SECURITY DEFINER` returns the
new reversed journal entry id of the primary reversal.

```plpgsql
create or replace function reverse_production_run(p_run_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_run     production_runs%rowtype;
  v_entry   uuid;
  v_new     uuid;
  v_fy      uuid;
begin
  select * into v_run from production_runs where id = p_run_id;
  if not found then raise exception 'reverse_production_run: run % not found', p_run_id; end if;
  if v_run.status = 'reversed' then raise exception 'already reversed'; end if;
  if v_run.status <> 'posted' then raise exception 'not posted'; end if;
  if not has_permission('production.run') then raise exception 'permission denied'; end if;

  v_fy := fy_for_date(current_date);
  if v_run.fy_id <> v_fy then
    raise exception 'cannot reverse prior FY run %', v_run.run_no;
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reversal reason required';
  end if;

  -- reverse every posted entry carrying this run's source id (mirrors
  -- inputs out / output in and reverses the abnormal + rounding journals)
  for v_entry in
    select id from journal_entries
     where source = 'production' and source_id = p_run_id::text
       and status = 'posted'
  loop
    v_new := reverse_journal(v_entry, p_reason);
  end loop;

  update production_runs set status = 'reversed' where id = p_run_id;
  perform write_audit('reverse','production_runs', p_run_id::text,
            format('Reversed run %s: %s', v_run.run_no, p_reason),
            jsonb_build_object('run_no', v_run.run_no, 'reason', p_reason), current_app_user());
  return v_new;
end $$;
```

**Why this is correct:** `reverse_journal` already negates `stock_qty` and
swaps debits/credits, so a single reversal of each posted production entry
simultaneously (a) restores input stock (`production_out` − → +), (b)
removes output stock (`production_in` + → −), and (c) zeroes WIP 1225 by the
mirror. The abnormal-wastage and rounding-true-up journals carry `source_id`
= run too, so all are reversed in one pass over `journal_entries`. The run is
then marked `reversed`; row + `production_run_inputs` are kept as the audit
trail.

Cross-FY is blocked because reversing a last-year run would break closed-year
balances; same as existing financial invariants.

### 3.4 RLS policies (migration)

- `production_job_cards`: `read_all_auth` (SELECT) mirroring parent tables.
  (Writes are RPC only, never direct `authenticated` INSERT.)
- No new roles — reuses `production.run`.

---

## 4. Data layer (`app/src/lib/data/production.ts`)

Add but keep existing readers. New types/readers:

- `JobCardRow` / `JobCardStatus`
- `listJobCards({ from, to, status? })` — ordered by `card_date` asc then
  `job_no`; joins `output_item:items(sku,name)`, `device:production_device_config(device_id)`,
  `assignee:users(full_name)`, `run:production_runs(run_no)`.
- `getJobCard(id)`.
- The existing `listRuns` / `getRun` stay unchanged.

## 5. Actions (`app/src/lib/actions/production.ts`)

Reuse `ActionResult<T>`.

- `createJobCard(input)`, `updateJobCard(id,input)`,
  `setJobCardStatus(id,status,runId?)` → `supabase.rpc('set_job_card_status', ...)`.
- `postRunForJobCard(cardId, overrides)` — lens: call existing
  `postProductionRun`, then `set_job_card_status(cardId,'completed',runId)`.
  Returns the new runId; revalidates `/production` and `/production/jobs`.
- `reverseProductionRun(runId, reason)`:
  - validates reason present.
  - `supabase.rpc('reverse_production_run', { p_run_id, p_reason })`.
  - on success `revalidatePath('/production')` + the detail path; returns
    `{ ok:true }`.

## 6. UI

### 6.1 Planning board — `/production/jobs` (new)

Server page `app/src/app/(app)/production/jobs/page.tsx` → client
`JobBoardView.tsx`.

- **Layout:** sticky toolbar (title, `+ New job`, status filter, day-scoped
  board), then a **day-grouped board**: columns for each date present
  (today first), each column lists that day's cards.
- **Card:** item sku/name, target qty, stage badge, device id, operator name,
  planned time window, status badge. Card actions: `Start` (→ in_progress),
  `Complete` → opens post-run dialog, `Edit`, `Cancel`. Completed cards show
  the linked `run_no`.
- **Post-run dialog** (complete a card): pre-fills the journal with the card's
  item/qty/stage/date via a read of `getJobCard`, runs a BOM-preview read
  (reuse the same select used by `/production/new`), then `postRunForJobCard`.
- **New/Edit modal**: fields — card_date, stage, output item (filtered by
  stage), target qty, planned start/end, device (from
  `production-device-config` read), assigned operators (list of users),
  instructions. `createJobCard` / `updateJobCard`.

### 6.2 Run detail — Reverse button

- `app/src/app/(app)/production/[id]/page.tsx`: render an additional card
  with a **Reverse run** button (destructive) **only when
  `run.status === 'posted'`**.
- Client wrapper `ReverseRunDialog.tsx`: confirm + required reason textarea →
  `reverseProductionRun` → toast → redirect back to `/production` (reversed
  row re-renders with `reversed` badge).

### 6.3 Nav

Add under Production group in `app/src/components/shell/nav.ts` after
`production`:
`{ id: "production-jobs", label: "Jobs", href: "/production/jobs", perm:
"production.run" }`.

## 7. Edge cases

- **Re-post guard:** `set_job_card_status` rejects `completed` when the card
  already has a `run_id`.
- **Reverse cross-FY:** RPC raises; UI shows the message. Run stays `posted`.
- **Reverse already-reversed / not-posted:** RPC raises `already reversed` /
  `not posted`.
- **Missing reason:** RPC raises `reversal reason required`; UI enforces a
  non-empty reason before calling.
- **Partial reverse failure:** everything is one RPC/transaction — any
  `reverse_journal` failure rolls back all reversals and the status flip,
  leaving the run `posted`.
- **BOM-less input** at post-from-card still raised by
  `post_production_run` (bundle `no inputs`).
- **Deleted device/operator on a card:** nullable FKs → card renders with a
  dash; posting still works (device/operator not required by the RPC).

## 8. Testing

- Migration `0099` applies clean; enum + table + RPCs exist; RLS read-only.
- Create card happy path → appears on the board.
- Post-run-from-card creates the run, sets `run_id`, flips card `completed`.
- Re-posting a completed card is rejected.
- Reverse a posted run → run `status-reversed`; stock restored (run back in,
  inputs out); WIP 1225 nets to zero (`assert_trial_balance` = 0);
  `reverse_production_run` returns a new reversal journal entry.
- Reverse guards: prior FY run rejects; missing reason rejects;
  already-reversed rejects.
- Typecheck + `next build` green.

## 9. Out of scope (explicit)

- Scheduling / multi-worker / shift assignment.
- Planned-material reservation (committing device to job during `planned`).
- Reports (job efficiency, downtime).
- Auto-posting from a completed job (kept a deliberate two-step so the
  operator can confirm input quantities before posting).