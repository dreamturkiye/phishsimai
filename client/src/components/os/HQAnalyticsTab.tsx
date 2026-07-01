export type AnalyticsView = {
  live30m: number
  today: { pageviews: number; visitors: number }
  last7d: { pageviews: number; visitors: number }
  last30d: { pageviews: number; visitors: number }
  daily: Array<{ day: string; pageviews: number; visitors: number }>
  topPages: Array<{ path: string; views: number }>
  topReferrers: Array<{ referrer: string; views: number }>
  topUtm: Array<{ source: string; medium: string; campaign: string; views: number }>
  devices: Array<{ device: string; views: number }>
  browsers: Array<{ browser: string; views: number }>
}

const s = {
  card: { background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 10, padding: '14px 16px', marginBottom: 10 } as const,
  cardTitle: { fontSize: 11, fontWeight: 700, color: '#9090aa', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 12 },
  metricCard: { background: '#0a0a14', border: '1px solid #1e1e2e', borderRadius: 8, padding: '10px 12px' },
  metricLabel: { fontSize: 9, color: '#6b6b8a', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  metricValue: { fontSize: 22, fontWeight: 600, lineHeight: 1 },
  metricSub: { fontSize: 10, color: '#6b6b8a', marginTop: 3 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #12121e', fontSize: 12 } as const,
  barWrap: { height: 6, borderRadius: 3, background: '#1e1e2e', flex: 1, margin: '0 8px', overflow: 'hidden' },
  barFill: { height: '100%', background: '#f5a623', borderRadius: 3 },
}

export function HQAnalyticsTab({ analytics, productLabel, accent = '#f5a623' }: {
  analytics?: AnalyticsView | null
  productLabel: string
  accent?: string
}) {
  if (!analytics) {
    return (
      <div style={s.card}>
        <div style={s.cardTitle}>Site analytics</div>
        <div style={{ fontSize: 13, color: '#6b6b8a' }}>Collecting first-party analytics… refresh in a few minutes.</div>
      </div>
    )
  }

  const maxDaily = Math.max(1, ...analytics.daily.map((d) => d.pageviews))

  return (
    <>
      <div style={{ ...s.card, borderColor: `${accent}33` }}>
        <div style={s.cardTitle}>Kaan OS Analytics — {productLabel}</div>
        <div style={{ fontSize: 12, color: '#9090aa', marginBottom: 12, lineHeight: 1.5 }}>
          Free first-party tracking (no Google/Umami account). Privacy-friendly hashed visitors. Janet uses this for growth decisions.
        </div>
        <div style={s.grid}>
          {[
            ['Live 30m', analytics.live30m, 'active now'],
            ['Today', analytics.today.pageviews, `${analytics.today.visitors} visitors`],
            ['7 days', analytics.last7d.pageviews, `${analytics.last7d.visitors} visitors`],
            ['30 days', analytics.last30d.pageviews, `${analytics.last30d.visitors} visitors`],
          ].map(([label, val, sub]) => (
            <div key={label as string} style={s.metricCard}>
              <div style={s.metricLabel}>{label as string}</div>
              <div style={{ ...s.metricValue, color: accent }}>{val as number}</div>
              <div style={s.metricSub}>{sub as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={s.card}>
          <div style={s.cardTitle}>14-day traffic</div>
          {analytics.daily.length === 0
            ? <div style={{ fontSize: 12, color: '#6b6b8a' }}>No data yet</div>
            : analytics.daily.map((d) => (
              <div key={d.day} style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 11 }}>
                <span style={{ width: 72, color: '#9090aa' }}>{d.day.slice(5)}</span>
                <div style={s.barWrap}>
                  <div style={{ ...s.barFill, width: `${(d.pageviews / maxDaily) * 100}%`, background: accent }} />
                </div>
                <span style={{ width: 28, textAlign: 'right', fontWeight: 600 }}>{d.pageviews}</span>
              </div>
            ))}
        </div>
        <div style={s.card}>
          <div style={s.cardTitle}>Top pages (7d)</div>
          {analytics.topPages.length === 0
            ? <div style={{ fontSize: 12, color: '#6b6b8a' }}>No pageviews yet</div>
            : analytics.topPages.map((p) => (
              <div key={p.path} style={s.row}>
                <code style={{ color: '#60a5fa', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{p.path}</code>
                <span style={{ fontWeight: 600 }}>{p.views}</span>
              </div>
            ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div style={s.card}>
          <div style={s.cardTitle}>Referrers (7d)</div>
          {analytics.topReferrers.map((r) => (
            <div key={r.referrer} style={s.row}>
              <span style={{ color: '#c8c8e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{r.referrer.replace(/^https?:\/\//, '').slice(0, 40)}</span>
              <span>{r.views}</span>
            </div>
          ))}
        </div>
        <div style={s.card}>
          <div style={s.cardTitle}>Devices (7d)</div>
          {analytics.devices.map((d) => (
            <div key={d.device} style={s.row}>
              <span style={{ textTransform: 'capitalize' }}>{d.device}</span>
              <span>{d.views}</span>
            </div>
          ))}
        </div>
        <div style={s.card}>
          <div style={s.cardTitle}>UTM campaigns (30d)</div>
          {analytics.topUtm.length === 0
            ? <div style={{ fontSize: 12, color: '#6b6b8a' }}>No UTM traffic yet</div>
            : analytics.topUtm.map((u, i) => (
              <div key={i} style={{ ...s.row, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span style={{ color: '#f5a623', fontSize: 11 }}>{u.source} / {u.medium || '—'}</span>
                <span style={{ color: '#6b6b8a', fontSize: 10 }}>{u.campaign || '(no campaign)'} · {u.views} views</span>
              </div>
            ))}
        </div>
      </div>
    </>
  )
}
