import type { DirEntry } from './remote-file-browser-helpers'
import type { RemoteFileBrowserFilterKeyEvent } from './use-remote-file-browser-filter-key-commands'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useEffect, useRef, useState } from 'react'
import {
  REMOTE_FILE_PICKER_EVENT,
  type RemoteFilePickerRequest
} from '@/runtime/remote-file-picker-request'
import type {
  RemoteFilePickerCommand,
  RemoteFilePickerState
} from '../../../../shared/rpc-contract/remote-file-picker-params'

type PickerOwner = Omit<RemoteFilePickerState, 'instance'> & {
  navigate: (path: string) => Promise<void>
  navigateUp: () => void
  select: () => void
  cancel: () => void
  input: (text: string) => void
  paste: (text: string) => void
  key: (event: RemoteFileBrowserFilterKeyEvent) => void
  rowClick: (entry: DirEntry) => void
  rowSelect: (entry: DirEntry) => string | undefined
  rowClickPending: () => boolean
  focusInput: () => void
}
export function useRemoteFilePickerCommands(owner: PickerOwner): void {
  const identity = useRef({ target: owner.target, instance: createBrowserUuid() })
  if (
    identity.current.target.kind !== owner.target.kind ||
    identity.current.target.id !== owner.target.id
  ) {
    identity.current = { target: owner.target, instance: createBrowserUuid() }
  }
  const current = useRef(owner)
  current.current = owner
  const pending = useRef<{ request: RemoteFilePickerRequest; revision: number } | null>(null)
  const revisionRef = useRef(0)
  const [revision, setRevision] = useState(0)
  const matches = (command: RemoteFilePickerCommand) =>
    command.target.kind === current.current.target.kind &&
    command.target.id === current.current.target.id &&
    (command.instance === undefined || command.instance === identity.current.instance)
  const snapshot = (): RemoteFilePickerState => {
    const { target, resolvedPath, loading, error, filter, preview, selectDisabled, entries } =
      current.current
    return {
      instance: identity.current.instance,
      target,
      resolvedPath,
      loading,
      error,
      filter,
      preview,
      selectDisabled,
      entries,
      previewPath: current.current.previewPath,
      previewLoading: current.current.previewLoading,
      fileHint: current.current.fileHint,
      inputFocused: current.current.inputFocused
    }
  }
  useEffect(() => {
    const receive = (event: WindowEventMap[typeof REMOTE_FILE_PICKER_EVENT]) => {
      const request = event.detail
      if (!matches(request.command)) {
        return
      }
      request.offer(() => {
        if (request.isSettled() || !matches(request.command) || Date.now() >= request.expiresAt) {
          request.finish(new Error('remote_picker_owner_changed_or_expired'))
          return
        }
        const value = current.current
        const command = request.command
        if (command.action === 'status') {
          request.finish(undefined, snapshot())
          return
        }
        if (!command.instance) {
          request.finish(new Error('remote_picker_instance_required'))
          return
        }
        const keyCancels =
          command.action === 'key' && command.key === 'Escape' && value.filter === ''
        if (pending.current && !pending.current.request.isSettled()) {
          const doubleClick =
            command.action === 'row-select' &&
            pending.current.request.command.action === 'row-click'
          if (command.action !== 'cancel' && !keyCancels && !doubleClick) {
            request.finish(new Error('remote_picker_busy'))
            return
          }
          pending.current.request.finish(
            new Error(
              doubleClick
                ? 'remote_picker_click_superseded'
                : 'remote_picker_canceled_effect_unknown'
            )
          )
          pending.current = null
        }
        if (value.loading && command.action !== 'cancel' && !keyCancels) {
          request.finish(new Error('remote_picker_loading'))
          return
        }
        if (command.action === 'select' && value.selectDisabled) {
          request.finish(new Error('remote_picker_selection_disabled'))
          return
        }
        try {
          const entry = command.entry
            ? value.entries.find((item) => item.name === command.entry)
            : undefined
          if (command.action === 'row-click' || command.action === 'row-select') {
            if (
              !entry ||
              value.previewLoading ||
              (command.action === 'row-select' && !entry.isDirectory)
            ) {
              request.finish(new Error('remote_picker_row_unavailable'))
              return
            }
          }
          if (command.action === 'row-select' && entry) {
            const result = snapshot()
            const selectedPath = value.rowSelect(entry)
            if (!selectedPath) {
              request.finish(new Error('remote_picker_row_selection_unconfirmed'))
              return
            }
            request.finish(undefined, { ...result, selectedPath })
            return
          }
          if (command.action === 'select' || command.action === 'cancel' || keyCancels) {
            const result = snapshot()
            if (command.action === 'select') {
              value.select()
              request.finish(undefined, { ...result, selectedPath: result.resolvedPath })
            } else {
              if (keyCancels && command.key) {
                value.key({ key: command.key, preventDefault: () => {}, stopPropagation: () => {} })
              } else {
                value.cancel()
              }
              request.finish(undefined, { ...result, canceled: true })
            }
            return
          }
          revisionRef.current++
          pending.current = { request, revision: revisionRef.current }
          setRevision(revisionRef.current)
          if (command.action === 'navigate' && command.path) {
            void value.navigate(command.path)
          } else if (command.action === 'up') {
            value.navigateUp()
          } else if (command.action === 'input' && command.text !== undefined) {
            value.input(command.text)
          } else if (command.action === 'paste' && command.text !== undefined) {
            value.paste(command.text)
          } else if (command.action === 'key' && command.key) {
            value.key({ key: command.key, preventDefault: () => {}, stopPropagation: () => {} })
          } else if (command.action === 'row-click' && entry) {
            value.rowClick(entry)
          } else if (command.action === 'focus-input') {
            value.focusInput()
          } else {
            pending.current = null
            request.finish(new Error('remote_picker_invalid_command'))
          }
        } catch (error) {
          pending.current = null
          request.finish(error instanceof Error ? error : new Error('remote_picker_effect_unknown'))
        }
      })
    }
    window.addEventListener(REMOTE_FILE_PICKER_EVENT, receive)
    return () => {
      window.removeEventListener(REMOTE_FILE_PICKER_EVENT, receive)
      pending.current?.request.finish(new Error('remote_picker_unmounted_effect_unknown'))
      pending.current = null
    }
  }, [])
  useEffect(() => {
    const value = pending.current
    if (!value || revision < value.revision || owner.loading || owner.rowClickPending()) {
      return
    }
    const request = value.request
    pending.current = null
    if (!matches(request.command) || Date.now() >= request.expiresAt) {
      request.finish(new Error('remote_picker_owner_changed_effect_unknown'))
    } else if (owner.error && ['navigate', 'up', 'row-click'].includes(request.command.action)) {
      request.finish(new Error('remote_picker_browse_failed'))
    } else {
      request.finish(undefined, snapshot())
    }
  })
}
