import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SendHorizontal, Sparkles } from 'lucide-react'
import { useApp } from '../AppContext'
import { Card, PageHeader } from '../components/ui'
import { RobotIcon } from '../components/Illustrations'

// Canned tutor replies for the demo. A real build would call an LLM here.
const replies = [
  {
    match: /algebra|expression|term|variable|ಬೀಜ/i,
    en: `**Algebraic expressions** combine numbers and letters (variables).\n\n• In 4x + 3, **4x** and **3** are *terms*.\n• **4** is the *coefficient* of x.\n• *Like terms* have the same variable: 3x and 5x → 8x.\n\nTry it: simplify 7a + 2b − 3a. (Answer: 4a + 2b)`,
    kn: `**ಬೀಜಗಣಿತೀಯ ಅಭಿವ್ಯಕ್ತಿಗಳು** ಸಂಖ್ಯೆಗಳು ಮತ್ತು ಅಕ್ಷರಗಳನ್ನು (ಚರಾಂಶ) ಸೇರಿಸುತ್ತವೆ.\n\n• 4x + 3 ರಲ್ಲಿ **4x** ಮತ್ತು **3** ಪದಗಳು.\n• **4** ಎಂಬುದು x ನ ಸಹಗುಣಕ.\n• ಸಜಾತೀಯ ಪದಗಳು: 3x ಮತ್ತು 5x → 8x.\n\nಪ್ರಯತ್ನಿಸಿ: 7a + 2b − 3a ಸರಳೀಕರಿಸಿ. (ಉತ್ತರ: 4a + 2b)`,
  },
  {
    match: /question|quiz|practice|test|ಪ್ರಶ್ನೆ/i,
    en: `Here are 5 practice questions on Algebra:\n\n1. Simplify 6m − 2m + 3\n2. Find the value of 3x + 2 when x = 5\n3. How many terms are in 2p² − 4p + 9?\n4. Write the coefficient of y in −8xy\n5. Add 4a + 3 and 2a − 7\n\nReply with your answers and I'll check them! ✅`,
    kn: `ಬೀಜಗಣಿತದ 5 ಅಭ್ಯಾಸ ಪ್ರಶ್ನೆಗಳು:\n\n1. 6m − 2m + 3 ಸರಳೀಕರಿಸಿ\n2. x = 5 ಆದಾಗ 3x + 2 ರ ಬೆಲೆ ಕಂಡುಹಿಡಿಯಿರಿ\n3. 2p² − 4p + 9 ರಲ್ಲಿ ಎಷ್ಟು ಪದಗಳಿವೆ?\n4. −8xy ನಲ್ಲಿ y ಯ ಸಹಗುಣಕ ಬರೆಯಿರಿ\n5. 4a + 3 ಮತ್ತು 2a − 7 ಕೂಡಿಸಿ\n\nನಿಮ್ಮ ಉತ್ತರಗಳನ್ನು ಕಳುಹಿಸಿ, ನಾನು ಪರಿಶೀಲಿಸುತ್ತೇನೆ! ✅`,
  },
  {
    match: /force|motion|newton|ಬಲ|ಚಲನೆ/i,
    en: `📝 **Notes: Force and Motion**\n\n• A **force** is a push or a pull.\n• Force can change an object's speed, direction or shape.\n• **Friction** opposes motion between two surfaces.\n• **Speed** = Distance ÷ Time (unit: m/s).\n• Balanced forces → no change in motion; unbalanced forces → motion changes.\n\nTip: Think of kicking a football — your kick is the force! ⚽`,
    kn: `📝 **ಟಿಪ್ಪಣಿ: ಬಲ ಮತ್ತು ಚಲನೆ**\n\n• **ಬಲ** ಎಂದರೆ ತಳ್ಳುವಿಕೆ ಅಥವಾ ಎಳೆಯುವಿಕೆ.\n• ಬಲವು ವಸ್ತುವಿನ ವೇಗ, ದಿಕ್ಕು ಅಥವಾ ಆಕಾರ ಬದಲಿಸಬಹುದು.\n• **ಘರ್ಷಣೆ** ಚಲನೆಯನ್ನು ವಿರೋಧಿಸುತ್ತದೆ.\n• **ವೇಗ** = ದೂರ ÷ ಸಮಯ (ಮೀ/ಸೆ).\n\nಉದಾಹರಣೆ: ಫುಟ್‌ಬಾಲ್ ಒದೆಯುವುದು — ನಿಮ್ಮ ಒದೆತವೇ ಬಲ! ⚽`,
  },
  {
    match: /constitution|government|ಸಂವಿಧಾನ/i,
    en: `🇮🇳 **Our Constitution** is the rulebook of India. It came into effect on **26 January 1950**.\n\n• Dr. B. R. Ambedkar chaired the Drafting Committee.\n• It gives us **Fundamental Rights** (like equality and freedom of speech).\n• It also lists **Fundamental Duties**, like respecting the national flag.`,
    kn: `🇮🇳 **ನಮ್ಮ ಸಂವಿಧಾನ** ಭಾರತದ ನಿಯಮ ಪುಸ್ತಕ. ಇದು **26 ಜನವರಿ 1950** ರಂದು ಜಾರಿಗೆ ಬಂತು.\n\n• ಡಾ. ಬಿ. ಆರ್. ಅಂಬೇಡ್ಕರ್ ಕರಡು ಸಮಿತಿಯ ಅಧ್ಯಕ್ಷರು.\n• ಇದು **ಮೂಲಭೂತ ಹಕ್ಕುಗಳನ್ನು** ನೀಡುತ್ತದೆ.\n• **ಮೂಲಭೂತ ಕರ್ತವ್ಯಗಳನ್ನೂ** ತಿಳಿಸುತ್ತದೆ.`,
  },
  {
    match: /plan|revise|exam|schedule|ಯೋಜನೆ/i,
    en: `Your Maths Unit Test is in **6 days**. Here's a quick plan:\n\n• Day 1–2: Revise Ch 4 & 5 (20 min/day)\n• Day 3: Lines and Angles basics\n• Day 4: 15 mixed questions\n• Day 5: Mock test\n• Day 6: Review mistakes 💪`,
    kn: `ನಿಮ್ಮ ಗಣಿತ ಘಟಕ ಪರೀಕ್ಷೆ **6 ದಿನಗಳಲ್ಲಿ** ಇದೆ. ಯೋಜನೆ:\n\n• ದಿನ 1–2: ಅಧ್ಯಾಯ 4 ಮತ್ತು 5 ಪುನರಾವರ್ತನೆ\n• ದಿನ 3: ರೇಖೆ ಮತ್ತು ಕೋನಗಳು\n• ದಿನ 4: 15 ಮಿಶ್ರ ಪ್ರಶ್ನೆಗಳು\n• ದಿನ 5: ಅಣಕು ಪರೀಕ್ಷೆ\n• ದಿನ 6: ತಪ್ಪುಗಳ ವಿಮರ್ಶೆ 💪`,
  },
]

