/** Replicate Flux image generation — same pattern as ScrollFuel UGC agency. */

export async function createReplicatePrediction(
  prompt: string,
  opts: { aspectRatio?: string; referenceImageUrl?: string } = {}
): Promise<{ id: string; status: string; output?: string | string[] }> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new Error('REPLICATE_API_TOKEN missing')

  const modelSlug = process.env.REPLICATE_MODEL || 'black-forest-labs/flux-1.1-pro'
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: opts.aspectRatio || '16:9',
    output_format: 'webp',
    output_quality: 90,
    safety_tolerance: 2,
    prompt_upsampling: true,
    num_inference_steps: 28,
    guidance_scale: 3.5,
  }

  if (opts.referenceImageUrl) {
    // Flux 1.1 Pro does not accept image inputs — skip to avoid 422 errors
  }

  const isOfficial = modelSlug.startsWith('black-forest-labs/')
  const url = isOfficial
    ? `https://api.replicate.com/v1/models/${modelSlug}/predictions`
    : 'https://api.replicate.com/v1/predictions'
  const body = isOfficial ? { input } : { version: modelSlug, input }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Replicate failed (${res.status}): ${errText.slice(0, 300)}`)
  }
  return res.json()
}

export async function pollReplicatePrediction(
  id: string,
  maxWaitMs = 180000
): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new Error('REPLICATE_API_TOKEN missing')

  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Token ${token}` },
    })
    if (!res.ok) throw new Error(`Replicate poll failed (${res.status})`)
    const result = await res.json()
    if (result.status === 'succeeded') {
      const out = result.output
      const url = Array.isArray(out) ? out[0] : out
      if (!url || typeof url !== 'string') throw new Error('Replicate returned no image URL')
      return url
    }
    if (result.status === 'failed' || result.status === 'canceled') {
      throw new Error(result.error || `Replicate ${result.status}`)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Replicate timed out')
}

export async function generateReplicateImageUrl(
  prompt: string,
  opts: { aspectRatio?: string; referenceImageUrl?: string } = {}
): Promise<string> {
  const prediction = await createReplicatePrediction(prompt, opts)
  if (prediction.status === 'succeeded') {
    const out = prediction.output
    const url = Array.isArray(out) ? out[0] : out
    if (url && typeof url === 'string') return url
  }
  return pollReplicatePrediction(prediction.id)
}
