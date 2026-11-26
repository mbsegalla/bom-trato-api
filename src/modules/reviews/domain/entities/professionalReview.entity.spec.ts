import { describe, expect, it } from 'vitest';

import { ProfessionalReview } from './professionalReview.entity.js';

const input = {
  id: 'review',
  publicBusinessProfileId: 'profile',
  workOrderId: 'order',
  customerId: 'customer',
  customerName: 'Cliente Sobrenome Privado',
  rating: 5,
  comment: ' Good ',
  now: new Date('2026-01-01T00:00:00Z'),
};

describe('ProfessionalReview', () => {
  it('limits customer identification in the reviewer display name', () => {
    expect(ProfessionalReview.create(input).snapshot()).toMatchObject({
      reviewerDisplayName: 'Cliente P.',
      rating: 5,
      comment: 'Good',
    });
    expect(ProfessionalReview.displayName(' ')).toBe('Cliente');
  });

  it.each([0, 6, 4.5, NaN])('rejects ratings outside the integer 1-5 range: %s', (rating) => {
    expect(() => ProfessionalReview.create({ ...input, rating })).toThrow('INVALID_REVIEW_RATING');
  });

  it('does not rank an unrated profile and smooths a small rating sample', () => {
    expect(ProfessionalReview.calculateReputationScore(0, 0)).toBe(0);
    expect(ProfessionalReview.calculateReputationScore(5, 1)).toBe(4167);
  });
});
