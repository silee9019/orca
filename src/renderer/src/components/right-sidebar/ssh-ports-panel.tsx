import {
  portsConnectionId,
  readPortsConnectionId,
  findCurrentSshForward,
  copySshForwardAddress,
  removeSshForward
} from './ssh-forwarded-port-actions'
import { useSshPortsViewer, type SshPortsFormOwner } from '@/runtime/ssh-ports-viewer'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { ChevronRight, Plus, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { resolvePortOpenInOrcaBrowser } from '@/lib/workspace-port-actions'
import { browserUrlForPortForwardEntry } from '@/lib/workspace-port-urls'
import type { EnrichedDetectedPort, PortForwardEntry } from '../../../../shared/ssh-types'
import { translate } from '@/i18n/i18n'
import { openWorkspaceBrowserTab } from '@/lib/workspace-browser-tab-open'
import { SshForwardedPortRow } from './ssh-forwarded-port-row'
import { SshDetectedPortRow } from './ssh-detected-port-row'
import { SshPortForwardDialog, type PortForwardDialogState } from './ssh-port-forward-dialog'

// Why: forwarded SSH ports and detected remote ports may report the same loopback
// endpoint using different textual hosts. Normalize for deduping only.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::'])
function normalizeHost(host: string | undefined): string {
  if (!host || LOOPBACK_HOSTS.has(host)) {
    return 'localhost'
  }
  return host
}

function detectedForConnection(
  targetId: string | null,
  forwards: PortForwardEntry[],
  ports: EnrichedDetectedPort[]
) {
  if (!targetId) {
    return []
  }
  const forwarded = new Set(
    forwards.map((entry) => `${normalizeHost(entry.remoteHost)}:${entry.remotePort}`)
  )
  return ports
    .filter((port) => !forwarded.has(`${normalizeHost(port.host)}:${port.port}`))
    .map((port) => ({ ...port, targetId }))
    .sort((a, b) => a.port - b.port)
}

export function SshPortsPanel(): React.JSX.Element {
  const portForwardsByConnection = useAppStore((s) => s.portForwardsByConnection)
  const detectedPortsByConnection = useAppStore((s) => s.detectedPortsByConnection)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  // Why: scope the panel to the active worktree's SSH connection so
  // actions target the correct machine and the disconnected state
  // reflects the active worktree, not some other SSH session.
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const activeConnectionId = portsConnectionId(
    activeWorktree?.id,
    activeWorktree?.hostId,
    activeRepo?.connectionId
  )

  const isDisconnected = activeConnectionId
    ? sshConnectionStates.get(activeConnectionId)?.status !== 'connected'
    : true

  const allForwards = useMemo(() => {
    if (!activeConnectionId) {
      return []
    }
    return portForwardsByConnection[activeConnectionId] ?? []
  }, [portForwardsByConnection, activeConnectionId])

  const allDetected = useMemo(
    () =>
      detectedForConnection(
        activeConnectionId,
        allForwards,
        activeConnectionId ? (detectedPortsByConnection[activeConnectionId] ?? []) : []
      ),
    [allForwards, detectedPortsByConnection, activeConnectionId]
  )

  const [forwardedCollapsed, setForwardedCollapsed] = useState(false)
  const [detectedCollapsed, setDetectedCollapsed] = useState(false)
  const [dialogState, publishDialogState] = useState<PortForwardDialogState>({ mode: 'closed' })
  const formOwner = useRef<SshPortsFormOwner | null>(null)
  const registerForm = useCallback((owner: SshPortsFormOwner) => {
    formOwner.current = owner
    return () => {
      if (formOwner.current === owner) {
        formOwner.current = null
      }
    }
  }, [])
  const currentDialog = useRef(dialogState)
  const setDialogState = useCallback((state: PortForwardDialogState) => {
    currentDialog.current = state
    publishDialogState(state)
  }, [])

  const handleForwardDetected = useCallback(
    (port: EnrichedDetectedPort & { targetId: string }) => {
      const current = useAppStore.getState()
      if (
        readPortsConnectionId() !== port.targetId ||
        current.sshConnectionStates.get(port.targetId)?.status !== 'connected'
      ) {
        return false
      }
      const canonical = detectedForConnection(
        port.targetId,
        current.portForwardsByConnection[port.targetId] ?? [],
        current.detectedPortsByConnection[port.targetId] ?? []
      ).find(
        (value) =>
          normalizeHost(value.host) === normalizeHost(port.host) && value.port === port.port
      )
      if (!canonical) {
        return false
      }
      setDialogState({
        mode: 'add',
        defaults: {
          remotePort: canonical.port,
          remoteHost: normalizeHost(canonical.host),
          label: canonical.processName,
          targetId: port.targetId
        }
      })
      return true
    },
    [setDialogState]
  )

  const handleEdit = useCallback(
    (entry: PortForwardEntry) => {
      const current = useAppStore.getState()
      if (
        readPortsConnectionId() !== entry.connectionId ||
        current.sshConnectionStates.get(entry.connectionId)?.status !== 'connected'
      ) {
        return false
      }
      const canonical = current.portForwardsByConnection[entry.connectionId]?.find(
        (value) => value.id === entry.id && value.connectionId === entry.connectionId
      )
      if (!canonical) {
        return false
      }
      setDialogState({ mode: 'edit', entry: canonical })
      return true
    },
    [setDialogState]
  )

  const handleOpenForwardInBrowser = useCallback(
    async (
      entry: PortForwardEntry,
      event?: React.MouseEvent<HTMLButtonElement>,
      destination: 'configured' | 'system' | 'orca' = 'configured'
    ): Promise<boolean> => {
      const canonical = findCurrentSshForward(entry.id, entry.connectionId)
      if (
        readPortsConnectionId() !== entry.connectionId ||
        !canonical ||
        useAppStore.getState().activeWorktreeId !== activeWorktree?.id
      ) {
        return false
      }
      const url = browserUrlForPortForwardEntry(canonical)
      const inOrca =
        destination === 'orca' ||
        (destination === 'configured' &&
          resolvePortOpenInOrcaBrowser({
            settings: useAppStore.getState().settings,
            event,
            isMac: navigator.userAgent.includes('Mac')
          }))
      if (!inOrca) {
        try {
          await window.api.shell.openUrl(url)
          return true
        } catch {
          return false
        }
      }
      if (!activeWorktree?.id) {
        toast.error(
          translate(
            'auto.components.right.sidebar.PortsPanel.409afcc145',
            'No workspace selected for the browser.'
          )
        )
        return false
      }
      try {
        await openWorkspaceBrowserTab({
          workspaceId: activeWorktree.id,
          url,
          intent: { kind: 'url' }
        })
        return true
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        return false
      }
    },
    [activeWorktree?.id]
  )

  const handleDialogClose = useCallback(
    (expected?: PortForwardDialogState) => {
      if (expected && currentDialog.current !== expected) {
        return false
      }
      setDialogState({ mode: 'closed' })
      return true
    },
    [setDialogState]
  )

  useSshPortsViewer({
    form: () => formOwner.current,
    read: () => ({
      connectionId: activeConnectionId,
      disconnected: isDisconnected,
      forwardCount: allForwards.length,
      detectedCount: allDetected.length,
      dialog: dialogState.mode,
      dialogTargetId:
        dialogState.mode === 'edit'
          ? dialogState.entry.connectionId
          : dialogState.mode === 'add'
            ? (dialogState.defaults.targetId ?? null)
            : null,
      editingForwardId: dialogState.mode === 'edit' ? dialogState.entry.id : null
    }),
    edit: (id) => {
      const entry = activeConnectionId
        ? useAppStore
            .getState()
            .portForwardsByConnection[activeConnectionId]?.find(
              (value) => value.id === id && value.connectionId === activeConnectionId
            )
        : null
      if (!entry) {
        return false
      }
      return handleEdit(entry)
    },
    detected: (host, port) => {
      if (!activeConnectionId) {
        return false
      }
      return handleForwardDetected({ host, port, targetId: activeConnectionId })
    },
    matchesDetected: (host, port) =>
      dialogState.mode === 'add' &&
      normalizeHost(dialogState.defaults.remoteHost) === normalizeHost(host) &&
      dialogState.defaults.remotePort === port,
    current: () =>
      readPortsConnectionId() === activeConnectionId &&
      Boolean(
        activeConnectionId &&
        useAppStore.getState().sshConnectionStates.get(activeConnectionId)?.status === 'connected'
      ),
    copy: async (id) => {
      const entry = activeConnectionId ? findCurrentSshForward(id, activeConnectionId) : undefined
      return entry ? copySshForwardAddress(entry) : false
    },
    remove: async (id) => {
      const entry = activeConnectionId ? findCurrentSshForward(id, activeConnectionId) : undefined
      return entry ? removeSshForward(entry) : false
    },
    openBrowser: async (id, destination) => {
      const entry = activeConnectionId ? findCurrentSshForward(id, activeConnectionId) : undefined
      return entry ? handleOpenForwardInBrowser(entry, undefined, destination) : false
    },
    removed: (id, targetId) =>
      !(useAppStore.getState().portForwardsByConnection[targetId] ?? []).some(
        (entry) => entry.id === id && entry.connectionId === targetId
      ),
    cancel: handleDialogClose
  })

  if (isDisconnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center text-muted-foreground">
        <Unplug size={32} className="mb-3 opacity-50" />
        <p className="text-sm font-medium">
          {translate('auto.components.right.sidebar.PortsPanel.a2f1a47f42', 'SSH connection lost')}
        </p>
        <p className="text-xs mt-1">
          {translate('auto.components.right.sidebar.PortsPanel.d4c3cd679c', 'Reconnecting...')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-sleek">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {translate('auto.components.right.sidebar.PortsPanel.6bc058dbe1', 'Ports')}
        </span>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() =>
            setDialogState({ mode: 'add', defaults: { targetId: activeConnectionId ?? undefined } })
          }
        >
          <Plus size={14} />
          {translate('auto.components.right.sidebar.PortsPanel.a103dae837', 'Add')}
        </button>
      </div>

      {/* Forwarded ports */}
      {allForwards.length > 0 && (
        <div className="px-3 pt-2">
          <button
            type="button"
            className="flex items-center gap-1 w-full text-left mb-1"
            onClick={() => setForwardedCollapsed((v) => !v)}
          >
            <ChevronRight
              size={12}
              className={cn(
                'text-muted-foreground transition-transform',
                !forwardedCollapsed && 'rotate-90'
              )}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {translate('auto.components.right.sidebar.PortsPanel.ddbe58d74e', 'Forwarded')}
            </span>
            <span className="text-[10px] text-muted-foreground/60 ml-1">{allForwards.length}</span>
          </button>
          {!forwardedCollapsed &&
            allForwards.map((entry) => (
              <SshForwardedPortRow
                key={entry.id}
                entry={entry}
                onEdit={() => handleEdit(entry)}
                onOpenInBrowser={(event) => handleOpenForwardInBrowser(entry, event)}
              />
            ))}
        </div>
      )}

      {/* Detected ports */}
      {allDetected.length > 0 && (
        <div className="px-3 pt-2">
          <button
            type="button"
            className="flex items-center gap-1 w-full text-left mb-1"
            onClick={() => setDetectedCollapsed((v) => !v)}
          >
            <ChevronRight
              size={12}
              className={cn(
                'text-muted-foreground transition-transform',
                !detectedCollapsed && 'rotate-90'
              )}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {translate('auto.components.right.sidebar.PortsPanel.36b1b2984a', 'Detected')}
            </span>
            <span className="text-[10px] text-muted-foreground/60 ml-1">{allDetected.length}</span>
          </button>
          {!detectedCollapsed &&
            allDetected.map((port) => (
              <SshDetectedPortRow
                key={`${port.targetId}-${port.host}-${port.port}`}
                port={port}
                onForward={() => handleForwardDetected(port)}
              />
            ))}
        </div>
      )}

      {/* Empty state */}
      {allForwards.length === 0 && allDetected.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 px-4 text-center text-muted-foreground">
          <p className="text-sm">
            {translate('auto.components.right.sidebar.PortsPanel.1f0d2a24f9', 'No forwarded ports')}
          </p>
          <p className="text-xs mt-1 mb-3">
            {translate(
              'auto.components.right.sidebar.PortsPanel.04efd3dad4',
              'Forward a port to access remote services on your local machine.'
            )}
          </p>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={() =>
              setDialogState({
                mode: 'add',
                defaults: { targetId: activeConnectionId ?? undefined }
              })
            }
          >
            {translate('auto.components.right.sidebar.PortsPanel.907eb53ed2', 'Forward a Port')}
          </button>
        </div>
      )}

      <SshPortForwardDialog
        registerForm={registerForm}
        state={dialogState}
        activeConnectionId={activeConnectionId}
        onClose={handleDialogClose}
      />
    </div>
  )
}
