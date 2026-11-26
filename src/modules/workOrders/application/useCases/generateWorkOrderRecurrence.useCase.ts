import type {
  DueWorkOrderRecurrence,
  WorkOrderRecurrenceGeneration,
} from '../ports/workOrderRecurrenceGeneration.port.js';

export class GenerateWorkOrderRecurrenceUseCase {
  constructor(private readonly generation: WorkOrderRecurrenceGeneration) {}

  listDue(today: string, limit: number, afterId?: string) {
    return this.generation.listDue(today, limit, afterId);
  }

  execute(candidate: DueWorkOrderRecurrence): Promise<void> {
    return this.generation.generate(candidate);
  }
}
