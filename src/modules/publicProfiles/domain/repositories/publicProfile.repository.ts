import type { PublicBusinessProfile, PublicBusinessProfileProps } from '../entities/publicBusinessProfile.entity.js';

export interface PublicProfessionalService {
  id: string;
  name: string;
  description: string | null;
}

export interface PublicProfessionalReview {
  id: string;
  reviewerDisplayName: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface PublicProfessionalRecord {
  slug: string;
  headline: string | null;
  description: string | null;
  whatsappAvailable: boolean;
  ratingAverage: number | null;
  ratingCount: number;
  organization: {
    name: string;
    logoKey: string | null;
    city: string;
    state: string;
  };
  services: PublicProfessionalService[];
  reviews: PublicProfessionalReview[];
}

export interface PublicProfessionalPageParams {
  page: number;
  limit: number;
  search?: string;
  city?: string;
  state?: string;
}

export interface PublicProfessionalPage {
  items: PublicProfessionalRecord[];
  page: number;
  hasMore: boolean;
}

export interface PublicWhatsappContact {
  businessName: string;
  phone: string;
}

export abstract class PublicProfileRepository {
  abstract findByOrganizationId(organizationId: string): Promise<PublicBusinessProfileProps | null>;
  abstract suggestAvailableSlug(baseSlug: string, organizationId: string): Promise<string>;
  abstract save(profile: PublicBusinessProfile): Promise<PublicBusinessProfileProps>;
  abstract listPublished(params: PublicProfessionalPageParams): Promise<PublicProfessionalPage>;
  abstract findPublishedBySlug(slug: string): Promise<PublicProfessionalRecord | null>;
  abstract findWhatsappContact(slug: string): Promise<PublicWhatsappContact | null>;
}
