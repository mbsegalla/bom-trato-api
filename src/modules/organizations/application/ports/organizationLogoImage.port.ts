export interface OrganizationLogoUpload {
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export interface ProcessedOrganizationLogo {
  buffer: Buffer;
  contentType: 'image/webp';
  extension: 'webp';
}

export abstract class OrganizationLogoImageProcessor {
  abstract process(input: OrganizationLogoUpload): Promise<ProcessedOrganizationLogo>;
}
