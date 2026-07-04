const MIN_TASK_LEN = 12

export function isValidArchitectTask(task: string): boolean {
  const t = task.trim()
  if (t.length < MIN_TASK_LEN) return false
  if (/^\*+$/.test(t)) return false
  if (/^[\W_]+$/.test(t)) return false
  if (/^(n\/a|none|todo|tbd)$/i.test(t)) return false
  return true
}
