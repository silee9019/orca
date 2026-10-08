// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SkillInstallWorkspaceCombobox } from './SkillInstallWorkspaceCombobox'
import {
  applySkillInstallWorkspaceViewerAction as apply,
  skillInstallWorkspaceViewerSnapshot as snapshot
} from '../../runtime/skill-install-workspace-viewer-controller'
import type { SkillInstallWorkspaceChoice } from './skill-install-workspace-choices'

const choices: SkillInstallWorkspaceChoice[] = [
  { id: 'a', label: 'Alpha', kind: 'worktree' },
  { id: 'b', label: 'Beta', kind: 'folder' }
]
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
function token(target = 'owner-1') {
  const value = snapshot(target)?.reviewedTarget
  if (!value) {
    throw new Error('missing workspace picker')
  }
  return value
}
function Picker() {
  const [value, setValue] = useState('')
  return (
    <SkillInstallWorkspaceCombobox
      viewerTarget="owner-1"
      value={value}
      onValueChange={setValue}
      choices={choices}
    />
  )
}
it('shares actual search, highlight and worktree/folder selection and clears a completed query', async () => {
  render(<Picker />)
  const reviewedTarget = token()
  fireEvent.click(screen.getByRole('combobox'))
  expect(snapshot('owner-1')?.open).toBe(true)
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('owner-1', { kind: 'query', reviewedTarget, value: 'folder Beta' })
  })
  expect((await pending)?.visibleWorkspaceIds).toEqual(['b'])
  expect(screen.getByPlaceholderText('Search workspaces...')).toHaveProperty('value', 'folder Beta')
  await expect(apply('owner-1', { kind: 'choose', reviewedTarget, id: 'a' })).rejects.toThrow(
    'skill_workspace_not_visible'
  )
  await act(async () => {
    pending = apply('owner-1', { kind: 'highlight', reviewedTarget, id: 'b' })
  })
  expect((await pending)?.highlightedId).toBe('b')
  expect(screen.getByRole('option').getAttribute('data-selected')).toBe('true')
  await act(async () => {
    pending = apply('owner-1', { kind: 'choose', reviewedTarget, id: 'b' })
  })
  expect(await pending).toMatchObject({ value: 'b', query: '', open: false })
  expect(screen.getByRole('combobox').textContent).toContain('Beta')
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
  fireEvent.change(screen.getByPlaceholderText('Search workspaces...'), {
    target: { value: 'Alpha' }
  })
  expect(snapshot('owner-1')?.visibleWorkspaceIds).toEqual(['a'])
  fireEvent.click(screen.getByRole('option'))
  expect(snapshot('owner-1')).toMatchObject({ value: 'a', query: '', open: false })
})
it('uses the actual trigger key and search focus callbacks without activating a window', async () => {
  render(<Picker />)
  const reviewedTarget = token()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('owner-1', { kind: 'trigger-key', reviewedTarget, key: 'B' })
  })
  expect(await pending).toMatchObject({ open: true, query: 'B', visibleWorkspaceIds: ['b'] })
  const trigger = screen.getAllByRole('combobox').find((element) => element.tagName === 'BUTTON')
  if (!trigger) {
    throw new Error('missing trigger')
  }
  trigger.focus()
  await act(async () => {
    pending = apply('owner-1', { kind: 'focus', reviewedTarget })
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
  expect((await pending)?.searchFocused).toBe(true)
  expect(document.activeElement).toBe(screen.getByPlaceholderText('Search workspaces...'))
  await act(async () => {
    pending = apply('owner-1', { kind: 'open', reviewedTarget, value: false })
  })
  expect(await pending).toMatchObject({ open: false, query: '' })
})
it('waits for parent value props and rejects owner changes and unmounts', async () => {
  let selected = ''
  const props = {
    choices,
    onValueChange: (value: string) => {
      selected = value
    }
  }
  const view = render(<SkillInstallWorkspaceCombobox {...props} viewerTarget="owner-1" value="" />)
  const reviewedTarget = token()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('owner-1', { kind: 'open', reviewedTarget, value: true })
  })
  await pending
  let completed = false
  await act(async () => {
    pending = apply('owner-1', { kind: 'choose', reviewedTarget, id: 'b' })
    void pending.then(() => {
      completed = true
    })
  })
  expect(completed).toBe(false)
  expect(snapshot('owner-1')).toMatchObject({ busy: true, open: false, value: '' })
  await expect(apply('owner-1', { kind: 'open', reviewedTarget, value: true })).rejects.toThrow(
    'viewer_busy'
  )
  view.rerender(
    <SkillInstallWorkspaceCombobox {...props} viewerTarget="owner-1" value={selected} />
  )
  expect((await pending)?.value).toBe('b')
  await act(async () => {
    pending = apply('owner-1', { kind: 'open', reviewedTarget, value: true })
  })
  await pending
  await act(async () => {
    pending = apply('owner-1', { kind: 'choose', reviewedTarget, id: 'a' })
  })
  const rejected = expect(pending).rejects.toThrow('viewer_target_changed')
  view.rerender(<SkillInstallWorkspaceCombobox {...props} viewerTarget="owner-2" value="b" />)
  await rejected
  const next = token('owner-2')
  expect(next).not.toBe(reviewedTarget)
  await act(async () => {
    pending = apply('owner-2', { kind: 'open', reviewedTarget: next, value: true })
  })
  await pending
  await act(async () => {
    pending = apply('owner-2', { kind: 'choose', reviewedTarget: next, id: 'a' })
  })
  const unmounted = expect(pending).rejects.toThrow('viewer_unmounted')
  view.unmount()
  await unmounted
})

