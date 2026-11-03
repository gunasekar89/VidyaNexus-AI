import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Bell, CheckCheck, HeartPulse, Info, Lock, MessageSquare, Plus, Send, ShieldAlert } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Card, Modal, PageHeader } from '../../components/ui'
import { ActButton, Button, DataTable, Note, Panel, StatusPill, Tabs, fieldClass, opts, useAction, useDate, useDialog, useTab } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

// ---------- Messages ----------

const AUDIENCES = ['section_guardians', 'all_guardians', 'all_staff', 'everyone']

function RecipientPreview({ form }) {
  const { t } = useApp()
  const [out, setOut] = useState(null)
  const { audience, sectionId, sensitive } = form
  useEffect(() => {
    if (!audience || (audience === 'section_guardians' && !sectionId)) {
      setOut(null)
      return undefined
    }
    let live = true
    api('/messages/preview', { method: 'POST', body: { audience, sectionId: sectionId ? Number(sectionId) : undefined, sensitive: Boolean(sensitive) } })
      .then((r) => live && setOut(r))
      .catch(() => live && setOut(null))
    return () => {
      live = false
    }
  }, [audience, sectionId, sensitive])
  if (!out) return <p className="text-sm text-muted">{t('chooseAudience')}</p>
  return (
    <p className={`rounded-xl px-3 py-2 text-sm ${out.needsApproval ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
      {t('willReach').replace('{n}', out.count)} {out.needsApproval ? t('needsSecondPerson') : t('sendsNow')}
    </p>
  )
}

export function Messages() {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi('/messages')
  const [dialog, open] = useDialog()
  const [view, setView] = useState(null)
  const d = state.data
  if (!d) return <Loading state={state} />
  const compose = () =>
    open({
      title: t('newMessage'),
      wide: true,
      initial: { audience: 'section_guardians' },
      fields: [
        { key: 'audience', label: t('sendTo'), type: 'select', required: true, options: opts(AUDIENCES, t, 'aud_') },
        { key: 'sectionId', label: t('class'), type: 'select', required: true, options: d.sections.map((s) => ({ value: String(s.id), label: tr(s.label) })), show: (f) => f.audience === 'section_guardians' },
        { key: 'titleEn', label: t('titleEnglish'), required: true },
        { key: 'titleKn', label: t('titleKannada'), required: true },
        { key: 'bodyEn', label: t('messageEnglish'), type: 'textarea', rows: 4, required: true },
        { key: 'bodyKn', label: t('messageKannada'), type: 'textarea', rows: 4, required: true },
        { key: 'sensitive', label: t('sensitiveMessage'), type: 'checkbox', hint: t('sensitiveHint'), wide: true },
        { key: 'preview', label: '', type: 'custom', send: false, wide: true, render: (form) => <RecipientPreview form={form} /> },
      ],
      submitLabel: t('send'),
      onSubmit: (b) => api('/messages', { method: 'POST', body: { ...b, sectionId: b.sectionId ? Number(b.sectionId) : undefined } }).then(state.reload),
    })
  const pending = d.messages.filter((m) => m.status === 'pending_approval' && !m.mine).length
  return (
    <div>
      {dialog}
      <PageHeader
        title={t('messagesTitle')}
        subtitle={t('messagesSub')}
        action={
          d.canSend && (
            <Button onClick={compose}>
              <Send size={16} /> {t('newMessage')}
            </Button>
          )
        }
      />
      {d.canApprove && pending > 0 && <Note tone="amber">{t('messagesWaiting').replace('{n}', pending)}</Note>}
      <Panel title={t('sentAndPending')} className="mt-4">
        <DataTable
          rows={d.messages}
          onRowClick={setView}
          columns={[
            { key: 'title', label: t('title'), render: (m) => <span className="font-medium">{tr(m.title)}</span> },
            { key: 'aud', label: t('sendTo'), render: (m) => (m.section ? tr(m.section) : t(`aud_${m.audience}`)) },
            { key: 'by', label: t('createdBy'), hideOnPhone: true, render: (m) => `${m.createdBy} · ${fmt(m.createdAt)}` },
            { key: 'n', label: t('recipients'), align: 'right', render: (m) => (m.status === 'sent' ? m.recipients : '—') },
            { key: 'status', label: t('status'), render: (m) => <StatusPill status={m.status} /> },
            {
              key: 'act',
              label: '',
              render: (m) =>
                m.status === 'pending_approval' &&
                (d.canApprove && !m.mine ? (
                  <span className="flex justify-end gap-1">
                    <ActButton path={`/messages/${m.id}/decide`} body={{ approve: true }} reload={state.reload} tone="success" okKey="messageSent">
                      {t('approveSend')}
                    </ActButton>
                    <ActButton path={`/messages/${m.id}/decide`} body={{ approve: false }} reload={state.reload} tone="danger" confirm="confirmReject" okKey="rejected">
                      {t('reject')}
                    </ActButton>
                  </span>
                ) : (
                  <span className="text-xs text-muted">{t('waitingForOther')}</span>
                )),
            },
          ]}
        />
      </Panel>
      {view && (
        <Modal open onClose={() => setView(null)} title={tr(view.title)} wide>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-400">English</p>
              <p className="font-medium">{view.title.en}</p>
              <p className="whitespace-pre-wrap text-muted">{view.body.en}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-400">ಕನ್ನಡ</p>
              <p className="font-medium">{view.title.kn}</p>
              <p className="whitespace-pre-wrap text-muted">{view.body.kn}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted">
            {view.createdBy}
            {view.approvedBy ? ` · ${t('approvedBy')} ${view.approvedBy}` : ''}
            {view.sensitive ? ` · ${t('sensitiveMessage')}` : ''}
          </p>
        </Modal>
      )}
    </div>
  )
}

// ---------- Helpdesk ----------

const CATEGORIES = ['fees', 'academic', 'transport', 'it', 'facility', 'other', 'grievance']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

function Ticket({ id, handlers, onClose, reload }) {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi(`/helpdesk/tickets/${id}`)
  const [reply, setReply] = useState('')
  const [resolution, setResolution] = useState(null)
  const [run, busy] = useAction(() => state.reload().then(reload))
  const d = state.data
  const tk = d?.ticket
  const patch = (body) => run(() => api(`/helpdesk/tickets/${id}`, { method: 'PATCH', body }))
  return (
    <Modal open onClose={onClose} title={tk ? `${tk.number} · ${tk.subject}` : t('loading')} wide>
      {!d ? (
        <Loading state={state} />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={tk.status} />
            <StatusPill status={tk.priority} label={t(`pr_${tk.priority}`)} />
            <span className="text-xs text-muted">
              {t(`hc_${tk.category}`)} · {tk.raisedBy} · {fmt(tk.createdAt)} · {t('dueBy')} {fmt(tk.dueAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            {tk.overdue && <StatusPill status="overdue" />}
          </div>
          {tk.category === 'grievance' && (
            <Note tone="rose">
              <Lock size={14} className="mr-1 inline" /> {t('grievancePrivacy')}
            </Note>
          )}
          <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3">{tk.body}</p>
          {tk.resolution && (
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
              <p className="text-xs font-semibold">{t('resolution')}</p>
              <p className="whitespace-pre-wrap">{tk.resolution}</p>
            </div>
          )}
          {d.canHandle && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                <span className="mb-1 block text-xs font-medium text-muted">{t('status')}</span>
                <select
                  value={tk.status}
                  onChange={(e) => (['resolved', 'closed'].includes(e.target.value) && !tk.resolution ? setResolution(e.target.value) : patch({ status: e.target.value }))}
                  className={fieldClass}
                >
                  {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
                    <option key={s} value={s}>
                      {t(`st_${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-muted">{t('priority')}</span>
                <select value={tk.priority} onChange={(e) => patch({ priority: e.target.value })} className={fieldClass}>
                  {PRIORITIES.map((s) => (
                    <option key={s} value={s}>
                      {t(`pr_${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-muted">{t('assignedTo')}</span>
                <select value={tk.assignedTo ?? ''} onChange={(e) => patch({ assignedTo: e.target.value ? Number(e.target.value) : null })} className={fieldClass}>
                  <option value="">—</option>
                  {(handlers ?? []).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {resolution && (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (await patch({ status: resolution, resolution: e.target.elements.res.value })) setResolution(null)
              }}
              className="space-y-2 rounded-xl border border-emerald-200 p-3"
            >
              <p className="text-xs font-medium">{t('resolutionNeeded')}</p>
              <textarea name="res" required rows={3} className={`${fieldClass} h-auto py-2`} />
              <div className="flex justify-end gap-2">
                <Button type="button" small tone="ghost" onClick={() => setResolution(null)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" small tone="success" busy={busy}>
                  {t(`st_${resolution}`)}
                </Button>
              </div>
            </form>
          )}
          <div>
            <p className="mb-2 font-semibold">{t('conversation')}</p>
            {!d.comments.length && <p className="text-xs text-muted">{t('noRepliesYet')}</p>}
            <ol className="space-y-2">
              {d.comments.map((c, i) => (
                <li key={i} className={`max-w-[85%] rounded-2xl p-3 ${c.mine ? 'ml-auto bg-brand-50' : 'bg-slate-50'}`}>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {c.by} · {fmt(c.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </li>
              ))}
            </ol>
            {tk.status !== 'closed' && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (await run(() => api(`/helpdesk/tickets/${id}/comments`, { method: 'POST', body: { body: reply } }), 'replySent')) setReply('')
                }}
                className="mt-3 flex gap-2"
              >
                <input value={reply} onChange={(e) => setReply(e.target.value)} required placeholder={t('writeReply')} className={`${fieldClass} flex-1`} />
                <Button type="submit" busy={busy}>
                  <Send size={16} />
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function TicketList({ rows, onOpen, showRaiser }) {
  const { t } = useApp()
  const fmt = useDate()
  return (
    <DataTable
      rows={rows}
      onRowClick={(r) => onOpen(r.id)}
      empty={t('noTickets')}
      columns={[
        {
          key: 'subj',
          label: t('subject'),
          render: (r) => (
            <span className="font-medium">
              {r.category === 'grievance' && <Lock size={13} className="mr-1 inline text-rose-500" />}
              {r.number} · {r.subject}
            </span>
          ),
        },
        { key: 'cat', label: t('category'), render: (r) => t(`hc_${r.category}`) },
        ...(showRaiser ? [{ key: 'by', label: t('raisedBy'), render: (r) => r.raisedBy }, { key: 'who', label: t('assignedTo'), hideOnPhone: true, render: (r) => r.assignee || '—' }] : []),
        { key: 'due', label: t('dueBy'), render: (r) => <span className={r.overdue ? 'font-semibold text-rose-600' : ''}>{fmt(r.dueAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> },
        { key: 'pr', label: t('priority'), hideOnPhone: true, render: (r) => <StatusPill status={r.priority} label={t(`pr_${r.priority}`)} /> },
        { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.status} /> },
      ]}
    />
  )
}

export function Helpdesk() {
  const { t, workspace } = useApp()
  const perms = new Set(workspace?.permissions ?? [])
  const canRaise = perms.has('helpdesk.raise')
  const canManage = perms.has('helpdesk.manage')
  const mine = useApi(canRaise ? '/helpdesk/mine' : null)
  const queue = useApi(canManage ? '/helpdesk/tickets' : null)
  const [tab, setTab] = useTab(canManage ? 'queue' : 'mine')
  const [dialog, open] = useDialog()
  const [ticket, setTicket] = useState(null)
  const reload = () => Promise.all([canRaise && mine.reload(), canManage && queue.reload()])
  const guardian = workspace?.kind === 'guardian'
  const raise = () =>
    open({
      title: t('newRequest'),
      wide: true,
      initial: { category: guardian ? 'fees' : 'it', priority: 'normal' },
      fields: [
        { key: 'category', label: t('category'), type: 'select', required: true, options: opts(guardian ? CATEGORIES.filter((c) => c !== 'grievance') : CATEGORIES, t, 'hc_') },
        { key: 'priority', label: t('priority'), type: 'select', required: true, options: opts(PRIORITIES, t, 'pr_') },
        { key: 'subject', label: t('subject'), required: true, wide: true },
        { key: 'body', label: t('details'), type: 'textarea', rows: 5, required: true, wide: true },
      ],
      intro: guardian ? t('helpdeskFamilyIntro') : t('helpdeskStaffIntro'),
      submitLabel: t('submit'),
      onSubmit: (b) => api('/helpdesk/tickets', { method: 'POST', body: b }).then(reload),
    })
  const waiting = (canManage && !queue.data) || (canRaise && !mine.data)
  if (waiting) return <Loading state={canManage && !queue.data ? queue : mine} />
  const q = queue.data?.tickets ?? []
  const open_ = q.filter((x) => !['resolved', 'closed'].includes(x.status))
  return (
    <div>
      {dialog}
      <PageHeader
        title={t('helpdeskTitle')}
        subtitle={canManage ? t('helpdeskSubManage') : t('helpdeskSub')}
        action={
          canRaise && (
            <Button onClick={raise}>
              <Plus size={16} /> {t('newRequest')}
            </Button>
          )
        }
      />
      {canManage && canRaise && (
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'queue', label: t('helpdeskQueue'), count: open_.filter((x) => x.overdue).length },
            { key: 'mine', label: t('myRequests') },
          ]}
        />
      )}
      {canManage && tab === 'queue' && (
        <>
          {!queue.data.canGrievance && <p className="mb-3 text-xs text-muted">{t('grievanceHidden')}</p>}
          <Panel title={`${t('helpdeskQueue')} · ${open_.length} ${t('openLower')}`}>
            <TicketList rows={q} onOpen={setTicket} showRaiser />
          </Panel>
        </>
      )}
      {canRaise && (tab === 'mine' || !canManage) && (
        <Panel title={t('myRequests')}>
          <TicketList rows={mine.data.tickets} onOpen={setTicket} />
        </Panel>
      )}
      {ticket && <Ticket id={ticket} handlers={queue.data?.handlers} onClose={() => setTicket(null)} reload={reload} />}
    </div>
  )
}

// ---------- Inbox ----------

const KIND_ICON = { approval: CheckCheck, alert: AlertTriangle, urgent: ShieldAlert, health: HeartPulse, message: MessageSquare, info: Info }

export function Inbox() {
  const { t, tr } = useApp()
  const fmt = useDate()
  const navigate = useNavigate()
  const state = useApi('/inbox')
  const [run] = useAction(state.reload)
  const d = state.data
  if (!d) return <Loading state={state} />
  const openItem = async (n) => {
    if (!n.read) await api('/inbox/read', { method: 'POST', body: { id: n.id } }).catch(() => {})
    window.dispatchEvent(new Event('vn:inbox'))
    if (n.link) navigate(n.link)
    else state.reload()
  }
  return (
    <div>
      <PageHeader
        title={t('inboxTitle')}
        subtitle={d.unread ? t('unreadCount').replace('{n}', d.unread) : t('allCaughtUp')}
        action={
          d.unread > 0 && (
            <Button
              tone="ghost"
              onClick={async () => {
                await run(() => api('/inbox/read', { method: 'POST', body: {} }), null)
                window.dispatchEvent(new Event('vn:inbox'))
              }}
            >
              <CheckCheck size={16} /> {t('markAllRead')}
            </Button>
          )
        }
      />
      {!d.items.length ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-muted">
          <Bell size={18} /> {t('inboxEmpty')}
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {d.items.map((n) => {
            const Icon = KIND_ICON[n.kind] ?? Info
            const tone = n.kind === 'urgent' || n.kind === 'alert' ? 'bg-rose-50 text-rose-600' : n.kind === 'approval' ? 'bg-amber-50 text-amber-600' : 'bg-brand-50 text-brand-600'
            return (
              <button key={n.id} onClick={() => openItem(n)} className={`flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50/30'}`}>
                <span className={`mt-0.5 rounded-xl p-2 ${tone}`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.read ? 'text-ink' : 'font-semibold text-ink'}`}>{tr(n.title)}</span>
                  {tr(n.body) && <span className="block text-sm text-muted">{tr(n.body)}</span>}
                  <span className="mt-0.5 block text-xs text-slate-400">{fmt(n.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </span>
                {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
              </button>
            )
          })}
        </Card>
      )}
    </div>
  )
}
