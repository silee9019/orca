import { normalizeRepoBadgeColor } from '../../shared/repo-badge-color'
import { DesktopNativeMenuParams, AppSurfaceAction } from '../../shared/app-surface-control'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { isReleaseChannel } from '../../shared/release-channel'
import {
  DesktopOnboardingUpdateParams,
  DesktopTelemetryEventParams
} from '../../shared/rpc-contract/app-lifecycle-params'
import {
  stringFlag,
  confirmTarget,
  viewer,
  printCall,
  readAppInput,
  requiredFlag
} from './app-lifecycle-command'
import { APP_ASSET_HANDLERS } from './app-lifecycle-assets'

export const APP_LIFECYCLE_HANDLERS: Record<string, CommandHandler> = {
  ...APP_ASSET_HANDLERS,
  'app repo-color': (context) => {
    const input = requiredFlag(context.flags, 'color').trim()
    const color = /^#?[0-9a-fA-F]{6}$/.test(input) ? normalizeRepoBadgeColor(input) : null
    if (!color) {
      throw new RuntimeClientError('invalid_argument', 'Specify a complete six-digit hex color')
    }
    return printCall(context, 'repo.update', {
      repo: requiredFlag(context.flags, 'repo'),
      updates: { badgeColor: color }
    })
  },
  'app native-menu': (context) =>
    printCall(
      context,
      'app.nativeMenu',
      DesktopNativeMenuParams.parse({
        confirmTarget: confirmTarget(context.flags),
        action: requiredFlag(context.flags, 'action')
      })
    ),
  'app view control': async (context) =>
    printCall(context, 'app.surfaceControl', {
      confirmTarget: confirmTarget(context.flags),
      viewer: viewer(context.flags),
      action: AppSurfaceAction.parse(await readAppInput(context))
    }),
  'app quit': (context) =>
    printCall(context, 'app.control', {
      confirmTarget: confirmTarget(context.flags),
      viewer: viewer(context.flags),
      action: 'quit'
    }),
  'app restart': (context) =>
    printCall(context, 'app.control', {
      confirmTarget: confirmTarget(context.flags),
      viewer: viewer(context.flags),
      action: 'restart'
    }),
  'app relaunch': (context) =>
    printCall(context, 'app.control', {
      confirmTarget: confirmTarget(context.flags),
      viewer: viewer(context.flags),
      action: 'relaunch'
    }),
  'app reload': (context) =>
    printCall(context, 'app.control', {
      confirmTarget: confirmTarget(context.flags),
      viewer: viewer(context.flags),
      action: 'reload'
    }),
  'app status': (context) => printCall(context, 'app.getStatus'),
  'app platform': (context) => printCall(context, 'app.platform'),
  'app shells': (context) => printCall(context, 'app.shellAvailability'),
  'app wsl-distros': (context) => printCall(context, 'app.wslDistros'),
  'app update status': (context) => printCall(context, 'desktopUpdater.getStatus'),
  'app update version': (context) => printCall(context, 'desktopUpdater.getVersion'),
  'app update check': (context) => {
    const channel = stringFlag(context.flags, 'channel')
    if (channel !== undefined && !isReleaseChannel(channel)) {
      throw new RuntimeClientError('invalid_argument', 'Unknown update channel')
    }
    return printCall(context, 'desktopUpdater.check', {
      channel,
      targetTag: stringFlag(context.flags, 'tag')
    })
  },
  'app update download': (context) => printCall(context, 'desktopUpdater.download'),
  'app update install': (context) =>
    printCall(context, 'desktopUpdater.install', {
      confirmTarget: confirmTarget(context.flags),
      viewer: viewer(context.flags)
    }),
  'app update dismiss-nudge': (context) => printCall(context, 'desktopUpdater.dismissNudge'),
  'app update dismiss-available': (context) =>
    printCall(context, 'desktopUpdater.dismissAvailableUpdate'),
  'app update instructions': (context) =>
    printCall(context, 'desktopUpdater.getLinuxPackageInstallInstructions'),
  'app update show-package': (context) => printCall(context, 'desktopUpdater.showLinuxPackage'),
  'app update builds': (context) => {
    const channel = stringFlag(context.flags, 'channel') ?? 'stable'
    if (!isReleaseChannel(channel)) {
      throw new RuntimeClientError('invalid_argument', 'Unknown update channel')
    }
    return printCall(context, 'desktopUpdater.listBuilds', {
      channel,
      force: context.flags.get('force') === true
    })
  },
  'app cli status': (context) => {
    const distro = stringFlag(context.flags, 'distro')
    return distro
      ? printCall(context, 'desktopCli.getWslInstallStatus', { distro })
      : printCall(context, 'desktopCli.getInstallStatus')
  },
  'app cli install': (context) =>
    printCall(context, 'desktopCli.install', {
      confirmTarget: confirmTarget(context.flags),
      distro: stringFlag(context.flags, 'distro')
    }),
  'app cli remove': (context) =>
    printCall(context, 'desktopCli.remove', {
      confirmTarget: confirmTarget(context.flags),
      distro: stringFlag(context.flags, 'distro')
    }),
  'app stats': (context) => printCall(context, 'stats.summary'),
  'app onboarding get': (context) => printCall(context, 'desktopOnboarding.get'),
  'app onboarding update': async (context) =>
    printCall(
      context,
      'desktopOnboarding.update',
      DesktopOnboardingUpdateParams.parse(await readAppInput(context))
    ),
  'app telemetry status': (context) => printCall(context, 'desktopTelemetry.getConsentState'),
  'app telemetry set': (context) => {
    const value = requiredFlag(context.flags, 'opted-in')
    if (value !== 'true' && value !== 'false') {
      throw new RuntimeClientError('invalid_argument', '--opted-in must be true or false')
    }
    return printCall(context, 'desktopTelemetry.setOptIn', { optedIn: value === 'true' })
  },
  'app telemetry acknowledge': (context) =>
    printCall(context, 'desktopTelemetry.acknowledgeBanner'),
  'app telemetry track': async (context) =>
    printCall(
      context,
      'desktopTelemetry.track',
      DesktopTelemetryEventParams.parse(await readAppInput(context))
    ),
  'app diagnostics status': (context) => printCall(context, 'desktopDiagnostics.getStatus'),
  'app diagnostics collect': (context) => {
    const raw = stringFlag(context.flags, 'lookback-minutes')
    const value = raw === undefined ? undefined : Number(raw)
    if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 43200)) {
      throw new RuntimeClientError('invalid_argument', 'lookback-minutes must be 1..43200')
    }
    return printCall(context, 'desktopDiagnostics.collectBundle', { lookbackMinutes: value })
  },
  'app diagnostics preview': (context) =>
    printCall(context, 'desktopDiagnostics.readBundle', {
      bundleSubmissionId: requiredFlag(context.flags, 'submission')
    }),
  'app diagnostics discard': (context) =>
    printCall(context, 'desktopDiagnostics.discardBundle', {
      bundleSubmissionId: requiredFlag(context.flags, 'submission')
    }),
  'app diagnostics upload': (context) => {
    const bundleSubmissionId = requiredFlag(context.flags, 'submission')
    const confirmSubmissionId = requiredFlag(context.flags, 'confirm-submission')
    if (bundleSubmissionId !== confirmSubmissionId) {
      throw new RuntimeClientError('invalid_argument', 'Confirm the exact reviewed submission ID')
    }
    return printCall(context, 'desktopDiagnostics.uploadBundle', {
      bundleSubmissionId,
      confirmSubmissionId
    })
  },
  'app diagnostics delete': (context) => {
    const ticketId = requiredFlag(context.flags, 'ticket')
    const confirmTicketId = requiredFlag(context.flags, 'confirm-ticket')
    if (ticketId !== confirmTicketId) {
      throw new RuntimeClientError('invalid_argument', 'Confirm the exact uploaded ticket ID')
    }
    return printCall(context, 'desktopDiagnostics.deleteBundle', { ticketId, confirmTicketId })
  }
}
