import { nanoid } from 'nanoid'
import { getSql } from './conn'
import { rememberFact, type MemoryEntry } from './memory'
import { COMPANY_ID } from './version'

export function parseDelimitedText(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (!inQuotes && ch === delimiter) { row.push(cell.trim()); cell = ''; continue }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some(c => c.length)) rows.push(row)
      row = []; cell = ''
      continue
    }
    cell += ch
  }
  if (cell.length || row.length) { row.push(cell.trim()); if (row.some(c => c.length)) rows.push(row) }
  return rows
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const n = headers.map(h => h.toLowerCase().trim())
  for (const a of aliases) {
    const i = n.indexOf(a)
    if (i >= 0) return i
  }
  return -1
}

export function rowsToLeadRecords(rows: string[][]): Array<{ email: string; name: string; company: string }> {
  if (rows.length < 2) return []
  const headers = rows[0]
  const emailIdx = findColumnIndex(headers, ['email', 'e-mail', 'work email'])
  if (emailIdx < 0) return []
  const nameIdx = findColumnIndex(headers, ['name', 'full name', 'contact'])
  const companyIdx = findColumnIndex(headers, ['company', 'organization'])
  const leads: Array<{ email: string; name: string; company: string }> = []
  for (const row of rows.slice(1)) {
    const email = (row[emailIdx] || '').trim().toLowerCase()
    if (!email.includes('@')) continue
    leads.push({
      email,
      name: nameIdx >= 0 ? (row[nameIdx] || '').trim() : email.split('@')[0],
      company: companyIdx >= 0 ? (row[companyIdx] || '').trim() : 'Unknown',
    })
  }
  return leads
}

export async function importLeadsToPipeline(
  leads: Array<{ email: string; name: string; company: string }>,
  source = 'founder_upload'
): Promise<{ imported: number; skipped: number }> {
  const sql = getSql()
  let imported = 0
  let skipped = 0
  for (const lead of leads) {
    const dup = await sql`SELECT id FROM ps_outreach_leads WHERE LOWER(email)=LOWER(${lead.email}) LIMIT 1`
    if ((dup as any[]).length > 0) { skipped++; continue }
    await sql`
      INSERT INTO ps_outreach_leads (email, name, company, source, pipeline_stage)
      VALUES (${lead.email}, ${lead.name}, ${lead.company}, ${source}, 'prospect')
      ON CONFLICT (email) DO NOTHING
    `.catch(() => { skipped++; return })
    imported++
  }
  return { imported, skipped }
}

export async function ingestFounderFile(buffer: Buffer, filename: string, mimeType: string) {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return {
      filename, mimeType, kind: 'image' as const,
      summary: `${filename}: image`,
      textContent: `[Image: ${filename}]`,
      imageBase64: buffer.toString('base64'),
      imageMime: mimeType,
    }
  }
  const raw = buffer.toString('utf8')
  const delimiter = raw.includes('\t') ? '\t' : ','
  const rows = ext === 'csv' || filename.includes('csv') ? parseDelimitedText(raw, delimiter) : []
  const leads = rows.length ? rowsToLeadRecords(rows) : []
  let leadsImported = 0
  let leadsSkipped = 0
  if (leads.length) {
    const r = await importLeadsToPipeline(leads)
    leadsImported = r.imported
    leadsSkipped = r.skipped
  }
  return {
    filename, mimeType,
    kind: (ext === 'csv' ? 'csv' : 'text') as 'csv' | 'text',
    summary: `${filename}: ${rows.length ? rows.length - 1 : 0} rows` + (leadsImported ? ` · ${leadsImported} imported` : ''),
    textContent: raw.slice(0, 50_000),
    leadsImported,
    leadsSkipped,
  }
}

export async function storeFounderUpload(companyId: string, result: Awaited<ReturnType<typeof ingestFounderFile>>) {
  const key = `upload_${Date.now()}_${result.filename.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}`
  await rememberFact({
    company_id: companyId,
    type: result.kind === 'csv' ? 'campaign' : 'operating',
    key,
    value: JSON.stringify({ filename: result.filename, summary: result.summary, leadsImported: result.leadsImported }),
    confidence: 1,
    source: 'founder_hq',
  })
  return key
}

export function formatAttachmentsForPrompt(
  attachments: Array<{ filename: string; summary: string; textContent: string }>
): string {
  if (!attachments.length) return ''
  return attachments.map((a, i) => `### ${i + 1}: ${a.filename}\n${a.summary}\n${a.textContent.slice(0, 4000)}`).join('\n\n')
}
