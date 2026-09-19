export interface InvitationToken {
  value: string;
  hash: string;
}

export abstract class OrganizationInvitationTokens {
  abstract create(): InvitationToken;
  abstract hash(value: string): string;
}
