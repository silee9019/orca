import { join } from 'node:path'

export type RuntimeTransportMetadata =
  | {
      kind: 'unix'
      endpoint: string
    }
  | {
      kind: 'named-pipe'
      endpoint: string
    }
  | {
      kind: 'websocket'
      endpoint: string
    }

export type RuntimeMetadata = {
  agentAwakeStreaming?: 1
  runtimeId: string
  remoteWorkspaceStreaming?: 1
  pid: number
  terminalPresentationStreaming?: 1
  transports: RuntimeTransportMetadata[]
  authToken: string | null
  nativeChatStreaming?: 1
  structuredHeldStreaming?: 1
  agentStatusStreaming?: 1
  agentStatusMigrationStreaming?: 1
  agentWorkerRecoveryStreaming?: 1
  terminalEffectsStreaming?: 1
  terminalExitStreaming?: 1
  terminalSpawnStreaming?: 1
  terminalControlStreaming?: 1
  terminalModelRestoreStreaming?: 1
  rendererDeliveryResyncStreaming?: 1
  terminalRendererDataStreaming?: 1
  terminalRendererReplayStreaming?: 1
  terminalPreviewDataStreaming?: 1
  startedAt: number
}

// Why: the CLI must handle metadata files written by older Orca versions that
// used a singular `transport` field. This helper extracts the first transport
// matching the given kinds from either the new `transports` array or the
// legacy `transport` field.
export function findTransport(
  metadata: RuntimeMetadata,
  ...kinds: RuntimeTransportMetadata['kind'][]
): RuntimeTransportMetadata | null {
  const transports = metadata.transports
  if (transports && Array.isArray(transports)) {
    return transports.find((t) => kinds.includes(t.kind)) ?? null
  }
  // Why: backward compatibility with pre-transports-array metadata files.
  const legacy = (metadata as Record<string, unknown>).transport as RuntimeTransportMetadata | null
  if (legacy && kinds.includes(legacy.kind)) {
    return legacy
  }
  return null
}

const PRIMARY_RUNTIME_METADATA_FILE = 'orca-runtime.json'

export function getRuntimeMetadataPath(userDataPath: string): string {
  return join(userDataPath, PRIMARY_RUNTIME_METADATA_FILE)
}
