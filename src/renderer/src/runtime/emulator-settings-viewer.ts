import { useEffect, useRef } from 'react'
import {
  EmulatorSettingsViewerParams,
  type EmulatorSettingsViewerResult,
  type EmulatorSettingsViewerState
} from '../../../shared/emulator-settings-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
export type EmulatorSdkActions = {
  matches: () => boolean
  locate: (expiresAt?: number) => Promise<boolean>
  clear: () => Promise<boolean>
  studio: () => Promise<boolean>
}
export type EmulatorSkillActions = {
  refresh: () => Promise<boolean | null>
  matches: (installed: boolean) => boolean
}
type EmulatorSettingsOwner = {
  read: () => EmulatorSettingsViewerState
  matchesSdk: (path: string | null) => boolean
  matchesDevice: (deviceId: string | null) => boolean
  refresh: () => Promise<boolean>
  matchesRefresh: () => boolean
  copyExample: (index: number) => Promise<boolean>
  sdk: (path: string | null) => Promise<boolean>
  enabled: (enabled: boolean) => Promise<boolean>
  device: (deviceId: string | null) => Promise<boolean>
  details: () => EmulatorSdkActions | null
  skill: () => EmulatorSkillActions | null
}
const settingsPanes = new Set<EmulatorSettingsOwner>()
export function useEmulatorSettingsViewer(owner: EmulatorSettingsOwner): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const pane: EmulatorSettingsOwner = {
      read: () => committed.current.read(),
      matchesSdk: (path) => committed.current.matchesSdk(path),
      matchesDevice: (id) => committed.current.matchesDevice(id),
      refresh: () => committed.current.refresh(),
      matchesRefresh: () => committed.current.matchesRefresh(),
      copyExample: (index) => committed.current.copyExample(index),
      sdk: (path) => committed.current.sdk(path),
      enabled: (enabled) => committed.current.enabled(enabled),
      device: (id) => committed.current.device(id),
      details: () => committed.current.details(),
      skill: () => committed.current.skill()
    }
    settingsPanes.add(pane)
    return () => {
      settingsPanes.delete(pane)
    }
  }, [])
}
export async function applyEmulatorSettingsViewerRequest(
  request: ConnectionsViewerRequest
): Promise<EmulatorSettingsViewerResult> {
  const parsed = EmulatorSettingsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  if (settingsPanes.size > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const owner = settingsPanes.values().next().value
  if (!owner) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const command = parsed.data
  let applied = true
  let persisted: boolean | null = null
  let matches = () => true
  switch (command.operation) {
    case 'emulator.settings-get':
      break
    case 'emulator.skill-refresh': {
      const skill = owner.skill()
      if (!skill) {
        throw new Error('connections_surface_unavailable')
      }
      const installed = await skill.refresh()
      applied = installed !== null
      matches = () => installed !== null && skill.matches(installed)
      break
    }
    case 'emulator.example-copy':
      applied = await owner.copyExample(command.exampleIndex)
      break
    case 'emulator.refresh':
      applied = await owner.refresh()
      matches = () => owner.matchesRefresh() && !owner.read().refreshing
      break
    case 'emulator.enabled':
      applied = await owner.enabled(command.value)
      persisted = applied
      matches = () => owner.read().enabled === command.value
      break
    case 'emulator.default-device':
      if (!owner.read().enabled) {
        throw new Error('connections_surface_unavailable')
      }
      applied = await owner.device(command.deviceId)
      persisted = applied
      matches = () => owner.matchesDevice(command.deviceId)
      break
    case 'emulator.sdk-set':
    case 'emulator.sdk-clear':
    case 'emulator.sdk-locate':
    case 'emulator.studio-open': {
      if (!owner.read().enabled || !owner.read().availabilityKnown) {
        throw new Error('connections_surface_unavailable')
      }
      if (command.operation === 'emulator.sdk-set') {
        applied = await owner.sdk(command.path)
        matches = () => owner.matchesSdk(command.path)
      } else {
        const details = owner.details()
        if (!details) {
          throw new Error('connections_surface_unavailable')
        }
        applied = await (command.operation === 'emulator.sdk-clear'
          ? details.clear()
          : command.operation === 'emulator.sdk-locate'
            ? details.locate(request.expiresAt)
            : details.studio())
        if (command.operation === 'emulator.sdk-clear') {
          matches = () => owner.matchesSdk(null)
        }
        if (command.operation === 'emulator.sdk-locate') {
          matches = details.matches
        }
      }
      persisted = command.operation === 'emulator.studio-open' ? null : applied
      break
    }
  }
  while (applied && !matches() && Date.now() < request.expiresAt && settingsPanes.has(owner)) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  if (Date.now() >= request.expiresAt || !settingsPanes.has(owner)) {
    throw new Error('request_expired')
  }
  applied = applied && matches()
  return {
    viewerId: command.viewerId,
    applied,
    persisted: persisted === null ? null : applied && persisted,
    state: owner.read()
  }
}
