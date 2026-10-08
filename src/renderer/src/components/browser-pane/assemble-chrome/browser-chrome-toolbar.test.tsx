// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserChromeFoldStage } from './use-browser-chrome-tool-fold'
import type { BrowserChromeFoldedTool } from './browser-chrome-folded-tools'

const mocks = vi.hoisted(() => {
  const stages: readonly BrowserChromeFoldStage[] = []
  return { folded: new Set<BrowserChromeFoldStage>(), stages }
})

vi.mock('./use-browser-chrome-tool-fold', () => ({
  BROWSER_CHROME_FOLD_ORDER: [
    'import-label',
    'external',
    'devtools',
    'share',
    'import',
    'draw',
    'grab',
    'annotate'
  ],
  useBrowserChromeToolFold: (_rowRef: unknown, stages: readonly BrowserChromeFoldStage[]) => {
    mocks.stages = stages
    return mocks.folded
  }
}))

vi.mock('./browser-navigation-control-row', () => ({
  BrowserNavigationControlRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}))

vi.mock('../annotate/MarkupDrawButton', () => ({
  MarkupDrawButton: () => <button>Draw</button>
}))

vi.mock('./browser-chrome-element-tool-buttons', () => ({
  BrowserChromeElementToolButtons: () => null
}))

import { BrowserChromeToolbar } from './browser-chrome-toolbar'
import { BrowserChromeFoldedMenuItems } from './browser-chrome-folded-tools'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

const controls = {
  canGoBack: false,
  canGoForward: false,
  loading: false,
  goBack: vi.fn(),
  goForward: vi.fn(),
  reload: vi.fn(),
  navigate: vi.fn()
}
const emptyOverflowMenu = (): null => null

beforeEach(() => {
  mocks.folded = new Set()
  mocks.stages = []
})

afterEach(cleanup)

