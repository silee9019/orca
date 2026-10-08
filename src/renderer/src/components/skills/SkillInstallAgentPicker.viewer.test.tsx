// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SkillInstallAgentPicker } from './SkillInstallAgentPicker'
import type { SkillInstallProviderId } from '../../../../shared/skill-install-providers'
import {
  applySkillInstallAgentViewerAction as apply,
  skillInstallAgentViewerSnapshot as snapshot
} from '../../runtime/skill-install-agent-viewer-controller'

afterEach(cleanup)
function token(target = 'owner-1') {
  const value = snapshot(target)?.reviewedTarget
  if (!value) {
    throw new Error('missing agent picker')
  }
  return value
}
function Picker() {
  const [selected, setSelected] = useState(new Set<SkillInstallProviderId>(['codex']))
  return (
    <SkillInstallAgentPicker
      viewerTarget="owner-1"
      scope="workspace"
      selected={selected}
      detectedAgents={null}
      busy={false}
      onChange={setSelected}
    />
  )
}
it('shares the actual popover, individual checkbox and select-all callbacks', async () => {
  render(<Picker />)
  const reviewedTarget = token()
  await expect(
    apply('owner-1', { kind: 'provider', reviewedTarget, provider: 'claude', checked: true })
  ).rejects.toThrow('skill_agent_picker_closed')
  fireEvent.click(screen.getByRole('button', { name: /Installing for:/ }))
  expect(snapshot('owner-1')?.open).toBe(true)
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('owner-1', {
      kind: 'provider',
      reviewedTarget,
      provider: 'claude',
      checked: true
    })
  })
  expect((await pending)?.selectedProviders).toContain('claude')
  expect(screen.getByRole('checkbox', { name: 'Claude Code' }).getAttribute('data-state')).toBe(
    'checked'
  )
  await expect(
    apply('owner-1', { kind: 'provider', reviewedTarget, provider: 'codex', checked: false })
  ).rejects.toThrow('skill_provider_unavailable')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Claude Code' }))
  expect(snapshot('owner-1')?.selectedProviders).not.toContain('claude')
  await act(async () => {
    pending = apply('owner-1', { kind: 'select-all', reviewedTarget, checked: true })
  })
  await pending
  fireEvent.click(screen.getByRole('button', { name: /Deselect (all|optional)/ }))
  expect(snapshot('owner-1')?.selectedProviders).toEqual(['codex'])
  await act(async () => {
    pending = apply('owner-1', { kind: 'open', reviewedTarget, value: false })
  })
  expect((await pending)?.open).toBe(false)
})
it('waits for actual parent selection props, rejects competing writes and rotates owner tokens', async () => {
  let selection = new Set<SkillInstallProviderId>()
  const props = {
    scope: 'global' as const,
    detectedAgents: null,
    busy: false,
    onChange: (next: Set<SkillInstallProviderId>) => {
      selection = next
    }
  }
  const view = render(
    <SkillInstallAgentPicker {...props} viewerTarget="owner-1" selected={new Set()} />
  )
  let pending: ReturnType<typeof apply> | undefined
  const reviewedTarget = token()
  await act(async () => {
    pending = apply('owner-1', { kind: 'open', reviewedTarget, value: true })
  })
  await pending
  let completed = false
  await act(async () => {
    pending = apply('owner-1', {
      kind: 'provider',
      reviewedTarget,
      provider: 'cursor',
      checked: true
    })
    void pending.then(() => {
      completed = true
    })
  })
  expect(completed).toBe(false)
  expect(snapshot('owner-1')?.busy).toBe(true)
  await expect(apply('owner-1', { kind: 'open', reviewedTarget, value: false })).rejects.toThrow(
    'viewer_busy'
  )
  view.rerender(<SkillInstallAgentPicker {...props} viewerTarget="owner-1" selected={selection} />)
  expect((await pending)?.selectedProviders).toContain('cursor')
  await act(async () => {
    pending = apply('owner-1', {
      kind: 'provider',
      reviewedTarget,
      provider: 'cursor',
      checked: false
    })
  })
  const rejected = expect(pending).rejects.toThrow('viewer_target_changed')
  view.rerender(<SkillInstallAgentPicker {...props} viewerTarget="owner-2" selected={selection} />)
  await rejected
  expect(snapshot('owner-1')).toBeNull()
  expect(token('owner-2')).not.toBe(reviewedTarget)
  await expect(apply('owner-2', { kind: 'open', reviewedTarget, value: false })).rejects.toThrow(
    'viewer_target_changed'
  )
})
it('rejects a held parent on unmount and refuses ambiguous or unavailable viewers', async () => {
  await expect(apply('owner-1', { kind: 'get' })).rejects.toThrow('viewer_unavailable')
  const view = render(
    <>
      <Picker />
      <Picker />
    </>
  )
  await expect(apply('owner-1', { kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  view.unmount()
  const single = render(
    <SkillInstallAgentPicker
      viewerTarget="owner-1"
      scope="global"
      selected={new Set()}
      detectedAgents={null}
      busy={false}
      onChange={() => undefined}
    />
  )
  const reviewedTarget = token()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('owner-1', { kind: 'open', reviewedTarget, value: true })
  })
  await pending
  await act(async () => {
    pending = apply('owner-1', {
      kind: 'provider',
      reviewedTarget,
      provider: 'cursor',
      checked: true
    })
  })
  const rejected = expect(pending).rejects.toThrow('viewer_unmounted')
  single.unmount()
  await rejected
})

it('keeps busy controls read-only and rejects a held checkbox when the actual popover closes', async () => {
  const props = {
    viewerTarget: 'owner-1',
    scope: 'global' as const,
    selected: new Set<SkillInstallProviderId>(),
    detectedAgents: null,
    onChange: () => undefined
  }
  const view = render(<SkillInstallAgentPicker {...props} busy />)
  const reviewedTarget = token()
  expect((await apply('owner-1', { kind: 'get' })).busy).toBe(true)
  await expect(apply('owner-1', { kind: 'open', reviewedTarget, value: true })).rejects.toThrow(
    'viewer_busy'
  )
  view.rerender(<SkillInstallAgentPicker {...props} busy={false} />)
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('owner-1', { kind: 'open', reviewedTarget, value: true })
  })
  await pending
  await act(async () => {
    pending = apply('owner-1', {
      kind: 'provider',
      reviewedTarget,
      provider: 'cursor',
      checked: true
    })
  })
  const rejected = expect(pending).rejects.toThrow('viewer_target_changed')
  fireEvent.click(screen.getByRole('button', { name: /Installing for:/ }))
  await rejected
})
