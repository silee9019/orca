import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const build = vi.hoisted(() => ({ dev: false }))

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({ Settings: 'Settings' }))
vi.mock('../components/OrcaLogo', () => ({ OrcaLogo: 'OrcaLogo' }))
vi.mock('../build-variant/android-dev-build', () => ({
  get isAndroidDevBuild() {
    return build.dev
  }
}))

import { MobileHomeTopBar } from './MobileHomeTopBar'

describe('MobileHomeTopBar', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  function brandTexts(): string[] {
    act(() => {
      renderer = create(createElement(MobileHomeTopBar, { onOpenSettings: () => {} }))
    })
    return renderer!.root
      .findAll((node) => String(node.type) === 'Text')
      .flatMap((node) => node.children.filter((child) => typeof child === 'string'))
  }

  it('shows only the Orca name in the store build', () => {
    build.dev = false
    expect(brandTexts()).toEqual(['Orca'])
  })

  it('adds a DEV badge next to the name in the Android Dev build', () => {
    build.dev = true
    expect(brandTexts()).toEqual(['Orca', 'DEV'])
  })
})
