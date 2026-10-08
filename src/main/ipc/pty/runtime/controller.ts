import { readMainTerminalBufferSnapshot } from '../../../runtime/terminal-main-buffer-snapshot'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { claimRuntimePaneCreate, makePaneSpawnReservationKey } from '../pane/spawn-reservation'
import { stopRendererPtyWithEvidence } from './renderer-pty-stop'
import type { PtyRuntimeControllerDeps } from './controller-deps'
import { listPtyProviderSessions } from '../listed-sessions'
import { spawnPtyFromRuntimeController } from './spawn'
import {
  killPtyFromRuntimeController,
  retireRejectedPtyFromRuntimeController,
  stopAndWaitPtyFromRuntimeController
} from './kill'
import {
  attachPtyFromRuntimeController,
  clearBufferFromRuntimeController,
  resetInputModesFromRuntimeController,
  sendSignalFromRuntimeController,
  confirmForegroundProcessFromRuntimeController,
  confirmShellForegroundFromRuntimeController,
  getCwdFromRuntimeController,
  getForegroundProcessFromRuntimeController,
  getRendererSerializerGenerationFromRuntimeController,
  getSizeFromRuntimeController,
  getAppliedSizeFromRuntimeController,
  hasChildProcessesFromRuntimeController,
  hasPtyFromRuntimeController,
  hasRendererSerializerFromRuntimeController,
  inspectProcessFromRuntimeController,
  probePtyLivenessFromRuntimeController,
  resizePtyFromRuntimeController,
  serializeProviderBufferFromRuntimeController,
  waitForRendererSerializerFromRuntimeController,
  writePtyFromRuntimeController
} from './operations'
import { recordUnconfirmedExplicitSshStop } from './undelivered-ssh-kill'
import { supportsForegroundProcessEvidenceFromRuntimeController } from './foreground-process-evidence-capability'
import {
  listProcessesFromRuntimeController,
  listProcessesWithHostScopeFromRuntimeController
} from './inventory-operations'

import { createCodexPaneSharedServerCommands } from '../../../codex/codex-pane-shared-server-commands'

export function installPtyRuntimeController(deps: PtyRuntimeControllerDeps): void {
  const { runtime, adoptStablePane, requestSerializedBuffer } = deps

  runtime?.setPtyController({
    codexSharedServer: createCodexPaneSharedServerCommands(deps),
    claimStablePaneCreate: (args) => {
      const paneKey = makePaneKey(args.tabId, args.leafId)
      const ownerKey = makePaneSpawnReservationKey(args.worktreeId, args.connectionId, paneKey)
      return ownerKey ? claimRuntimePaneCreate(ownerKey) : () => {}
    },
    adoptStablePane,
    listSessions: (scope) =>
      listPtyProviderSessions(() => deps.getLocalPtyProviderStartupPromise(), scope),
    spawn: async (args) => spawnPtyFromRuntimeController(deps, args),
    write: (ptyId, data, inputKind) => writePtyFromRuntimeController(deps, ptyId, data, inputKind),
    writeWithSettlement: (ptyId, data, inputKind) =>
      writePtyFromRuntimeController(deps, ptyId, data, inputKind, { waitForSettlement: true }),
    probePtyLiveness: (ptyId) => probePtyLivenessFromRuntimeController(deps, ptyId),
    // Why: subscriber-driven ingestion for daemon sessions no renderer pane
    // ever attached. Local daemon sessions only — SSH panes have their own
    // lease machinery, and the in-process local provider streams without
    // attach. Attach-only and false-on-doubt: never creates or resizes.
    attach: (ptyId) => attachPtyFromRuntimeController(deps, ptyId),
    kill: (ptyId) => killPtyFromRuntimeController(deps, ptyId),
    sendSignal: (ptyId, signal) => sendSignalFromRuntimeController(ptyId, signal),
    retireRejectedPty: (ptyId, stopConfirmed) =>
      retireRejectedPtyFromRuntimeController(deps, ptyId, stopConfirmed),
    stopAndWait: (ptyId, opts) => stopAndWaitPtyFromRuntimeController(deps, ptyId, opts),
    stopRendererOwnedPty: (ptyId, options, assertOwner) =>
      stopRendererPtyWithEvidence(deps, ptyId, options, assertOwner),
    recordUnconfirmedStop: (ptyId) =>
      recordUnconfirmedExplicitSshStop({
        store: deps.store,
        ptyId,
        reversible: runtime?.intentionalPtyStops?.isReversibleStopInFlight(ptyId) ?? false
      }),
    getForegroundProcess: (ptyId) => getForegroundProcessFromRuntimeController(ptyId),
    inspectProcess: (ptyId, options) => inspectProcessFromRuntimeController(ptyId, options),
    confirmForegroundProcess: (ptyId) => confirmForegroundProcessFromRuntimeController(ptyId),
    confirmShellForeground: (ptyId) => confirmShellForegroundFromRuntimeController(ptyId),
    getCwd: (ptyId) => getCwdFromRuntimeController(ptyId),
    hasChildProcesses: (ptyId) => hasChildProcessesFromRuntimeController(ptyId),
    clearBuffer: (ptyId) => clearBufferFromRuntimeController(deps, ptyId),
    resetInputModes: (ptyId) => resetInputModesFromRuntimeController(deps, ptyId),
    hasPty: (ptyId) => hasPtyFromRuntimeController(deps, ptyId),
    listProcesses: (connectionId, opts) =>
      listProcessesFromRuntimeController(deps, connectionId, opts),
    listProcessesWithHostScope: (opts) =>
      listProcessesWithHostScopeFromRuntimeController(deps, opts),
    supportsForegroundProcessEvidence: (connectionId) =>
      supportsForegroundProcessEvidenceFromRuntimeController(connectionId),
    getMainBufferSnapshot: (ptyId, opts) =>
      deps.pendingData
        ? readMainTerminalBufferSnapshot(runtime, deps.pendingData, { id: ptyId, opts })
        : Promise.resolve(null),
    serializeBuffer: (ptyId, opts) => {
      // Why: mobile xterm must start from the desktop's exact screen state/dimensions before live TUI chunks render correctly.
      return requestSerializedBuffer(ptyId, opts)
    },
    serializeProviderBuffer: (ptyId, opts) =>
      serializeProviderBufferFromRuntimeController(ptyId, opts),
    hasRendererSerializer: (ptyId) => hasRendererSerializerFromRuntimeController(ptyId),
    getRendererSerializerGeneration: (ptyId) =>
      getRendererSerializerGenerationFromRuntimeController(ptyId),
    waitForRendererSerializer: (ptyId, afterGeneration, timeoutMs, signal) =>
      waitForRendererSerializerFromRuntimeController(ptyId, afterGeneration, timeoutMs, signal),
    getSize: (ptyId) => getSizeFromRuntimeController(ptyId),
    getAppliedSize: (ptyId) => getAppliedSizeFromRuntimeController(ptyId),
    resize: (ptyId, cols, rows) => resizePtyFromRuntimeController(ptyId, cols, rows)
  })
}
