/**
 * Pixel-faithful LinkedIn feed post mock — what Kaan sees in Safari should match the live post.
 */
import type { LinkedInPreview } from './sarahLinkedIn'
import { sanitizeStoredPostBody } from './parseSarahDraft'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatPostText(body: string, hashtags: string[]): string {
  const tagLine = hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')
  const full = tagLine ? `${body.trim()}\n\n${tagLine}` : body.trim()
  return escapeHtml(full)
    .replace(/\n\n/g, '</p><p style="margin:8px 0 0">')
    .replace(/\n/g, '<br/>')
}

/** LinkedIn mobile/desktop feed card — text then full-bleed image, engagement bar. */
export function renderLinkedInFeedPost(preview: Omit<LinkedInPreview, 'previewHtml'>): string {
  const cleanBody = sanitizeStoredPostBody(preview.body, preview.hook)
  const bodyHtml = formatPostText(cleanBody, preview.hashtags || [])
  const avatar = preview.author.avatarInitials
  const imageBlock = preview.imageUrl
    ? `<div class="li-image"><img src="${escapeHtml(preview.imageUrl)}" alt="" loading="eager"/></div>`
    : `<div class="li-image li-image-missing"><span>Hero image generating…</span></div>`

  return `<article class="li-post" aria-label="LinkedIn post preview">
  <header class="li-header">
    <div class="li-avatar" aria-hidden="true">${escapeHtml(avatar)}</div>
    <div class="li-meta">
      <div class="li-name">${escapeHtml(preview.author.name)}</div>
      <div class="li-headline">${escapeHtml(preview.author.title)}</div>
      <div class="li-time">Just now · <span aria-hidden="true">🌐</span></div>
    </div>
    <button type="button" class="li-more" aria-label="More" disabled>···</button>
  </header>
  <div class="li-body"><p style="margin:0">${bodyHtml}</p></div>
  ${imageBlock}
  <div class="li-stats"><span class="li-reactions" aria-hidden="true"><span class="li-react-icons">👍</span></span><span class="li-impressions">Preview mode</span></div>
  <div class="li-actions" aria-hidden="true">
    <span class="li-action">👍 Like</span>
    <span class="li-action">💬 Comment</span>
    <span class="li-action">🔁 Repost</span>
    <span class="li-action">✉ Send</span>
  </div>
</article>
<style>
.li-post{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fff;color:rgba(0,0,0,.9);border:1px solid rgba(0,0,0,.08);border-radius:8px;overflow:hidden;max-width:552px;margin:0 auto}
.li-header{display:flex;gap:8px;padding:12px 12px 0;align-items:flex-start}
.li-avatar{width:48px;height:48px;border-radius:50%;background:#0a66c2;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;flex-shrink:0}
.li-meta{flex:1;min-width:0}
.li-name{font-size:14px;font-weight:600;line-height:1.25;color:rgba(0,0,0,.9)}
.li-headline{font-size:12px;color:rgba(0,0,0,.6);line-height:1.33;margin-top:2px}
.li-time{font-size:12px;color:rgba(0,0,0,.6);margin-top:2px}
.li-more{border:none;background:transparent;color:rgba(0,0,0,.6);font-size:20px;line-height:1;padding:4px 8px;cursor:default}
.li-body{padding:8px 12px 12px;font-size:14px;line-height:1.43;word-wrap:break-word;white-space:pre-wrap}
.li-body a{color:#0a66c2;text-decoration:none}
.li-image{width:100%;background:#000;line-height:0}
.li-image img{width:100%;height:auto;display:block;object-fit:cover}
.li-image-missing{aspect-ratio:1/1;background:#111;color:#666;display:flex;align-items:center;justify-content:center;font-size:13px;min-height:280px}
.li-stats{display:flex;justify-content:space-between;padding:8px 12px 0;font-size:12px;color:rgba(0,0,0,.6);align-items:center}
.li-react-icons{display:inline-flex;gap:2px}
.li-actions{display:flex;justify-content:space-around;padding:4px 8px 4px;border-top:1px solid rgba(0,0,0,.08);margin-top:8px}
.li-action{flex:1;text-align:center;padding:12px 4px;font-size:14px;font-weight:600;color:rgba(0,0,0,.6)}
@media (max-width:600px){.li-post{border-radius:0;border-left:none;border-right:none}}
</style>`
}

export function renderLinkedInPreviewCard(preview: Omit<LinkedInPreview, 'previewHtml'>): string {
  return renderLinkedInFeedPost(preview)
}
