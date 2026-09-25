import type { OrganizationDocumentType } from '../../../../generated/prisma/enums.js';
import { normalizeEmail } from '../../../../shared/text/email.js';
import { OrganizationError } from '../errors/organization.error.js';

export interface OrganizationBusinessDetails {
  name: string;
  email: string | null;
  phone: string | null;
  documentType: OrganizationDocumentType | null;
  document: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

export interface OrganizationProps extends OrganizationBusinessDetails {
  id: string;
  ownerId: string;
}

export interface CreateOrganizationProps {
  id: string;
  name: string;
  ownerId: string;
}

export type OrganizationProfile = Omit<OrganizationProps, 'ownerId'>;

export class Organization {
  private constructor(private props: OrganizationProps) {}

  static create(props: CreateOrganizationProps): Organization {
    return new Organization({
      id: props.id,
      ownerId: props.ownerId,
      ...Organization.normalize({
        name: props.name,
        email: null,
        phone: null,
        documentType: null,
        document: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
      }),
    });
  }

  static restore(props: OrganizationProps): Organization {
    return new Organization(structuredClone(props));
  }

  update(details: Partial<OrganizationBusinessDetails>): void {
    const values = [
      details.name,
      details.email,
      details.phone,
      details.documentType,
      details.document,
      details.addressLine1,
      details.addressLine2,
      details.city,
      details.state,
      details.postalCode,
    ];

    if (values.every((value) => value === undefined)) {
      throw new OrganizationError('EMPTY_ORGANIZATION_UPDATE');
    }

    const normalized = Organization.normalize({
      name: details.name === undefined ? this.props.name : details.name,
      email: details.email === undefined ? this.props.email : details.email,
      phone: details.phone === undefined ? this.props.phone : details.phone,
      documentType: details.documentType === undefined ? this.props.documentType : details.documentType,
      document: details.document === undefined ? this.props.document : details.document,
      addressLine1: details.addressLine1 === undefined ? this.props.addressLine1 : details.addressLine1,
      addressLine2: details.addressLine2 === undefined ? this.props.addressLine2 : details.addressLine2,
      city: details.city === undefined ? this.props.city : details.city,
      state: details.state === undefined ? this.props.state : details.state,
      postalCode: details.postalCode === undefined ? this.props.postalCode : details.postalCode,
    });

    this.props = {
      ...this.props,
      ...normalized,
    };
  }

  isOwnedBy(userId: string): boolean {
    return this.props.ownerId === userId;
  }

  snapshot(): OrganizationProps {
    return structuredClone(this.props);
  }

  profile(): OrganizationProfile {
    const { ownerId: _ownerId, ...profile } = this.props;

    return structuredClone(profile);
  }

  private static normalize(details: OrganizationBusinessDetails): OrganizationBusinessDetails {
    const name = details.name.trim();
    const email = details.email ? normalizeEmail(details.email) || null : null;
    const phone = details.phone?.trim() || null;
    const document = details.document ? details.document.replace(/\D/g, '') || null : null;
    const documentType = details.documentType ?? null;
    const addressLine1 = details.addressLine1?.trim() || null;
    const addressLine2 = details.addressLine2?.trim() || null;
    const city = details.city?.trim() || null;
    const state = details.state?.trim().toUpperCase() || null;
    const postalCode = details.postalCode ? details.postalCode.replace(/\D/g, '') || null : null;

    if (name.length < 2 || name.length > 100) {
      throw new OrganizationError('INVALID_ORGANIZATION_NAME');
    }

    if (email !== null && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new OrganizationError('INVALID_ORGANIZATION_EMAIL');
    }

    if (phone !== null && phone.length > 30) {
      throw new OrganizationError('INVALID_ORGANIZATION_PHONE');
    }

    Organization.validateDocument(documentType, document);

    if (addressLine1 !== null && addressLine1.length > 150) {
      throw new OrganizationError('INVALID_ORGANIZATION_ADDRESS');
    }

    if (addressLine2 !== null && addressLine2.length > 100) {
      throw new OrganizationError('INVALID_ORGANIZATION_ADDRESS');
    }

    if (city !== null && city.length > 100) {
      throw new OrganizationError('INVALID_ORGANIZATION_CITY');
    }

    if (state !== null && !/^[A-Z]{2}$/.test(state)) {
      throw new OrganizationError('INVALID_ORGANIZATION_STATE');
    }

    if (postalCode !== null && !/^\d{8}$/.test(postalCode)) {
      throw new OrganizationError('INVALID_ORGANIZATION_POSTAL_CODE');
    }

    return {
      name,
      email,
      phone,
      documentType,
      document,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
    };
  }

  private static validateDocument(documentType: OrganizationDocumentType | null, document: string | null): void {
    if ((documentType === null) !== (document === null)) {
      throw new OrganizationError('INVALID_ORGANIZATION_DOCUMENT');
    }

    if (document === null || documentType === null) {
      return;
    }

    if (documentType === 'CPF' && !/^\d{11}$/.test(document)) {
      throw new OrganizationError('INVALID_ORGANIZATION_DOCUMENT');
    }

    if (documentType === 'CNPJ' && !/^\d{14}$/.test(document)) {
      throw new OrganizationError('INVALID_ORGANIZATION_DOCUMENT');
    }
  }
}
