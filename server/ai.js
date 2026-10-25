import Anthropic from '@anthropic-ai/sdk'

// All Claude calls go through this file. The key comes from ANTHROPIC_API_KEY;
// without it the app still runs and the AI features fall back to offline replies.
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY)

let client
const getClient = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 }))

// On models that support it, a declined request is retried server-side on
// Anthropic's recommended fallback model instead of failing.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'])
const fallbackParams = () => (FALLBACK_MODELS.has(MODEL) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {})

const textOf = (message) =>
  message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')

// Streams a chat reply. Calls onText for every chunk and resolves with the full text.
export async function streamChat({ system, messages, onText, signal }) {
  const stream = getClient().beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low' }, // quick, friendly answers for a chat tutor
      system,
      messages,
      ...fallbackParams(),
    },
    { signal },
  )
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText(event.delta.text)
  }
  const final = await stream.finalMessage()
  return { text: textOf(final), stopReason: final.stop_reason }
}

// One request whose answer must match a JSON schema (structured outputs).
export async function generateJSON({ system, prompt, schema, effort = 'medium', maxTokens = 16000 }) {
  const message = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: prompt }],
    ...fallbackParams(),
  })
  if (message.stop_reason === 'refusal') throw new Error('ai.refused')
  return JSON.parse(textOf(message))
}

const translationSchema = {
  type: 'object',
  properties: { translations: { type: 'array', items: { type: 'string' } } },
  required: ['translations'],
  additionalProperties: false,
}

// Translates short UI texts written by teachers/students. Returns null if AI is off or fails.
export async function translate(texts, target) {
  if (!aiEnabled() || texts.length === 0) return null
  const language = target === 'kn' ? 'Kannada (ಕನ್ನಡ script)' : 'English'
  try {
    const { translations } = await generateJSON({
      effort: 'low',
      maxTokens: 4000,
      system:
        'You translate short school notices, homework titles and goals for a Bengaluru school app. ' +
        'Keep names, numbers, dates and subject terms accurate and natural for a Class 7 student. Return one translation per input, in order.',
      prompt: `Translate each item into ${language}:\n${JSON.stringify(texts)}`,
      schema: translationSchema,
    })
    return translations.length === texts.length ? translations : null
  } catch (err) {
    console.warn('Translation failed:', err.message)
    return null
  }
}
