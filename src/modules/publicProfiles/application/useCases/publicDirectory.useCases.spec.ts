import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import type { WorkOrderPortfolioRepository } from '../../../workOrders/application/ports/workOrderPortfolio.repository.js';
import type {
  PublicProfessionalRecord,
  PublicProfileRepository
} from '../../domain/repositories/publicProfile.repository.js';
import { GetPublicProfessionalUseCase } from './getPublicProfessional.useCase.js';
import { GetPublicProfessionalWhatsappUseCase } from './getPublicProfessionalWhatsapp.useCase.js';
import { ListPublicProfessionalsUseCase } from './listPublicProfessionals.useCase.js';

const record: PublicProfessionalRecord = {
  slug: 'fixture',
  headline: 'Service',
  description: 'Description',
  whatsappAvailable: true,
  ratingAverage: 5,
  ratingCount: 1,
  organization: {
    name: 'Fixture & Co',
    logoKey: 'private/logo',
    city: 'Uberlandia',
    state: 'MG'
  },
  services: [{
    id: 'service',
    name: 'Fixture service',
    description: 'Details'
  }],
  reviews: [{
    id: 'review',
    reviewerDisplayName: 'Cliente T.',
    rating: 5,
    comment: null,
    createdAt: new Date(0)
  }]
};
function fixture() {
  const findPublishedBySlug = vi.fn<PublicProfileRepository['findPublishedBySlug']>().mockResolvedValue(record);
  const findWhatsappContact = vi.fn<PublicProfileRepository['findWhatsappContact']>().mockResolvedValue({
    businessName: record.organization.name,
    phone: '34999991234'
  });
  const listPublished = vi.fn<PublicProfileRepository['listPublished']>().mockResolvedValue({
    items: [record],
    page: 1,
    hasMore: false
  });
  const repository = { findPublishedBySlug, findWhatsappContact, listPublished } as unknown as PublicProfileRepository;
  const publicUrl = vi.fn().mockReturnValue('https://assets.example.invalid/logo');
  const storage = { publicUrl } as unknown as ObjectStorage;
  const listPublishedForSlug = vi.fn<WorkOrderPortfolioRepository['listPublishedForSlug']>().mockResolvedValue([]);

  return {
    findPublishedBySlug,
    findWhatsappContact,
    listPublished,
    publicUrl,
    listPublishedForSlug,
    get: new GetPublicProfessionalUseCase(repository, storage, { listPublishedForSlug } as unknown as WorkOrderPortfolioRepository),
    list: new ListPublicProfessionalsUseCase(repository, storage),
    contact: new GetPublicProfessionalWhatsappUseCase(repository)
  };
}

describe('public directory projections', () => {
  it('returns public fields without internal storage identity and only lists published portfolio', async () => {
    const f = fixture();

    const result = await f.get.execute(' FIXTURE ');

    expect(f.findPublishedBySlug).toHaveBeenCalledWith('fixture');
    expect(f.listPublishedForSlug).toHaveBeenCalledWith('fixture');
    expect(result).toMatchObject({
      logoUrl: 'https://assets.example.invalid/logo',
      reviews: [{
        reviewerDisplayName: 'Cliente T.',
        verified: true
      }]
    });
    expect(result).not.toHaveProperty('organization');
    expect(JSON.stringify(result)).not.toContain('private/logo');

    const list = await f.list.execute({ page: 1, limit: 10, state: 'MG' });

    expect(list.items[0]?.services).toEqual([{ id: 'service', name: 'Fixture service' }]);
    expect(list.items[0]).not.toHaveProperty('reviews');
  });

  it('never accesses storage or portfolio for unavailable profiles', async () => {
    const f = fixture();
    f.findPublishedBySlug.mockResolvedValueOnce(null);

    await expect(f.get.execute('unknown')).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');
    expect(f.publicUrl).not.toHaveBeenCalled();
    expect(f.listPublishedForSlug).not.toHaveBeenCalled();
  });

  it('uses the authorized contact returned by the repository and safely encodes the message', async () => {
    const f = fixture();
    const url = new URL(await f.contact.execute(' FIXTURE '));

    expect(url.origin).toBe('https://wa.me');
    expect(url.pathname).toBe('/5534999991234');
    expect(url.searchParams.get('text')).toContain('Fixture & Co');

    f.findWhatsappContact.mockResolvedValueOnce(null);

    await expect(f.contact.execute('unknown')).rejects.toThrow('PUBLIC_PROFILE_CONTACT_UNAVAILABLE');
  });
});
