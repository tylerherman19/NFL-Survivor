import { isTestMode } from '@/lib/testMode'

// Sticky strip shown on every page while this browser is in the testing
// sandbox. Renders nothing (and costs nothing — isTestMode is draft-mode
// gated, so static/ISR pages stay static) during normal weeks.
export default async function TestModeBanner() {
  if (!(await isTestMode())) return null

  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-center gap-3 px-4 py-1.5 text-center"
      style={{ background: 'repeating-linear-gradient(135deg, #b45309, #b45309 12px, #92400e 12px, #92400e 24px)' }}
    >
      <span className="text-xs font-bold tracking-widest uppercase text-white">
        🧪 Testing Mode — sandbox data, nothing here touches the real pool
      </span>
      {/* Plain <a>: a prefetched Link would clear the cookies just by hovering */}
      <a
        href="/api/test-mode/leave"
        className="text-xs font-bold uppercase tracking-widest text-amber-200 underline hover:text-white"
      >
        Exit
      </a>
    </div>
  )
}
