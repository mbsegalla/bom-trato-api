export abstract class WorkOrderShareSecurity {
  abstract issue(): {
    token: string;
    hash: string;
  };

  abstract hash(token: string): string;
}
