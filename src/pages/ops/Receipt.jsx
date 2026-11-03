import { Printer } from 'lucide-react'
import { useApp } from '../../AppContext'
import { Modal } from '../../components/ui'
import { Button, Money, StatusPill, useDate } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

// A fee receipt that can be printed (or saved as PDF from the print dialog).
export default function Receipt({ path, onClose }) {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi(path)
  const r = state.data
  return (
    <Modal open onClose={onClose} title={t('receipt')}>
      {!r ? (
        <Loading state={state} />
      ) : (
        <div className="print-area">
          <div className="border-b border-dashed border-slate-200 pb-3 text-center">
            <p className="text-lg font-bold text-ink">{tr(r.school.name)}</p>
            <p className="text-xs text-muted">{t('feeReceipt')}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 py-3 text-sm">
            <span className="text-muted">{t('receiptNo')}</span>
            <span className="text-right font-semibold">{r.receiptNo}</span>
            <span className="text-muted">{t('date')}</span>
            <span className="text-right">{fmt(r.date)}</span>
            <span className="text-muted">{t('student')}</span>
            <span className="text-right">
              {r.student.name}
              <span className="block text-xs text-muted">
                {r.student.admissionNo} {r.student.section ? `· ${tr(r.student.section)}` : ''}
              </span>
            </span>
            <span className="text-muted">{t('method')}</span>
            <span className="text-right">
              {t(`pm_${r.method}`)} {r.reference && <span className="text-xs text-muted">· {r.reference}</span>}
            </span>
          </div>
          <table className="w-full border-y border-slate-100 text-sm">
            <tbody>
              {r.lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="py-2">
                    {tr(l.head)} <span className="text-xs text-muted">· {l.description}</span>
                  </td>
                  <td className="py-2 text-right">
                    <Money paise={l.amountPaise} />
                  </td>
                </tr>
              ))}
              {r.advancePaise > 0 && (
                <tr>
                  <td className="py-2 text-muted">{t('advanceCredit')}</td>
                  <td className="py-2 text-right">
                    <Money paise={r.advancePaise} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between py-3">
            <span className="font-semibold">{t('totalPaid')}</span>
            <Money paise={r.amountPaise} className="text-lg font-bold" />
          </div>
          {r.status !== 'captured' && (
            <p className="mb-2">
              <StatusPill status={r.status} />
            </p>
          )}
          {r.refundedPaise > 0 && (
            <p className="text-xs text-muted">
              {t('refunded')}: <Money paise={r.refundedPaise} />
            </p>
          )}
          <p className="text-xs text-muted">
            {r.receivedBy ? `${t('receivedBy')}: ${r.receivedBy}. ` : ''}
            {t('receiptFooter')}
          </p>
          <div className="mt-4 flex justify-end print:hidden">
            <Button tone="ghost" onClick={() => window.print()}>
              <Printer size={16} /> {t('print')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
