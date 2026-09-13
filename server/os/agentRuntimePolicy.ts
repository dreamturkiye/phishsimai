export type AgentWorkingState = {
  currentGoal: string
  nextAction: string
  lastAssessment: string
  updatedAt: string | null
}

export type SelfModifyClass = 'none' | 'continue' | 'marcus' | 'hard_stop'

export function classifySelfModification(action: string): SelfModifyClass {
  const a = (action || '').trim()
  if (!a || /^none$/i.test(a)) return 'none'
  if (/\b(change price|raise price|lower price|new stripe product|sign (a )?contract|legal agreement)\b/i.test(a)) {
    return 'hard_stop'
  }
  if (/\b(architect|marcus|patch|deploy|pr\b|code fix|\.ts\b|\.tsx\b|lib\/|server\/|app\/)\b/i.test(a)) {
    return 'marcus'
  }
  return 'continue'
}

export function formatRuntimeContext(opts: {
  working: AgentWorkingState
  lessons: string
  reflections: string
}): string {
  const parts: string[] = []
  if (opts.working.nextAction && opts.working.nextAction !== 'none') {
    parts.push(
      `OPEN THREAD (resume unless today's measured data invalidates it):\n` +
        `Goal: ${opts.working.currentGoal || 'none'}\n` +
        `Next: ${opts.working.nextAction}\n` +
        `Last: ${opts.working.lastAssessment || 'none'}` +
        (opts.working.updatedAt ? `\nUpdated: ${opts.working.updatedAt}` : ''),
    )
  }
  if (opts.lessons) parts.push(opts.lessons)
  if (opts.reflections) parts.push(opts.reflections)
  parts.push(
    'L5.7 SELF-MODIFICATION: you may change YOUR next action and remember a lesson. ' +
      'You may queue Marcus for a concrete file/route fix. You may NOT change price, billing, ' +
      'legal, or Dex send rails (assertSendable / hasMx / suppression). Working memory survives this process.',
  )
  return parts.filter(Boolean).join('\n\n')
}
