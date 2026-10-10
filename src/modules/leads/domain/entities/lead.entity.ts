import type { LeadStatus } from '../../../../generated/prisma/enums.js';
import { normalizeEmail } from '../../../../shared/text/email.js';
import { isValidBrazilianPhone, normalizeBrazilianPhone } from '../../../../shared/text/phone.js';
import { LeadError } from '../errors/lead.error.js';

export interface LeadProps {
  id: string;
  requestKey: string;
  organizationId: string;
  publicBusinessProfileId: string;
  catalogServiceId: string | null;
  requestedServiceName: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  status: LeadStatus;
  convertedCustomerId: string | null;
  convertedQuoteId: string | null;
  contactedAt: Date | null;
  convertedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadDetails {
  name: string;
  email?: string | null;
  phone?: string | null;
  message: string;
}

export class Lead {
  private constructor(private props: LeadProps) {}

  static create(
    params: LeadDetails & {
      id: string;
      requestKey: string;
      organizationId: string;
      publicBusinessProfileId: string;
      catalogServiceId: string | null;
      requestedServiceName: string | null;
    },
    now: Date,
  ): Lead {
    const details = Lead.normalize(params);

    return new Lead({
      id: params.id,
      requestKey: params.requestKey,
      organizationId: params.organizationId,
      publicBusinessProfileId: params.publicBusinessProfileId,
      catalogServiceId: params.catalogServiceId,
      requestedServiceName: params.requestedServiceName?.trim() || null,
      ...details,
      status: 'NEW',
      convertedCustomerId: null,
      convertedQuoteId: null,
      contactedAt: null,
      convertedAt: null,
      archivedAt: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  static restore(props: LeadProps): Lead {
    return new Lead(structuredClone(props));
  }

  markContacted(now: Date): void {
    if (this.props.status === 'CONVERTED' || this.props.status === 'ARCHIVED') {
      throw new LeadError('INVALID_LEAD_TRANSITION');
    }

    if (this.props.status === 'CONTACTED') {
      return;
    }

    this.props.status = 'CONTACTED';
    this.props.contactedAt = new Date(now);
    this.props.updatedAt = new Date(now);
  }

  convert(customerId: string, quoteId: string, now: Date): void {
    if (this.props.status === 'CONVERTED' || this.props.status === 'ARCHIVED') {
      throw new LeadError('INVALID_LEAD_TRANSITION');
    }

    this.props.status = 'CONVERTED';
    this.props.convertedCustomerId = customerId;
    this.props.convertedQuoteId = quoteId;
    this.props.convertedAt = new Date(now);
    this.props.updatedAt = new Date(now);
  }

  archive(now: Date): void {
    if (this.props.status === 'CONVERTED') {
      throw new LeadError('INVALID_LEAD_TRANSITION');
    }

    if (this.props.status === 'ARCHIVED') {
      return;
    }

    this.props.status = 'ARCHIVED';
    this.props.archivedAt = new Date(now);
    this.props.updatedAt = new Date(now);
  }

  snapshot(): LeadProps {
    return structuredClone(this.props);
  }

  private static normalize(details: LeadDetails) {
    const name = details.name.trim();
    const email = details.email ? normalizeEmail(details.email) || null : null;
    const phoneInput = details.phone?.trim() || null;
    const message = details.message.trim();

    if (name.length < 2 || name.length > 100) {
      throw new LeadError('INVALID_LEAD_NAME');
    }

    if (email !== null && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new LeadError('INVALID_LEAD_EMAIL');
    }

    if (phoneInput !== null && !isValidBrazilianPhone(phoneInput)) {
      throw new LeadError('INVALID_LEAD_PHONE');
    }

    const phone = phoneInput === null ? null : normalizeBrazilianPhone(phoneInput);

    if (email === null && phone === null) {
      throw new LeadError('LEAD_CONTACT_REQUIRED');
    }

    if (message.length < 10 || message.length > 2000) {
      throw new LeadError('INVALID_LEAD_MESSAGE');
    }

    return {
      name,
      email,
      phone,
      message,
    };
  }
}
