// @vitest-environment happy-dom
import { Suspense, lazy, createRef } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useRenderedActivePage } from './use-rendered-active-page'

afterEach(cleanup)
it('publishes only after the lazy entry commits and clears on unmount', async () => {
  const contentRef = createRef<HTMLDivElement>()
  let ready: (() => void) | undefined
  const Page = lazy(
    () =>
      new Promise<{ default: () => React.JSX.Element }>((resolve) => {
        ready = () => resolve({ default: () => <span>Settings</span> })
      })
  )
  function Entry() {
    useRenderedActivePage(contentRef, 'settings')
    return <Page />
  }
  const mounted = render(
    <div ref={contentRef}>
      <Suspense fallback={null}>
        <Entry />
      </Suspense>
    </div>
  )
  const content = contentRef.current
  expect(content?.dataset.renderedActivePage).toBeUndefined()
  await act(async () => {
    ready?.()
  })
  expect(content?.dataset.renderedActivePage).toBe('settings')
  mounted.unmount()
  expect(content?.dataset.renderedActivePage).toBeUndefined()
})
