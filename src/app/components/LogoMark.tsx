// Icon half of the "vintage badge" logo (design 1a) — a dark ring around a
// cream disc with a small football glyph. Used wherever the wordmark text
// ("NFL SURVIVOR POOL") already appears separately, e.g. site headers.
export default function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="32" cy="32" r="28" fill="var(--cream)" stroke="var(--dark)" strokeWidth="6" />
      <g transform="translate(32 34) rotate(45)">
        <ellipse cx="0" cy="0" rx="15" ry="9" fill="var(--dark)" />
        <line x1="-8" y1="0" x2="8" y2="0" stroke="var(--cream)" strokeWidth="1.5" />
        <line x1="-2.5" y1="-2.5" x2="-2.5" y2="2.5" stroke="var(--cream)" strokeWidth="1.5" />
        <line x1="2.5" y1="-2.5" x2="2.5" y2="2.5" stroke="var(--cream)" strokeWidth="1.5" />
      </g>
    </svg>
  )
}
