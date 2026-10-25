import { useId } from 'react'

export function RobotIcon({ className = 'h-14 w-14' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <line x1="32" y1="6" x2="32" y2="14" stroke="#7c8bb8" strokeWidth="2.5" />
      <circle cx="32" cy="6" r="3.5" fill="#5b8def" />
      <rect x="10" y="26" width="5" height="12" rx="2.5" fill="#5b8def" />
      <rect x="49" y="26" width="5" height="12" rx="2.5" fill="#5b8def" />
      <rect x="13" y="14" width="38" height="32" rx="14" fill="#eef2fb" stroke="#d5dcef" strokeWidth="1.5" />
      <rect x="18" y="20" width="28" height="18" rx="9" fill="#1f2a55" />
      <circle cx="26" cy="29" r="3.2" fill="#5fd3ff" />
      <circle cx="38" cy="29" r="3.2" fill="#5fd3ff" />
      <path d="M22 50h20l-2 8H24z" fill="#dfe5f3" />
      <ellipse cx="32" cy="60" rx="14" ry="2" fill="#e6e9f5" />
    </svg>
  )
}

export function Sparkle({ className = '', style }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path d="M12 0c.7 6.6 5.4 11.3 12 12-6.6.7-11.3 5.4-12 12-.7-6.6-5.4-11.3-12-12C6.6 11.3 11.3 6.6 12 0z" fill="currentColor" />
    </svg>
  )
}

export function SunIcon({ className = 'h-14 w-14' }) {
  const id = useId().replace(/:/g, '')
  const rays = Array.from({ length: 12 }, (_, i) => i * 30)
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {rays.map((deg) => (
        <line
          key={deg}
          x1="32"
          y1="5"
          x2="32"
          y2="13"
          stroke="#ffc83d"
          strokeWidth="3.2"
          strokeLinecap="round"
          transform={`rotate(${deg} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="14" fill="#ffc83d" />
      <circle cx="32" cy="32" r="14" fill={`url(#${id})`} />
      <defs>
        <radialGradient id={id} cx="0.35" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="1" stopColor="#ffb21e" />
        </radialGradient>
      </defs>
    </svg>
  )
}

export function MoonIcon({ className = 'h-14 w-14' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M40 10a22 22 0 1 0 14 34A18 18 0 0 1 40 10z" fill="#ffd66b" />
    </svg>
  )
}

export function LeafDecoration({ className = '' }) {
  return (
    <svg viewBox="0 0 60 90" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M30 88V20" />
        <path d="M30 50c-14-4-22-16-20-30 12 4 20 14 20 30z" fill="currentColor" fillOpacity="0.25" />
        <path d="M30 40c12-6 18-18 14-32-10 6-16 18-14 32z" fill="currentColor" fillOpacity="0.25" />
        <path d="M30 70c14-2 24-12 24-26-12 2-22 12-24 26z" fill="currentColor" fillOpacity="0.25" />
      </g>
    </svg>
  )
}
