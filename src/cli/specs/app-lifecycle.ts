import { APP_SURFACE_COMMAND_SPECS } from './app-surface'
import { APP_ASSET_COMMAND_SPECS } from './app-assets'
import { APP_SUPPORT_COMMAND_SPECS } from './app-support'
import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const APP_LIFECYCLE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['app', 'status'],
    summary: 'Show the answering desktop app and its current confirmation target',
    usage: 'orca app status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server.'
    ]
  },
  {
    path: ['app', 'platform'],
    summary: 'Show the operating system of the answering runtime',
    usage: 'orca app platform [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server.'
    ]
  },
  {
    path: ['app', 'shells'],
    summary: 'Probe shells on the answering runtime host',
    usage: 'orca app shells [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server.'
    ]
  },
  {
    path: ['app', 'wsl-distros'],
    summary: 'List WSL distributions on the answering runtime host',
    usage: 'orca app wsl-distros [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server.'
    ]
  },
  {
    path: ['app', 'update', 'status'],
    summary: 'Show desktop update progress',
    usage: 'orca app update status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'update', 'version'],
    summary: 'Show the desktop app version',
    usage: 'orca app update version [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'update', 'check'],
    summary: 'Start a desktop update check',
    usage: 'orca app update check [--channel <value>] [--tag <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'channel', 'tag'],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'update', 'download'],
    summary: 'Start the available desktop update download',
    usage: 'orca app update download [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'update', 'install'],
    summary: 'Request installation through the existing desktop quit pipeline',
    usage: 'orca app update install --confirm-target <value> --viewer <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm-target', 'viewer'],
    destructive: true,
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'update', 'dismiss-nudge'],
    summary: 'Dismiss the current update nudge',
    usage: 'orca app update dismiss-nudge [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'update', 'dismiss-available'],
    summary: 'Dismiss the available desktop update',
    usage: 'orca app update dismiss-available [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'update', 'instructions'],
    summary: 'Read Linux package installation instructions',
    usage: 'orca app update instructions [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'update', 'show-package'],
    summary: 'Reveal the cached Linux package on the desktop',
    usage: 'orca app update show-package [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'update', 'builds'],
    summary: 'List builds for one release channel',
    usage: 'orca app update builds [--channel <value>] [--force] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'channel', 'force'],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server. Desktop updates are separate from the remote-server updater. Poll status after check/download; installation acceptance does not prove restart completion.'
    ]
  },
  {
    path: ['app', 'cli', 'status'],
    summary: 'Show native or explicitly selected WSL CLI registration',
    usage: 'orca app cli status [--distro <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'distro'],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server.'
    ]
  },
  {
    path: ['app', 'cli', 'install'],
    summary: 'Install the CLI for the confirmed app',
    usage: 'orca app cli install [--confirm-target <value>] [--distro <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm-target', 'distro'],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server.'
    ]
  },
  {
    path: ['app', 'cli', 'remove'],
    aliases: [['app', 'cli', 'rm']],
    summary: 'Remove the CLI for the confirmed app',
    usage: 'orca app cli remove [--confirm-target <value>] [--distro <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm-target', 'distro'],
    destructive: true,
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server.'
    ]
  },
  {
    path: ['app', 'stats'],
    summary: 'Show the answering runtime usage summary',
    usage: 'orca app stats [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime selected with --environment; SSH child hosts are not substituted for this app. Desktop-only methods return desktop_unavailable on a headless server.'
    ]
  },
  {
    path: ['app', 'quit'],
    summary: 'Request quit after the specified viewer checkpoints its state',
    usage: 'orca app quit --confirm-target <target> --viewer <id> [--json]',
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'confirm-target', 'viewer'],
    notes: [
      'Read app status first. The target expires on app restart. Returns acceptance after checkpointing; verify the new incarnation separately.'
    ]
  },
  {
    path: ['app', 'restart'],
    summary: 'Request restart after the specified viewer checkpoints its state',
    usage: 'orca app restart --confirm-target <target> --viewer <id> [--json]',
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'confirm-target', 'viewer'],
    notes: [
      'Read app status first. The target expires on app restart. Returns acceptance after checkpointing; verify the new incarnation separately.'
    ]
  },
  {
    path: ['app', 'relaunch'],
    summary: 'Request relaunch after the specified viewer checkpoints its state',
    usage: 'orca app relaunch --confirm-target <target> --viewer <id> [--json]',
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'confirm-target', 'viewer'],
    notes: [
      'Read app status first. The target expires on app restart. Returns acceptance after checkpointing; verify the new incarnation separately.'
    ]
  },
  {
    path: ['app', 'reload'],
    summary: 'Request reload after the specified viewer checkpoints its state',
    usage: 'orca app reload --confirm-target <target> --viewer <id> [--json]',
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'confirm-target', 'viewer'],
    notes: [
      'Read app status first. The target expires on app restart. Returns acceptance after checkpointing; verify the new incarnation separately.'
    ]
  },
  ...APP_SUPPORT_COMMAND_SPECS,
  ...APP_SURFACE_COMMAND_SPECS,
  ...APP_ASSET_COMMAND_SPECS
]
