import axios from 'axios'

const AGENTS: Record<string, { url: string }> = {
  janet: { url: 'https://janet.phishsimai.com' },
  // Add other agents here
}

export const talkToAgent = async (agentId: string, prompt: string, companyId: string, debug: boolean) => {
  const agent = AGENTS[agentId]
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`)
  }
  const url = agent.url
  const headers = {
    'Content-Type': 'application/json',
    'X-Company-Id': companyId,
  }
  const data = { prompt }
  try {
    const response = await axios.post(url, data, { headers, timeout: 10000 })
    return response.data
  } catch (error) {
    if (debug) {
      console.error(`Error talking to agent ${agentId}:`, error)
    }
    throw error
  }
}