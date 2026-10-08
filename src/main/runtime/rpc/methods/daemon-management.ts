import { defineMethod } from '../core'
import {
  DaemonManagementListParams,
  DaemonManagementStopManyParams,
  DaemonManagementStopParams
} from '../../../../shared/rpc-contract/daemon-management-params'
import {
  listManagedDaemonSessions,
  stopManagedDaemonSession
} from '../../../daemon/daemon-management'

export const DAEMON_MANAGEMENT_METHODS = [
  defineMethod({
    name: 'daemon.sessions.list',
    params: DaemonManagementListParams,
    handler: () => listManagedDaemonSessions()
  }),
  defineMethod({
    name: 'daemon.sessions.stop',
    params: DaemonManagementStopParams,
    handler: (params) => stopManagedDaemonSession(params)
  }),
  defineMethod({
    name: 'daemon.sessions.stopMany',
    params: DaemonManagementStopManyParams,
    handler: async (params) => ({
      results: await Promise.all(
        params.targets.map(async (target) => {
          try {
            return await stopManagedDaemonSession(target)
          } catch {
            return {
              target,
              refused: true,
              verdict: { status: 'unverifiable', reason: 'The target could not be safely stopped.' }
            }
          }
        })
      )
    })
  })
]
