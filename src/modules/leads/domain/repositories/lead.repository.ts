import type { LeadStatus } from '../../../../generated/prisma/enums.js';
import type { Lead, LeadProps } from '../entities/lead.entity.js';

export interface LeadPageParams {
  page: number;
  limit: number;
  status?: LeadStatus;
  search?: string;
}

export interface LeadPage {
  items: LeadProps[];
  page: number;
  hasMore: boolean;
}

export interface LeadCreateResult {
  lead: LeadProps;
  created: boolean;
}

export abstract class LeadRepository {
  abstract create(lead: Lead): Promise<LeadCreateResult>;
  abstract findById(id: string): Promise<LeadProps | null>;
  abstract list(params: LeadPageParams): Promise<LeadPage>;
  abstract save(lead: Lead): Promise<void>;
}
