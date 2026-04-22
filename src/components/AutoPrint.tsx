'use client'

import { useEffect } from 'react'

// When the `?autoprint=1` query param is present, trigger the browser print dialog
// shortly after mount. Used on the schedule page so the agent's Print button can
// open the PDF view and raise the print dialog in one click.
export default function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return
    // Wait for the iframe PDF viewer to initialize before calling print.
    const t = setTimeout(() => {
      window.print()
    }, 800)
    return () => clearTimeout(t)
  }, [enabled])
  return null
}
