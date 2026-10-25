import { useId } from 'react'

export function LogoMark({ className = 'h-9 w-9' }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 40 36" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f7cf7" />
          <stop offset="1" stopColor="#2f3aa3" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9b7bff" />
          <stop offset="1" stopColor="#5b3fd6" />
        </linearGradient>
      </defs>
      <path d="M2 9c6 0 12 3 18 9v16C14 28 8 25 2 25z" fill={`url(#${id}a)`} />
      <path d="M38 9c-6 0-12 3-18 9v16c6-6 12-9 18-9z" fill={`url(#${id}a)`} opacity="0.85" />
      <path d="M20 2c4 4 6 9 6 14l-6 8-6-8c0-5 2-10 6-14z" fill={`url(#${id}b)`} />
    </svg>
  )
}

export function Logo({ tagline, compact }) {
  return (
    <div className="flex items-center gap-2">
      <LogoMark className={compact ? 'h-6 w-6' : 'h-10 w-10'} />
      <div className="leading-none">
        <div className={`${compact ? 'text-[15px]' : 'text-[26px]'} font-bold tracking-tight text-brand-900`}>VidyaNexus</div>
        {tagline && <div className="mt-1 pl-0.5 text-[11.5px] text-muted">{tagline}</div>}
      </div>
    </div>
  )
}
