import { Connection } from '@tidbcloud/serverless';
import { Groq } from 'groq-sdk';
import Telegram from 'node-telegram-bot-api';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const db = new Connection({ url: process.env.DATABASE_URL });
const tg = new Telegram(process.env.TELEGRAM_BOT_TOKEN || '');

// ── HQ Data Endpoint — Dashboard Status ──────────────────────────────────────
export async function hqData(req: any, res: any) {
  try {
    // Fetch agent health
    const agents = await db.execute(
      'SELECT id, name, status, last_seen, health_check_result FROM agent_status ORDER BY name'
    );

    // Fetch recent tasks
    const tasks = await db.execute(
      `SELECT id, task, status, created_at FROM agent_tasks 
       ORDER BY created_at DESC LIMIT 10`
    );

    // Fetch recent completions for metrics
    const completions = await db.execute(
      `SELECT COUNT(*) as total_completed, COUNT(CASE WHEN status = 'success' THEN 1 END) as successful
       FROM completions WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );

    const comp = completions[0] || { total_completed: 0, successful: 0 };
    const successRate = comp.total_completed > 0 
      ? Math.round((comp.successful / comp.total_completed) * 100)
      : 0;

    res.json({
      agents: agents || [],
      agentCount: agents?.length || 0,
      healthyCount: agents?.filter((a: any) => a.health_check_result === 'healthy').length || 0,
      recentTasks: tasks || [],
      metrics: {
        completedToday: comp.total_completed || 0,
        successRate: successRate,
        bounceRate: 0
      }
    });
  } catch (e: any) {
    console.error('[hqData]', e.message);
    res.status(500).json({ error: 'hqData failed', detail: e.message });
  }
}

// ── HQ Chat Endpoint — Message to Janet/Agents ──────────────────────────────
export async function hqChat(req: any, res: any) {
  try {
    const { message, agent_name } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const targetAgent = agent_name || 'janet';

    // Get agent's memory context
    const memory = await db.execute(
      'SELECT memory_text FROM agent_memory WHERE agent_name = ? ORDER BY created_at DESC LIMIT 5',
      [targetAgent]
    );

    const memoryContext = memory.map((m: any) => m.memory_text).join('\n');

    // Route through Groq
    const response = await groq.chat.completions.create({
      model: 'llama3-70b-8192',
      messages: [
        {
          role: 'system',
          content: `You are ${targetAgent}, a specialist agent in Kaan AI OS v4. Context: ${memoryContext}`
        },
        { role: 'user', content: message }
      ],
      max_tokens: 500
    });

    const reply = response.choices[0]?.message?.content || '';

    // Store in memory
    await db.execute(
      'INSERT INTO agent_memory (agent_name, memory_text, created_at) VALUES (?, ?, NOW())',
      [targetAgent, `[CHAT] User: ${message}\nReply: ${reply}`]
    );

    res.json({ agent: targetAgent, reply });
  } catch (e: any) {
    console.error('[hqChat]', e.message);
    res.status(500).json({ error: 'hqChat failed', detail: e.message });
  }
}

// ── HQ Task Endpoint — Create Architect Task ────────────────────────────────
export async function hqTask(req: any, res: any) {
  try {
    const { task, assignee } = req.body;
    if (!task) return res.status(400).json({ error: 'task required' });

    const result = await db.execute(
      `INSERT INTO agent_tasks (task, assignee, status, created_at) 
       VALUES (?, ?, 'pending', NOW())`,
      [task, assignee || 'architect']
    );

    // Notify via Telegram
    if (process.env.TELEGRAM_CHAT_ID && task.length > 0) {
      await tg.sendMessage(
        process.env.TELEGRAM_CHAT_ID,
        `🏗️ ARCHITECT TASK\n${task.substring(0, 200)}`
      ).catch(() => {});
    }

    res.json({ 
      taskId: result.insertId, 
      status: 'pending',
      task 
    });
  } catch (e: any) {
    console.error('[hqTask]', e.message);
    res.status(500).json({ error: 'hqTask failed', detail: e.message });
  }
}

// ── HQ Memory Endpoint — Fetch Agent Memory ─────────────────────────────────
export async function hqMemoryGet(req: any, res: any) {
  try {
    const { agent } = req.query;
    const agentName = agent || 'janet';

    const memory = await db.execute(
      `SELECT memory_text, created_at FROM agent_memory 
       WHERE agent_name = ? 
       ORDER BY created_at DESC LIMIT 20`,
      [agentName]
    );

    res.json({ agent: agentName, memory: memory || [] });
  } catch (e: any) {
    console.error('[hqMemoryGet]', e.message);
    res.status(500).json({ error: 'hqMemoryGet failed', detail: e.message });
  }
}

// ── HQ Seed Endpoint — Initialize Test Data ────────────────────────────────
export async function hqSeed(req: any, res: any) {
  try {
    const agents = [
      { name: 'janet', title: 'Chief Growth Officer', status: 'online' },
      { name: 'marcus', title: 'Senior Sales Director', status: 'online' },
      { name: 'aria', title: 'VP of Marketing', status: 'online' },
      { name: 'nova', title: 'Head of Product Growth', status: 'online' },
      { name: 'rex', title: 'Revenue Operations Manager', status: 'online' },
      { name: 'scout', title: 'Head of Market Intelligence', status: 'online' },
      { name: 'finn', title: 'Chief Financial Officer', status: 'online' },
      { name: 'vera', title: 'VP of Customer Success', status: 'online' },
      { name: 'max', title: 'Chief of Staff', status: 'online' }
    ];

    for (const agent of agents) {
      await db.execute(
        `INSERT INTO agent_status (name, title, status, health_check_result, last_seen) 
         VALUES (?, ?, ?, 'healthy', NOW())
         ON DUPLICATE KEY UPDATE status = ?, last_seen = NOW()`,
        [agent.name, agent.title, agent.status, agent.status]
      );
    }

    res.json({ seeded: agents.length });
  } catch (e: any) {
    console.error('[hqSeed]', e.message);
    res.status(500).json({ error: 'hqSeed failed', detail: e.message });
  }
}
