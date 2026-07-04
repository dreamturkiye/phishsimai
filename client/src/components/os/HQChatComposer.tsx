import { useCallback, useEffect, useRef, useState } from 'react'

export type HQAttachment = {
  id: string
  filename: string
  kind: string
  summary: string
  textPreview: string
  memoryKey?: string
  imageBase64?: string
  imageMime?: string
  leadsImported?: number
  leadsSkipped?: number
}

type Props = {
  value: string
  onChange: (value: string) => void
  onSend: (text: string, attachments: HQAttachment[]) => void
  disabled?: boolean
  secret: string
  placeholder?: string
}

const ACCEPT = '.csv,.txt,.md,.json,.xlsx,.xls,.docx,.doc,.pdf,.png,.jpg,.jpeg,.gif,.webp'

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function HQChatComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  secret,
  placeholder = 'Message Janet — Shift+Enter for new line. Attach CSV, Excel, PDF, Word, images…',
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<HQAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`
  }, [])

  useEffect(() => { resize() }, [value, resize])

  async function ingestFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return
    setUploading(true)
    try {
      const payload = await Promise.all(
        files.map(async f => ({
          filename: f.name,
          mimeType: f.type || 'application/octet-stream',
          base64: await fileToBase64(f),
        }))
      )
      const r = await fetch(`/api/os/hq/ingest?secret=${secret}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payload }),
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error || 'Upload failed')
      const ingested: HQAttachment[] = (d.files || [])
        .filter((f: any) => f.ok)
        .map((f: any) => ({
          id: `${f.memoryKey || f.filename}-${Date.now()}`,
          filename: f.filename,
          kind: f.kind,
          summary: f.summary,
          textPreview: f.textPreview || '',
          memoryKey: f.memoryKey,
          imageBase64: f.imageBase64,
          imageMime: f.imageMime,
          leadsImported: f.leadsImported,
          leadsSkipped: f.leadsSkipped,
        }))
      setAttachments(prev => [...prev, ...ingested])
    } catch (e: any) {
      alert(e.message || 'File upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleSend() {
    if (disabled || uploading) return
    if (!value.trim() && !attachments.length) return
    onSend(value.trim(), attachments)
    onChange('')
    setAttachments([])
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files?.length) ingestFiles(e.dataTransfer.files)
      }}
      style={{
        padding: '10px 12px',
        borderTop: '1px solid #1e1e2e',
        background: dragOver ? '#12122a' : 'transparent',
      }}
    >
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {attachments.map(a => (
            <div
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                padding: '4px 8px', borderRadius: 6, background: '#16161f',
                border: '1px solid #2a2a3e', color: '#c8c8e0',
              }}
            >
              <span>{a.kind === 'image' ? '🖼' : '📎'} {a.filename}</span>
              {a.leadsImported != null && a.leadsImported > 0 && (
                <span style={{ color: '#4ade80' }}>+{a.leadsImported} leads</span>
              )}
              <button
                type="button"
                onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}
                style={{ border: 'none', background: 'none', color: '#9090aa', cursor: 'pointer', padding: 0, fontSize: 14 }}
                aria-label="Remove attachment"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple style={{ display: 'none' }}
          onChange={e => { if (e.target.files) ingestFiles(e.target.files) }} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #2a2a3e', background: '#0e0e16', color: '#888', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
          title="Attach CSV, Excel, PDF, Word, text, or image"
        >
          {uploading ? '…' : '📎'}
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          onPaste={() => setTimeout(resize, 0)}
          disabled={disabled || uploading}
          placeholder={placeholder}
          rows={1}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #2a2a3e',
            background: '#0e0e16', color: '#e4e4ec', fontSize: 13, resize: 'none',
            lineHeight: 1.5, fontFamily: 'inherit', minHeight: 42, maxHeight: 280,
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || uploading || (!value.trim() && !attachments.length)}
          style={{ padding: '10px 14px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, cursor: 'pointer', flexShrink: 0, opacity: disabled || uploading || (!value.trim() && !attachments.length) ? 0.5 : 1 }}
        >
          {disabled ? '…' : 'Send'}
        </button>
      </div>
      <div style={{ fontSize: 10, color: '#4a4a60', marginTop: 6 }}>
        Enter to send · Shift+Enter for new line · Drop files here · CSV/Excel leads auto-import to pipeline
      </div>
    </div>
  )
}
