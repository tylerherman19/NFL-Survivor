// Full "vintage badge" logo (design 1a): dark ring, stacked wordmark, football
// glyph. Self-contained — includes the "PICK AND PRAY" text, so it replaces
// (not sits beside) a separate site-name text label wherever it's used.
export default function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Pick and Pray"
      className="shrink-0"
    >
      <circle cx="32" cy="32" r="27" fill="var(--cream)" stroke="var(--dark)" strokeWidth="6" />
      <text
        x="32"
        y="24.5"
        textAnchor="middle"
        className="font-display"
        fontSize="9.5"
        letterSpacing="0.3"
        fill="var(--dark)"
      >
        PICK
      </text>
      <text
        x="32"
        y="33.5"
        textAnchor="middle"
        className="font-display"
        fontSize="9.5"
        letterSpacing="0.3"
        fill="var(--dark)"
      >
        AND
      </text>
      <text
        x="32"
        y="42.5"
        textAnchor="middle"
        className="font-display"
        fontSize="9.5"
        letterSpacing="0.3"
        fill="var(--dark)"
      >
        PRAY
      </text>
      <g transform="translate(32 49.5) rotate(45)">
        <ellipse cx="0" cy="0" rx="6.5" ry="4" fill="var(--dark)" />
      </g>
    </svg>
  )
}
