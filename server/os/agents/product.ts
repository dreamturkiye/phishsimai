import { rememberFact } from '../memory'

export interface ProductReport {
  topFeature:string; backlog:string[]; architectTasksQueued:string[]
}

export async function runProductAgent(companyId='phishsimai'): Promise<ProductReport> {
  const backlog = [
    'MSP white-label portal with client sub-accounts — unlocks entire MSP channel (HIGH)',
    'HIPAA/SOC2 compliance report auto-generation — closes enterprise deals (HIGH)',
    'Outlook/Teams phish-report add-in — differentiator vs KnowBe4 (MEDIUM)',
    'AI phishing templates that auto-update weekly (MEDIUM)',
    'Slack notification on employee click (LOW)',
  ]
  await rememberFact({ company_id:companyId, type:'strategic', key:`product_${Date.now()}`,
    value:backlog[0], confidence:0.9, source:'product_agent' })
  return { topFeature:backlog[0], backlog, architectTasksQueued:[backlog[0]] }
}
