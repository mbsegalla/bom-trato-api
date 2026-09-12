export interface PlanChangeOwnerParams {
  organizationId: string;
  userId: string;
}

export interface PreviewPlanChangeParams extends PlanChangeOwnerParams {
  planPriceId: string;
}

export interface PlanChangeActionParams extends PlanChangeOwnerParams {
  changeId: string;
}
