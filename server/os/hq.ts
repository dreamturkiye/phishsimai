/**
 * Kaan AI OS v4 - HQ Backend for PhishSimAI
 * TiDB/MySQL implementation for agent status, memory, tasks, and chat
 */

import { createConnection, Connection } from '@tidbcloud/serverless';

let dbConn: Connection | null = null;

async function getDb(): Promise<Connection> {
  if (dbConn) return dbConn;
  
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) throw new Error('DATABASE_URL not set');
  
  dbConn = await createConnection({ url: dbUrl });
  return dbConn;
}

// ── HQ Data Endpoint ─────────────────────────────────────────────────────────
export async function hqData(req: any, res: any) {
  try {
    const secret = req.query.secret || req.body.secret;
    if (secret !== process.env.HQ_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = await getDb();

    // Fetch agent health/status
    const agents = await db.execute(
      `SELECT id, name, title, status, last_ping, uptime_pct, health_score 
       FROM agent_status ORDER BY created_at DESC`
    );

    // Fetch recent tasks
    const tasks = await db.execute(
      `SELECT id, agent_id, description, status, created_at, updated_at 
       FROM agent_tasks ORDER BY created_at DESC LIMIT 10`
    );

    // Fetch aggregate metrics
    const metrics = await db.execute(
      `SELECT 
         COUNT(DISTINCT agent_id) as agent_count,
         SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy_count,
         AVG(health_score) as avg_health
       FROM agent_status`
    );

    const agentList = Array.isArray(agents) ? agents : [];
    const taskList = Array.isArray(tasks) ? tasks : [];
    const metricRow = Array.isArray(metrics) && metrics.length > 0 ? metrics[0] : {};

    return res.json({
      ok: true,
      agents: agentList,
      tasks: taskList,
      metrics: {
        total_agents: metricRow.agent_count || 0,
        healthy_agents: metricRow.healthy_count || 0,
        avg_health: metricRow.avg_health || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('hqData error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── HQ Chat Endpoint ─────────────────────────────────────────────────────────
export async function hqChat(req: any, res: any) {
  try {
    const { secret, agent_name, message } = req.body;
    if (secret !== process.env.HQ_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    const db = await getDb();

    // Log chat message
    const timestamp = new Date().toISOString();
    await db.execute(
      `INSERT INTO agent_chats (agent_name, message, created_at) 
       VALUES (?, ?, ?)`,
      [agent_name || 'janet', message, timestamp]
    );

    // For now, return a simple acknowledgment
    // In production, this would route to Groq for LLM response
    return res.json({
      ok: true,
      agent: agent_name || 'janet',
      reply: `Acknowledged: ${message.substring(0, 50)}...`,
      timestamp
    });
  } catch (e: any) {
    console.error('hqChat error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── HQ Task Endpoint ────────────────────────────────────────────────────────
export async function hqTask(req: any, res: any) {
  try {
    const { secret, agent_id, description, action } = req.body;
    if (secret !== process.env.HQ_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = await getDb();

    if (action === 'create') {
      const taskId = `task_${Date.now()}`;
      await db.execute(
        `INSERT INTO agent_tasks (id, agent_id, description, status, created_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [taskId, agent_id, description, 'pending', new Date().toISOString()]
      );
      return res.json({ ok: true, task_id: taskId });
    }

    if (action === 'list') {
      const tasks = await db.execute(
        `SELECT id, agent_id, description, status, created_at 
         FROM agent_tasks WHERE status = 'pending' ORDER BY created_at DESC`
      );
      return res.json({ ok: true, tasks: tasks || [] });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (e: any) {
    console.error('hqTask error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── HQ Memory Endpoint ──────────────────────────────────────────────────────
export async function hqMemoryGet(req: any, res: any) {
  try {
    const secret = req.query.secret || req.body.secret;
    if (secret !== process.env.HQ_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const agentId = req.query.agent_id || 'janet';
    const db = await getDb();

    const memory = await db.execute(
      `SELECT id, agent_id, key, value, created_at, updated_at 
       FROM agent_memory WHERE agent_id = ? ORDER BY updated_at DESC`,
      [agentId]
    );

    const memoryObj: Record<string, any> = {};
    if (Array.isArray(memory)) {
      for (const entry of memory) {
        memoryObj[entry.key] = entry.value;
      }
    }

    return res.json({
      ok: true,
      agent_id: agentId,
      memory: memoryObj,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('hqMemoryGet error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── HQ Seed Endpoint ────────────────────────────────────────────────────────
export async function hqSeed(req: any, res: any) {
  try {
    const secret = req.body.secret;
    if (secret !== process.env.HQ_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = await getDb();

    // Clear existing data (careful in production!)
    await db.execute('TRUNCATE TABLE agent_status');
    await db.execute('TRUNCATE TABLE agent_memory');
    await db.execute('TRUNCATE TABLE agent_tasks');
    await db.execute('TRUNCATE TABLE agent_chats');

    // Seed 9 agents (Janet + 8 specialists)
    const agents = [
      { name: 'janet', title: 'Chief Growth Officer' },
      { name: 'marcus', title: 'Senior Sales Director' },
      { name: 'aria', title: 'VP of Marketing' },
      { name: 'nova', title: 'Head of Product Growth' },
      { name: 'rex', title: 'Revenue Operations Manager' },
      { name: 'scout', title: 'Head of Market Intelligence' },
      { name: 'finn', title: 'Chief Financial Officer' },
      { name: 'vera', title: 'VP of Customer Success' },
      { name: 'max', title: 'Chief of Staff' }
    ];

    for (const agent of agents) {
      await db.execute(
        `INSERT INTO agent_status (name, title, status, uptime_pct, health_score, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [agent.name, agent.title, 'healthy', 100, 100, new Date().toISOString()]
      );
    }

    return res.json({
      ok: true,
      agents_created: agents.length,
      message: 'Database seeded successfully'
    });
  } catch (e: any) {
    console.error('hqSeed error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

export async function hqTTS(req: any, res: any) {
  // Placeholder for TTS endpoint
  return res.json({ ok: true, message: 'TTS not yet implemented' });
}
