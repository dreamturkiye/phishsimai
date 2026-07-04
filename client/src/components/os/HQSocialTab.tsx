import { useCallback, useEffect, useState } from 'react'

type Preview = {
  status: string
  reviewStatus?: string
  hook: string
  body: string
  hashtags?: string[]
  scheduledAt?: string | null
  blocker?: string | null
  previewHtml: string
  previewUrl?: string
  previewToken?: string
  imageUrl?: string | null
}

type Props = {
  apiBase: string
  secret: string
}

export function HQSocialTab({ apiBase, secret }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [queue, setQueue] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState('')
  const [copied, setCopied] = useState(false)
  const [drafting, setDrafting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [p, q] = await Promise.all([
        fetch(`${apiBase}/hq/social?secret=${secret}&action=linkedin-preview`).then(r => r.json()),
        fetch(`${apiBase}/hq/social?secret=${secret}`).then(r => r.json()),
      ])
      if (p.preview) setPreview(p.preview)
      if (q.queue) setQueue(q.queue)
    } catch { /* ignore */ }
    setLoading(false)
  }, [apiBase, secret])

  useEffect(() => { void refresh() }, [refresh])

  async function draftNew() {
    setDrafting(true)
    try {
      const r = await fetch(`${apiBase}/hq/social?secret=${secret}&action=linkedin-preview&mode=draft&topic=${encodeURIComponent(topic)}`)
      const d = await r.json()
      if (d.preview) setPreview(d.preview)
    } finally {
      setDrafting(false)
    }
  }

  async function copyLink() {
    if (!preview?.previewUrl) return
    try {
      await navigator.clipboard.writeText(preview.previewUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy preview link:', preview.previewUrl)
    }
  }

  const card = { background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 10, padding: 16, marginBottom: 12 }
  const btn = (bg: string, color: string) => ({
    padding: '8px 14px', borderRadius: 6, border: 'none', background: bg, color, fontWeight: 600 as const, cursor: 'pointer', fontSize: 12, textDecoration: 'none' as const, display: 'inline-block',
  })

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e2f0', marginBottom: 8 }}>Sarah Mitchell — LinkedIn preview</div>
        <p style={{ fontSize: 12, color: '#9090aa', margin: '0 0 12px', lineHeight: 1.5 }}>
          Each draft gets a <strong style={{ color: '#c4c4d4' }}>Safari link</strong> — full post, approve or request changes with comments. Janet gets your feedback instantly.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Topic (optional)"
            style={{ flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 6, border: '1px solid #2a2a3e', background: '#0a0a12', color: '#e2e2f0', fontSize: 12 }}
          />
          <button type="button" disabled={drafting} onClick={() => void draftNew()} style={{ ...btn('#f5a623', '#000'), opacity: drafting ? 0.6 : 1 }}>
            {drafting ? 'Generating post + image…' : 'Generate draft + link'}
          </button>
          <button type="button" onClick={() => void refresh()} style={{ ...btn('transparent', '#9090aa'), border: '1px solid #2a2a3e' }}>
            Refresh
          </button>
        </div>

        {preview?.previewUrl && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#6b6b8a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Live preview — exactly as it appears on LinkedIn
            </div>
            <iframe
              title="LinkedIn post preview"
              src={preview.previewUrl}
              style={{
                width: '100%',
                minHeight: 720,
                border: '1px solid #2a2a3e',
                borderRadius: 8,
                background: '#f3f2ef',
              }}
            />
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <a href={preview.previewUrl} target="_blank" rel="noopener noreferrer" style={btn('#0a66c2', '#fff')}>
                Open in Safari →
              </a>
              <button type="button" onClick={() => void copyLink()} style={{ ...btn('#1e1e2e', '#e2e2f0'), border: '1px solid #3a3a4e' }}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
            {preview.reviewStatus && preview.reviewStatus !== 'pending_review' && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#9090aa' }}>Review: {preview.reviewStatus.replace(/_/g, ' ')}</div>
            )}
          </div>
        )}

        {loading && <div style={{ color: '#6b6b8a', fontSize: 12 }}>Loading…</div>}
        {preview?.blocker && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>⚠ {preview.blocker}</div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e2f0', marginBottom: 8 }}>Social queue</div>
        {queue.length === 0 ? (
          <div style={{ fontSize: 12, color: '#6b6b8a' }}>No queued items</div>
        ) : (
          <table style={{ width: '100%', fontSize: 11, color: '#9090aa', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b6b8a' }}>
                <th style={{ padding: 6 }}>Platform</th>
                <th style={{ padding: 6 }}>Review</th>
                <th style={{ padding: 6 }}>Status</th>
                <th style={{ padding: 6 }}>Preview</th>
              </tr>
            </thead>
            <tbody>
              {queue.slice(0, 12).map((row: any) => (
                <tr key={row.id} style={{ borderTop: '1px solid #1e1e2e' }}>
                  <td style={{ padding: 6 }}>{row.platform}</td>
                  <td style={{ padding: 6 }}>{row.review_status || '—'}</td>
                  <td style={{ padding: 6 }}>{row.status}</td>
                  <td style={{ padding: 6 }}>
                    {row.preview_token ? (
                      <a href={`/preview/social/${row.preview_token}`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>Open</a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
