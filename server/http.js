// Small request helpers shared by the API routers.

// Express 4 does not catch rejected promises, so wrap async handlers.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export class HttpError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
  }
}
export const bad = (code = 'invalid') => new HttpError(400, code)
export const forbidden = (code = 'auth.forbidden') => new HttpError(403, code)
export const notFound = () => new HttpError(404, 'not.found')

export const text = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
export function required(v, max) {
  const s = text(v, max)
  if (!s) throw bad('missing.field')
  return s
}
export const id = (v) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw bad()
  return n
}
