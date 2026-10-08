import { defineMethod } from '../core'
import { DesktopStarPromptParams } from '../../../../shared/rpc-contract/app-lifecycle-params'
import { assertDesktopAppContext, assertDesktopAppTarget } from './desktop-app-target'

export const DESKTOP_STAR_PROMPT_METHODS = [
  defineMethod({
    name: 'desktopStarPrompt.control',
    params: DesktopStarPromptParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      if (params.action === 'star') {
        if (!params.confirmTarget) {
          throw new Error(
            'Confirm the exact app target before starring the repository using its account'
          )
        }
        assertDesktopAppTarget(context, params.confirmTarget)
      }
      const operations = (
        await import('../../../star-nag/cli-operations')
      ).getStarNagCliOperations()
      switch (params.action) {
        case 'status':
          return operations.status()
        case 'dismiss':
          operations.dismiss()
          break
        case 'later':
          operations.later()
          break
        case 'disable':
          operations.disable()
          break
        case 'complete':
          operations.complete()
          break
        case 'open-web':
          operations.openWeb()
          return {
            state: 'handoff-recorded' as const,
            url: 'https://github.com/stablyai/orca',
            verifiedStar: false
          }
        case 'star':
          return { starred: await operations.star() }
        case 'show': {
          if (params.viewer === undefined) {
            throw new Error('Specify the desktop viewer for the star prompt')
          }
          const { BrowserWindow } = await import('electron')
          const { isTrustedUIRenderer } = await import('../../../ipc/ui')
          const window = BrowserWindow.fromId(params.viewer)
          if (!window || window.isDestroyed() || !isTrustedUIRenderer(window.webContents)) {
            throw new Error('The desktop viewer is unavailable')
          }
          return { shown: operations.show(window), viewer: params.viewer }
        }
      }
      return operations.status()
    }
  })
]
