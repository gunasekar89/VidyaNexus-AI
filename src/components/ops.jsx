// Building blocks shared by the school-operations screens: tabs, tables that
// turn into cards on phones, forms in a dialog, status pills and money.
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Search } from 'lucide-react'
import { useApp } from '../AppContext'
import { api } from '../api'
import { inputClass } from './AuthShell'
import { Card, Modal, Pill } from './ui'

export const fieldClass = `${inputClass} h-11`

// ---------- Money and dates ----------

// Amounts use Indian lakh grouping (₹2,52,200) in both languages; the Kannada
// locale's default grouping would print ₹252,200.
export const money = (paise, lang, decimals = false) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format((paise ?? 0) / 100)

export function Money({ paise, className = '', decimals }) {
  const { lang } = useApp()
  return <span className={`tabular-nums ${className}`}>{money(paise, lang, decimals || (paise ?? 0) % 100 !== 0)}</span>
}

// Rupees typed by a person → integer paise ("1,250.50" → 125050).
export function toPaise(v) {
  const s = String(v ?? '').replace(/[,\s₹]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN
  const [r, p = ''] = s.split('.')
  return Number(r) * 100 + Number(p.padEnd(2, '0'))
}

export function useDate() {
  const { lang } = useApp()
  return (s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
    if (!s) return '—'
    // "2026-10" (a month), "2026-10-31" (a day) or a timestamp.
    const d = s.length === 7 ? new Date(`${s}-01T00:00:00`) : s.length <= 10 ? new Date(`${s}T00:00:00`) : new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`)
    return new Intl.DateTimeFormat(lang === 'kn' ? 'kn-IN' : 'en-IN', opts).format(d)
  }
}

// ---------- Tabs (kept in ?tab= so links can open one) ----------

export function useTab(first) {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || first
  return [tab, (v) => setParams(v === first ? {} : { tab: v }, { replace: true })]
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <div className="flex w-max gap-1 rounded-2xl bg-white p-1 shadow-card">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => onChange(tb.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
              value === tb.key ? 'bg-brand-600 text-white' : 'text-ink hover:bg-slate-50'
            }`}
          >
            {tb.label}
            {tb.count > 0 && (
              <span className={`rounded-full px-1.5 text-[11px] font-semibold ${value === tb.key ? 'bg-white/25 text-white' : 'bg-rose-500 text-white'}`}>{tb.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Tables ----------

// columns: [{ key, label, render(row), align: 'right', className, hideOnPhone }]
export function DataTable({ columns, rows, empty, rowKey = 'id', onRowClick }) {
  const { t } = useApp()
  if (!rows?.length) return <p className="px-5 py-8 text-center text-sm text-muted">{empty ?? t('nothingYet')}</p>
  const cell = (c, r) => (c.render ? c.render(r) : r[c.key])
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <tr key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'cursor-pointer hover:bg-slate-50/70' : ''}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-top text-ink ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}>
                    {cell(c, r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`space-y-1 px-4 py-3 ${onRowClick ? 'active:bg-slate-50' : ''}`}>
            {columns
              .filter((c) => !c.hideOnPhone)
              .map((c, i) => (
                <div key={c.key} className={i === 0 ? 'font-medium text-ink' : 'flex items-start justify-between gap-3 text-sm'}>
                  {i > 0 && c.label && <span className="shrink-0 text-xs text-muted">{c.label}</span>}
                  <span className={i > 0 ? 'min-w-0 text-right text-ink' : ''}>{cell(c, r)}</span>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </>
  )
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="font-semibold text-ink">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </Card>
  )
}

// ---------- Status ----------

const TONE = {
  green: ['paid', 'captured', 'approved', 'enrolled', 'accepted', 'sent', 'released', 'matched', 'received', 'closed_ok', 'available', 'ok', 'resolved', 'active', 'in_use', 'settled', 'verified', 'documents_verified'],
  orange: ['pending', 'part_paid', 'requested', 'submitted', 'draft', 'pending_approval', 'waiting', 'offered', 'partially_received', 'in_progress', 'investigating', 'expiring', 'due', 'under_repair', 'waitlisted', 'mismatch', 'issued', 'on_loan', 'started', 'medium', 'high', 'normal'],
  rose: ['rejected', 'failed', 'bounced', 'cancelled', 'refused', 'overdue', 'expired', 'urgent', 'withdrawn', 'missing', 'disposed', 'lost'],
  blue: ['enquiry', 'applied', 'open', 'ordered', 'in_store', 'low', 'closed', 'waived', 'ended'],
}
const toneOf = (s) => Object.keys(TONE).find((k) => TONE[k].includes(s)) ?? 'slate'

export function StatusPill({ status, label }) {
  const { t } = useApp()
  return <Pill tone={toneOf(status)}>{label ?? t(`st_${status}`)}</Pill>
}

export function Stat({ label, value, tone = 'text-ink', hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold md:text-2xl ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  )
}

// ---------- Buttons and actions ----------

const BTN = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  ghost: 'bg-white text-ink ring-1 ring-slate-200 hover:bg-slate-50',
  danger: 'bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
}
export function Button({ tone = 'primary', small, className = '', busy, children, ...props }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:opacity-50 ${small ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'} ${BTN[tone]} ${className}`}
    >
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

// Runs an API call, shows a toast on success or the translated error, then reloads.
export function useAction(reload) {
  const { errorText, showToast, t } = useApp()
  const [busy, setBusy] = useState(false)
  const run = async (fn, okKey = 'saved') => {
    setBusy(true)
    try {
      const out = await fn()
      if (okKey) showToast(t(okKey))
      await reload?.()
      return out ?? true
    } catch (err) {
      showToast(errorText(err))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return [run, busy]
}

export function ActButton({ path, method = 'POST', body, reload, confirm, okKey, tone = 'ghost', children, onDone }) {
  const { t } = useApp()
  const [run, busy] = useAction(reload)
  return (
    <Button
      small
      tone={tone}
      busy={busy}
      onClick={async (e) => {
        e.stopPropagation()
        if (confirm && !window.confirm(t(confirm))) return
        const out = await run(() => api(path, { method, body }), okKey)
        if (out && onDone) onDone(out)
      }}
    >
      {children}
    </Button>
  )
}

// ---------- Forms ----------

export function StudentPicker({ value, onChange, autoFocus }) {
  const { t, tr } = useApp()
  const [q, setQ] = useState(value?.name ?? '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      api(`/lookup/students?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.students))
        .catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(timer.current)
  }, [q, open])
  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
      <input
        autoFocus={autoFocus}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          onChange(null)
        }}
        placeholder={t('searchStudent')}
        className={`${fieldClass} pl-9`}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-100 bg-white p-1 shadow-xl">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(s)
                  setQ(s.name)
                  setOpen(false)
                }}
                className="flex w-full justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-ink">{s.name}</span>
                <span className="text-xs text-muted">
                  {s.admissionNo} · {tr(s.section)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Field({ f, form, set }) {
  const { t } = useApp()
  const label = (
    <span className="mb-1 block text-sm font-medium text-ink">
      {f.label}
      {f.required && <span className="text-rose-500"> *</span>}
    </span>
  )
  const v = form[f.key] ?? ''
  const on = (e) => set(f.key, e.target.value)
  let input
  switch (f.type) {
    case 'textarea':
      input = <textarea value={v} onChange={on} rows={f.rows ?? 3} required={f.required} placeholder={f.placeholder} className={`${inputClass} py-2.5`} />
      break
    case 'select':
      input = (
        <select value={v} onChange={on} required={f.required} className={fieldClass}>
          {!f.required && <option value="">{f.emptyLabel ?? '—'}</option>}
          {f.required && v === '' && <option value="">{t('choose')}</option>}
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
      break
    case 'checkbox':
      return (
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => set(f.key, e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
          <span>
            {f.label}
            {f.hint && <span className="block text-xs text-muted">{f.hint}</span>}
          </span>
        </label>
      )
    case 'student':
      input = <StudentPicker value={form[f.key]} onChange={(s) => set(f.key, s)} />
      break
    case 'money':
      input = (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">₹</span>
          <input inputMode="decimal" value={v} onChange={on} required={f.required} placeholder="0" className={`${fieldClass} pl-7 tabular-nums`} />
        </div>
      )
      break
    case 'custom':
      input = f.render(form, set)
      break
    default:
      input = <input type={f.type ?? 'text'} value={v} onChange={on} required={f.required} placeholder={f.placeholder} min={f.min} max={f.max} step={f.step} className={fieldClass} />
  }
  return (
    <label className={`block ${f.wide ? 'sm:col-span-2' : ''}`}>
      {label}
      {input}
      {f.hint && <span className="mt-1 block text-xs text-muted">{f.hint}</span>}
    </label>
  )
}

// A dialog with a form. Money fields are typed in rupees and sent as paise;
// student fields send the chosen student's id.
export function FormModal({ open, onClose, title, fields, initial, submitLabel, onSubmit, intro, wide }) {
  const { t, errorText } = useApp()
  const [form, setForm] = useState(initial ?? {})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setForm(initial ?? {})
      setError(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const visible = fields.filter((f) => !f.show || f.show(form))
  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    const out = {}
    for (const f of visible) {
      const v = form[f.key]
      if (f.type === 'money') {
        if (v === '' || v === undefined) {
          if (f.required) return setError(t('err.missing.field'))
          continue
        }
        const p = toPaise(v)
        if (Number.isNaN(p)) return setError(t('err.invalid.amount'))
        out[f.send ?? f.key] = p
      } else if (f.type === 'student') {
        if (!v) {
          if (f.required) return setError(t('pickStudent'))
          continue
        }
        out[f.send ?? f.key] = v.id
      } else if (f.type === 'number') out[f.send ?? f.key] = v === '' || v === undefined ? undefined : Number(v)
      else if (f.type === 'checkbox') out[f.send ?? f.key] = Boolean(v)
      else if (f.type !== 'custom' || f.send !== false) out[f.send ?? f.key] = v
    }
    setBusy(true)
    try {
      await onSubmit(out, form)
      onClose()
    } catch (err) {
      setError(err.message?.startsWith?.('local:') ? t(err.message.slice(6)) : errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={title} wide={wide}>
      <form onSubmit={submit} className="space-y-4">
        {intro && <div className="rounded-xl bg-slate-50 p-3 text-sm text-muted">{intro}</div>}
        <div className={`grid gap-4 ${wide ? 'sm:grid-cols-2' : ''}`}>
          {visible.map((f) => (
            <Field key={f.key} f={f} form={form} set={set} />
          ))}
        </div>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" tone="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" busy={busy}>
            {submitLabel ?? t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// Opens one FormModal at a time: const [dialog, open] = useDialog(); open({...}).
export function useDialog() {
  const [spec, setSpec] = useState(null)
  const el = spec ? <FormModal open onClose={() => setSpec(null)} {...spec} /> : null
  return [el, setSpec]
}

export const opts = (values, t, prefix) => values.map((v) => ({ value: v, label: t(`${prefix}${v}`) }))

export function Spinner() {
  return (
    <div className="flex justify-center py-16 text-muted">
      <Loader2 className="animate-spin" />
    </div>
  )
}

export function Note({ children, tone = 'amber' }) {
  const tones = { amber: 'bg-amber-50 text-amber-800', blue: 'bg-blue-50 text-blue-800', rose: 'bg-rose-50 text-rose-700', green: 'bg-emerald-50 text-emerald-800' }
  return <div className={`rounded-2xl px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>
}
