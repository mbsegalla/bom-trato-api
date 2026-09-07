import type { BillingInterval } from '../../../../generated/prisma/enums.js';

export interface PlanPrice {
  readonly id: string;
  readonly amountInCents: number;
  readonly currency: string;
  readonly interval: BillingInterval;
  readonly intervalCount: number;
}

export interface PlanProps {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxUsers: number;
  teamManagementEnabled: boolean;
  prices: readonly PlanPrice[];
}

export class Plan {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly maxUsers: number;
  readonly teamManagementEnabled: boolean;
  readonly prices: readonly PlanPrice[];

  constructor(props: PlanProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.description = props.description;
    this.maxUsers = props.maxUsers;
    this.teamManagementEnabled = props.teamManagementEnabled;
    this.prices = props.prices.map((price) => ({ ...price }));
  }
}
