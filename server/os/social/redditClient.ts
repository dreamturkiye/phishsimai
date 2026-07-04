/**
 * Sarah Mitchell Reddit client — session login via credentials (no OAuth app required).
 * Credentials: SARAH_REDDIT_USERNAME, SARAH_REDDIT_PASSWORD in env only.
 */

const UA = () =>
  process.env.SARAH_REDDIT_USER_AGENT ||
  'PhishSimAI/1.0 (Sarah Mitchell compliance outreach; contact sarah@phishsimai.com)'

export type RedditSession = {
  cookies: string
  modhash: string
  username: string
  via: 'cookie' | 'oauth'
  accessToken?: string
}

let cachedSession: { session: RedditSession; expiresAt: number } | null = null

export function clearRedditSessionCache() {
  cachedSession = null
}

function parseCookies(setCookie: string | null, existing = ''): string {
  const jar = new Map<string, string>()
  for (const part of existing.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [k, ...v] = part.split('=')
    if (k) jar.set(k, v.join('='))
  }
  if (setCookie) {
    for (const chunk of setCookie.split(/,(?=[^;]+?=)/)) {
      const [pair] = chunk.split(';')
      const [k, ...v] = pair.trim().split('=')
      if (k) jar.set(k, v.join('='))
    }
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function extractCsrf(html: string): string | null {
  const m = html.match(/name="csrf_token"\s+value="([^"]+)"/) ||
    html.match(/"csrf_token"\s*:\s*"([^"]+)"/)
  return m?.[1] || null
}

async function loginWithCookies(username: string, password: string): Promise<RedditSession> {
  const loginPage = await fetch('https://www.reddit.com/login/', {
    headers: { 'User-Agent': UA(), Accept: 'text/html' },
  })
  const html = await loginPage.text()
  let cookies = parseCookies(loginPage.headers.get('set-cookie'))
  const csrf = extractCsrf(html)

  const body = new URLSearchParams({
    op: 'login-main',
    user: username,
    passwd: password,
    api_type: 'json',
  })
  if (csrf) body.set('csrf_token', csrf)

  const loginRes = await fetch('https://www.reddit.com/post/login', {
    method: 'POST',
    headers: {
      'User-Agent': UA(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies,
      ...(csrf ? { 'X-Modhash': csrf } : {}),
    },
    body: body.toString(),
    redirect: 'manual',
  })
  cookies = parseCookies(loginRes.headers.get('set-cookie'), cookies)

  const loginJson = await loginRes.json().catch(() => ({} as any))
  if (loginJson?.json?.errors?.length) {
    throw new Error(`Reddit login failed: ${JSON.stringify(loginJson.json.errors)}`)
  }

  const meRes = await fetch('https://www.reddit.com/api/me.json?api_type=json', {
    headers: { 'User-Agent': UA(), Cookie: cookies },
  })
  const me = await meRes.json().catch(() => ({} as any))
  if (!me?.data?.name) {
    throw new Error('Reddit login failed: no session (check username/password or 2FA)')
  }

  return {
    cookies,
    modhash: me.data.modhash || csrf || '',
    username: me.data.name,
    via: 'cookie',
  }
}

async function loginWithOAuth(username: string, password: string): Promise<RedditSession> {
  const clientId = process.env.REDDIT_CLIENT_ID!
  const clientSecret = process.env.REDDIT_CLIENT_SECRET || ''
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'User-Agent': UA(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username,
      password,
    }),
  })
  const tokenJson = await tokenRes.json().catch(() => ({} as any))
  if (!tokenJson.access_token) {
    throw new Error(`Reddit OAuth login failed: ${tokenJson.error || tokenJson.message || 'no token'}`)
  }

  const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': UA() },
  })
  const me = await meRes.json().catch(() => ({} as any))
  return {
    cookies: '',
    modhash: '',
    username: me.name || username,
    via: 'oauth',
    accessToken: tokenJson.access_token,
  }
}

