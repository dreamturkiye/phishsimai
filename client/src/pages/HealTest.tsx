import { useEffect } from 'react'
import { reportBug } from '@/lib/errorTelemetry'

function SelfHealTestProbe({ armed }: { armed: boolean }) {
  useEffect(() => {
    if (!armed) return
    const err = new Error('SELF_HEAL_TEST v4.5.1: intentional probe')
    reportBug(err, 'SelfHealTestProbe', 'heal_test_armed')
    // ARCH-FIX: report bug to Janet without throwing — keeps page alive after self-heal
  }, [armed])

  if (!armed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-10 text-muted-foreground">
        <p>
          Self-heal test probe disarmed. Add <code className="rounded bg-muted px-1">?arm=ps-hq-2026</code> to trigger.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-10 text-muted-foreground">
      <p>Self-heal probe armed — bug reported to Janet. Page stays up for E2E verification.</p>
    </div>
  )
}

export default function HealTest() {
  const armed = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('arm') === 'ps-hq-2026'
  return <SelfHealTestProbe armed={armed} />
}
