// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { requestBrowserMarkupHint } from '@/runtime/browser-markup-hint-request'
import { MarkupDrawButton } from './MarkupDrawButton'
const initial = useAppStore.getInitialState()
beforeEach(() => {
  localStorage.removeItem('orca.browser.markup-draw-hint-seen')
  useAppStore.setState({ persistedUIReady: true })
})
afterEach(async () => {
  cleanup()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  useAppStore.setState(initial, true)
  localStorage.removeItem('orca.browser.markup-draw-hint-seen')
})
function mount(ownerActive = true, disabled = false) {
  function Owner() {
    const [active, setActive] = useState(false)
    return (
      <TooltipProvider>
        <MarkupDrawButton
          commandOwner={{ page: 'page', active: ownerActive }}
          surfaceActive={ownerActive}
          disabled={disabled}
          active={active}
          onClick={() => setActive(!active)}
        />
      </TooltipProvider>
    )
  }
  return render(<Owner />)
}
async function command(action: 'toggle' | 'dismiss' | 'status') {
  let pending: ReturnType<typeof requestBrowserMarkupHint> | undefined
  await act(async () => {
    pending = requestBrowserMarkupHint('page', action, Date.now() + 1000)
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing hint request')
  }
  return pending
}
it('dismisses the existing visible discovery hint and reads its committed state', async () => {
  const view = mount()
  expect(await command('status')).toMatchObject({ hintOpen: true, active: false })
  expect(view.getByText('Got it')).toBeTruthy()
  expect(await command('dismiss')).toMatchObject({ hintOpen: false, active: false })
  expect(view.queryByText('Got it')).toBeNull()
})
it('reuses the actual startMarkup callback to dismiss the hint and toggle the tool', async () => {
  mount()
  expect(await command('toggle')).toMatchObject({ hintOpen: false, active: true })
  expect(await command('toggle')).toMatchObject({ hintOpen: false, active: false })
})
it('refuses inactive, disabled and duplicate active button owners before toggling', async () => {
  const inactive = mount(false)
  await expect(command('toggle')).rejects.toThrow('browser_markup_hint_inactive')
  inactive.unmount()
  const disabled = mount(true, true)
  await expect(command('toggle')).rejects.toThrow('browser_markup_hint_disabled')
  disabled.unmount()
  mount()
  mount()
  await expect(command('toggle')).rejects.toThrow('browser_markup_hint_owner_ambiguous')
})

it.each(['button', 'command'] as const)(
  'preserves opening input focus and restores the original trigger after %s dismissal',
  async (dismissal) => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    try {
      const view = mount()
      const trigger = view.getByRole('button', { name: 'Draw on screenshot' }).parentElement
      expect(trigger).not.toBeNull()
      expect(view.getByText('Got it')).toBeTruthy()
      expect(document.activeElement).toBe(input)
      if (dismissal === 'button') {
        fireEvent.click(view.getByText('Got it'))
      } else {
        expect(await command('dismiss')).toMatchObject({ hintOpen: false })
      }
      await waitFor(() => expect(document.activeElement).toBe(trigger))
    } finally {
      input.remove()
    }
  }
)