export async function getRedditSession(force = false): Promise<RedditSession> {
  if (!force && cachedSession && cachedSession.expiresAt > Date.now()) {
    return cachedSession.session
  }

  const username = process.env.SARAH_REDDIT_USERNAME
  const password = process.env.SARAH_REDDIT_PASSWORD
  if (!username || !password) {
    throw new Error('SARAH_REDDIT_USERNAME and SARAH_REDDIT_PASSWORD must be set in env')
  }

  const session =
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
      ? await loginWithOAuth(username, password)
      : await loginWithCookies(username, password)

  cachedSession = { session, expiresAt: Date.now() + 50 * 60 * 1000 }
  return session
}

export async function redditGet(path: string, session: RedditSession): Promise<any> {
  const url = path.startsWith('http') ? path : `https://www.reddit.com${path}`
  const headers: Record<string, string> = { 'User-Agent': UA(), Accept: 'application/json' }
  if (session.via === 'oauth' && session.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`
    const oauthUrl = url.replace('https://www.reddit.com', 'https://oauth.reddit.com')
    const res = await fetch(oauthUrl, { headers })
    if (!res.ok) throw new Error(`Reddit GET ${path}: ${res.status}`)
    return res.json()
  }
  headers.Cookie = session.cookies
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Reddit GET ${path}: ${res.status}`)
  return res.json()
}

async function redditPostForm(path: string, session: RedditSession, fields: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({ ...fields, api_type: 'json' })
  const headers: Record<string, string> = {
    'User-Agent': UA(),
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  if (session.via === 'oauth' && session.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`
    const res = await fetch(`https://oauth.reddit.com${path}`, { method: 'POST', headers, body })
    const json = await res.json().catch(() => ({}))
    if (json?.json?.errors?.length) throw new Error(JSON.stringify(json.json.errors))
    return json
  }

  body.set('uh', session.modhash)
  headers.Cookie = session.cookies
  const res = await fetch(`https://www.reddit.com${path}`, { method: 'POST', headers, body })
  const json = await res.json().catch(() => ({}))
  if (json?.json?.errors?.length) throw new Error(JSON.stringify(json.json.errors))
  return json
}

export async function submitComment(session: RedditSession, thingId: string, text: string) {
  const id = thingId.startsWith('t3_') || thingId.startsWith('t1_') ? thingId : `t3_${thingId}`
  return redditPostForm('/api/comment', session, { thing_id: id, text })
}

export async function submitTextPost(session: RedditSession, subreddit: string, title: string, text: string) {
  const sub = subreddit.replace(/^r\//, '')
  return redditPostForm('/api/submit', session, {
    sr: sub,
    kind: 'self',
    title: title.slice(0, 300),
    text,
  })
}

export async function fetchHotThreads(subreddit: string, limit = 5, session?: RedditSession): Promise<Array<{ id: string; title: string; url: string; permalink: string }>> {
  const sub = subreddit.replace(/^r\//, '')
  const json = session
    ? await redditGet(`/r/${sub}/hot.json?limit=${limit}`, session)
    : await (async () => {
        const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`, {
          headers: { 'User-Agent': UA(), Accept: 'application/json' },
        })
        if (!res.ok) throw new Error(`hot.json ${res.status}`)
        return res.json()
      })()

  return (json?.data?.children || []).map((c: any) => ({
    id: c.data.name as string,
    title: c.data.title as string,
    url: c.data.url as string,
    permalink: `https://www.reddit.com${c.data.permalink}`,
  }))
}

export async function verifyRedditLogin(): Promise<{ ok: boolean; username?: string; via?: string; error?: string }> {
  try {
    const s = await getRedditSession(true)
    return { ok: true, username: s.username, via: s.via }
  } catch (e: any) {
    return { ok: false, error: e.message?.slice(0, 200) }
  }
}
