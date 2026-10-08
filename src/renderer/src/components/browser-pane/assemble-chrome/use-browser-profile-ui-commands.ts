import { useBrowserToolbarImportCommands } from './use-browser-toolbar-import-commands'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BROWSER_PROFILE_UI_COMMAND_EVENT,
  type BrowserProfileUiEvent
} from '@/runtime/browser-profile-ui-request'
import type { BrowserProfileUiState } from '../../../../../shared/rpc-contract/browser-profile-ui-params'
import type { BrowserCookieImportExecutionResult, BrowserSlice } from '@/store/slices/browser'
type ProfileUiOwner = {
  detect: () => Promise<void>
  getDetection: () => NonNullable<BrowserProfileUiState['detection']>
  cookieHost: string
  getImportState: () => BrowserSlice['browserSessionImportState']
  cookieMenuForcedOpen?: boolean
  cookieBusy: boolean
  importBrowser: (family: string, profile?: string) => Promise<BrowserCookieImportExecutionResult>
  importFile: (filePath: string) => Promise<BrowserCookieImportExecutionResult>
  page: string
  active: boolean
  snapshot: BrowserProfileUiState
  profiles: readonly { id: string; partition: string; label: string }[]
  menu: (open: boolean) => void
  select: (profile: string | null) => void
  cancelSwitch: () => void
  confirmSwitch: () => void
  newDialog: (open: boolean) => void
  name: (value: string) => void
  create: () => Promise<void>
}
export function useBrowserProfileUiCommands(owner: ProfileUiOwner): void {
  useBrowserToolbarImportCommands(owner)
  const current = useRef(owner)
  const pending = useRef<{
    request: BrowserProfileUiEvent
    check: (state: BrowserProfileUiState) => boolean
    done: boolean
  } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = owner
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    if (operation.request.isSettled()) {
      pending.current = null
      return
    }
    if (!owner.active) {
      operation.request.finish(new Error('browser_profile_ui_inactive_effect_unknown'))
      pending.current = null
    } else if (operation.done) {
      const state = current.current.snapshot
      operation.request.finish(
        operation.check(state)
          ? undefined
          : new Error('browser_profile_ui_not_applied_effect_unknown'),
        state
      )
      pending.current = null
    }
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-profile-ui-command']): void => {
      const request = event.detail
      if (new Set(['import-file', 'import-browser', 'settings-open']).has(request.command.action)) {
        return
      }
      if (request.page !== owner.page || !request.claim()) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      const before = current.current
      if (!before.active) {
        request.finish(new Error('browser_profile_ui_inactive'))
        return
      }
      const command = request.command
      if (command.action === 'status') {
        request.finish(undefined, before.snapshot)
        return
      }
      const closingDuringCreate = command.action === 'new-cancel' && before.snapshot.creating
      if (closingDuringCreate) {
        pending.current?.request.finish(
          new Error('browser_profile_dialog_closed_create_effect_unknown')
        )
        pending.current = null
      }
      if (
        (!closingDuringCreate && before.snapshot.creating) ||
        (pending.current && !pending.current.request.isSettled())
      ) {
        request.finish(new Error('browser_profile_ui_busy'))
        return
      }
      if (command.action === 'detect-browsers') {
        if (before.cookieHost !== 'local' || before.cookieBusy) {
          request.finish(new Error('browser_profile_detect_host_unsupported_or_busy'))
          return
        }
        const operation = { request, check: () => true, done: false }
        pending.current = operation
        void before.detect().then(
          () => {
            if (pending.current !== operation || request.isSettled()) {
              return
            }
            pending.current = null
            if (
              !current.current.active ||
              Date.now() >= request.expiresAt ||
              current.current.cookieHost !== 'local'
            ) {
              request.finish(new Error('browser_profile_detect_owner_changed_effect_unknown'))
            } else {
              request.finish(undefined, {
                ...current.current.snapshot,
                detection: before.getDetection()
              })
            }
          },
          () => {
            if (pending.current === operation) {
              pending.current = null
            }
            request.finish(new Error('browser_profile_detect_failed_effect_unknown'))
          }
        )
        return
      }
      let check: (state: BrowserProfileUiState) => boolean
      let create = false
      if (command.action === 'menu-open' || command.action === 'menu-close') {
        const open = command.action === 'menu-open'
        before.menu(open)
        check = (state) => state.menuOpen === open
      } else if (command.action === 'select') {
        if (!before.profiles.some((profile) => profile.id === command.profile)) {
          request.finish(new Error('browser_profile_not_found'))
          return
        }
        before.select(command.profile === 'default' ? null : command.profile)
        check = (state) =>
          state.profile === command.profile || state.pendingProfile === command.profile
      } else if (command.action === 'switch-cancel') {
        before.cancelSwitch()
        check = (state) => state.pendingProfile === null
      } else if (command.action === 'switch-confirm') {
        const target = before.snapshot.pendingProfile
        const profile = before.profiles.find((profile) => profile.id === target)
        if (!target || !profile) {
          request.finish(new Error('browser_profile_switch_not_pending'))
          return
        }
        before.confirmSwitch()
        check = (state) =>
          state.pendingProfile === null &&
          state.profile === target &&
          state.partition === profile.partition
      } else if (command.action === 'new-open' || command.action === 'new-cancel') {
        const open = command.action === 'new-open'
        before.newDialog(open)
        check = (state) => state.newDialogOpen === open && (open || state.newName === '')
      } else if (command.action === 'new-name') {
        if (command.name.length > 50) {
          request.finish(new Error('browser_profile_name_too_long'))
          return
        }
        if (!before.snapshot.newDialogOpen) {
          request.finish(new Error('browser_profile_dialog_not_open'))
          return
        }
        before.name(command.name)
        check = (state) => state.newName === command.name
      } else {
        const name = before.snapshot.newName.trim()
        if (!before.snapshot.newDialogOpen || !name) {
          request.finish(new Error('browser_profile_name_required'))
          return
        }
        create = true
        const oldProfiles = new Set(before.profiles.map((profile) => profile.id))
        check = (state) =>
          !state.creating &&
          !state.newDialogOpen &&
          state.newName === '' &&
          current.current.profiles.some(
            (profile) =>
              !oldProfiles.has(profile.id) &&
              profile.label === name &&
              state.profile === profile.id &&
              state.partition === profile.partition
          )
      }
      const operation = { request, check, done: !create }
      pending.current = operation
      if (create) {
        void before.create().then(
          () => {
            if (pending.current !== operation || request.isSettled()) {
              return
            }
            operation.done = true
            update((value) => value + 1)
          },
          () => {
            request.finish(new Error('browser_profile_create_failed_effect_unknown'))
            if (pending.current === operation) {
              pending.current = null
            }
          }
        )
      } else {
        update((value) => value + 1)
      }
    }
    window.addEventListener(BROWSER_PROFILE_UI_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_PROFILE_UI_COMMAND_EVENT, receive)
  }, [owner.page])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_profile_ui_unavailable_effect_unknown'))
      pending.current = null
    },
    [owner.page]
  )
}
