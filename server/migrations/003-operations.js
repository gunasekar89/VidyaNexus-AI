// 003: school operations modules — admissions, fees, accounting, leave and
// payroll, transport, purchasing / stores / assets, library, reception and
// visitors, health and safeguarding, messages and helpdesk.
//
// Money is always integer paise. Posted accounting records are append-only.
export const id = '003-operations'

export const sql = `
-- ---------- Shared ----------

-- Gap-free document numbers per school, kind and period (e.g. RCPT/2026-27/000001).
CREATE TABLE doc_sequences (
  school_id INTEGER NOT NULL REFERENCES schools(id),
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  next_no INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (school_id, kind, period)
);

-- In-app inbox for every signed-in person.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  school_id INTEGER REFERENCES schools(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'info',
  title_en TEXT NOT NULL, title_kn TEXT NOT NULL,
  body_en TEXT NOT NULL DEFAULT '', body_kn TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at TEXT
);
CREATE INDEX notifications_user ON notifications (user_id, id DESC);

-- ---------- Admissions ----------

CREATE TABLE admission_applications (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
  number TEXT NOT NULL,
  child_name TEXT NOT NULL,
  child_dob TEXT,
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  previous_school TEXT NOT NULL DEFAULT '',
  guardian_name TEXT NOT NULL,
  guardian_relationship TEXT NOT NULL DEFAULT 'guardian',
  guardian_mobile TEXT NOT NULL,
  guardian_email TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'walk_in',
  status TEXT NOT NULL DEFAULT 'enquiry' CHECK (status IN ('enquiry', 'applied', 'documents_verified', 'offered', 'accepted', 'enrolled', 'waitlisted', 'rejected', 'withdrawn')),
  docs_birth_certificate INTEGER NOT NULL DEFAULT 0,
  docs_address_proof INTEGER NOT NULL DEFAULT 0,
  docs_transfer_certificate INTEGER NOT NULL DEFAULT 0,
  docs_photo INTEGER NOT NULL DEFAULT 0,
  offer_section_id INTEGER REFERENCES sections(id),
  offer_expires_on TEXT,
  decision_reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  follow_up_on TEXT,
  student_user_id INTEGER REFERENCES users(id),
  guardian_user_id INTEGER REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, number)
);

-- ---------- Fees ----------

CREATE TABLE fee_heads (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL, name_kn TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tuition', 'admission', 'annual', 'exam', 'activity', 'transport', 'hostel', 'meal', 'library', 'other')),
  refundable INTEGER NOT NULL DEFAULT 0,
  UNIQUE (school_id, code),
  UNIQUE (school_id, id)
);
-- Amount per grade, head and instalment for an academic year.
CREATE TABLE fee_plan_items (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL,
  academic_year_id INTEGER NOT NULL,
  grade_level INTEGER NOT NULL,
  head_id INTEGER NOT NULL,
  installment_no INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT '',
  due_on TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  UNIQUE (academic_year_id, grade_level, head_id, installment_no),
  FOREIGN KEY (school_id, head_id) REFERENCES fee_heads (school_id, id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years (school_id, id)
);
CREATE TABLE fee_concessions (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
  head_id INTEGER REFERENCES fee_heads(id),
  kind TEXT NOT NULL CHECK (kind IN ('sibling', 'scholarship', 'staff_child', 'merit', 'hardship', 'other')),
  percent INTEGER CHECK (percent BETWEEN 1 AND 100),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE fee_demands (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
  head_id INTEGER NOT NULL REFERENCES fee_heads(id),
  installment_no INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  due_on TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  concession_paise INTEGER NOT NULL DEFAULT 0 CHECK (concession_paise >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'plan',
  source_ref TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (concession_paise <= amount_paise),
  -- One demand per student, year, head, instalment and source: re-running never duplicates.
  UNIQUE (school_id, student_user_id, academic_year_id, head_id, installment_no, source, source_ref)
);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  payer_user_id INTEGER REFERENCES users(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'cheque', 'upi', 'card', 'netbanking', 'bank_transfer', 'gateway')),
  reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('initiated', 'captured', 'failed', 'bounced', 'cancelled')),
  receipt_no TEXT,
  gateway_order_id TEXT UNIQUE,
  gateway_payment_id TEXT UNIQUE,
  idempotency_key TEXT UNIQUE,
  settlement_status TEXT NOT NULL DEFAULT 'unsettled' CHECK (settlement_status IN ('unsettled', 'settled', 'not_applicable')),
  settlement_ref TEXT,
  settled_at TEXT,
  reconciled_at TEXT,
  received_by INTEGER REFERENCES users(id),
  received_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, receipt_no)
);
CREATE TABLE payment_allocations (
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  demand_id INTEGER NOT NULL REFERENCES fee_demands(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  PRIMARY KEY (payment_id, demand_id)
);
CREATE TABLE fee_refunds (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'paid')),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  paid_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Every gateway webhook as received. event_id makes redelivery harmless.
CREATE TABLE gateway_events (
  id INTEGER PRIMARY KEY,
  school_id INTEGER REFERENCES schools(id),
  event_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  signature_ok INTEGER NOT NULL,
  payload TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------- Accounting ----------

CREATE TABLE ledger_accounts (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL, name_kn TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  UNIQUE (school_id, code)
);
CREATE TABLE journals (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  number TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  narration TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('fee_demand', 'fee_payment', 'fee_refund', 'settlement', 'payroll', 'payroll_payment', 'purchase', 'purchase_payment', 'manual', 'reversal')),
  source_ref TEXT NOT NULL DEFAULT '',
  reverses_id INTEGER REFERENCES journals(id),
  prepared_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, number),
  UNIQUE (school_id, source, source_ref)
);
CREATE TABLE journal_lines (
  id INTEGER PRIMARY KEY,
  journal_id INTEGER NOT NULL REFERENCES journals(id),
  account_id INTEGER NOT NULL REFERENCES ledger_accounts(id),
  debit_paise INTEGER NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
  credit_paise INTEGER NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
  CHECK ((debit_paise = 0) <> (credit_paise = 0))
);
CREATE TRIGGER journals_no_update BEFORE UPDATE ON journals BEGIN SELECT RAISE(ABORT, 'posted journals are immutable; post a reversal'); END;
CREATE TRIGGER journals_no_delete BEFORE DELETE ON journals BEGIN SELECT RAISE(ABORT, 'posted journals are immutable; post a reversal'); END;
CREATE TRIGGER journal_lines_no_update BEFORE UPDATE ON journal_lines BEGIN SELECT RAISE(ABORT, 'posted journals are immutable; post a reversal'); END;
CREATE TRIGGER journal_lines_no_delete BEFORE DELETE ON journal_lines BEGIN SELECT RAISE(ABORT, 'posted journals are immutable; post a reversal'); END;
-- Manual journals wait here until a second person approves them.
CREATE TABLE journal_drafts (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  entry_date TEXT NOT NULL,
  narration TEXT NOT NULL,
  lines TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  prepared_by INTEGER NOT NULL REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  journal_id INTEGER REFERENCES journals(id),
  reverses_id INTEGER REFERENCES journals(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE period_locks (
  school_id INTEGER NOT NULL REFERENCES schools(id),
  month TEXT NOT NULL,
  locked_by INTEGER NOT NULL REFERENCES users(id),
  locked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (school_id, month)
);

-- ---------- HR: leave and payroll ----------

CREATE TABLE leave_types (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL, name_kn TEXT NOT NULL,
  days_per_year INTEGER NOT NULL CHECK (days_per_year >= 0),
  paid INTEGER NOT NULL DEFAULT 1,
  UNIQUE (school_id, code)
);
CREATE TABLE leave_requests (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  days INTEGER NOT NULL CHECK (days > 0),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (to_date >= from_date)
);
-- School-configured deduction rules. Rates are settings to verify, not statutory facts.
CREATE TABLE payroll_rules (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL, name_kn TEXT NOT NULL,
  -- component: share of gross treated as basic pay; deduction: taken from the
  -- employee; employer: the school's own contribution on top.
  kind TEXT NOT NULL CHECK (kind IN ('component', 'deduction', 'employer')),
  basis TEXT NOT NULL CHECK (basis IN ('basic', 'gross', 'fixed')),
  percent_bp INTEGER NOT NULL DEFAULT 0,
  fixed_paise INTEGER NOT NULL DEFAULT 0,
  base_cap_paise INTEGER,
  min_gross_paise INTEGER,
  max_gross_paise INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  verified_by TEXT NOT NULL DEFAULT '',
  UNIQUE (school_id, code)
);
CREATE TABLE payroll_runs (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  inputs_hash TEXT NOT NULL,
  total_gross_paise INTEGER NOT NULL,
  total_deductions_paise INTEGER NOT NULL,
  total_net_paise INTEGER NOT NULL,
  total_employer_paise INTEGER NOT NULL,
  flags INTEGER NOT NULL DEFAULT 0,
  prepared_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  paid_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX payroll_one_live_run ON payroll_runs (school_id, month) WHERE status != 'cancelled';
CREATE TABLE payslips (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES payroll_runs(id),
  school_id INTEGER NOT NULL REFERENCES schools(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  days_in_month INTEGER NOT NULL,
  lop_days INTEGER NOT NULL DEFAULT 0,
  gross_paise INTEGER NOT NULL,
  lop_paise INTEGER NOT NULL DEFAULT 0,
  earned_paise INTEGER NOT NULL,
  deductions TEXT NOT NULL DEFAULT '[]',
  deductions_paise INTEGER NOT NULL DEFAULT 0,
  employer_paise INTEGER NOT NULL DEFAULT 0,
  net_paise INTEGER NOT NULL,
  previous_net_paise INTEGER,
  flag TEXT NOT NULL DEFAULT '',
  bank_last4 TEXT NOT NULL DEFAULT '',
  UNIQUE (run_id, employee_id)
);

-- ---------- Transport ----------

CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  reg_no TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  insurance_until TEXT, fitness_until TEXT, permit_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  UNIQUE (school_id, reg_no)
);
CREATE TABLE transport_routes (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL, name_kn TEXT NOT NULL,
  vehicle_id INTEGER REFERENCES vehicles(id),
  driver_user_id INTEGER REFERENCES users(id),
  attendant_user_id INTEGER REFERENCES users(id),
  monthly_fee_paise INTEGER NOT NULL DEFAULT 0,
  UNIQUE (school_id, code)
);
CREATE TABLE route_stops (
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES transport_routes(id),
  seq INTEGER NOT NULL,
  name TEXT NOT NULL,
  pickup_time TEXT NOT NULL,
  drop_time TEXT NOT NULL,
  UNIQUE (route_id, seq)
);
CREATE TABLE transport_allocations (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  route_id INTEGER NOT NULL REFERENCES transport_routes(id),
  stop_id INTEGER NOT NULL REFERENCES route_stops(id),
  from_date TEXT NOT NULL,
  to_date TEXT,
  consent_guardian_user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX one_active_route ON transport_allocations (student_user_id) WHERE status = 'active';
CREATE TABLE trips (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  route_id INTEGER NOT NULL REFERENCES transport_routes(id),
  trip_date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('to_school', 'to_home')),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'closed')),
  attendant_present INTEGER NOT NULL DEFAULT 1,
  started_by INTEGER REFERENCES users(id),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at TEXT,
  closing_note TEXT NOT NULL DEFAULT '',
  UNIQUE (route_id, trip_date, direction)
);
-- Boarding and alighting are recorded by people, never inferred from GPS.
CREATE TABLE trip_events (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  event TEXT NOT NULL CHECK (event IN ('boarded', 'alighted', 'absent')),
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (trip_id, student_user_id, event)
);
CREATE TABLE gps_pings (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  lat REAL NOT NULL, lng REAL NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------- Purchasing, stores and assets ----------

CREATE TABLE vendors (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  gstin TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  UNIQUE (school_id, name)
);
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'nos',
  kind TEXT NOT NULL DEFAULT 'consumable' CHECK (kind IN ('consumable', 'asset')),
  reorder_level INTEGER NOT NULL DEFAULT 0,
  UNIQUE (school_id, sku)
);
CREATE TABLE requisitions (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  number TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'ordered')),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  estimated_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, number)
);
CREATE TABLE requisition_lines (
  id INTEGER PRIMARY KEY,
  requisition_id INTEGER NOT NULL REFERENCES requisitions(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  est_unit_paise INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  number TEXT NOT NULL,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  requisition_id INTEGER REFERENCES requisitions(id),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'partially_received', 'received', 'closed', 'cancelled')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, number)
);
CREATE TABLE po_lines (
  id INTEGER PRIMARY KEY,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_paise INTEGER NOT NULL CHECK (unit_paise >= 0),
  received_qty INTEGER NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  CHECK (received_qty <= qty)
);
CREATE TABLE goods_receipts (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  number TEXT NOT NULL,
  received_by INTEGER NOT NULL REFERENCES users(id),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, number)
);
CREATE TABLE goods_receipt_lines (
  grn_id INTEGER NOT NULL REFERENCES goods_receipts(id),
  po_line_id INTEGER NOT NULL REFERENCES po_lines(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (grn_id, po_line_id)
);
CREATE TABLE vendor_invoices (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  po_id INTEGER REFERENCES purchase_orders(id),
  invoice_no TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  matched_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'mismatch' CHECK (status IN ('matched', 'mismatch', 'approved', 'paid', 'rejected')),
  note TEXT NOT NULL DEFAULT '',
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- The same supplier invoice number can be entered only once.
  UNIQUE (school_id, vendor_id, invoice_no)
);
CREATE TABLE stock_moves (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty INTEGER NOT NULL CHECK (qty <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('receipt', 'issue', 'adjustment', 'write_off')),
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  moved_by INTEGER REFERENCES users(id),
  moved_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE assets (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  tag TEXT NOT NULL,
  name TEXT NOT NULL,
  item_id INTEGER REFERENCES items(id),
  location TEXT NOT NULL DEFAULT '',
  custodian_user_id INTEGER REFERENCES users(id),
  purchase_date TEXT,
  cost_paise INTEGER NOT NULL DEFAULT 0,
  warranty_until TEXT,
  status TEXT NOT NULL DEFAULT 'in_use' CHECK (status IN ('in_use', 'in_store', 'under_repair', 'disposed')),
  source_ref TEXT NOT NULL DEFAULT '',
  UNIQUE (school_id, tag)
);

-- ---------- Library ----------

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  isbn TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en',
  subject TEXT NOT NULL DEFAULT ''
);
CREATE TABLE book_copies (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  book_id INTEGER NOT NULL REFERENCES books(id),
  accession_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_loan', 'lost', 'withdrawn')),
  UNIQUE (school_id, accession_no)
);
CREATE TABLE library_loans (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  copy_id INTEGER NOT NULL REFERENCES book_copies(id),
  borrower_user_id INTEGER NOT NULL REFERENCES users(id),
  issued_by INTEGER NOT NULL REFERENCES users(id),
  issued_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  returned_on TEXT,
  fine_paise INTEGER NOT NULL DEFAULT 0,
  fine_status TEXT NOT NULL DEFAULT 'none' CHECK (fine_status IN ('none', 'due', 'waived', 'paid'))
);
CREATE UNIQUE INDEX one_open_loan_per_copy ON library_loans (copy_id) WHERE returned_on IS NULL;

-- ---------- Reception and visitors ----------

CREATE TABLE visitors (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  pass_no TEXT NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL,
  host TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'visitor' CHECK (kind IN ('visitor', 'parent', 'contractor', 'delivery', 'official')),
  checked_in_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  checked_out_at TEXT,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  UNIQUE (school_id, pass_no)
);
-- Early exit and pickup: a child goes only with an approved person.
CREATE TABLE pickup_requests (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  pickup_name TEXT NOT NULL,
  pickup_guardian_user_id INTEGER REFERENCES users(id),
  verification TEXT NOT NULL DEFAULT '' CHECK (verification IN ('', 'approved_guardian', 'override')),
  override_reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'released', 'refused')),
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  released_at TEXT
);

-- ---------- Health and safeguarding ----------

CREATE TABLE infirmary_visits (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  complaint TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  sent_home INTEGER NOT NULL DEFAULT 0,
  guardian_informed INTEGER NOT NULL DEFAULT 0,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  visited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE safeguarding_cases (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  number TEXT NOT NULL,
  student_user_id INTEGER REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN ('bullying', 'neglect', 'abuse', 'self_harm', 'online', 'other')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'urgent')),
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'closed')),
  reported_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  escalated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at TEXT,
  UNIQUE (school_id, number)
);
CREATE TABLE safeguarding_notes (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES safeguarding_cases(id),
  body TEXT NOT NULL,
  written_by INTEGER NOT NULL REFERENCES users(id),
  written_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------- Messages and helpdesk ----------

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  audience TEXT NOT NULL CHECK (audience IN ('all_guardians', 'all_staff', 'section_guardians', 'everyone')),
  section_id INTEGER REFERENCES sections(id),
  title_en TEXT NOT NULL, title_kn TEXT NOT NULL,
  body_en TEXT NOT NULL, body_kn TEXT NOT NULL,
  sensitive INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'sent', 'rejected')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  number TEXT NOT NULL,
  raised_by INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN ('fees', 'academic', 'transport', 'it', 'facility', 'other', 'grievance')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to INTEGER REFERENCES users(id),
  due_at TEXT NOT NULL,
  resolution TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT,
  UNIQUE (school_id, number)
);
CREATE TABLE ticket_comments (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`
