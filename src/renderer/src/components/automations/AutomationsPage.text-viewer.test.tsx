// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  api,
  mocks,
  installAutomationsPageHarness,
  settleHostQueries
} from './automations-page-test-harness'
import { AutomationViewerActionSchema } from '../../../../shared/automation-viewer-command'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
const monaco = vi.hoisted(() => ({
  props: new Map<string, unknown>(),
  content: '',
  mounts: 0,
  edits: 0,
  undoStops: 0,
  find: vi.fn(),
  disposed: vi.fn()
}))
vi.mock('@/lib/monaco-setup', () => ({}))
vi.mock('@monaco-editor/react', async () => {
  const { useLayoutEffect, useRef } = await import('react')
  return {
    default: function MonacoProvider(props: Record<string, unknown>) {
      monaco.props = new Map(Object.entries(props))
      const root = useRef<HTMLDivElement>(null)
      useLayoutEffect(() => {
        const onMount = monaco.props.get('onMount')
        const node = root.current
        if (typeof onMount !== 'function' || !node) {
          throw new Error('missing Monaco mount')
        }
        const disposers: (() => void)[] = []
        monaco.content = 'retained stale prompt'
        monaco.mounts += 1
        onMount({
          getContainerDomNode: () => node,
          getAction: () => ({ run: monaco.find }),
          onDidDispose: (callback: () => void) => {
            disposers.push(callback)
          },
          pushUndoStop: () => {
            monaco.undoStops += 1
          },
          getModel: () => ({
            getValue: () => monaco.content,
            getEOL: () => '\n',
            getFullModelRange: () => ({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: monaco.content.length + 1
            }),
            pushEditOperations: (
              _selections: unknown,
              edits: { text: string; range: { startColumn: number; endColumn: number } }[]
            ) => {
              for (const edit of edits) {
                monaco.content =
                  monaco.content.slice(0, edit.range.startColumn - 1) +
                  edit.text +
                  monaco.content.slice(edit.range.endColumn - 1)
              }
              monaco.edits += 1
              const onChange = monaco.props.get('onChange')
              if (typeof onChange !== 'function') {
                throw new Error('missing Monaco change')
              }
              onChange(monaco.content)
            }
          })
        })
        return () => {
          disposers.forEach((dispose) => dispose())
          monaco.disposed()
        }
      }, [])
      return (
        <div ref={root} data-testid="monaco-provider">
          <input
            aria-label="Provider input"
            onChange={(event) => {
              monaco.content = event.target.value
              const onChange = monaco.props.get('onChange')
              if (typeof onChange !== 'function') {
                throw new Error('missing Monaco change')
              }
              onChange(monaco.content)
            }}
          />
        </div>
      )
    }
  }
})
installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
async function request(action: Parameters<typeof apply>[0]) {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
async function editor() {
  const form = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
  if (!form) {
    throw new Error('missing editor')
  }
  return form
}
async function focusName(reviewedTarget: string) {
  const current = await editor()
  return request(
    AutomationViewerActionSchema.parse({
      kind: 'editor-form',
      action: {
        kind: 'text-form',
        reviewedTarget: current.reviewedTarget,
        action: { kind: 'focus-name', reviewedTarget }
      }
    })
  )
}
async function mount() {
  vi.resetModules()
  monaco.mounts = 0
  monaco.edits = 0
  monaco.undoStops = 0
  vi.doUnmock('./AutomationEditorDialog')
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  const view = render(<Page />)
  await settleHostQueries()
  await request({ kind: 'editor-create' })
  return { view, redraw: () => view.rerender(<Page />) }
}
it('shares actual name focus and Monaco native/CLI draft updates without remounting or losing undo stops', async () => {
  await mount()
  const first = await editor()
  expect(monaco.mounts).toBe(1)
  expect(monaco.content).toBe(first.prompt)
  expect(monaco.edits).toBe(1)
  expect(monaco.undoStops).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Edit name' }))
  const title = screen.getByRole('textbox', { name: 'Automation name' })
  expect(document.activeElement).toBe(title)
  screen.getByRole('textbox', { name: 'Provider input' }).focus()
  if (!first.text) {
    throw new Error('missing text form')
  }
  await focusName(first.text.reviewedTarget)
  expect(document.activeElement).toBe(title)
  fireEvent.change(screen.getByRole('textbox', { name: 'Provider input' }), {
    target: { value: 'native prompt' }
  })
  const native = await editor()
  expect(native.prompt).toBe('native prompt')
  expect(monaco.edits).toBe(1)
  await request({
    kind: 'editor-form',
    action: { kind: 'prompt', reviewedTarget: native.reviewedTarget, value: 'CLI replacement' }
  })
  expect(monaco.content).toBe('CLI replacement')
  expect((await editor()).prompt).toBe('CLI replacement')
  expect(monaco.undoStops).toBe(2)
  expect(monaco.mounts).toBe(1)
  await expect(focusName(first.text.reviewedTarget)).rejects.toThrow('viewer_target_changed')
  expect(api.automations.create).not.toHaveBeenCalled()
  expect(api.automations.update).not.toHaveBeenCalled()
})
it('dismisses the actual PromptSection through Monaco Escape and public CLI close', async () => {
  await mount()
  const provider = screen.getByTestId('monaco-provider')
  const find = document.createElement('div')
  find.className = 'find-widget visible'
  provider.appendChild(find)
  fireEvent.keyDown(provider, { key: 'Escape' })
  expect((await editor()).open).toBe(true)
  find.setAttribute('aria-hidden', 'true')
  fireEvent.keyDown(provider, { key: 'Escape' })
  expect(screen.queryByRole('textbox', { name: 'Automation name' })).toBeNull()
  expect(monaco.disposed).toHaveBeenCalledOnce()
  await request({ kind: 'editor-create' })
  const current = await editor()
  await request({
    kind: 'editor-form',
    action: { kind: 'close', reviewedTarget: current.reviewedTarget }
  })
  expect(screen.queryByRole('textbox', { name: 'Automation name' })).toBeNull()
  expect(monaco.disposed).toHaveBeenCalledTimes(2)
  expect(api.automations.create).not.toHaveBeenCalled()
})
it('invalidates name focus reviews across profile ABA and modal changes', async () => {
  const { redraw } = await mount()
  const first = (await editor()).text
  if (!first) {
    throw new Error('missing text form')
  }
  const profile = mocks.state.activeOrcaProfileId
  mocks.state.activeOrcaProfileId = 'another-profile'
  redraw()
  mocks.state.activeOrcaProfileId = profile
  redraw()
  await expect(focusName(first.reviewedTarget)).rejects.toThrow('viewer_target_changed')
  mocks.state.activeModal = 'settings'
  redraw()
  const modal = (await editor()).text
  if (!modal) {
    throw new Error('missing text form')
  }
  await expect(focusName(modal.reviewedTarget)).rejects.toThrow('viewer_modal_open')
})
