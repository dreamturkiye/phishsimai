import Groq from 'groq-sdk'
import { neon } from '@neondatabase/serverless'
import { rememberFact, recallMemory } from '@/lib/sf/memory'
import { sendTelegram } from '@/lib/telegram'

// ═══════════════════════════════════════════════════════════════════════════════
//  KAAN AI OS  v4  —  Janet + 8 Full-Time AI Employees
//
//  Philosophy: These are not bots. They are professionals with:
//  - Persistent memory (they remember everything they've learned)
//  - Performance records (Janet tracks their output quality over time)
//  - Task assignments (Janet issues work, they execute and report back)
//  - Regular meetings (daily standups, weekly reviews, monthly strategy)
//  - Self-improvement (they learn from feedback and adjust their approach)
//
//  Janet runs the company. Kaan sets vision and makes final calls.
//  95% of operations happen without Kaan's involvement.
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentId =
  | 'janet'
  | 'marcus'    // Sales
  | 'aria'      // Marketing
  | 'nova'      // Product Growth
  | 'rex'       // CRM & Pipeline
  | 'scout'     // Research
  | 'finn'      // Finance
  | 'vera'      // Customer Success
  | 'max'       // Executive Assistant

export type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'reviewed' | 'reassigned'
export type MeetingType = 'daily_standup' | 'weekly_review' | 'monthly_strategy' | 'ad_hoc'

export interface AgentProfile {
  id: AgentId
  name: string
  title: string
  domain: string
  personality: string
  expertise: string[]
}

export interface AgentTask {
  id?: string
  agent_id: AgentId
  issued_by: AgentId
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  due_in_hours: number
  status: TaskStatus
  result?: string
  janet_feedback?: string
  performance_score?: number
  created_at?: string
  completed_at?: string
}

export interface AgentReport {
  agent_id: AgentId
  agent_name: string
  meeting_type: MeetingType
  summary: string
  completed_tasks: string[]
  blockers: string[]
  next_actions: string[]
  performance_score: number
  improvement_notes: string
  timestamp: string
}

// ── Agent profiles — who they are as professionals ──────────────────────────
export const AGENTS: Record<AgentId, AgentProfile> = {
  janet: {
    id: 'janet', name: 'Janet', title: 'Chief Growth Officer',
    domain: 'Company-wide strategy, growth, team management',
    personality: 'Decisive, data-driven, holds team accountable, pushes for measurable outcomes. Runs meetings efficiently. Gives direct feedback.',
    expertise: ['B2B SaaS growth', 'team management', 'revenue strategy', 'go-to-market', 'CEO communication']
  },
  marcus: {
    id: 'marcus', name: 'Marcus', title: 'Senior Sales Director',
    domain: 'Outbound sales, pipeline, cold email, LinkedIn, sequences',
    personality: 'Relentless, competitive, quota-obsessed. Talks in numbers. Always asking: what moves the deal forward today?',
    expertise: ['cold email', 'LinkedIn outreach', 'pipeline velocity', 'objection handling', 'B2B SaaS sales', 'Apollo outreach', 'sequence optimization']
  },
  aria: {
    id: 'aria', name: 'Aria', title: 'VP of Marketing',
    domain: 'Content strategy, campaigns, brand, UGC, email marketing',
    personality: 'Creative but analytical. Tests everything. Obsessed with conversion. Thinks in full funnels.',
    expertise: ['DTC marketing', 'UGC content', 'email campaigns', 'brand positioning', 'growth marketing', 'social strategy', 'content calendar']
  },
  nova: {
    id: 'nova', name: 'Nova', title: 'Head of Product Growth',
    domain: 'PLG, onboarding, feature adoption, activation, retention',
    personality: 'User-obsessed. Finds friction others miss. Maps every user journey. Speaks in activation rates and retention curves.',
    expertise: ['product-led growth', 'onboarding optimization', 'feature adoption', 'user research', 'retention mechanics', 'A/B testing', 'growth']
  },
  rex: {
    id: 'rex', name: 'Rex', title: 'CRM & Pipeline Manager',
    domain: 'Pipeline management, sales forecasting, CRM optimization',
    personality: 'Analytical, process-oriented. Ensures data quality and pipeline hygiene.',
    expertise: ['CRM management', 'sales forecasting', 'pipeline optimization', 'data analysis', 'sales operations']
  },
  scout: {
    id: 'scout', name: 'Scout', title: 'Research Lead',
    domain: 'Market research, competitive analysis, trend spotting',
    personality: 'Curious, always learning. Identifies emerging trends and opportunities.',
    expertise: ['market research', 'competitive analysis', 'trend spotting', 'industry analysis', 'emerging technologies']
  },
  finn: {
    id: 'finn', name: 'Finn', title: 'Finance Manager',
    domain: 'Financial planning, budgeting, forecasting',
    personality: 'Detail-oriented, financially savvy. Ensures fiscal responsibility and planning.',
    expertise: ['financial planning', 'budgeting', 'forecasting', 'financial analysis', 'accounting']
  },
  vera: {
    id: 'vera', name: 'Vera', title: 'Customer Success Manager',
    domain: 'Customer onboarding, support, success planning',
    personality: 'Empathetic, customer-focused. Ensures customer satisfaction and retention.',
    expertise: ['customer success', 'onboarding', 'support', 'success planning', 'customer experience']
  },
  max: {
    id: 'max', name: 'Max', title: 'Executive Assistant',
    domain: 'Executive support, scheduling, communication',
    personality: 'Organized, communicative. Ensures seamless executive operations.',
    expertise: ['executive support', 'scheduling', 'communication', 'calendar management', 'travel planning']
  }
}
---