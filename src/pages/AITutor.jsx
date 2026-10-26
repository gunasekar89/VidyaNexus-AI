import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SendHorizontal, Sparkles, Square, Trash2 } from 'lucide-react'
import { useApp } from '../AppContext'
import { api, streamChat } from '../api'
import { Card, PageHeader } from '../components/ui'
import { RobotIcon } from '../components/Illustrations'

// Light markdown for tutor replies: **bold**, *italic*, bullet and numbered lines.
function RichText({ text }) {
  return text.split('\n').map((raw, i) => {
    let line = raw.replace(/^#{1,6}\s+(.*)$/, '**$1**').replace(/^\s*[-*]\s+/, '• ')
    return (
      <p key={i} className={line.trim() === '' ? 'h-2' : ''}>
        {line.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/).map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
            <em key={j}>{part.slice(1, -1)}</em>
          ) : (
            part
          ),
        )}
      </p>
    )
  })
}

const suggestionList = {
  en: ['Explain algebraic expressions', 'Generate practice questions on algebra', 'Create notes on Force and Motion', 'Make a revision plan for my exam'],
  kn: ['ಬೀಜಗಣಿತೀಯ ಅಭಿವ್ಯಕ್ತಿ ವಿವರಿಸಿ', 'ಬೀಜಗಣಿತ ಪ್ರಶ್ನೆಗಳನ್ನು ರಚಿಸಿ', 'ಬಲ ಮತ್ತು ಚಲನೆ ಟಿಪ್ಪಣಿ ಮಾಡಿ', 'ಪರೀಕ್ಷೆಗೆ ಯೋಜನೆ ಮಾಡಿ'],
}

export default function AITutor() {
  const { t, tr, lang, user, aiEnabled, errorText } = useApp()
  const [params, setParams] = useSearchParams()
  const [messages, setMessages] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const endRef = useRef(null)
  const abortRef = useRef(null)
  const pendingPrompt = useRef(params.get('prompt'))

  const send = async (text) => {
    const q = text.trim()
    if (!q || typing) return
    setMessages((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '' }])
    setInput('')
    setTyping(true)
    const controller = new AbortController()
    abortRef.current = controller
    const update = (fn) =>
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = fn(copy[copy.length - 1])
        return copy
      })
    try {
      await streamChat(
        { message: q, lang },
        (ev) => {
          if (ev.t) update((last) => ({ ...last, content: last.content + ev.t }))
          if (ev.error) update((last) => ({ ...last, error: ev.error }))
        },
        controller.signal,
      )
    } catch (err) {
      if (err.name !== 'AbortError') update((last) => ({ ...last, error: err.code ?? 'server.error' }))
    } finally {
      setTyping(false)
      abortRef.current = null
    }
  }

  // Load saved conversation, then send any prompt passed from the dashboard shortcuts.
  useEffect(() => {
    api('/ai/chat')
      .then((res) => setMessages(res.messages))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (loaded && pendingPrompt.current) {
      const prompt = pendingPrompt.current
      pendingPrompt.current = null
      setParams({}, { replace: true })
      send(prompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, typing])

  useEffect(() => () => abortRef.current?.abort(), [])

  const clear = async () => {
    abortRef.current?.abort()
    await api('/ai/chat', { method: 'DELETE' }).catch(() => {})
    setMessages([])
  }

  const hello = `${t('tutorHelloName').replace('{name}', tr(user.firstName))} ${t('tutorHello')}`

  return (
    <div>
      <PageHeader
        title={t('aiTutor')}
        subtitle={t('aiStudyCoach')}
        action={
          messages.length > 0 && (
            <button onClick={clear} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-muted hover:text-rose-600">
              <Trash2 size={15} /> {t('clearChat')}
            </button>
          )
        }
      />
      <Card className="flex h-[calc(100vh-15rem)] min-h-[420px] flex-col lg:h-[calc(100vh-12rem)]">
        {!aiEnabled && <div className="rounded-t-2xl bg-amber-50 px-4 py-2 text-xs text-amber-700">{t('tutorOffline')}</div>}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          <div className="flex items-start gap-3">
            <RobotIcon className="h-10 w-10 shrink-0" />
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 text-sm text-ink">{hello}</div>
          </div>
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={m.id ?? i} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-3 text-sm text-white">{m.content}</div>
              </div>
            ) : m.content || m.error ? (
              <div key={m.id ?? i} className="flex items-start gap-3">
                <RobotIcon className="h-10 w-10 shrink-0" />
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 text-sm leading-relaxed text-ink">
                  {m.content && <RichText text={m.content} />}
                  {m.error && <p className="text-rose-600">{errorText({ code: m.error })}</p>}
                </div>
              </div>
            ) : null,
          )}
          {typing && !messages.at(-1)?.content && (
            <div className="flex items-center gap-3">
              <RobotIcon className="h-10 w-10 shrink-0" />
              <div className="flex gap-1 rounded-2xl bg-slate-50 px-4 py-3">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 150}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t border-slate-100 p-3 md:p-4">
          <div className="mb-3 flex gap-2 overflow-x-auto">
            <Sparkles size={16} className="mt-1.5 shrink-0 text-violet-500" />
            {suggestionList[lang].map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={typing}
                className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-ink hover:border-brand-200 hover:bg-brand-50 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              placeholder={t('askAnything')}
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-500 focus:bg-white"
            />
            {typing ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-700 text-white hover:bg-slate-800"
                aria-label={t('stop')}
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={!input.trim()}
                aria-label={t('send')}
              >
                <SendHorizontal size={18} />
              </button>
            )}
          </form>
        </div>
      </Card>
    </div>
  )
}
