// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { useAppStore } from '@/store'
import { applySkillsViewerAction } from '../../runtime/skills-viewer-controller'
import { SkillsViewerActionSchema } from '../../../../shared/skills-viewer-command'
import type { SkillDeleteRequest } from '../../../../shared/skill-delete-contract'
import SkillsPage from './SkillsPage'
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
let root: Root | undefined
let container: HTMLDivElement
const initialState = useAppStore.getState()
const skill = {
  id: 'alpha',
  name: 'alpha',
  description: null,
  providers: ['agent-skills'],
  sourceKind: 'home',
  sourceLabel: 'Home',
  rootPath: '/fixture/skills',
  directoryPath: '/fixture/skills/alpha',
  skillFilePath: '/fixture/skills/alpha/SKILL.md',
  installed: true,
  updatedAt: 1
}
const previewDelete = vi.fn()
const deleteSkills = vi.fn()
async function apply(action: unknown) {
  let request: ReturnType<typeof applySkillsViewerAction> | undefined
  await act(async () => {
    request = applySkillsViewerAction(SkillsViewerActionSchema.parse(action))
    void request.catch(() => undefined)
  })
  return request
}
async function beginDelete() {
  await apply({ kind: 'mode', value: 'delete' })
  await apply({ kind: 'select-visible' })
  let request: ReturnType<typeof applySkillsViewerAction> | undefined
  await act(async () => {
    request = applySkillsViewerAction(SkillsViewerActionSchema.parse({ kind: 'delete-selected' }))
    void request.catch(() => undefined)
  })
  return { request }
}
async function reviewedOperation() {
  return z
    .object({ deletionConfirmation: z.object({ operationId: z.uuid() }) })
    .parse(await apply({ kind: 'get' })).deletionConfirmation.operationId
}
beforeEach(async () => {
  previewDelete.mockReset().mockImplementation(async (request: SkillDeleteRequest) => ({
    operationId: request.operationId,
    skills: [
      {
        id: 'alpha',
        name: 'alpha',
        canonicalPath: skill.skillFilePath,
        placements: [{ path: skill.directoryPath, kind: 'canonical', rootLabel: 'Home' }]
      }
    ]
  }))
  deleteSkills.mockReset().mockImplementation(async (request: SkillDeleteRequest) => ({
    operationId: request.operationId,
    skills: [{ id: 'alpha', name: 'alpha', status: 'partial', removedPaths: [skill.directoryPath] }]
  }))
  useAppStore.setState({
    runtimeEnvironmentCatalogSettled: true,
    runtimeEnvironments: [],
    settings: null
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: {
        discover: async () => ({ skills: [skill], sources: [], scannedAt: 1 }),
        deleteSupported: async () => true,
        onInstallProgress: () => () => {},
        previewDelete,
        delete: deleteSkills
      },
      preflight: { detectAgents: async () => [] },
      runtimeEnvironments: { call: vi.fn() }
    }
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root?.render(
      <TooltipProvider>
        <ConfirmationDialogProvider>
          <SkillsPage />
        </ConfirmationDialogProvider>
      </TooltipProvider>
    )
  )
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container.remove()
  useAppStore.setState(initialState)
  Reflect.deleteProperty(window, 'api')
  vi.restoreAllMocks()
})
it('reviews the actual delete plan, cancels without deleting and commits the result band', async () => {
  const cancelled = await beginDelete()
  const first = await reviewedOperation()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(skill.directoryPath)
  await expect(
    apply({
      kind: 'delete-confirmation',
      operationId: '00000000-0000-4000-8000-000000000001',
      confirmed: true
    })
  ).rejects.toThrow('viewer_target_changed')
  await apply({ kind: 'delete-confirmation', operationId: first, confirmed: false })
  await expect(cancelled.request).rejects.toThrow('skills_delete_not_completed')
  expect(deleteSkills).not.toHaveBeenCalled()
  const approved = await beginDelete()
  const second = await reviewedOperation()
  expect(second).not.toBe(first)
  await expect(
    apply({ kind: 'delete-confirmation', operationId: first, confirmed: true })
  ).rejects.toThrow('viewer_target_changed')
  await apply({ kind: 'delete-confirmation', operationId: second, confirmed: true })
  await expect(approved.request).resolves.toMatchObject({ deleteResult: { operationId: second } })
  expect(deleteSkills).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ operationId: second })
  )
  expect(container.querySelector('div[role="status"]')).not.toBeNull()
  await expect(apply({ kind: 'delete-result-dismiss' })).resolves.toMatchObject({
    deleteResult: null
  })
  expect(container.querySelector('div[role="status"]')).toBeNull()
})
it('aborts the old confirmation when the owner becomes unresolved or the page unmounts', async () => {
  const pending = await beginDelete()
  const operationId = await reviewedOperation()
  await act(async () => useAppStore.setState({ runtimeEnvironmentCatalogSettled: false }))
  await expect(pending.request).rejects.toThrow('viewer_target_changed')
  await expect(
    apply({ kind: 'delete-confirmation', operationId, confirmed: true })
  ).rejects.toThrow('viewer_unavailable')
  expect(deleteSkills).not.toHaveBeenCalled()
  await act(async () => useAppStore.setState({ runtimeEnvironmentCatalogSettled: true }))
  const unmounted = await beginDelete()
  await reviewedOperation()
  await act(async () => root?.unmount())
  root = undefined
  await expect(unmounted.request).rejects.toThrow('viewer_unmounted')
  expect(deleteSkills).not.toHaveBeenCalled()
})

it('ignores a late preview after owner loss and a late delete result after unmount', async () => {
  let releasePreview: (() => void) | undefined
  const previewWait = new Promise<void>((resolve) => {
    releasePreview = resolve
  })
  const originalPreview = previewDelete.getMockImplementation()
  previewDelete.mockImplementationOnce(async (request: SkillDeleteRequest) => {
    await previewWait
    return originalPreview?.(request)
  })
  const previewing = await beginDelete()
  await expect(apply({ kind: 'delete-selected' })).rejects.toThrow('viewer_busy')
  await act(async () => useAppStore.setState({ runtimeEnvironmentCatalogSettled: false }))
  await expect(previewing.request).rejects.toThrow('viewer_target_changed')
  await act(async () => releasePreview?.())
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(deleteSkills).not.toHaveBeenCalled()
  await act(async () => useAppStore.setState({ runtimeEnvironmentCatalogSettled: true }))
  let releaseDelete: ((value: unknown) => void) | undefined
  deleteSkills.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseDelete = resolve
      })
  )
  const deleting = await beginDelete()
  const operationId = await reviewedOperation()
  await apply({ kind: 'delete-confirmation', operationId, confirmed: true })
  expect(deleteSkills).toHaveBeenCalledOnce()
  await act(async () => root?.unmount())
  root = undefined
  await expect(deleting.request).rejects.toThrow('viewer_unmounted')
  await act(async () => releaseDelete?.({ operationId, skills: [] }))
  expect(container.children).toHaveLength(0)
})
