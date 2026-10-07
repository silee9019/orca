import { runViewerCommand, requireBrowserViewerConfirmation } from './browser-viewer-command'
import { readFile, stat } from 'node:fs/promises'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { RuntimeClientError } from '../runtime-client'

function runFindCommand(
  ctx: HandlerContext,
  action: 'open' | 'next' | 'previous' | 'close' | 'status'
): Promise<void> {
  return runViewerCommand(ctx, {
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    operation: 'find',
    page: getRequiredStringFlag(ctx.flags, 'page'),
    action
  })
}
function runGrabCommand(
  ctx: HandlerContext,
  action: 'start' | 'cancel' | 'rearm' | 'exit' | 'status' | 'copy' | 'copy-screenshot'
): Promise<void> {
  return runViewerCommand(ctx, {
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    operation: 'grab',
    page: getRequiredStringFlag(ctx.flags, 'page'),
    action,
    ...(action === 'start' ? { intent: getRequiredStringFlag(ctx.flags, 'intent') } : {})
  })
}

function runMarkupEditor(ctx: HandlerContext, command: unknown): Promise<void> {
  return runViewerCommand(ctx, {
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    page: getRequiredStringFlag(ctx.flags, 'page'),
    operation: 'markup-editor',
    command
  })
}

export const BROWSER_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'browser profile-ui': (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    if (action === 'switch-confirm' || action === 'new-create') {
      requireBrowserViewerConfirmation(ctx)
    }
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      operation: 'profile-ui',
      command: {
        action,
        ...(action === 'select' ? { profile: getRequiredStringFlag(ctx.flags, 'profile') } : {}),
        ...(action === 'new-name'
          ? { name: getRequiredStringFlagAllowingEmpty(ctx.flags, 'name') }
          : {})
      }
    })
  },
  'browser markup copy': (ctx) => runMarkupEditor(ctx, { action: 'copy' }),
  'browser markup text-commit': (ctx) =>
    runMarkupEditor(ctx, {
      action: 'text-commit',
      text: getRequiredStringFlagAllowingEmpty(ctx.flags, 'text')
    }),
  'browser markup text-cancel': (ctx) => runMarkupEditor(ctx, { action: 'text-cancel' }),
  'browser annotation tray': (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    if (action === 'clear') {
      requireBrowserViewerConfirmation(ctx)
    }
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      operation: 'annotation-tray',
      action
    })
  },
  'browser address': (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      operation: 'address',
      command: {
        action,
        ...(action === 'draft'
          ? { text: getRequiredStringFlagAllowingEmpty(ctx.flags, 'text') }
          : {}),
        ...(action === 'preview' || action === 'select' || action === 'highlight'
          ? { index: Number(getRequiredStringFlag(ctx.flags, 'index')) }
          : {})
      }
    })
  },
  'browser markup tool': (ctx) =>
    runMarkupEditor(ctx, { action: 'tool', value: getRequiredStringFlag(ctx.flags, 'tool') }),
  'browser markup color': (ctx) =>
    runMarkupEditor(ctx, { action: 'color', value: getRequiredStringFlag(ctx.flags, 'color') }),
  'browser markup width': (ctx) =>
    runMarkupEditor(ctx, {
      action: 'width',
      value: Number(getRequiredStringFlag(ctx.flags, 'width'))
    }),
  'browser markup font-size': (ctx) =>
    runMarkupEditor(ctx, {
      action: 'font-size',
      value: Number(getRequiredStringFlag(ctx.flags, 'font-size'))
    }),
  'browser markup undo': (ctx) => runMarkupEditor(ctx, { action: 'undo' }),
  'browser markup redo': (ctx) => runMarkupEditor(ctx, { action: 'redo' }),
  'browser markup clear': (ctx) => runMarkupEditor(ctx, { action: 'clear' }),
  'browser markup editor-status': (ctx) => runMarkupEditor(ctx, { action: 'status' }),

  'browser markup start': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'markup',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      action: 'start'
    }),
  'browser markup cancel': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'markup',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      action: 'cancel'
    }),
  'browser markup status': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'markup',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      action: 'status'
    }),

  'browser grab start': (ctx) => runGrabCommand(ctx, 'start'),
  'browser grab cancel': (ctx) => runGrabCommand(ctx, 'cancel'),
  'browser grab rearm': (ctx) => runGrabCommand(ctx, 'rearm'),
  'browser grab exit': (ctx) => runGrabCommand(ctx, 'exit'),
  'browser grab copy': (ctx) => runGrabCommand(ctx, 'copy'),
  'browser grab copy-screenshot': (ctx) => runGrabCommand(ctx, 'copy-screenshot'),
  'browser grab status': (ctx) => runGrabCommand(ctx, 'status'),
  'browser toolbar-nav': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      operation: 'toolbar-navigation',
      action: getRequiredStringFlag(ctx.flags, 'action')
    }),
  'browser find-ui open': (ctx) => runFindCommand(ctx, 'open'),
  'browser find-ui next': (ctx) => runFindCommand(ctx, 'next'),
  'browser find-ui previous': (ctx) => runFindCommand(ctx, 'previous'),
  'browser find-ui close': (ctx) => runFindCommand(ctx, 'close'),
  'browser find-ui status': (ctx) => runFindCommand(ctx, 'status'),
  'browser find-ui query': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'find-query',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      query: getRequiredStringFlagAllowingEmpty(ctx.flags, 'query')
    }),
  'browser zoom': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'zoom',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      direction: getRequiredStringFlag(ctx.flags, 'direction')
    }),
  'browser download cancel': (ctx) => {
    requireBrowserViewerConfirmation(ctx)
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'download-cancel',
      downloadId: getRequiredStringFlag(ctx.flags, 'download')
    })
  },
  'browser devtools open': (ctx) => {
    requireBrowserViewerConfirmation(ctx)
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'devtools-open',
      page: getRequiredStringFlag(ctx.flags, 'page')
    })
  },
  'browser webauthn cancel': (ctx) => {
    requireBrowserViewerConfirmation(ctx)
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'webauthn-respond',
      requestId: getRequiredStringFlag(ctx.flags, 'request'),
      credentialId: null
    })
  },
  'browser webauthn respond': async (ctx) => {
    requireBrowserViewerConfirmation(ctx)
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const requestId = getRequiredStringFlag(ctx.flags, 'request')
    const file = getRequiredStringFlag(ctx.flags, 'credential-file')
    let credentialId: string
    try {
      if ((await stat(file)).size > 4096) {
        throw new Error('credential file too large')
      }
      credentialId = (await readFile(file, 'utf8')).trim()
    } catch {
      throw new RuntimeClientError(
        'invalid_argument',
        'Could not read credential file (maximum 4096 bytes).'
      )
    }
    return runViewerCommand(ctx, { viewer, operation: 'webauthn-respond', requestId, credentialId })
  },
  'browser annotation draft-status': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'annotation-draft',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      action: 'status'
    }),
  'browser annotation draft-cancel': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'annotation-draft',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      action: 'cancel'
    }),
  'browser annotation add': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'annotation-add',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      comment: getRequiredStringFlagAllowingEmpty(ctx.flags, 'comment'),
      intent: getRequiredStringFlag(ctx.flags, 'intent')
    }),
  'browser annotation list': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'annotation-list',
      page: getRequiredStringFlag(ctx.flags, 'page')
    }),
  'browser annotation update': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'annotation-update',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      annotationId: getRequiredStringFlag(ctx.flags, 'annotation'),
      comment: getRequiredStringFlagAllowingEmpty(ctx.flags, 'comment'),
      intent: getRequiredStringFlag(ctx.flags, 'intent')
    }),
  'browser annotation rm': (ctx) => {
    requireBrowserViewerConfirmation(ctx)
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'annotation-delete',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      annotationId: getRequiredStringFlag(ctx.flags, 'annotation')
    })
  },
  'browser annotation clear': (ctx) => {
    requireBrowserViewerConfirmation(ctx)
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'annotation-clear',
      page: getRequiredStringFlag(ctx.flags, 'page')
    })
  },
  'browser history list': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'history-list'
    }),
  'browser history clear': (ctx) => {
    requireBrowserViewerConfirmation(ctx)
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'history-clear'
    })
  },
  'browser viewport-preset set': (ctx) => {
    const preset = getRequiredStringFlag(ctx.flags, 'preset')
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'viewport-preset',
      page: getRequiredStringFlag(ctx.flags, 'page'),
      preset: preset === 'default' ? null : preset
    })
  }
}
