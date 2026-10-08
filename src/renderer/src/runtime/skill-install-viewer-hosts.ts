import { SKILL_INSTALL_CAPABILITY } from '../../../shared/skill-install-capability'
import type { SshConnectionState } from '../../../shared/ssh-types'

export function skillInstallViewerHosts({
  runtimeEnvironments,
  runtimeStatus,
  sshTargetLabels,
  sshConnectionStates,
  requiredCapability = SKILL_INSTALL_CAPABILITY
}: {
  runtimeEnvironments: readonly { id: string; createdAt: number; pairingRevision?: number }[]
  runtimeStatus: ReadonlyMap<string, { status: { capabilities?: readonly string[] } | null }>
  sshTargetLabels: ReadonlyMap<string, string>
  sshConnectionStates: ReadonlyMap<string, SshConnectionState>
  requiredCapability?: string
}) {
  const sshConnections = [...sshTargetLabels.entries()].map(([id, label]) => ({
    id,
    label,
    connected: sshConnectionStates.get(id)?.status === 'connected'
  }))
  return {
    sshConnections,
    ownerRevisions: new Map([
      ['local', 'local'],
      ...runtimeEnvironments.map((environment): [string, string] => [
        environment.id,
        String(environment.pairingRevision ?? environment.createdAt)
      ]),
      ...sshConnections.map((connection): [string, string] => {
        const state = sshConnectionStates.get(connection.id)
        return [
          `ssh:${connection.id}`,
          `${state?.connectionGeneration}:${state?.providerEpoch}:${state?.status}`
        ]
      })
    ]),
    availableEnvironments: [
      'local',
      ...runtimeEnvironments
        .filter((environment) => {
          const status = runtimeStatus.get(environment.id)?.status
          return !status || status.capabilities?.includes(requiredCapability) === true
        })
        .map((environment) => environment.id),
      ...sshConnections
        .filter((connection) => connection.connected)
        .map((connection) => `ssh:${connection.id}`)
    ]
  }
}
