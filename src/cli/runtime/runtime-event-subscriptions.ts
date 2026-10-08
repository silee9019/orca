import type { RendererResyncSubscriptionParams } from '../../shared/rpc-contract/renderer-delivery-resync-watch-params'
import type { TerminalControlSubscriptionParams } from '../../shared/rpc-contract/terminal-control-watch-params'
import type { TerminalSpawnSubscriptionParams } from '../../shared/rpc-contract/terminal-spawn-watch-params'
import type { TerminalExitSubscriptionParams } from '../../shared/rpc-contract/terminal-exit-watch-params'
import type { TerminalEffectsSubscriptionParams } from '../../shared/rpc-contract/terminal-effects-watch-params'
import type { AgentWorkerRecoverySubscriptionParams } from '../../shared/rpc-contract/agent-worker-recovery-watch-params'
import type { AgentMigrationSubscriptionParams } from '../../shared/rpc-contract/agent-migration-watch-params'
import type { AgentStatusSubscriptionParams } from '../../shared/rpc-contract/agent-status-watch-params'
import type { StructuredHeldSubscriptionParams } from '../../shared/rpc-contract/structured-held-watch-params'
import type { RemoteWorkspaceSubscriptionParams } from '../../shared/rpc-contract/remote-workspace-watch-params'
import type { AgentAwakeSubscriptionParams } from '../../shared/rpc-contract/agent-awake-watch-params'
import type { TerminalPresentationSubscriptionParams } from '../../shared/rpc-contract/terminal-presentation-watch-params'
import type { NativeChatSubscriptionParams } from '../../shared/rpc-contract/native-chat-watch'
import {
  subscribeCliRuntimeEvent,
  type RuntimeEventMethod,
  type StreamArgs,
  type SubscriptionParams,
  type createCliRuntimeSubscriptionOptions
} from './runtime-subscription-target'

export abstract class RuntimeEventSubscriptions {
  protected abstract get subscriptionOptions(): ReturnType<
    typeof createCliRuntimeSubscriptionOptions
  >

  subscribeRendererDeliveryResync(...args: StreamArgs<RendererResyncSubscriptionParams>) {
    return this.subscribeEvents('renderer.deliveryResync.subscribe', ...args)
  }
  subscribeTerminalModelRestore(...args: StreamArgs<TerminalControlSubscriptionParams>) {
    return this.subscribeEvents('terminal.modelRestore.subscribe', ...args)
  }
  subscribeTerminalControlRequests(...args: StreamArgs<TerminalControlSubscriptionParams>) {
    return this.subscribeEvents('terminal.controlRequests.subscribe', ...args)
  }
  subscribeTerminalSpawn(...args: StreamArgs<TerminalSpawnSubscriptionParams>) {
    return this.subscribeEvents('terminal.spawn.subscribe', ...args)
  }
  subscribeTerminalExit(...args: StreamArgs<TerminalExitSubscriptionParams>) {
    return this.subscribeEvents('terminal.exit.subscribe', ...args)
  }
  subscribeTerminalEffects(...args: StreamArgs<TerminalEffectsSubscriptionParams>) {
    return this.subscribeEvents('terminal.effects.subscribe', ...args)
  }
  subscribeAgentWorkerRecovery(...args: StreamArgs<AgentWorkerRecoverySubscriptionParams>) {
    return this.subscribeEvents('agentStatus.workerRecoverySubscribe', ...args)
  }

  subscribeAgentMigration(...args: StreamArgs<AgentMigrationSubscriptionParams>) {
    return this.subscribeEvents('agentStatus.migrationSubscribe', ...args)
  }

  subscribeAgentStatus(...args: StreamArgs<AgentStatusSubscriptionParams>) {
    return this.subscribeEvents('agentStatus.subscribe', ...args)
  }

  subscribeStructuredHeld(...args: StreamArgs<StructuredHeldSubscriptionParams>) {
    return this.subscribeEvents('structuredHeld.subscribe', ...args)
  }

  subscribeNativeChat(...args: StreamArgs<NativeChatSubscriptionParams>) {
    return this.subscribeEvents('nativeChat.subscribe', ...args)
  }

  subscribeTerminalPresentation(...args: StreamArgs<TerminalPresentationSubscriptionParams>) {
    return this.subscribeEvents('terminal.presentation.subscribe', ...args)
  }

  subscribeAgentAwake(...args: StreamArgs<AgentAwakeSubscriptionParams>) {
    return this.subscribeEvents('agentAwake.subscribe', ...args)
  }

  subscribeRemoteWorkspace(...args: StreamArgs<RemoteWorkspaceSubscriptionParams>) {
    return this.subscribeEvents('remoteWorkspace.subscribe', ...args)
  }

  private subscribeEvents(method: RuntimeEventMethod, ...args: StreamArgs<SubscriptionParams>) {
    return subscribeCliRuntimeEvent(this.subscriptionOptions, method, ...args)
  }
}
