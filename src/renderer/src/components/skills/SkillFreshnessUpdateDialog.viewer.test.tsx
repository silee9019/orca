// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  SkillFreshnessInventory,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '../../../../shared/skill-freshness'
import type { SkillFreshnessViewerAction } from '../../../../shared/skill-freshness-viewer-command'
import { applySkillFreshnessViewerAction } from '@/runtime/skill-freshness-viewer-controller'
import { SkillFreshnessUpdateDialog } from './SkillFreshnessUpdateDialog'
import { eligibleInventory } from './skill-freshness-dialog-test-fixture'
import { _resetSkillUpdateRunStore } from './skill-update-run-store'
import { consumeSkillFreshnessUpdateDialogRequest } from './skill-freshness-update-dialog'

const mocks = vi.hoisted(() => ({
  inventory: null as SkillFreshnessInventory | null,
  loading: false,
  local: true,
  refresh: vi.fn()
}))
vi.mock('@/hooks/useSkillFreshness', () => ({
  useSkillFreshness: () => ({
    inventory: mocks.inventory,
    loading: mocks.loading,
    error: null,
    refresh: mocks.refresh
  })
}))
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({ canUseLocalSkillFreshness: mocks.local })
}))
let pushRun: (run: SkillUpdateRun) => void = () => undefined
const skills = {
  startUpdateRun: vi
    .fn<() => Promise<SkillUpdateStartResult>>()
    .mockResolvedValue({ started: true }),
  cancelUpdateRun: vi.fn().mockResolvedValue(undefined),
  acknowledgeUpdateRun: vi.fn().mockResolvedValue(undefined),
  getUpdateRun: vi.fn().mockResolvedValue({ state: 'idle' }),
  onUpdateRun: vi.fn((listener: (run: SkillUpdateRun) => void) => {
    pushRun = listener
    return () => undefined
  })
}
beforeEach(() => {
  _resetSkillUpdateRunStore()
  consumeSkillFreshnessUpdateDialogRequest()
  mocks.inventory = eligibleInventory()
  mocks.loading = false
  mocks.local = true
  mocks.refresh.mockReset()
  vi.clearAllMocks()
  skills.startUpdateRun.mockReset().mockResolvedValue({ started: true })
  skills.cancelUpdateRun.mockReset().mockResolvedValue(undefined)
  skills.acknowledgeUpdateRun.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', { configurable: true, value: { skills } })
})
afterEach(() => {
  cleanup()
  _resetSkillUpdateRunStore()
  consumeSkillFreshnessUpdateDialogRequest()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
it('opens the existing global dialog, submits eligible names, and closes without cancelling a running update', async () => {
  await act(async () => {
    render(<SkillFreshnessUpdateDialog />)
  })
  await expect(applySkillFreshnessViewerAction({ kind: 'get' })).resolves.toMatchObject({
    open: false,
    eligibleNames: ['orca-cli']
  })
  let request: ReturnType<typeof applySkillFreshnessViewerAction> | undefined
  await act(async () => {
    request = applySkillFreshnessViewerAction({ kind: 'open', value: true })
  })
  await expect(request).resolves.toMatchObject({ open: true })
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => {
    request = applySkillFreshnessViewerAction({ kind: 'update' })
  })
  await expect(request).resolves.toMatchObject({ accepted: true })
  expect(skills.startUpdateRun).toHaveBeenCalledExactlyOnceWith(['orca-cli'])
  await act(async () => {
    pushRun({ state: 'running', names: ['orca-cli'], startedAt: 1, output: '' })
  })
  await act(async () => {
    request = applySkillFreshnessViewerAction({ kind: 'open', value: false })
  })
  await expect(request).resolves.toMatchObject({ open: false, run: { state: 'running' } })
  expect(skills.cancelUpdateRun).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

async function apply(action: SkillFreshnessViewerAction) {
  let request: ReturnType<typeof applySkillFreshnessViewerAction> | undefined
  await act(async () => {
    request = applySkillFreshnessViewerAction(action)
    void request.catch(() => undefined)
  })
  return request
}
async function mountOpen() {
  await act(async () => {
    render(<SkillFreshnessUpdateDialog />)
  })
  await apply({ kind: 'open', value: true })
}
const failedRun: SkillUpdateRun = {
  state: 'error',
  names: ['orca-cli', 'orchestration'],
  failedNames: ['orchestration'],
  finishedAt: 3,
  output: 'failed',
  message: 'update failed'
}
it('uses live eligibility and refuses remote or loading inventories', async () => {
  await mountOpen()
  await expect(
    applySkillFreshnessViewerAction({ kind: 'update', names: ['unknown'] })
  ).rejects.toThrow('skill_update_name_ineligible')
  mocks.inventory = null
  await act(async () => {
    pushRun({ state: 'idle' })
  })
  await expect(applySkillFreshnessViewerAction({ kind: 'update' })).rejects.toThrow(
    'skill_update_name_ineligible'
  )
  mocks.inventory = eligibleInventory()
  mocks.local = false
  await act(async () => {
    pushRun({ state: 'idle' })
  })
  await expect(applySkillFreshnessViewerAction({ kind: 'update' })).rejects.toThrow(
    'local_inventory_unavailable'
  )
  mocks.local = true
  mocks.loading = true
  await act(async () => {
    pushRun({ state: 'idle' })
  })
  await expect(applySkillFreshnessViewerAction({ kind: 'update' })).rejects.toThrow('viewer_busy')
  expect(skills.startUpdateRun).not.toHaveBeenCalled()
})
it('retries only failed names while inventory refreshes, and reports stop acceptance without completion', async () => {
  await mountOpen()
  mocks.inventory = null
  mocks.loading = true
  await act(async () => {
    pushRun(failedRun)
  })
  await expect(apply({ kind: 'retry' })).resolves.toMatchObject({
    accepted: true,
    run: { state: 'error' }
  })
  expect(skills.startUpdateRun).toHaveBeenCalledExactlyOnceWith(['orchestration'])
  await act(async () => {
    pushRun({ state: 'running', names: ['orchestration'], startedAt: 4, output: '' })
  })
  await expect(apply({ kind: 'stop' })).resolves.toMatchObject({
    accepted: true,
    run: { state: 'running' }
  })
  await act(async () => {
    pushRun({
      state: 'running',
      names: ['orchestration'],
      startedAt: 4,
      output: '',
      stopping: true
    })
  })
  await expect(applySkillFreshnessViewerAction({ kind: 'stop' })).rejects.toThrow('not_stoppable')
  expect(skills.cancelUpdateRun).toHaveBeenCalledOnce()
})
it('rejects declined starts and failed stop acknowledgements', async () => {
  await mountOpen()
  skills.startUpdateRun.mockResolvedValueOnce({ started: false, reason: 'already-running' })
  await expect(apply({ kind: 'update' })).rejects.toThrow(
    'skill_update_start_failed:already-running'
  )
  await act(async () => {
    pushRun({ state: 'running', names: ['orca-cli'], startedAt: 1, output: '' })
  })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  skills.cancelUpdateRun.mockRejectedValueOnce(new Error('offline'))
  await expect(apply({ kind: 'stop' })).rejects.toThrow('skill_update_stop_failed')
})
it('waits for result acknowledgement and rejects its failure without cancelling', async () => {
  await mountOpen()
  await act(async () => {
    pushRun(failedRun)
  })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  skills.acknowledgeUpdateRun.mockRejectedValueOnce(new Error('offline'))
  await expect(apply({ kind: 'open', value: false })).rejects.toThrow('acknowledgement_failed')
  expect(skills.acknowledgeUpdateRun).toHaveBeenCalledOnce()
  expect(skills.cancelUpdateRun).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('copies only the targeted failed-name command and rejects clipboard failures', async () => {
  await mountOpen()
  await act(async () => {
    pushRun(failedRun)
  })
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
  await expect(apply({ kind: 'copy-command' })).resolves.toMatchObject({ copied: true })
  expect(writeText).toHaveBeenCalledOnce()
  expect(writeText.mock.calls[0]?.[0]).toContain('orchestration')
  expect(writeText.mock.calls[0]?.[0]).not.toContain('orca-cli')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  writeText.mockRejectedValueOnce(new Error('denied'))
  await expect(apply({ kind: 'copy-command' })).rejects.toThrow('skill_update_copy_failed')
})
it('refreshes the live inventory before acknowledging', async () => {
  await mountOpen()
  mocks.refresh.mockImplementation(async () => {
    mocks.inventory = { ...eligibleInventory(), eligibleUpdateNames: [], scannedAt: 2 }
  })
  await expect(apply({ kind: 'refresh' })).resolves.toMatchObject({
    eligibleNames: [],
    inventory: { scannedAt: 2 }
  })
  expect(mocks.refresh).toHaveBeenCalledOnce()
})
