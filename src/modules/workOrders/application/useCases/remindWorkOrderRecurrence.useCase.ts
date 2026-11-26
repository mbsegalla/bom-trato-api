import type {
  WorkOrderRecurrenceReminderCandidate,
  WorkOrderRecurrenceReminderRepository,
} from '../ports/workOrderRecurrenceReminder.port.js';

export class RemindWorkOrderRecurrenceUseCase {
  constructor(private readonly repository: WorkOrderRecurrenceReminderRepository) {}

  listCandidates(today: string, limit: number, afterId?: string) {
    return this.repository.listCandidates(today, limit, afterId);
  }

  execute(candidate: WorkOrderRecurrenceReminderCandidate): Promise<void> {
    return this.repository.enqueue(candidate);
  }
}
