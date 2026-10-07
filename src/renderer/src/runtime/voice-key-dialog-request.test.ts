import { afterEach, expect, it, vi } from 'vitest'
import { attachVoiceKeyDialogRequest, requestVoiceKeyDialog } from './voice-key-dialog-request'
afterEach(() => vi.unstubAllGlobals())
it('delivers only typed dialog visibility without accepting key material', () => {
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  const receive = vi.fn()
  const detach = attachVoiceKeyDialogRequest(receive)
  requestVoiceKeyDialog(true)
  requestVoiceKeyDialog(false)
  target.dispatchEvent(
    new CustomEvent('orca:voice-key-dialog', { detail: { key: 'fixture-secret' } })
  )
  expect(receive.mock.calls).toEqual([
    [true, null],
    [false, null]
  ])
  detach()
  requestVoiceKeyDialog(true)
  expect(receive).toHaveBeenCalledTimes(2)
})
