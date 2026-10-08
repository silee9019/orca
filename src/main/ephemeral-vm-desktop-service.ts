import type { EphemeralVmOperations } from './ephemeral-vm-operations'

let operations: EphemeralVmOperations | null = null

export function setEphemeralVmDesktopService(next: EphemeralVmOperations | null): void {
  operations = next
}

export function getEphemeralVmDesktopService(): EphemeralVmOperations {
  if (!operations) {
    throw new Error('ephemeral_vm_unavailable: this host has no desktop VM services')
  }
  return operations
}
