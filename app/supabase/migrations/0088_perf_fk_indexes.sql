-- =====================================================================
-- 0088_perf_fk_indexes.sql   Index unindexed FK columns + drop duplicates
--
-- Advisor (performance): 179 unindexed foreign keys across ~88 tables and
-- 2 duplicate index pairs. All FK columns lacking a leading-column index are
-- given a `<table>_<column>_idx` btree index (matching the naming convention
-- used in earlier migrations). The two redundant duplicate pairs are dropped.
--
-- This is write-amplification-free for existing data: each CREATE INDEX is
-- `if not exists` and single-column, so collisions with existing partial or
-- composite indexes are impossible (those carry different names/columns).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Drop duplicate index pairs (same expression, keep convention names).
-- ---------------------------------------------------------------------
drop index if exists ralloc_invoice_idx;
drop index if exists so_status_idx;

-- ---------------------------------------------------------------------
-- B) Index every FK column lacking a leading-column index.
-- ---------------------------------------------------------------------
create index if not exists account_balances_fy_id_idx on account_balances (fy_id);
create index if not exists alternate_group_members_item_id_idx on alternate_group_members (item_id);
create index if not exists attendance_created_by_idx on attendance (created_by);
create index if not exists bank_accounts_created_by_idx on bank_accounts (created_by);
create index if not exists bank_accounts_gl_account_code_idx on bank_accounts (gl_account_code);
create index if not exists bank_csv_column_mapping_created_by_idx on bank_csv_column_mapping (created_by);
create index if not exists bank_statement_imports_imported_by_idx on bank_statement_imports (imported_by);
create index if not exists bank_transactions_import_id_idx on bank_transactions (import_id);
create index if not exists bank_txn_matches_journal_entry_id_idx on bank_txn_matches (journal_entry_id);
create index if not exists bank_txn_matches_matched_by_idx on bank_txn_matches (matched_by);
create index if not exists bank_txn_matches_payment_id_idx on bank_txn_matches (payment_id);
create index if not exists bank_txn_matches_receipt_id_idx on bank_txn_matches (receipt_id);
create index if not exists bom_lines_alternate_group_id_idx on bom_lines (alternate_group_id);
create index if not exists boms_created_by_idx on boms (created_by);
create index if not exists campaign_results_customer_store_id_idx on campaign_results (customer_store_id);
create index if not exists campaign_results_order_id_idx on campaign_results (order_id);
create index if not exists campaigns_created_by_idx on campaigns (created_by);
create index if not exists chart_of_accounts_parent_id_idx on chart_of_accounts (parent_id);
create index if not exists cheque_registry_bank_account_id_idx on cheque_registry (bank_account_id);
create index if not exists cheque_registry_bounce_journal_id_idx on cheque_registry (bounce_journal_id);
create index if not exists cheque_registry_created_by_idx on cheque_registry (created_by);
create index if not exists cheque_registry_journal_entry_id_idx on cheque_registry (journal_entry_id);
create index if not exists cheque_registry_payment_id_idx on cheque_registry (payment_id);
create index if not exists cheque_registry_receipt_id_idx on cheque_registry (receipt_id);
create index if not exists commission_lines_user_id_idx on commission_lines (user_id);
create index if not exists commission_rules_created_by_idx on commission_rules (created_by);
create index if not exists commission_rules_role_code_idx on commission_rules (role_code);
create index if not exists commission_rules_user_id_idx on commission_rules (user_id);
create index if not exists commission_runs_created_by_idx on commission_runs (created_by);
create index if not exists commission_runs_journal_entry_id_idx on commission_runs (journal_entry_id);
create index if not exists complaints_created_by_idx on complaints (created_by);
create index if not exists complaints_credit_note_id_idx on complaints (credit_note_id);
create index if not exists cost_accounts_tag_updated_by_idx on cost_accounts_tag (updated_by);
create index if not exists costing_run_lines_item_id_idx on costing_run_lines (item_id);
create index if not exists costing_runs_computed_by_idx on costing_runs (computed_by);
create index if not exists credit_notes_approved_by_idx on credit_notes (approved_by);
create index if not exists credit_notes_complaint_id_idx on credit_notes (complaint_id);
create index if not exists credit_notes_created_by_idx on credit_notes (created_by);
create index if not exists credit_notes_fy_id_idx on credit_notes (fy_id);
create index if not exists credit_notes_journal_entry_id_idx on credit_notes (journal_entry_id);
create index if not exists credit_notes_reference_sale_id_idx on credit_notes (reference_sale_id);
create index if not exists credit_notes_scheme_eligibility_id_idx on credit_notes (scheme_eligibility_id);
create index if not exists customer_receipts_collected_by_idx on customer_receipts (collected_by);
create index if not exists customer_receipts_created_by_idx on customer_receipts (created_by);
create index if not exists customer_receipts_journal_entry_id_idx on customer_receipts (journal_entry_id);
create index if not exists customer_receipts_method_id_idx on customer_receipts (method_id);
create index if not exists customer_receipts_store_id_idx on customer_receipts (store_id);
create index if not exists customer_store_routes_created_by_idx on customer_store_routes (created_by);
create index if not exists customer_stores_created_by_idx on customer_stores (created_by);
create index if not exists customer_stores_price_list_id_idx on customer_stores (price_list_id);
create index if not exists customer_stores_route_id_idx on customer_stores (route_id);
create index if not exists customers_created_by_idx on customers (created_by);
create index if not exists customers_price_list_id_idx on customers (price_list_id);
create index if not exists debit_note_lines_item_id_idx on debit_note_lines (item_id);
create index if not exists debit_notes_branch_id_idx on debit_notes (branch_id);
create index if not exists debit_notes_created_by_idx on debit_notes (created_by);
create index if not exists debit_notes_journal_entry_id_idx on debit_notes (journal_entry_id);
create index if not exists debit_notes_purchase_bill_id_idx on debit_notes (purchase_bill_id);
create index if not exists delivery_challan_lines_item_id_idx on delivery_challan_lines (item_id);
create index if not exists delivery_challan_lines_order_line_id_idx on delivery_challan_lines (order_line_id);
create index if not exists delivery_challans_agent_id_idx on delivery_challans (agent_id);
create index if not exists delivery_challans_branch_id_idx on delivery_challans (branch_id);
create index if not exists delivery_challans_cogs_entry_id_idx on delivery_challans (cogs_entry_id);
create index if not exists delivery_challans_created_by_idx on delivery_challans (created_by);
create index if not exists delivery_challans_journal_entry_id_idx on delivery_challans (journal_entry_id);
create index if not exists depreciation_runs_journal_entry_id_idx on depreciation_runs (journal_entry_id);
create index if not exists documents_uploaded_by_idx on documents (uploaded_by);
create index if not exists expenses_account_code_idx on expenses (account_code);
create index if not exists expenses_journal_id_idx on expenses (journal_id);
create index if not exists expenses_user_id_idx on expenses (user_id);
create index if not exists fixed_assets_accum_dep_account_idx on fixed_assets (accum_dep_account);
create index if not exists fixed_assets_asset_account_idx on fixed_assets (asset_account);
create index if not exists fixed_assets_capitalize_journal_id_idx on fixed_assets (capitalize_journal_id);
create index if not exists fixed_assets_dep_expense_account_idx on fixed_assets (dep_expense_account);
create index if not exists fixed_assets_disposal_journal_id_idx on fixed_assets (disposal_journal_id);
create index if not exists fuel_logs_created_by_idx on fuel_logs (created_by);
create index if not exists fuel_logs_journal_entry_id_idx on fuel_logs (journal_entry_id);
create index if not exists fuel_logs_trip_id_idx on fuel_logs (trip_id);
create index if not exists fuel_refill_events_fuel_log_id_idx on fuel_refill_events (fuel_log_id);
create index if not exists gstr2b_imports_imported_by_idx on gstr2b_imports (imported_by);
create index if not exists gstr2b_rows_matched_bill_id_idx on gstr2b_rows (matched_bill_id);
create index if not exists interactions_by_user_id_idx on interactions (by_user_id);
create index if not exists invoice_lines_item_id_idx on invoice_lines (item_id);
create index if not exists invoices_cogs_entry_id_idx on invoices (cogs_entry_id);
create index if not exists invoices_created_by_idx on invoices (created_by);
create index if not exists invoices_journal_entry_id_idx on invoices (journal_entry_id);
create index if not exists item_suppliers_created_by_idx on item_suppliers (created_by);
create index if not exists items_base_unit_id_idx on items (base_unit_id);
create index if not exists items_category_id_idx on items (category_id);
create index if not exists items_created_by_idx on items (created_by);
create index if not exists items_pack_unit_id_idx on items (pack_unit_id);
create index if not exists journal_entries_posted_by_idx on journal_entries (posted_by);
create index if not exists journal_entries_reverses_id_idx on journal_entries (reverses_id);
create index if not exists journal_lines_branch_id_idx on journal_lines (branch_id);
create index if not exists journal_lines_cost_center_id_idx on journal_lines (cost_center_id);
create index if not exists leads_converted_customer_id_idx on leads (converted_customer_id);
create index if not exists leads_created_by_idx on leads (created_by);
create index if not exists licenses_created_by_idx on licenses (created_by);
create index if not exists loan_schedule_payment_journal_id_idx on loan_schedule (payment_journal_id);
create index if not exists loans_disburse_journal_id_idx on loans (disburse_journal_id);
create index if not exists loans_interest_account_idx on loans (interest_account);
create index if not exists loans_loan_account_idx on loans (loan_account);
create index if not exists notifications_created_by_idx on notifications (created_by);
create index if not exists number_series_fy_id_idx on number_series (fy_id);
create index if not exists overhead_pools_created_by_idx on overhead_pools (created_by);
create index if not exists payroll_lines_paid_journal_id_idx on payroll_lines (paid_journal_id);
create index if not exists payroll_lines_user_id_idx on payroll_lines (user_id);
create index if not exists payroll_runs_created_by_idx on payroll_runs (created_by);
create index if not exists payroll_runs_journal_entry_id_idx on payroll_runs (journal_entry_id);
create index if not exists price_list_items_item_id_idx on price_list_items (item_id);
create index if not exists product_cost_snapshots_source_run_id_idx on product_cost_snapshots (source_run_id);
create index if not exists production_device_config_item_id_idx on production_device_config (item_id);
create index if not exists production_run_inputs_item_id_idx on production_run_inputs (item_id);
create index if not exists production_runs_branch_id_idx on production_runs (branch_id);
create index if not exists production_runs_created_by_idx on production_runs (created_by);
create index if not exists purchase_order_lines_item_id_idx on purchase_order_lines (item_id);
create index if not exists purchase_orders_branch_id_idx on purchase_orders (branch_id);
create index if not exists purchase_orders_created_by_idx on purchase_orders (created_by);
create index if not exists purchase_receipt_lines_item_id_idx on purchase_receipt_lines (item_id);
create index if not exists purchase_receipts_branch_id_idx on purchase_receipts (branch_id);
create index if not exists purchase_receipts_created_by_idx on purchase_receipts (created_by);
create index if not exists purchase_receipts_journal_entry_id_idx on purchase_receipts (journal_entry_id);
create index if not exists purchase_receipts_po_id_idx on purchase_receipts (po_id);
create index if not exists reconciliation_adjustments_bank_account_id_idx on reconciliation_adjustments (bank_account_id);
create index if not exists reconciliation_adjustments_bank_transaction_id_idx on reconciliation_adjustments (bank_transaction_id);
create index if not exists reconciliation_adjustments_created_by_idx on reconciliation_adjustments (created_by);
create index if not exists reconciliation_adjustments_journal_entry_id_idx on reconciliation_adjustments (journal_entry_id);
create index if not exists role_permissions_permission_idx on role_permissions (permission);
create index if not exists route_sessions_created_by_idx on route_sessions (created_by);
create index if not exists routes_created_by_idx on routes (created_by);
create index if not exists sales_order_lines_item_id_idx on sales_order_lines (item_id);
create index if not exists sales_orders_created_by_idx on sales_orders (created_by);
create index if not exists sales_orders_followup_order_id_idx on sales_orders (followup_order_id);
create index if not exists sales_orders_parent_order_id_idx on sales_orders (parent_order_id);
create index if not exists sales_orders_price_list_id_idx on sales_orders (price_list_id);
create index if not exists sales_return_lines_invoice_id_idx on sales_return_lines (invoice_id);
create index if not exists sales_return_lines_item_id_idx on sales_return_lines (item_id);
create index if not exists sales_targets_created_by_idx on sales_targets (created_by);
create index if not exists scheme_eligibility_approved_by_idx on scheme_eligibility (approved_by);
create index if not exists scheme_eligibility_credit_note_id_idx on scheme_eligibility (credit_note_id);
create index if not exists scheme_eligibility_customer_store_id_idx on scheme_eligibility (customer_store_id);
create index if not exists schemes_created_by_idx on schemes (created_by);
create index if not exists stock_branch_id_idx on stock (branch_id);
create index if not exists stock_ledger_branch_id_idx on stock_ledger (branch_id);
create index if not exists stock_ledger_journal_entry_id_idx on stock_ledger (journal_entry_id);
create index if not exists stock_ledger_moved_by_idx on stock_ledger (moved_by);
create index if not exists supplier_bill_lines_item_id_idx on supplier_bill_lines (item_id);
create index if not exists supplier_bills_branch_id_idx on supplier_bills (branch_id);
create index if not exists supplier_bills_created_by_idx on supplier_bills (created_by);
create index if not exists supplier_bills_journal_entry_id_idx on supplier_bills (journal_entry_id);
create index if not exists supplier_payments_created_by_idx on supplier_payments (created_by);
create index if not exists supplier_payments_journal_entry_id_idx on supplier_payments (journal_entry_id);
create index if not exists supplier_payments_paid_by_idx on supplier_payments (paid_by);
create index if not exists suppliers_created_by_idx on suppliers (created_by);
create index if not exists transfer_lines_item_id_idx on transfer_lines (item_id);
create index if not exists transfers_created_by_idx on transfers (created_by);
create index if not exists transfers_from_branch_id_idx on transfers (from_branch_id);
create index if not exists transfers_journal_entry_id_idx on transfers (journal_entry_id);
create index if not exists transfers_reference_order_id_idx on transfers (reference_order_id);
create index if not exists transfers_responded_by_idx on transfers (responded_by);
create index if not exists transfers_to_branch_id_idx on transfers (to_branch_id);
create index if not exists trips_created_by_idx on trips (created_by);
create index if not exists trips_driver_user_id_idx on trips (driver_user_id);
create index if not exists trips_route_session_id_idx on trips (route_session_id);
create index if not exists user_invitations_branch_id_idx on user_invitations (branch_id);
create index if not exists user_invitations_consumed_by_idx on user_invitations (consumed_by);
create index if not exists user_invitations_invited_by_idx on user_invitations (invited_by);
create index if not exists user_permission_overrides_granted_by_idx on user_permission_overrides (granted_by);
create index if not exists user_stock_holdings_item_id_idx on user_stock_holdings (item_id);
create index if not exists users_branch_id_idx on users (branch_id);
create index if not exists vehicles_created_by_idx on vehicles (created_by);
create index if not exists voucher_templates_created_by_idx on voucher_templates (created_by);
create index if not exists whatsapp_config_updated_by_idx on whatsapp_config (updated_by);
create index if not exists whatsapp_conversations_assigned_to_idx on whatsapp_conversations (assigned_to);
create index if not exists whatsapp_conversations_created_by_idx on whatsapp_conversations (created_by);
create index if not exists whatsapp_conversations_customer_id_idx on whatsapp_conversations (customer_id);
create index if not exists whatsapp_message_templates_user_id_idx on whatsapp_message_templates (user_id);
create index if not exists whatsapp_messages_sent_by_idx on whatsapp_messages (sent_by);
create index if not exists worker_transactions_created_by_idx on worker_transactions (created_by);
