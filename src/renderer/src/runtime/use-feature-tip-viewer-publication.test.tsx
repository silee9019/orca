// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({
  useAppStore: (select: (state: { settings: { activeRuntimeEnvironmentId: null } }) => unknown) =>
    select({ settings: { activeRuntimeEnvironmentId: null } })
}))
import { useFeatureTipViewerPublication } from './use-feature-tip-viewer-publication'
import {
  publishFeatureTipControl,
  publishFeatureTipView,
  readFeatureTipControl,
  readFeatureTipView
} from './feature-tip-viewer-view'

type PublicationArgs = Parameters<typeof useFeatureTipViewerPublication>[0]

afterEach(() => {
  cleanup()
  publishFeatureTipView(null)
  publishFeatureTipControl(null)
})

it('publishes the open tip with the latest skip and withdraws both on unmount', () => {
  const first = vi.fn()
  const hook = renderHook<void, PublicationArgs>((props) => useFeatureTipViewerPublication(props), {
    initialProps: { open: true, tipId: 'cmd-j-palette', action: 'learn-cmd-j-palette', skip: first }
  })
  expect(readFeatureTipView()).toEqual({
    runtimeContextKey: expect.any(String),
    open: true,
    tipId: 'cmd-j-palette',
    action: 'learn-cmd-j-palette'
  })
  readFeatureTipControl()?.skip()
  expect(first).toHaveBeenCalledOnce()
  const second = vi.fn()
  hook.rerender({ open: true, tipId: 'cmd-j-palette', action: 'learn-cmd-j-palette', skip: second })
  readFeatureTipControl()?.skip()
  expect(second).toHaveBeenCalledOnce()
  hook.rerender({ open: false, tipId: null, action: null, skip: second })
  expect(readFeatureTipView()).toMatchObject({ open: false, tipId: null })
  expect(readFeatureTipControl()).toBeNull()
  hook.unmount()
  expect(readFeatureTipView()).toBeNull()
  expect(readFeatureTipControl()).toBeNull()
})
