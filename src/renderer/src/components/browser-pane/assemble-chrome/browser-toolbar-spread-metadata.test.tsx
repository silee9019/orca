// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../../ui/tooltip'
import { BrowserChromeElementToolButtons } from './browser-chrome-element-tool-buttons'
import { BrowserNavigationControlRow } from './browser-navigation-control-row'

afterEach(cleanup)
it('adds only tour anchor metadata while preserving the separate copy and annotation callbacks', () => {
  const start = vi.fn()
  const tree = (anchors: boolean) => (
    <TooltipProvider>
      <BrowserChromeElementToolButtons
        showGrab
        showAnnotate
        showTourAnchors={anchors}
        tools={{
          activeIntent: null,
          onStartIntent: start,
          disabled: false,
          grabShortcutLabel: '',
          annotationCount: 0
        }}
      />
    </TooltipProvider>
  )
  const view = render(tree(true))
  const copy = screen.getByRole('button', { name: 'Grab page element' })
  const annotate = screen.getByRole('button', { name: 'Annotate page element' })
  expect(copy.getAttribute('data-contextual-tour-target')).toBe('browser-grab-control')
  expect(annotate.getAttribute('data-contextual-tour-target')).toBe('browser-annotation-control')
  fireEvent.click(copy)
  fireEvent.click(annotate)
  expect(start.mock.calls).toEqual([['copy'], ['annotate']])
  view.rerender(tree(false))
  expect(copy.hasAttribute('data-contextual-tour-target')).toBe(false)
  expect(annotate.hasAttribute('data-contextual-tour-target')).toBe(false)
  expect(start).toHaveBeenCalledTimes(2)
})
it('adds and removes toolbar tour metadata without invoking navigation callbacks', () => {
  const back = vi.fn()
  const forward = vi.fn()
  const reload = vi.fn()
  const tree = (anchors: boolean) => (
    <BrowserNavigationControlRow
      showTourAnchors={anchors}
      addressSlot={null}
      controls={{
        canGoBack: true,
        canGoForward: true,
        loading: false,
        goBack: back,
        goForward: forward,
        reload,
        navigate: () => {}
      }}
    />
  )
  const view = render(tree(true))
  expect(document.querySelector('[data-contextual-tour-target="browser-toolbar"]')).not.toBeNull()
  view.rerender(tree(false))
  expect(document.querySelector('[data-contextual-tour-target="browser-toolbar"]')).toBeNull()
  expect(back).not.toHaveBeenCalled()
  expect(forward).not.toHaveBeenCalled()
  expect(reload).not.toHaveBeenCalled()
})
