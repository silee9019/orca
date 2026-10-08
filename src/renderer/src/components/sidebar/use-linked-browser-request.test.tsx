// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { requestLinkedBrowser } from '@/runtime/linked-browser-request'
import { useLinkedBrowserRequest } from './use-linked-browser-request'

it('refuses modal/expiry/identity mismatches and bounds initiated observations after hover unmount', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const command = {
    workspaceId: 'linked-fixture',
    executionHostId: 'local',
    surface: 'card-details',
    kind: 'issue',
    number: 41,
    url: 'https://fixture.invalid/41'
  } as const
  let effects = 0
  function Owner() {
    useLinkedBrowserRequest({
      workspaceId: command.workspaceId,
      surface: command.surface,
      open: true,
      issue: { number: 41, title: 'Fixture', url: command.url },
      review: null,
      closeHover: () => {
        effects += 1
      },
      openIssue: () => new Promise<boolean>(() => {})
    })
    return null
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(createElement(Owner)))
  try {
    useAppStore.setState({
      activeModal: 'edit-meta',
      activeWorktreeId: command.workspaceId,
      activeWorkspaceExecutionHostId: 'local'
    })
    await expect(requestLinkedBrowser(command, Date.now() + 1000)).rejects.toThrow('effect_unknown')
    useAppStore.setState({ activeModal: 'none' })
    await expect(requestLinkedBrowser(command, Date.now() - 1)).rejects.toThrow('effect_unknown')
    await expect(
      requestLinkedBrowser({ ...command, workspaceId: 'wrong' }, Date.now() + 1000)
    ).rejects.toThrow('owner_unavailable')
    await expect(
      requestLinkedBrowser({ ...command, surface: 'activity' }, Date.now() + 1000)
    ).rejects.toThrow('owner_unavailable')
    await expect(
      requestLinkedBrowser({ ...command, number: 42 }, Date.now() + 1000)
    ).rejects.toThrow('effect_unknown')
    expect(effects).toBe(0)
    const pending = requestLinkedBrowser(command, Date.now() + 40)
    const pendingFailure = pending.catch((error) => error)
    await expect(requestLinkedBrowser(command, Date.now() + 1000)).rejects.toThrow('effect_unknown')
    expect(effects).toBe(1)
    await act(async () => root.unmount())
    expect(await pendingFailure).toMatchObject({ message: 'linked_browser_effect_unknown' })
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
