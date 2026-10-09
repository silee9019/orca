// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { FeatureTipId } from '../../../../shared/feature-tips'
import {
  publishFeatureTipControl,
  publishFeatureTipView,
  readFeatureTipControl,
  readFeatureTipView
} from '@/runtime/feature-tip-viewer-view'

type TipDialogProps = { onOpenChange: (open: boolean) => void }
const dialog = vi.hoisted(() => {
  const noProps = (): { current: TipDialogProps | null } => ({ current: null })
  return noProps()
})
vi.mock('./CmdJPaletteTipDialog', () => ({
  CmdJPaletteTipDialog: (props: TipDialogProps) => {
    dialog.current = props
    return null
  }
}))
vi.mock('./CliSetupTipDialog', () => ({ CliSetupTipDialog: () => null }))
vi.mock('./SessionSearchTipDialog', () => ({ SessionSearchTipDialog: () => null }))
vi.mock('./VoiceDictationTipDialog', () => ({ VoiceDictationTipDialog: () => null }))
vi.mock('./feature-tip-telemetry', () => ({
  getOrcaCliFeatureTipTelemetrySource: vi.fn(),
  trackCmdJPaletteFeatureTipAcknowledged: vi.fn(),
  trackOrcaCliFeatureTipSetupClicked: vi.fn(),
  trackOrcaCliFeatureTipSetupResult: vi.fn()
}))
vi.mock('./use-session-search-tip-setup', () => ({
  useSessionSearchTipSetup: () => ({ stage: 'offer', status: null, enable: vi.fn() })
}))
vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  type ModalState = {
    activeModal: string
    modalData: Record<string, unknown>
    featureTipsSeenIds: FeatureTipId[]
  } & Record<string, unknown>
  const useAppStore = create<ModalState>(() => ({
    activeModal: 'feature-tips',
    modalData: { tipId: 'cmd-j-palette' },
    settings: { activeRuntimeEnvironmentId: null },
    featureTipsSeenIds: [],
    featureInteractions: {},
    closeModal: () => useAppStore.setState({ activeModal: 'none', modalData: {} }),
    markFeatureTipsSeen: (ids: FeatureTipId[]) =>
      useAppStore.setState((state) => ({
        featureTipsSeenIds: [...new Set([...state.featureTipsSeenIds, ...ids])]
      })),
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    updateSettings: vi.fn(),
    showAiVaultSearch: vi.fn()
  }))
  return { useAppStore }
})
import { useAppStore } from '@/store'
import FeatureTipsModal from './FeatureTipsModal'

const reopen = (): void =>
  useAppStore.setState({
    activeModal: 'feature-tips',
    modalData: { tipId: 'cmd-j-palette' },
    featureTipsSeenIds: []
  })
beforeEach(() => {
  dialog.current = null
  reopen()
})
afterEach(() => {
  cleanup()
  publishFeatureTipView(null)
  publishFeatureTipControl(null)
})

it('publishes the open tip and closes it through the same handler as the dialog close button', () => {
  render(<FeatureTipsModal />)
  expect(readFeatureTipView()).toMatchObject({
    open: true,
    tipId: 'cmd-j-palette',
    action: 'learn-cmd-j-palette'
  })

  act(() => dialog.current?.onOpenChange(false))
  expect(useAppStore.getState()).toMatchObject({
    activeModal: 'none',
    featureTipsSeenIds: ['cmd-j-palette']
  })

  act(reopen)
  expect(readFeatureTipView()).toMatchObject({ open: true, tipId: 'cmd-j-palette' })
  act(() => readFeatureTipControl()?.skip())
  expect(useAppStore.getState()).toMatchObject({
    activeModal: 'none',
    featureTipsSeenIds: ['cmd-j-palette']
  })
  expect(readFeatureTipView()).toMatchObject({ open: false, tipId: null, action: null })
  expect(readFeatureTipControl()).toBeNull()
})

it('publishes no open tip while the modal is closed and withdraws on unmount', () => {
  useAppStore.setState({ activeModal: 'none' })
  const { unmount } = render(<FeatureTipsModal />)
  expect(readFeatureTipView()).toMatchObject({ open: false, tipId: null })
  expect(readFeatureTipControl()).toBeNull()
  unmount()
  expect(readFeatureTipView()).toBeNull()
})
