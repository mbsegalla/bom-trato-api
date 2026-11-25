export interface DueWorkOrderRecurrence {
  workOrderId: string;
  organizationId: string;
}

export abstract class WorkOrderRecurrenceGeneration {
  abstract listDue(today: string, limit: number, afterId?: string): Promise<DueWorkOrderRecurrence[]>;
  abstract generate(candidate: DueWorkOrderRecurrence): Promise<void>;
}