describe('BrowserChromeToolbar', () => {
  it('does not duplicate an action already provided by the surface menu', () => {
    mocks.folded = new Set(['devtools', 'external'])
    let foldedTools: readonly BrowserChromeFoldedTool[] = []

    render(
      <BrowserChromeToolbar
        controls={controls}
        addressSlot={null}
        elementTools={null}
        markup={{ active: false, disabled: false, onToggle: vi.fn(), canShowDiscoveryHint: false }}
        viewSource={{
          label: 'Open source file',
          onSelect: vi.fn(),
          alreadyInOverflowMenu: true
        }}
        openExternal={{ label: 'Open with default app', onSelect: vi.fn() }}
        overflowMenu={(overflow) => {
          foldedTools = overflow.tools
          return null
        }}
      />
    )

    expect(foldedTools.map((tool) => tool.stage)).toEqual(['external'])
  })

  it('compacts the import hint before removing it', () => {
    mocks.folded = new Set(['import-label'])
    const importControl = vi.fn(() => null)

    render(
      <BrowserChromeToolbar
        controls={controls}
        addressSlot={null}
        importControl={importControl}
        elementTools={null}
        markup={{ active: false, disabled: false, onToggle: vi.fn(), canShowDiscoveryHint: false }}
        viewSource={null}
        openExternal={null}
        overflowMenu={emptyOverflowMenu}
      />
    )

    expect(importControl).toHaveBeenCalledWith(true)
  })

  it('keeps the active tour control out of the fold sequence', () => {
    render(
      <BrowserChromeToolbar
        controls={controls}
        addressSlot={null}
        pinnedStage="grab"
        elementTools={{
          activeIntent: null,
          onStartIntent: vi.fn(),
          disabled: false,
          grabShortcutLabel: 'Cmd+Shift+C',
          annotationCount: 0
        }}
        markup={{ active: false, disabled: false, onToggle: vi.fn(), canShowDiscoveryHint: false }}
        viewSource={null}
        openExternal={null}
        overflowMenu={emptyOverflowMenu}
      />
    )

    expect(mocks.stages).not.toContain('grab')
    expect(mocks.stages).toContain('annotate')
  })

  it('keeps the same share control mounted when it moves into overflow', () => {
    function StatefulShare(): React.JSX.Element {
      const [clicks, setClicks] = useState(0)
      return <button onClick={() => setClicks((count) => count + 1)}>Share state {clicks}</button>
    }
    const props = {
      controls,
      addressSlot: null,
      elementTools: null,
      markup: { active: false, disabled: false, onToggle: vi.fn(), canShowDiscoveryHint: false },
      shareControl: () => <StatefulShare />,
      viewSource: null,
      openExternal: null,
      overflowMenu: emptyOverflowMenu
    }
    const view = render(<BrowserChromeToolbar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share state 0' }))

    mocks.folded = new Set(['share'])
    view.rerender(<BrowserChromeToolbar {...props} />)

    expect(screen.getByRole('button', { name: 'Share state 1' })).not.toBeNull()
  })
})

describe('shared chrome action ownership', () => {
  function FoldedOverflow({
    overflow,
    beforeClose
  }: {
    beforeClose?: () => void
    overflow: Parameters<React.ComponentProps<typeof BrowserChromeToolbar>['overflowMenu']>[0]
  }) {
    const [open, setOpen] = useState(true)
    return (
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger>Tools</DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={(event) => {
            beforeClose?.()
            overflow.onMenuCloseAutoFocus(event)
          }}
        >
          <BrowserChromeFoldedMenuItems
            tools={overflow.tools}
            deferUntilClose={overflow.deferUntilClose}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
  it('runs the shared action button exact parent callback once and respects disabled', () => {
    const source = vi.fn(),
      external = vi.fn()
    const view = render(
      <BrowserChromeToolbar
        controls={controls}
        addressSlot={null}
        elementTools={null}
        markup={{ active: false, disabled: false, onToggle: vi.fn(), canShowDiscoveryHint: false }}
        viewSource={{ label: 'Source parent', onSelect: source }}
        openExternal={{ label: 'External parent', onSelect: external, disabled: true }}
        overflowMenu={emptyOverflowMenu}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Source parent' }))
    fireEvent.click(screen.getByRole('button', { name: 'External parent' }))
    expect(source).toHaveBeenCalledTimes(1)
    expect(external).not.toHaveBeenCalled()
    view.unmount()
  })
  it.each(['grab', 'annotate', 'draw', 'devtools', 'external'] as const)(
    'folded %s selects only its supplied parent',
    (stage) => {
      mocks.folded = new Set([stage])
      const intent = vi.fn(),
        draw = vi.fn(),
        source = vi.fn(),
        external = vi.fn()
      render(
        <BrowserChromeToolbar
          controls={controls}
          addressSlot={null}
          elementTools={{
            activeIntent: null,
            onStartIntent: intent,
            disabled: false,
            grabShortcutLabel: '',
            annotationCount: 0
          }}
          markup={{ active: false, disabled: false, onToggle: draw, canShowDiscoveryHint: false }}
          viewSource={{ label: 'Source parent', onSelect: source }}
          openExternal={{ label: 'External parent', onSelect: external }}
          overflowMenu={(overflow) => <FoldedOverflow overflow={overflow} />}
        />
      )
      const labels = {
        grab: 'Grab page element',
        annotate: 'Annotate page element',
        draw: 'Draw on screenshot',
        devtools: 'Source parent',
        external: 'External parent'
      }
      fireEvent.click(
        screen.queryByRole('menuitemcheckbox', { name: labels[stage] }) ??
          screen.getByRole('menuitem', { name: labels[stage] })
      )
      expect(intent.mock.calls).toEqual(
        stage === 'grab' ? [['copy']] : stage === 'annotate' ? [['annotate']] : []
      )
      expect(draw).toHaveBeenCalledTimes(stage === 'draw' ? 1 : 0)
      expect(source).toHaveBeenCalledTimes(stage === 'devtools' ? 1 : 0)
      expect(external).toHaveBeenCalledTimes(stage === 'external' ? 1 : 0)
    }
  )
  it('runs deferred share only after the actual menu closes', async () => {
    let shareIsOpen = false
    const beforeClose = vi.fn(() => shareIsOpen)
    mocks.folded = new Set(['share'])
    render(
      <BrowserChromeToolbar
        controls={controls}
        addressSlot={null}
        elementTools={null}
        markup={{ active: false, disabled: false, onToggle: vi.fn(), canShowDiscoveryHint: false }}
        viewSource={null}
        openExternal={null}
        shareControl={({ open }) => {
          shareIsOpen = open
          return <output data-testid="share-open">{String(open)}</output>
        }}
        overflowMenu={(overflow) => (
          <FoldedOverflow overflow={overflow} beforeClose={beforeClose} />
        )}
      />
    )
    expect(screen.getByTestId('share-open').textContent).toBe('false')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share as artifact' }))
    expect(screen.queryByRole('menuitem', { name: 'Share as artifact' })).toBeNull()
    await waitFor(() => expect(screen.getByTestId('share-open').textContent).toBe('true'))
    expect(beforeClose).toHaveReturnedWith(false)
    expect(beforeClose).toHaveBeenCalledTimes(1)
  })
})
