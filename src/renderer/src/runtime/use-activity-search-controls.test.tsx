/** @vitest-environment happy-dom */
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { captureActivitySearchControl } from './activity-search-controls'
import { useActivitySearchControls } from './use-activity-search-controls'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it('publishes committed local query and actual input without replacing the captured parent', async () => {
  function Surface() {
    const [query, setQuery] = useState('before')
    const input = useRef<HTMLInputElement>(null)
    useActivitySearchControls('activity-page', query, setQuery, input)
    return <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} />
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<Surface />))
    const control = captureActivitySearchControl('activity-page')
    expect(control.getQuery()).toBe('before')
    await act(async () => control.setQuery('after'))
    expect(captureActivitySearchControl('activity-page')).toBe(control)
    expect(control.getQuery()).toBe('after')
    expect(control.getInput()?.value).toBe('after')
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
  expect(() => captureActivitySearchControl('activity-page')).toThrow(
    'activity_surface_unavailable'
  )
})
