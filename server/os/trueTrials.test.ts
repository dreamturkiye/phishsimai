import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  isNonCustomerOrg,
  NON_CUSTOMER_ORG_NAMES,
  TRUE_TRIAL_EXCLUSION_RULES,
  trueTrialExcludedSql,
} from './trueTrials'

describe('isNonCustomerOrg — owner 2026-09-14 live DB fixtures', () => {
  it('keeps Grey Box Consulting as a true customer trial', () => {
    expect(isNonCustomerOrg({ name: 'Grey Box Consulting', adminEmail: 'ops@greybox.example', orgId: 42 })).toBe(false)
  })

  it('excludes Signup Canary, test, walkthrough, and Adeo', () => {
    expect(isNonCustomerOrg({ name: "Signup Canary's organization" })).toBe(true)
    expect(isNonCustomerOrg({ name: 'Signup Canary Org' })).toBe(true)
    expect(isNonCustomerOrg({ name: 'test' })).toBe(true)
    expect(isNonCustomerOrg({ name: 'TEST' })).toBe(true)
    expect(isNonCustomerOrg({ name: 'Trial Walkthrough Co' })).toBe(true)
    expect(isNonCustomerOrg({ name: 'Adeo' })).toBe(true)
    expect(isNonCustomerOrg({ name: 'adeo' })).toBe(true)
  })

  it('excludes founder/test admin emails and canary addresses, not a real MSP', () => {
    expect(isNonCustomerOrg({ name: 'Acme MSP', adminEmail: 'kaanari@mac.com' })).toBe(true)
    expect(isNonCustomerOrg({ name: 'Acme MSP', adminEmail: 'canary+1@example.com' })).toBe(true)
    expect(isNonCustomerOrg({ name: 'Acme MSP', adminEmail: 'bot@phishsimai.com' })).toBe(true)
    expect(isNonCustomerOrg({ name: 'Acme MSP', adminEmail: 'owner@acmemsp.com' })).toBe(false)
  })

  it('does not slug-match phishsim (would drop PhishSim Partners)', () => {
    expect(isNonCustomerOrg({ name: 'PhishSim Partners', adminEmail: 'hello@partners.example' })).toBe(false)
    expect(TRUE_TRIAL_EXCLUSION_RULES).not.toMatch(/contains phishsim/)
    expect(NON_CUSTOMER_ORG_NAMES).toContain('adeo')
    expect(NON_CUSTOMER_ORG_NAMES).toContain("signup canary's organization")
  })

  it('SQL helper names the canary/walkthrough/Adeo rules without a phishsim slug', () => {
    const sql = trueTrialExcludedSql()
    expect(sql).toMatch(/%canary%/i)
    expect(sql).toMatch(/%walkthrough%/i)
    expect(sql).toContain("'adeo'")
    expect(sql).not.toMatch(/ILIKE '%phishsim%'/)
  })
})

describe('true-trial exclusion is wired into every operating count path', () => {
  it('founder brief, Mason, funnel health, CGO goals, and OS load use the canonical helper or name rules', () => {
    const founder = readFileSync('server/os/founderBrief.ts', 'utf8')
    const mason = readFileSync('server/os/agents/mason.ts', 'utf8')
    const funnel = readFileSync('server/os/funnelHealth.ts', 'utf8')
    const goals = readFileSync('server/os/cgoGoals.ts', 'utf8')
    const os = readFileSync('server/lib/kaan_os_v4.ts', 'utf8')
    const nudges = readFileSync('server/os/trialNudges.ts', 'utf8')
    expect(founder).toContain('measureTrueOrgCounts')
    expect(mason).toContain('measureTrueOrgCounts')
    expect(funnel).toContain('countTrueOrgCreates')
    expect(goals).toContain('%canary%')
    expect(goals).toContain('NON_CUSTOMER_ORG_NAMES')
    expect(os).toContain('measureTrueOrgCounts')
    expect(os).toContain('TRUE-TRIAL DROUGHT')
    expect(nudges).toContain('isNonCustomerOrg')
  })
})
