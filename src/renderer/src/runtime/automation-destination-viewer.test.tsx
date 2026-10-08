// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { AutomationHostCatalogEntry } from '../components/automations/automation-host-catalog-types'
import {
  applyAutomationDestination as apply,
  automationDestinationSnapshot as get,
  useAutomationDestinationViewer
} from './automation-destination-viewer'
const entry: AutomationHostCatalogEntry = {
  stableRef: { authority: { kind: 'desktop' }, selector: { kind: 'ssh', targetId: 'ssh' } },
  owner: {
    authority: { kind: 'desktop' },
    selector: { kind: 'ssh', targetId: 'ssh', targetGeneration: 1 }
  },
  stableKey: 'host:desktop:ssh:ssh',
  label: 'SSH',
  authorityLabel: 'Desktop',
  kind: 'ssh',
  catalogState: 'authoritative',
  authorityHealth: 'fresh',
  executionHealth: 'connected',
  querySupport: 'scoped'
}
const ENTRIES = [entry]
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
})
afterEach(cleanup)
function Harness({
  entries = ENTRIES,
  hold = false,
  select = vi.fn()
}: {
  entries?: AutomationHostCatalogEntry[]
  hold?: boolean
  select?: () => void
}) {
  const [selected, setSelected] = useState(entry)
  const owner = selected.owner
  if (!owner) {
    throw new Error('missing owner')
  }
  useAutomationDestinationViewer({
    entries,
    projects: [],
    resolution: {
      status: 'ready',
      entry: selected,
      authority: owner.authority,
      destination: { selector: owner.selector }
    },
    onSelect: (key) => {
      select()
      const current = entries.find((entry) => entry.stableKey === key)
      if (!hold && current) {
        setSelected(current)
      }
    }
  })
  return null
}
function token() {
  const current = get()
  if (!current) {
    throw new Error('missing destination')
  }
  return current.reviewedTarget
}
async function request(reviewedTarget = token()) {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'select', stableKey: entry.stableKey, reviewedTarget })
    void pending.catch(() => undefined)
  })
  return { pending }
}
it('rejects identical host ID with a new owner and profile ABA reviews', async () => {
  const view = render(<Harness />)
  const old = token()
  view.rerender(
    <Harness
      entries={[
        {
          ...entry,
          owner: {
            authority: { kind: 'desktop' },
            selector: { kind: 'ssh', targetId: 'ssh', targetGeneration: 2 }
          }
        }
      ]}
    />
  )
  await expect((await request(old)).pending).rejects.toThrow('viewer_target_changed')
  const profile = token()
  act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
  act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
  await expect((await request(profile)).pending).rejects.toThrow('viewer_target_changed')
  act(() => useAppStore.setState({ activeModal: 'create-worktree' }))
  await expect((await request()).pending).rejects.toThrow('viewer_modal_open')
})
it('refuses old-peer hosts and a selection that does not commit', async () => {
  const view = render(
    <Harness
      entries={[{ ...entry, querySupport: 'legacy-unscoped', scopeGap: 'authority-unscoped' }]}
    />
  )
  await expect((await request()).pending).rejects.toThrow('automation_destination_unavailable')
  view.unmount()
  render(
    <Harness
      hold
      entries={[
        {
          ...entry,
          owner: {
            authority: { kind: 'desktop' },
            selector: { kind: 'ssh', targetId: 'ssh', targetGeneration: 2 }
          }
        }
      ]}
    />
  )
  await expect((await request()).pending).rejects.toThrow('viewer_target_changed')
})
it('releases a throwing callback and refuses duplicate or unmounted requests', async () => {
  const select = vi.fn((): void => {
    throw new Error('fixture failure')
  })
  const view = render(<Harness select={select} />)
  await expect((await request()).pending).rejects.toThrow('fixture failure')
  expect(get()?.busy).toBe(false)
  select.mockImplementation(() => undefined)
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'select', stableKey: entry.stableKey, reviewedTarget: token() })
    await expect(
      apply({ kind: 'select', stableKey: entry.stableKey, reviewedTarget: token() })
    ).rejects.toThrow('viewer_busy')
  })
  await expect(pending).resolves.toMatchObject({ selectedStableKey: entry.stableKey, busy: false })
  act(() => {
    pending = apply({ kind: 'select', stableKey: entry.stableKey, reviewedTarget: token() })
    void pending.catch(() => undefined)
    view.unmount()
  })
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
it('refuses ambiguous mounted fields', async () => {
  render(
    <>
      <Harness />
      <Harness />
    </>
  )
  expect(get()).toBeNull()
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
})
