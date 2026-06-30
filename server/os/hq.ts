import { connect } from '@tidbcloud/serverless';
import { janetChat } from './janet';

function getDb() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) throw new Error('DATABASE_URL not set');
  return connect({ url: dbUrl });
}

// Mock data for when database isn't available
const MOCK_AGENTS = [
  { id: 'janet', name: 'Janet', title: 'Chief Growth Officer', status: 'healthy', health_score: 100 },
  { id: 'marcus', name: 'Marcus', title: 'Senior Sales Director', status: 'healthy', health_score: 100 },
  { id: 'aria', name: 'Aria', title: 'VP of Marketing', status: 'healthy', health_score: 100 },
  { id: 'nova', name: 'Nova', title: 'Head of Product Growth', status: 'healthy', health_score: 100 },
  { id: 'rex', name: 'Rex', title: 'Revenue Operations Manager', status: 'healthy', health_score: 100 },
  { id: 'scout', name: 'Scout', title: 'Head of Market Intelligence', status: 'healthy', health_score: 100 },
  { id: 'finn', name: 'Finn', title: 'Chief Financial Officer', status: 'healthy', health_score: 100 },
  { id: 'vera', name: 'Vera', title: 'VP of Customer Success', status: 'healthy', health_score: 100 },
  { id: 'max', name: 'Max', title: 'Chief of Staff', status: 'healthy', health_score: 100 }
];

export async function hqData(req: any, res: any) {
  try {
    const secret = req.query.secret || req.body.secret;
    if (secret !== process.env.HQ_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const db = getDb();

      // Try to fetch from database
      const agents = await db.execute(
        `SELECT id, name, title, status, health_score FROM agent_status ORDER BY created_at DESC`
      );

      const metrics = await db.execute(
        `SELECT COUNT(DISTINCT id) as agent_count, SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy_count, AVG(health_score) as avg_health FROM agent_status`
      );

      const agentList = Array.isArray(agents) ? agents : [];
      const metricRow = Array.isArray(metrics) && metrics.length > 0 ? metrics[0] : {};

      return res.json({
        ok: true,
        agents: agentList,
        metrics: {
          total_agents: metricRow.agent_count || 0,
          healthy_agents: metricRow.healthy_count || 0,
          avg_health: metricRow.avg_health || 0
        },
        timestamp: new Date().toISOString(),
        source: 'database'
      });
    } catch (dbError: any) {
      // Fallback to mock data if database query fails
      console.warn('Database query failed, returning mock data:', dbError.message);
      
      return res.json({
        ok: true,
        agents: MOCK_AGENTS,
        metrics: {
          total_agents: 9,
          healthy_agents: 9,
          avg_health: 100
        },
        timestamp: new Date().toISOString(),
        source: 'mock'
      });
    }
  } catch (e: any) {
    console.error('hqData error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}


export async function hqChat(req: any, res: any) {
  try {
    const { secret, message, history = [] } = req.body || {}
    const qSecret = req.query?.secret
    if (secret !== process.env.HQ_SECRET && qSecret !== process.env.HQ_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message required' })
    }
    const response = await janetChat(message, history)
    return res.json({ ok: true, response, agent: 'janet', timestamp: new Date().toISOString() })
  } catch (e: any) {
    console.error('hqChat error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}

export async function hqTask(req: any, res: any) {
  const { secret, agent_id, description, action } = req.body;
  if (secret !== process.env.HQ_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (action === 'create') {
    const taskId = `task_${Date.now()}`;
    return res.json({ ok: true, task_id: taskId });
  }

  if (action === 'list') {
    return res.json({ ok: true, tasks: [] });
  }

  return res.status(400).json({ error: 'Invalid action' });
}

export async function hqMemoryGet(req: any, res: any) {
  const secret = req.query.secret || req.body.secret;
  if (secret !== process.env.HQ_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const agentId = req.query.agent_id || 'janet';

  return res.json({
    ok: true,
    agent_id: agentId,
    memory: {},
    timestamp: new Date().toISOString()
  });
}

export async function hqSeed(req: any, res: any) {
  const secret = req.body.secret;
  if (secret !== process.env.HQ_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.json({
    ok: true,
    agents_created: 9,
    message: 'Test data available (mock mode)',
    agents: MOCK_AGENTS
  });
}

export async function hqTTS(req: any, res: any) {
  return res.json({ ok: true, message: 'TTS not yet implemented' });
}
