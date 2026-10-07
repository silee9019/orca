type ProvisionObservation = {
  provisionId: string
  state: 'running' | 'succeeded' | 'failed' | 'cancel-requested'
  stdoutBytes: number
  stderrBytes: number
  updatedAt: number
}
const observations = new Map<string, ProvisionObservation>()

export function beginVmProvisionObservation(provisionId: string): void {
  const existing = observations.get(provisionId)
  if (existing?.state === 'running' || existing?.state === 'cancel-requested') {
    throw new Error('provision_id_in_use')
  }
  for (const [id, value] of observations) {
    if (observations.size < 100) {
      break
    }
    if (value.state === 'succeeded' || value.state === 'failed') {
      observations.delete(id)
    }
  }
  if (observations.size >= 100) {
    throw new Error('provision_observation_capacity')
  }
  observations.set(provisionId, {
    provisionId,
    state: 'running',
    stdoutBytes: 0,
    stderrBytes: 0,
    updatedAt: Date.now()
  })
}
export function observeVmProvisionOutput(
  provisionId: string,
  stream: 'stdout' | 'stderr',
  chunk: string
): void {
  const value = observations.get(provisionId)
  if (!value) {
    return
  }
  if (stream === 'stdout') {
    value.stdoutBytes += Buffer.byteLength(chunk)
  } else {
    value.stderrBytes += Buffer.byteLength(chunk)
  }
  value.updatedAt = Date.now()
}
export function updateVmProvisionObservation(
  provisionId: string,
  state: ProvisionObservation['state']
): void {
  const value = observations.get(provisionId)
  if (!value) {
    return
  }
  value.state = state
  value.updatedAt = Date.now()
}
export function readVmProvisionObservation(provisionId: string): ProvisionObservation {
  const value = observations.get(provisionId)
  if (!value) {
    throw new Error('provision_observation_not_found')
  }
  return { ...value }
}
