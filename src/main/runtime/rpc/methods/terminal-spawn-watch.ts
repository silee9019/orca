import { defineStreamingMethod } from '../core'
import {
  TerminalSpawnSubscriptionParams,
  TerminalSpawnAnnouncement
} from '../../../../shared/rpc-contract/terminal-spawn-watch-params'
import { subscribePtySpawned } from '../../pty-spawn-observers'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'

export const TERMINAL_SPAWN_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'terminal.spawn.subscribe',
    params: TerminalSpawnSubscriptionParams,
    handler: async (params, context, emit) => {
      const hosts = new Set(params.executionHostIds),
        ptys = new Set(params.ptyIds)
      const stream = createRuntimeJsonEventSubscription(
        context,
        'terminalSpawn',
        params.subscriptionId,
        emit,
        () => {}
      )
      const fail = () => {
        emit({ type: 'error', code: 'terminal_spawn_unavailable' })
        stream.close()
      }
      try {
        stream.register(
          subscribePtySpawned(
            context.runtime,
            (announcement) => {
              if (
                !hosts.has(announcement.executionHostId) ||
                (ptys.size > 0 && !ptys.has(announcement.ptyId))
              ) {
                return
              }
              const parsed = TerminalSpawnAnnouncement.safeParse(announcement)
              if (!parsed.success) {
                fail()
                return
              }
              stream.event({ announcement: parsed.data })
            },
            fail
          )
        )
        stream.ready({ executionHostIds: params.executionHostIds, ptyIds: params.ptyIds })
      } catch (error) {
        stream.close()
        throw error
      }
    }
  })
]