const fallback = {
  en: `Great question! 🌟 Let's break it down step by step. Could you tell me which subject and chapter this is from? I can explain it, make notes, or create practice questions for you.`,
  kn: `ಉತ್ತಮ ಪ್ರಶ್ನೆ! 🌟 ಹಂತ ಹಂತವಾಗಿ ನೋಡೋಣ. ಇದು ಯಾವ ವಿಷಯ ಮತ್ತು ಅಧ್ಯಾಯದ್ದು ಎಂದು ತಿಳಿಸಿ. ನಾನು ವಿವರಿಸಬಹುದು, ಟಿಪ್ಪಣಿ ಮಾಡಬಹುದು ಅಥವಾ ಪ್ರಶ್ನೆಗಳನ್ನು ರಚಿಸಬಹುದು.`,
}

function answer(text, lang) {
  const hit = replies.find((r) => r.match.test(text)) ?? fallback
  return hit[lang]
}

// Minimal **bold** and *italic* rendering for tutor replies.
function RichText({ text }) {
  return text.split('\n').map((line, i) => (
    <p key={i} className={line === '' ? 'h-2' : ''}>
      {line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, j) =>
        part.startsWith('**') ? (
          <strong key={j}>{part.slice(2, -2)}</strong>
        ) : part.startsWith('*') ? (
          <em key={j}>{part.slice(1, -1)}</em>
        ) : (
          part
        ),
      )}
    </p>
  ))
}

const suggestionList = {
  en: ['Explain algebraic expressions', 'Generate practice questions on algebra', 'Create notes on Force and Motion', 'Make a revision plan for my exam'],
  kn: ['ಬೀಜಗಣಿತೀಯ ಅಭಿವ್ಯಕ್ತಿ ವಿವರಿಸಿ', 'ಬೀಜಗಣಿತ ಪ್ರಶ್ನೆಗಳನ್ನು ರಚಿಸಿ', 'ಬಲ ಮತ್ತು ಚಲನೆ ಟಿಪ್ಪಣಿ ಮಾಡಿ', 'ಪರೀಕ್ಷೆಗೆ ಯೋಜನೆ ಮಾಡಿ'],
}

export default function AITutor() {
  const { t, lang } = useApp()
  const [params, setParams] = useSearchParams()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const endRef = useRef(null)
  const promptHandled = useRef(false)

  const send = (text) => {
    const q = text.trim()
    if (!q || typing) return
    setMessages((m) => [...m, { from: 'me', text: q }])
    setInput('')
    setTyping(true)
    setTimeout(() => {
      setMessages((m) => [...m, { from: 'ai', text: answer(q, lang) }])
      setTyping(false)
    }, 900)
  }

  useEffect(() => {
    const prompt = params.get('prompt')
    if (prompt && !promptHandled.current) {
      promptHandled.current = true
      setParams({}, { replace: true })
      send(prompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, typing])

  return (
    <div>
      <PageHeader title={t('aiTutor')} subtitle={t('aiStudyCoach')} />
      <Card className="flex h-[calc(100vh-15rem)] min-h-[420px] flex-col lg:h-[calc(100vh-12rem)]">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          <div className="flex items-start gap-3">
            <RobotIcon className="h-10 w-10 shrink-0" />
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 text-sm text-ink">{t('tutorHello')}</div>
          </div>
          {messages.map((m, i) =>
            m.from === 'me' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-3 text-sm text-white">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-3">
                <RobotIcon className="h-10 w-10 shrink-0" />
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 text-sm leading-relaxed text-ink">
                  <RichText text={m.text} />
                </div>
              </div>
            ),
          )}
          {typing && (
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
                className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-ink hover:border-brand-200 hover:bg-brand-50"
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
              placeholder={t('askAnything')}
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-500 focus:bg-white"
            />
            <button
              type="submit"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={!input.trim() || typing}
              aria-label={t('send')}
            >
              <SendHorizontal size={18} />
            </button>
          </form>
        </div>
      </Card>
    </div>
  )
}
