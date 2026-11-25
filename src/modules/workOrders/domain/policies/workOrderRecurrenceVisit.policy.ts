export type WorkOrderRecurrenceVisitPeriod = 'OVERDUE' | 'TODAY' | 'NEXT_SEVEN_DAYS';

interface WorkOrderRecurrenceVisitFilter {
  lt?: Date;
  gte?: Date;
  lte?: Date;
}

export function workOrderRecurrenceVisitFilter(
  today: string,
  period?: WorkOrderRecurrenceVisitPeriod,
): WorkOrderRecurrenceVisitFilter | undefined {
  const start = new Date(`${today}T00:00:00.000Z`);

  switch (period) {
    case 'OVERDUE':
      return { lt: start };

    case 'TODAY':
      return { gte: start, lte: start };

    case 'NEXT_SEVEN_DAYS': {
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);

      return { gte: start, lte: end };
    }

    default:
      return undefined;
  }
}
