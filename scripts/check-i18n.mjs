// Checks that every text key the web app uses exists in both English and
// Kannada, including keys built from data (statuses, methods, categories…) and
// the error codes the server can send. Run with `npm run check:i18n`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strings } from '../src/i18n.js'

const root = fileURLToPath(new URL('..', import.meta.url))

function files(dir, ext) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p, ext))
    else if (ext.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

// Values that keys are built from: prefix → every value the data can hold.
const DYNAMIC = {
  st_: [
    // admissions
    'enquiry', 'applied', 'documents_verified', 'offered', 'accepted', 'enrolled', 'waitlisted', 'rejected', 'withdrawn',
    // fees, payments, refunds and approvals
    'due', 'part_paid', 'paid', 'overdue', 'cancelled', 'initiated', 'captured', 'failed', 'bounced', 'pending', 'approved', 'requested',
    // payroll, transport
    'draft', 'started', 'closed', 'ok', 'expiring', 'expired', 'missing', 'active', 'ended',
    // purchasing and assets
    'submitted', 'ordered', 'issued', 'partially_received', 'received', 'matched', 'mismatch', 'in_use', 'in_store', 'under_repair', 'disposed',
    // library, reception, safeguarding, messages, helpdesk
    'on_loan', 'available', 'waiting', 'released', 'refused', 'open', 'investigating', 'pending_approval', 'sent', 'in_progress', 'resolved',
  ],
  rel_: ['mother', 'father', 'guardian', 'grandparent', 'other'],
  pm_: ['cash', 'cheque', 'upi', 'card', 'netbanking', 'bank_transfer', 'gateway'],
  dir_: ['to_school', 'to_home'],
  sev_: ['low', 'medium', 'high', 'urgent'],
  pr_: ['low', 'normal', 'high', 'urgent'],
  vs_: ['active', 'maintenance', 'retired'],
  sgc_: ['bullying', 'neglect', 'abuse', 'self_harm', 'online', 'other'],
  moveTo_: ['applied', 'documents_verified', 'waitlisted', 'offered', 'accepted', 'rejected', 'withdrawn'],
  js_: ['fee_demand', 'fee_payment', 'fee_refund', 'settlement', 'payroll', 'payroll_payment', 'purchase', 'purchase_payment', 'manual', 'reversal'],
  ik_: ['consumable', 'asset'],
  hc_: ['fees', 'academic', 'transport', 'it', 'facility', 'other', 'grievance'],
  doc_: ['birth_certificate', 'address_proof', 'transfer_certificate', 'photo', 'insurance', 'fitness', 'permit'],
  conc_: ['sibling', 'scholarship', 'staff_child', 'merit', 'hardship', 'other'],
  bl_: ['en', 'kn', 'hi', 'other'],
  vk_: ['visitor', 'parent', 'contractor', 'delivery', 'official'],
  tx_: ['over_capacity', 'no_vehicle', 'no_driver', 'document_expiring', 'document_expired', 'document_missing', 'no_attendant', 'gps_stale', 'closed_with_note'],
  te_: ['boarded', 'alighted', 'absent'],
  src_: ['walk_in', 'website', 'phone', 'referral', 'sibling', 'event', 'other'],
  settle_: ['unsettled', 'settled', 'not_applicable'],
  rk_: ['component', 'deduction', 'employer'],
  mv_: ['receipt', 'issue', 'adjustment', 'write_off'],
  hk_: ['tuition', 'admission', 'annual', 'exam', 'activity', 'transport', 'hostel', 'meal', 'library', 'other'],
  flag_: ['variance', 'first_pay', 'no_bank', 'lop'],
  basis_: ['basic', 'gross', 'fixed'],
  aud_: ['all_guardians', 'all_staff', 'section_guardians', 'everyone'],
  at_: ['asset', 'liability', 'equity', 'income', 'expense'],
  ap_: ['concessions', 'refunds', 'journals', 'leave', 'payroll', 'requisitions', 'invoices', 'messages', 'pickups', 'tickets', 'safeguarding'],
  act_: ['created', 'updated', 'status_changed', 'enrolled'],
  // Keys from the earlier foundation screens.
  staffType_: ['teaching', 'non_teaching', 'contractor'],
  signInAs_: ['admin', 'family', 'staff'],
  identifier_: ['admin', 'family', 'staff'],
  demo_: ['student', 'guardian', 'teacher', 'driver', 'principal', 'trustee', 'accountantParent', 'hr', 'receptionist', 'safeguarding', 'nurse', 'librarian', 'stores', 'attendant'],
}

const used = new Map() // key → first file that uses it
const prefixes = new Set()
const use = (key, file) => used.has(key) || used.set(key, relative(root, file))

for (const file of files(join(root, 'src'), ['.js', '.jsx'])) {
  if (/i18n/.test(file)) continue
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/\bt\('([^']+)'\)/g)) use(m[1], file)
  for (const m of src.matchAll(/(?:okKey|confirm)(?:=|: )["']([A-Za-z.]+)["']/g)) use(m[1], file)
  for (const m of src.matchAll(/\brun\(\(\) => [^\n]*\),\s*'([A-Za-z]+)'\)/g)) use(m[1], file)
  for (const m of src.matchAll(/'local:([A-Za-z.]+)'/g)) use(m[1], file)
  for (const m of src.matchAll(/\bt\(`([A-Za-z_]+)\$\{/g)) prefixes.add(m[1])
  for (const m of src.matchAll(/opts\([^;]*?, t, '([A-Za-z_]+)'\)/g)) prefixes.add(m[1])
  for (const m of src.matchAll(/SECTION_LABEL = \{([^}]*)\}/g)) for (const k of m[1].matchAll(/'([A-Za-z_]+)'/g)) use(k[1], file)
  if (file.endsWith('nav.js')) for (const m of src.matchAll(/key: '([A-Za-z_]+)'/g)) use(m[1], file)
}

const problems = []
for (const p of prefixes) {
  if (!DYNAMIC[p]) problems.push(`no value list for key prefix "${p}" in scripts/check-i18n.mjs`)
  else for (const v of DYNAMIC[p]) use(`${p}${v}`, 'scripts/check-i18n.mjs')
}

// Error codes the server can send become err.<code> on screen.
for (const file of files(join(root, 'server'), ['.js'])) {
  const src = readFileSync(file, 'utf8')
  const patterns = [/\b(?:bad|conflict|forbidden|notFound|unauthorized)\('([a-z_.]+)'/g, /HttpError\(\d+, '([a-z_.]+)'\)/g, /\berror: '([a-z_.]+)'/g]
  for (const re of patterns) for (const m of src.matchAll(re)) use(`err.${m[1]}`, file)
}

for (const [key, file] of used) {
  for (const lang of ['en', 'kn']) if (!(key in strings[lang])) problems.push(`${lang}: missing "${key}" (used in ${file})`)
}
const en = Object.keys(strings.en)
for (const key of en) if (!(key in strings.kn)) problems.push(`kn: missing "${key}" (present in English)`)

if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} problem(s).`)
  process.exit(1)
}
console.log(`All ${used.size} keys exist in English and Kannada.`)
