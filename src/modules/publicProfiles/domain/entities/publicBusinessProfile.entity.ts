import { isValidBrazilianPhone, normalizeBrazilianPhone } from '../../../../shared/text/phone.js';
import { PublicProfileError } from '../errors/publicProfile.error.js';

export interface PublicBusinessProfileDetails {
  slug: string;
  headline: string | null;
  description: string | null;
  whatsappPhone: string | null;
  whatsappEnabled: boolean;
  published: boolean;
  serviceIds: string[];
}

export interface PublicBusinessProfileProps extends PublicBusinessProfileDetails {
  id: string;
  organizationId: string;
  whatsappEnabledAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PublicBusinessProfile {
  private constructor(private props: PublicBusinessProfileProps) {}

  static create(
    params: PublicBusinessProfileDetails & {
      id: string;
      organizationId: string;
    },
    now: Date,
  ): PublicBusinessProfile {
    const details = PublicBusinessProfile.normalize(params);

    return new PublicBusinessProfile({
      id: params.id,
      organizationId: params.organizationId,
      ...details,
      whatsappEnabledAt: details.whatsappEnabled ? new Date(now) : null,
      publishedAt: details.published ? new Date(now) : null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  static restore(props: PublicBusinessProfileProps): PublicBusinessProfile {
    return new PublicBusinessProfile(structuredClone(props));
  }

  static slugFromName(name: string): string {
    const slug = name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120)
      .replace(/-+$/g, '');

    return slug.length >= 3 ? slug : 'profissional';
  }

  update(details: PublicBusinessProfileDetails, now: Date): void {
    const normalized = PublicBusinessProfile.normalize(details);

    const whatsappEnabledAt = normalized.whatsappEnabled ? (this.props.whatsappEnabledAt ?? new Date(now)) : null;

    const publishedAt = normalized.published ? (this.props.publishedAt ?? new Date(now)) : null;

    this.props = {
      ...this.props,
      ...normalized,
      whatsappEnabledAt,
      publishedAt,
      updatedAt: new Date(now),
    };
  }

  snapshot(): PublicBusinessProfileProps {
    return structuredClone(this.props);
  }

  private static normalize(details: PublicBusinessProfileDetails): PublicBusinessProfileDetails {
    const slug = details.slug.trim().toLowerCase();

    const headline = details.headline?.trim() || null;

    const description = details.description?.trim() || null;

    const phoneInput = details.whatsappPhone?.trim() || null;

    if (slug.length < 3 || slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new PublicProfileError('INVALID_PUBLIC_PROFILE_SLUG');
    }

    if (headline !== null && headline.length > 160) {
      throw new PublicProfileError('INVALID_PUBLIC_PROFILE_HEADLINE');
    }

    if (description !== null && description.length > 3000) {
      throw new PublicProfileError('INVALID_PUBLIC_PROFILE_DESCRIPTION');
    }

    if (phoneInput !== null && !isValidBrazilianPhone(phoneInput)) {
      throw new PublicProfileError('INVALID_PUBLIC_PROFILE_PHONE');
    }

    const whatsappPhone = phoneInput === null ? null : normalizeBrazilianPhone(phoneInput);

    if (details.whatsappEnabled && whatsappPhone === null) {
      throw new PublicProfileError('PUBLIC_PROFILE_CONTACT_REQUIRED');
    }

    if (details.published && (!details.whatsappEnabled || whatsappPhone === null)) {
      throw new PublicProfileError('PUBLIC_PROFILE_CONTACT_REQUIRED');
    }

    const serviceIds = [...new Set(details.serviceIds)];

    if (serviceIds.length > 20) {
      throw new PublicProfileError('PUBLIC_PROFILE_TOO_MANY_SERVICES');
    }

    return {
      slug,
      headline,
      description,
      whatsappPhone,
      whatsappEnabled: details.whatsappEnabled,
      published: details.published,
      serviceIds,
    };
  }
}
