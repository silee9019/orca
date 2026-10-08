import { getSshPortForwardManagement, listRegisteredSshTargets } from '../ssh/ssh-target-registry'
import { isRuntimeOwnedSshTargetId } from '../../shared/execution-host'
import {
  projectDetectedObservation,
  projectForwardObservation
} from '../../shared/ssh-port-observation'

export function readSshPortObservationSnapshot() {
  const owner = getSshPortForwardManagement()
  return listRegisteredSshTargets().flatMap((target) =>
    isRuntimeOwnedSshTargetId(target.id)
      ? []
      : [
          projectForwardObservation(target.id, owner.listPortForwards({ targetId: target.id })),
          projectDetectedObservation(target.id, owner.listDetectedPorts({ targetId: target.id }))
        ]
  )
}
