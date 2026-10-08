import type { SshPortsFormDraft } from '../../../../shared/ssh-ports-viewer'
import type { SshPortsFormOwner } from '@/runtime/ssh-ports-viewer'
import { useAppStore } from '@/store'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { PortForwardEntry } from '../../../../shared/ssh-types'
import { translate } from '@/i18n/i18n'

// Why: ports < 1024 require root to bind on the local machine. Remap them
// to a high port so the default "Forward" action doesn't fail with EACCES.
function safeLocalPort(remotePort: number): number {
  if (remotePort < 1024) {
    return remotePort + 10000
  }
  return remotePort
}

export type PortForwardDialogState =
  | { mode: 'closed' }
  | {
      mode: 'add'
      defaults: { remotePort?: number; remoteHost?: string; label?: string; targetId?: string }
    }
  | { mode: 'edit'; entry: PortForwardEntry }

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

const INPUT_CLASS =
  'block w-full mt-0.5 px-2 py-1.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

export function SshPortForwardDialog({
  state,
  activeConnectionId,
  registerForm,
  onClose: closeDialog
}: {
  state: PortForwardDialogState
  registerForm?: (owner: SshPortsFormOwner) => () => void
  activeConnectionId: string | null
  onClose: (expected?: PortForwardDialogState) => boolean | void
}): React.JSX.Element {
  const onClose = useCallback(() => closeDialog(state), [closeDialog, state])
  const isOpen = state.mode !== 'closed'
  const isEdit = state.mode === 'edit'

  const initialRemotePort =
    state.mode === 'edit'
      ? state.entry.remotePort.toString()
      : state.mode === 'add'
        ? (state.defaults.remotePort?.toString() ?? '')
        : ''

  const initialLocalPort =
    state.mode === 'edit'
      ? state.entry.localPort.toString()
      : state.mode === 'add' && state.defaults.remotePort != null
        ? safeLocalPort(state.defaults.remotePort).toString()
        : ''

  const initialRemoteHost =
    state.mode === 'edit'
      ? state.entry.remoteHost
      : state.mode === 'add'
        ? (state.defaults.remoteHost ?? 'localhost')
        : 'localhost'

  const initialLabel =
    state.mode === 'edit'
      ? (state.entry.label ?? '')
      : state.mode === 'add'
        ? (state.defaults.label ?? '')
        : ''

  // Why: capture the target at dialog-open time via defaults.targetId so
  // switching worktrees while the dialog is open doesn't redirect the
  // forward to the wrong SSH connection.
  const targetId =
    state.mode === 'edit'
      ? state.entry.connectionId
      : state.mode === 'add'
        ? (state.defaults.targetId ?? activeConnectionId ?? '')
        : (activeConnectionId ?? '')

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-[340px]">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isEdit
              ? translate(
                  'auto.components.right.sidebar.PortsPanel.80206251c8',
                  'Edit Port Forward'
                )
              : translate('auto.components.right.sidebar.PortsPanel.907eb53ed2', 'Forward a Port')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEdit
              ? translate(
                  'auto.components.right.sidebar.PortsPanel.10360598a4',
                  'Update the port forwarding configuration.'
                )
              : translate(
                  'auto.components.right.sidebar.PortsPanel.31e80cff2d',
                  'Forward a remote port to your local machine.'
                )}
          </DialogDescription>
        </DialogHeader>
        {isOpen && (
          <PortForwardForm
            key={
              state.mode === 'edit'
                ? `edit-${state.entry.id}`
                : `add-${targetId}-${initialRemotePort}-${initialRemoteHost}`
            }
            registerForm={registerForm}
            mode={state.mode}
            editId={state.mode === 'edit' ? state.entry.id : undefined}
            initialRemotePort={initialRemotePort}
            initialLocalPort={initialLocalPort}
            initialRemoteHost={initialRemoteHost}
            initialLabel={initialLabel}
            targetId={targetId}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PortForwardForm({
  registerForm,
  mode,
  editId,
  initialRemotePort,
  initialLocalPort,
  initialRemoteHost,
  initialLabel,
  targetId,
  onClose
}: {
  registerForm?: (owner: SshPortsFormOwner) => () => void
  mode: 'add' | 'edit'
  editId?: string
  initialRemotePort: string
  initialLocalPort: string
  initialRemoteHost: string
  initialLabel: string
  targetId: string
  onClose: () => boolean | void
}): React.JSX.Element {
  const revision = useRef(0)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const currentClose = useRef(onClose)
  currentClose.current = onClose
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [remotePort, setRemotePort] = useState(initialRemotePort)
  const [localPort, setLocalPort] = useState(initialLocalPort)
  const [remoteHost, setRemoteHost] = useState(initialRemoteHost)
  const [label, setLabel] = useState(initialLabel)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(
    async (e?: React.FormEvent): Promise<boolean> => {
      e?.preventDefault()
      if (inFlight.current || !mounted.current) {
        return false
      }
      setError(null)

      const rPort = Number.parseInt(remotePort, 10)
      const lPort = Number.parseInt(localPort || remotePort, 10)

      if (Number.isNaN(rPort) || rPort < 1 || rPort > 65535) {
        setError('Remote port must be 1\u201365535')
        return false
      }
      if (Number.isNaN(lPort) || lPort < 1 || lPort > 65535) {
        setError('Local port must be 1\u201365535')
        return false
      }

      if (useAppStore.getState().sshConnectionStates.get(targetId)?.status !== 'connected') {
        return false
      }
      inFlight.current = true
      setSubmitting(true)
      const close = currentClose.current
      const savedRevision = revision.current
      try {
        const saved = await (mode === 'edit' && editId
          ? window.api.ssh.updatePortForward({
              id: editId,
              targetId,
              localPort: lPort,
              remoteHost: remoteHost || 'localhost',
              remotePort: rPort,
              label: label || undefined
            })
          : window.api.ssh.addPortForward({
              targetId,
              localPort: lPort,
              remoteHost: remoteHost || 'localhost',
              remotePort: rPort,
              label: label || undefined
            }))
        const canonical = await window.api.ssh.listPortForwards({ targetId })
        if (
          !mounted.current ||
          currentClose.current !== close ||
          savedRevision !== revision.current
        ) {
          return false
        }
        const confirmed = canonical.some(
          (entry) =>
            entry.id === (mode === 'edit' ? editId : saved.id) &&
            entry.connectionId === targetId &&
            entry.localPort === lPort &&
            entry.remotePort === rPort &&
            entry.remoteHost === (remoteHost || 'localhost') &&
            (entry.label ?? '') === label
        )
        if (confirmed) {
          return close() !== false
        }
        setError('Port forward could not be confirmed.')
        return false
      } catch (err) {
        if (
          !mounted.current ||
          currentClose.current !== close ||
          savedRevision !== revision.current
        ) {
          return false
        }
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('EADDRINUSE') || msg.includes('already in use')) {
          setError(`Port ${lPort} is already in use. Choose a different local port.`)
        } else if (msg.includes('EACCES') || msg.includes('permission denied')) {
          setError(`Port ${lPort} requires elevated privileges. Use a local port \u2265 1024.`)
        } else {
          setError('Port forward could not be saved.')
        }
        return false
      } finally {
        inFlight.current = false
        if (mounted.current) {
          setSubmitting(false)
        }
      }
    },
    [mode, editId, remotePort, localPort, remoteHost, label, targetId]
  )

  const changeDraft = (value: SshPortsFormDraft): boolean => {
    if (!mounted.current) {
      return false
    }
    revision.current += 1
    if (value.remotePort !== undefined) {
      const val = digitsOnly(value.remotePort)
      setRemotePort(val)
      const prev = Number.parseInt(remotePort, 10)
      const cur = Number.parseInt(localPort, 10)
      if (!localPort || cur === prev || cur === safeLocalPort(prev)) {
        const parsed = Number.parseInt(val, 10)
        setLocalPort(Number.isNaN(parsed) ? '' : safeLocalPort(parsed).toString())
      }
    }
    if (value.localPort !== undefined) {
      setLocalPort(digitsOnly(value.localPort))
    }
    if (value.remoteHost !== undefined) {
      setRemoteHost(value.remoteHost)
    }
    if (value.label !== undefined) {
      setLabel(value.label)
    }
    return true
  }
  const editor = useRef({ changeDraft, handleSubmit, remotePort, localPort, remoteHost, label })
  editor.current = { changeDraft, handleSubmit, remotePort, localPort, remoteHost, label }
  useEffect(
    () =>
      registerForm?.({
        targetId,
        draft: (value) => editor.current.changeDraft(value),
        save: () => editor.current.handleSubmit(),
        matches: (value) =>
          Object.entries(value).every(
            ([key, expected]) =>
              typeof expected === 'string' &&
              Reflect.get(editor.current, key) ===
                (key === 'remotePort' || key === 'localPort' ? digitsOnly(expected) : expected)
          )
      }),
    [registerForm, targetId]
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            {translate('auto.components.right.sidebar.PortsPanel.9e5a4118b0', 'Remote Port')}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={remotePort}
            onChange={(e) => changeDraft({ remotePort: e.target.value })}
            className={INPUT_CLASS}
            placeholder="3000"
            autoFocus
            required
          />
        </label>

        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            {translate('auto.components.right.sidebar.PortsPanel.b950b1948b', 'Local Port')}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={localPort}
            onChange={(e) => changeDraft({ localPort: e.target.value })}
            className={INPUT_CLASS}
            placeholder={translate(
              'auto.components.right.sidebar.PortsPanel.d57545ff92',
              'Same as remote'
            )}
          />
        </label>

        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            {translate('auto.components.right.sidebar.PortsPanel.a3721a50b0', 'Remote Host')}
          </span>
          <input
            type="text"
            value={remoteHost}
            onChange={(e) => changeDraft({ remoteHost: e.target.value })}
            className={INPUT_CLASS}
            placeholder={translate(
              'auto.components.right.sidebar.PortsPanel.17bea6e391',
              'localhost'
            )}
          />
        </label>

        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            {translate('auto.components.right.sidebar.PortsPanel.8dfed0a15c', 'Label (optional)')}
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => changeDraft({ label: e.target.value })}
            className={INPUT_CLASS}
            placeholder={translate(
              'auto.components.right.sidebar.PortsPanel.4eb801ce93',
              'dev-server'
            )}
          />
        </label>
      </div>

      {error && <div className="text-[11px] text-destructive">{error}</div>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {translate('auto.components.right.sidebar.PortsPanel.3ea4a02a8f', 'Cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={submitting || !remotePort}>
          {submitting
            ? mode === 'edit'
              ? translate('auto.components.right.sidebar.PortsPanel.d7c83cfd24', 'Saving...')
              : translate('auto.components.right.sidebar.PortsPanel.9f475dc994', 'Forwarding...')
            : mode === 'edit'
              ? translate('auto.components.right.sidebar.PortsPanel.9079776663', 'Save')
              : translate('auto.components.right.sidebar.PortsPanel.c9d106547a', 'Forward')}
        </Button>
      </div>
    </form>
  )
}
