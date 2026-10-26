import Anthropic from '@anthropic-ai/sdk'

// All AI calls go through this file. Two providers are supported:
//   - Claude (Anthropic API): set ANTHROPIC_API_KEY.
//   - Azure OpenAI (e.g. a KodeKloud Azure playground): set AZURE_OPENAI_ENDPOINT,
//     AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT.
// AI_PROVIDER (anthropic | azure) picks one when both are set. With neither, the app
// still runs and the AI features fall back to offline replies.
const azure = parseAzureEndpoint(process.env.AZURE_OPENAI_ENDPOINT || '')
azure.key = process.env.AZURE_OPENAI_API_KEY || ''
// Values written into a pasted Target URI win, since they match that deployment.
azure.deployment = azure.deployment || process.env.AZURE_OPENAI_DEPLOYMENT
azure.apiVersion = azure.apiVersion || process.env.AZURE_OPENAI_API_VERSION || '2024-10-21'
// Playground deployments have tiny quotas (e.g. 2,000 tokens a minute), and Azure counts
// the reply limit against them, so keep replies and history short.
azure.maxTokens = Number(process.env.AZURE_OPENAI_MAX_TOKENS) || 1000
azure.historyLimit = Number(process.env.AZURE_OPENAI_HISTORY) || 6

export const PROVIDER =
  process.env.AI_PROVIDER?.toLowerCase() === 'azure' || (!process.env.AI_PROVIDER && !process.env.ANTHROPIC_API_KEY && azure.key)
    ? 'azure'
    : 'anthropic'
export const MODEL = PROVIDER === 'azure' ? azure.deployment : process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'
export const aiEnabled = () =>
  PROVIDER === 'azure' ? Boolean(azure.key && azure.endpoint && azure.deployment) : Boolean(process.env.ANTHROPIC_API_KEY)
export const providerLabel = () => (PROVIDER === 'azure' ? `Azure OpenAI, deployment ${MODEL}` : `Claude, ${MODEL}`)

// An error from either provider, with the HTTP status the provider returned.
export class AIError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
export const isAIError = (err) => err instanceof AIError || err instanceof Anthropic.APIError
export const aiErrorCode = (err) => (err.status === 401 || err.status === 403 ? 'ai.badKey' : err.status === 429 ? 'ai.busy' : 'ai.failed')

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
  if (PROVIDER === 'azure') return azureStreamChat({ system, messages, onText, signal })
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
  if (PROVIDER === 'azure') return azureJSON({ system, prompt, schema })
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

// ---------- Azure OpenAI ----------

// Accepts either the resource endpoint (https://NAME.openai.azure.com/) or the full
// "Target URI" Azure shows for a deployment, which also carries the deployment name
// and api-version.
function parseAzureEndpoint(value) {
  if (!value) return { endpoint: '' }
  try {
    const url = new URL(value.trim())
    const deployment = url.pathname.match(/\/openai\/deployments\/([^/]+)/)?.[1]
    return { endpoint: url.origin, deployment: deployment && decodeURIComponent(deployment), apiVersion: url.searchParams.get('api-version') }
  } catch {
    return { endpoint: '' }
  }
}

// System prompts arrive as Claude text blocks; Azure takes one plain string.
const systemText = (system) => (Array.isArray(system) ? system.map((b) => b.text).join('\n\n') : system)

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), { once: true })
  })

// How long Azure asks us to wait after a 429, in ms (null if it doesn't say).
function retryDelay(res) {
  const ms = Number(res.headers.get('retry-after-ms'))
  if (ms > 0) return ms
  const seconds = Number(res.headers.get('retry-after'))
  return seconds > 0 ? seconds * 1000 : null
}

async function azureRequest(body, signal) {
  const url = `${azure.endpoint}/openai/deployments/${encodeURIComponent(azure.deployment)}/chat/completions?api-version=${encodeURIComponent(azure.apiVersion)}`
  let res
  // With a per-minute quota, waiting out a short 429 beats failing the student's request.
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': azure.key },
        body: JSON.stringify({ max_completion_tokens: azure.maxTokens, ...body }),
        signal: signal ?? AbortSignal.timeout(120_000),
      })
    } catch (err) {
      if (signal?.aborted) throw err
      throw new AIError(502, `Could not reach Azure OpenAI: ${err.message}`)
    }
    const wait = res.status === 429 && attempt < 2 ? retryDelay(res) ?? 10_000 : null
    if (wait === null || wait > 35_000) break
    await res.body?.cancel()
    await sleep(wait + 250, signal)
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new AIError(res.status, `Azure OpenAI ${res.status}: ${detail?.error?.message ?? res.statusText}`)
  }
  return res
}

async function azureStreamChat({ system, messages, onText, signal }) {
  const recent = messages.slice(-azure.historyLimit)
  while (recent.length > 1 && recent[0].role !== 'user') recent.shift()
  const res = await azureRequest({ messages: [{ role: 'system', content: systemText(system) }, ...recent], stream: true, max_completion_tokens: Math.min(azure.maxTokens, 700) }, signal)
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let finish = null
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      // The first chunk only carries content-filter results and has no choices.
      const choice = JSON.parse(data).choices?.[0]
      if (!choice) continue
      const delta = choice.delta?.content
      if (delta) {
        text += delta
        onText(delta)
      }
      if (choice.finish_reason) finish = choice.finish_reason
    }
  }
  return { text, stopReason: finish === 'content_filter' ? 'refusal' : finish }
}

async function azureJSON({ system, prompt, schema }) {
  const res = await azureRequest({
    messages: [
      { role: 'system', content: systemText(system) },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'result', strict: true, schema } },
  })
  const choice = (await res.json()).choices?.[0]
  if (!choice || choice.finish_reason === 'content_filter' || choice.message?.refusal) throw new Error('ai.refused')
  if (choice.finish_reason === 'length') throw new AIError(502, 'Azure OpenAI reply was cut off; raise AZURE_OPENAI_MAX_TOKENS')
  return JSON.parse(choice.message.content)
}
