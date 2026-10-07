// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import {
  useUsageAccountRefreshController,
  refreshMountedUsageAccount
} from './use-usage-account-refresh-controller'
it('runs the mounted provider callback and rejects busy, other provider and unmounted targets', async () => {
  const refresh = vi.fn(async () => {})
  function Consumer({ busy }: { busy: boolean }) {
    useUsageAccountRefreshController('cursor', refresh, busy)
    return null
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(<Consumer busy={false} />)
  })
  expect(await refreshMountedUsageAccount('cursor')).toEqual({
    provider: 'cursor',
    refreshCompleted: true
  })
  expect(refresh).toHaveBeenCalledOnce()
  await expect(refreshMountedUsageAccount('zcode')).rejects.toThrow('unavailable')
  await act(async () => {
    root.render(<Consumer busy={true} />)
  })
  await expect(refreshMountedUsageAccount('cursor')).rejects.toThrow('busy')
  act(() => root.unmount())
  await expect(refreshMountedUsageAccount('cursor')).rejects.toThrow('unavailable')
})

it('allows two mounted consumers and rejects only the ambiguous action', async () => {
  const refresh = vi.fn(async () => {})
  function Consumer() {
    useUsageAccountRefreshController('zcode', refresh, false)
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => {
    root.render(
      <>
        <Consumer key="first" />
        <Consumer key="second" />
      </>
    )
  })
  await expect(refreshMountedUsageAccount('zcode')).rejects.toThrow('ambiguous')
  await act(async () => {
    root.render(<Consumer key="first" />)
  })
  expect(await refreshMountedUsageAccount('zcode')).toEqual({
    provider: 'zcode',
    refreshCompleted: true
  })
  expect(refresh).toHaveBeenCalledOnce()
  act(() => root.unmount())
})