it('refuses unavailable, disabled and ambiguous controls and invalidates a replaced choice list', async () => {
  await expect(apply('owner-1', { kind: 'get' })).rejects.toThrow('viewer_unavailable')
  const props = { viewerTarget: 'owner-1', value: '', onValueChange: () => undefined }
  const view = render(<SkillInstallWorkspaceCombobox {...props} choices={[]} />)
  let reviewedTarget = token()
  await expect(apply('owner-1', { kind: 'open', reviewedTarget, value: true })).rejects.toThrow(
    'skill_workspace_unavailable'
  )
  view.rerender(<SkillInstallWorkspaceCombobox {...props} choices={choices} disabled />)
  reviewedTarget = token()
  expect((await apply('owner-1', { kind: 'get' })).busy).toBe(true)
  await expect(apply('owner-1', { kind: 'open', reviewedTarget, value: true })).rejects.toThrow(
    'viewer_busy'
  )
  view.rerender(<SkillInstallWorkspaceCombobox {...props} choices={choices} />)
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('owner-1', { kind: 'open', reviewedTarget, value: true })
  })
  await pending
  await act(async () => {
    pending = apply('owner-1', { kind: 'choose', reviewedTarget, id: 'a' })
  })
  const rejected = expect(pending).rejects.toThrow('viewer_target_changed')
  view.rerender(
    <SkillInstallWorkspaceCombobox
      {...props}
      choices={choices.filter((choice) => choice.id !== 'a')}
    />
  )
  await rejected
  expect(token()).not.toBe(reviewedTarget)
  view.rerender(
    <>
      <Picker />
      <Picker />
    </>
  )
  await expect(apply('owner-1', { kind: 'get' })).rejects.toThrow('viewer_ambiguous')
})

it('cancels delayed search focus when its owner changes before the animation frame', async () => {
  const props = { choices, value: '', onValueChange: () => undefined }
  const view = render(<SkillInstallWorkspaceCombobox {...props} viewerTarget="owner-1" />)
  const reviewedTarget = token()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('owner-1', { kind: 'open', reviewedTarget, value: true })
  })
  await pending
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
  const trigger = screen.getAllByRole('combobox').find((element) => element.tagName === 'BUTTON')
  if (!trigger) {
    throw new Error('missing trigger')
  }
  trigger.focus()
  expect(document.activeElement).toBe(trigger)
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 1000
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    frameId += 1
    frames.set(frameId, callback)
    return frameId
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
  await act(async () => {
    pending = apply('owner-1', { kind: 'focus', reviewedTarget })
  })
  expect(frames.size).toBe(2)
  const rejected = expect(pending).rejects.toThrow('viewer_target_changed')
  view.rerender(<SkillInstallWorkspaceCombobox {...props} viewerTarget="owner-2" />)
  await rejected
  expect(frames.size).toBe(0)
  expect(document.activeElement).toBe(trigger)
})
