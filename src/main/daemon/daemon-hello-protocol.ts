export const DAEMON_INCARNATION_FENCED_KILL_CAPABILITY = 'session.incarnation-fenced-kill.v1'

export type HelloMessage = {
  type: 'hello'
  version: number
  token: string
  clientId: string
  role: 'control' | 'stream'
}

export type DaemonEndpointIdentity = {
  pid: number
  startedAtMs: number
  launchNonce: string
  /** Optional launch metadata. Absent from daemons that predate it; readers must fall back. */
  entryPath?: string
  appVersion?: string
  spawnerExecPath?: string
}

export type HelloResponse = {
  type: 'hello'
  ok: boolean
  error?: string
  daemonIdentity?: DaemonEndpointIdentity
  capabilities?: readonly string[]
}
