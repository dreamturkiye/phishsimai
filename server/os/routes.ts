import { Request, Response } from 'express'
import { runJanetBrief, janetChat } from './janet'
import { runSequence } from './sequences'
import { runWatchdog } from './watchdog'
import { runHeartbeat } from './heartbeat'
import { processReply } from './replyParser'
import { recallContext, recallMemory, rememberFact, seedPhishSimMemory } from './memory'
import { connect } from '@tidbcloud/serverless'
import { sendTelegram } from './telegram'

const HQ = process.env.HQ_SECRET || 'ps-hq-2026'
const CRON = process.env.CRON_SECRET || ''

function okHQ(req: Request, res: Response) {
  const s = (req.query.secret || req.headers['x-hq-secret']) as string
  if (s !== HQ) { res.status(401).json({ error:'Unauthorized' }); return false }
  return true
}
function okCron(req: Request, res: Response) {
  if (req.headers.authorization !== `Bearer ${CRON}`) { res.status(401).json({ error:'Unauthorized' }); return false }
  return true
}

export async function cronSequence(req: Request, res: Response) {
  if (!okCron(req,res)) return
  try { res.json(await runSequence()) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronJanet(req: Request, res: Response) {
  if (!okCron(req,res)) return
  try { res.json(await runJanetBrief()) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronWatchdog(req: Request, res: Response) {
  if (!okCron(req,res)) return
  try { res.json(await runWatchdog()) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronHeartbeat(req: Request, res: Response) {
  if (!okCron(req,res)) return
  try { res.json(await runHeartbeat()) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function webhookReply(req: Request, res: Response) {
  try {
    const { type, data } = req.body
    let from='', subject='', text=''
    if (type==='email.received' && data) {
      const raw=data.from||''; from=raw.match(/<([^>]+)>/)?.[1]||raw
      subject=data.subject||''; text=data.text||data.html?.replace(/<[^>]+>/g,' ')||''
    } else {
      const raw=req.body.from||''; from=raw.match(/<([^>]+)>/)?.[1]||raw
      subject=req.body.subject||''; text=req.body.text||req.body.plain||req.body.body||''
    }
    if (!from||!text) { res.json({ok:true}); return }
    res.json({ok:true, ...(await processReply(from,subject,text))})
  } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function hqData(req: Request, res: Response) {
  if (!okHQ(req,res)) return
  try {
    const conn = connect({ url: process.env.DATABASE_URL! })
    const pipeline = await conn.execute(`SELECT
      COUNT(CASE WHEN touch1_sent_at IS NOT NULL THEN 1 END) as touched,
      COUNT(CASE WHEN replied=1 THEN 1 END) as replied,
      COUNT(CASE WHEN pipeline_stage='engaged' THEN 1 END) as engaged,
      COUNT(CASE WHEN pipeline_stage='customer' THEN 1 END) as customers,
      COUNT(CASE WHEN pipeline_stage='prospect' THEN 1 END) as prospects,
      COUNT(CASE WHEN bounced=1 AND touch1_sent_at IS NOT NULL THEN 1 END) as bounced
      FROM ps_outreach_leads`)
    const recentLeads = await conn.execute(`SELECT name,company,email,pipeline_stage,touch1_sent_at,touch2_sent_at,replied,bounced FROM ps_outreach_leads ORDER BY created_at DESC LIMIT 20`)
    const tasks = await conn.execute(`SELECT id,task,status,source,created_at,notes FROM os_architect_tasks ORDER BY created_at DESC LIMIT 10`).catch(()=>({rows:[]}))
    const memory = await recallMemory('phishsimai', undefined, 40)
    const p = (pipeline as any).rows?.[0] || {}
    const sent = Number(p.touched||0), bounced = Number(p.bounced||0)
    res.json({
      ok:true, ts:new Date().toISOString(),
      pipeline:{
        touched:sent, replied:Number(p.replied||0), engaged:Number(p.engaged||0),
        customers:Number(p.customers||0), prospects:Number(p.prospects||0),
        bounceRate: sent>0 ? (bounced/sent*100).toFixed(1) : '0.0',
        replyRate: sent>0 ? (Number(p.replied||0)/sent*100).toFixed(1) : '0.0'
      },
      recentLeads:(recentLeads as any).rows||[],
      archTasks:(tasks as any).rows||[],
      memory
    })
  } catch(e:any) { res.status(500).json({ok:false,error:e.message}) }
}

export async function hqChat(req: Request, res: Response) {
  if (!okHQ(req,res)) return
  try {
    const { message, history=[] } = req.body
    if (!message) { res.status(400).json({error:'No message'}); return }
    res.json({ok:true, response:await janetChat(message,history)})
  } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function hqTTS(req: Request, res: Response) {
  if (!okHQ(req,res)) return
  const { text } = req.body
  if (!text) { res.status(400).json({error:'No text'}); return }
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) { res.status(503).json({error:'ElevenLabs not configured'}); return }
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream', {
      method:'POST', headers:{'xi-api-key':apiKey,'Content-Type':'application/json','Accept':'audio/mpeg'},
      body: JSON.stringify({text:text.slice(0,500),model_id:'eleven_turbo_v2_5',voice_settings:{stability:0.55,similarity_boost:0.75}})
    })
    if (!r.ok) { res.status(502).json({error:'ElevenLabs error'}); return }
    const buf = Buffer.from(await r.arrayBuffer())
    res.set({'Content-Type':'audio/mpeg','Content-Length':String(buf.length),'Cache-Control':'no-store'}).send(buf)
  } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function hqTask(req: Request, res: Response) {
  if (!okHQ(req,res)) return
  try {
    const { id, status, notes } = req.body
    const conn = connect({ url: process.env.DATABASE_URL! })
    await conn.execute(`UPDATE os_architect_tasks SET status=?,notes=?,updated_at=NOW() WHERE id=?`,[status,notes||null,id])
    await sendTelegram(`PHISHSIMAI TASK ${status.toUpperCase()}: ${notes||id}`)
    res.json({ok:true})
  } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function hqMemoryGet(req: Request, res: Response) {
  if (!okHQ(req,res)) return
  try { res.json({ok:true, context:await recallContext('phishsimai')}) }
  catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function hqSeed(req: Request, res: Response) {
  if (!okHQ(req,res)) return
  try { const n=await seedPhishSimMemory(); res.json({ok:true,seeded:n}) }
  catch(e:any) { res.status(500).json({error:e.message}) }
}
