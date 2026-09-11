export interface ConsumeInvitationSendParams {
  organizationId: string;
  now: Date;
}

export abstract class OrganizationInvitationRateLimit {
  abstract consume(params: ConsumeInvitationSendParams): Promise<void>;
}
