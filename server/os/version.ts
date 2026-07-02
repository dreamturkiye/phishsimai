/** Re-export unified L5 version — source of truth: server/os/kaan-os-core/version.ts */
import { KAAN_OS_LABEL } from './kaan-os-core/version'

export {
  KAAN_OS_VERSION,
  KAAN_OS_SPEC,
  KAAN_OS_AUTONOMY,
  KAAN_OS_LABEL,
  osVersionForCompany,
} from './kaan-os-core/version'

export const COMPANY_ID = 'phishsimai'

export const KAAN_OS_SYSTEM = `${KAAN_OS_LABEL} — Janet CEO Supervisor + Hierarchical L5 Autonomy`

export const ARCHITECT_SECRET = process.env.ARCHITECT_SECRET || process.env.HQ_SECRET || 'ps-hq-2026'
