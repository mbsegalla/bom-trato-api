export interface WorkOrderRecurrenceReminderCandidate {
  workOrderId: string;
  organizationId: string;
}

export abstract class WorkOrderRecurrenceReminderRepository {
  abstract listCandidates(
    today: string,
    limit: number,
    afterId?: string,
  ): Promise<WorkOrderRecurrenceReminderCandidate[]>;

  abstract enqueue(candidate: WorkOrderRecurrenceReminderCandidate): Promise<void>;
}
