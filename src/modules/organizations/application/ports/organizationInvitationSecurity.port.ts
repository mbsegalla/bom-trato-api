export interface InvitationToken {
  value: string;
  hash: string;
}

export abstract class OrganizationInvitationTokens {
  abstract create(): InvitationToken;
  abstract hash(value: string): string;
}

export interface SendInvitationParams {
  email: string;
  organizationName: string;
  token: string;
}

export abstract class OrganizationInvitationMail {
  abstract send(params: SendInvitationParams): Promise<boolean>;
}
