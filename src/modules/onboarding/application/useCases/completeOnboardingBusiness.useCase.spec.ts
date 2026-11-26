import { describe, expect, it, vi } from 'vitest';

import type { UpdateBillingCustomerNameUseCase } from '../../../billing/application/useCases/updateBillingCustomerName.useCase.js';
import type { BillingRepository } from '../../../billing/domain/repositories/billing.repository.js';
import type { StartOrganizationTrialUseCase } from '../../../organizations/application/useCases/startOrganizationTrial.useCase.js';
import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';
import type { OnboardingState } from '../../domain/types/onboarding.types.js';
import type { OnboardingApplicationService } from '../services/onboardingApplicationService.service.js';

import { CompleteOnboardingBusinessUseCase } from './completeOnboardingBusiness.useCase.js';

const userId = 'owner';
const organizationId = 'org';
const state: OnboardingState = {
  step: 'CREATE_BUSINESS',
  organizationId,
  selectedPlanPriceId: null,
  accessSource: 'NONE',
  trialEligible: true,
  trial: null,
};
const completed: OnboardingState = { ...state, step: 'APP', trialEligible: false, accessSource: 'TRIAL' };

function fixture(initial: Partial<OnboardingState> = {}) {
  const repository = { completeBusinessSetup: vi.fn().mockResolvedValue(undefined) };
  const application = {
    state: vi
      .fn()
      .mockResolvedValueOnce({ ...state, ...initial })
      .mockResolvedValue(completed),
  };
  const billingName = { execute: vi.fn().mockResolvedValue(undefined) };
  const trial = { execute: vi.fn().mockResolvedValue(undefined) };
  const billing = { assertOwner: vi.fn().mockResolvedValue(undefined) };
  const useCase = new CompleteOnboardingBusinessUseCase(
    repository as unknown as OnboardingRepository,
    application as unknown as OnboardingApplicationService,
    billingName as unknown as UpdateBillingCustomerNameUseCase,
    trial as unknown as StartOrganizationTrialUseCase,
    billing as unknown as BillingRepository,
  );

  return { repository, application, billingName, trial, billing, useCase };
}

describe('CompleteOnboardingBusinessUseCase', () => {
  it('starts a free trial with the normalized business name without contacting billing', async () => {
    const f = fixture();

    expect(await f.useCase.execute(userId, organizationId, '  Fixture services  ')).toEqual(completed);
    expect(f.billing.assertOwner).toHaveBeenCalledWith(organizationId, userId);
    expect(f.trial.execute).toHaveBeenCalledWith({ organizationId, userId, name: 'Fixture services' });
    expect(f.billingName.execute).not.toHaveBeenCalled();
    expect(f.repository.completeBusinessSetup).not.toHaveBeenCalled();
    expect(f.application.state).toHaveBeenCalledTimes(2);
  });

  it('updates the billing name before finalizing paid business setup', async () => {
    const f = fixture({ trialEligible: false, accessSource: 'SUBSCRIPTION' });

    await f.useCase.execute(userId, organizationId, '  Fixture paid  ');

    expect(f.billingName.execute).toHaveBeenCalledWith({ organizationId, name: 'Fixture paid' });
    expect(f.repository.completeBusinessSetup).toHaveBeenCalledWith({ organizationId, userId, name: 'Fixture paid' });
    expect(f.billingName.execute.mock.invocationCallOrder[0]).toBeLessThan(
      f.repository.completeBusinessSetup.mock.invocationCallOrder[0],
    );
    expect(f.trial.execute).not.toHaveBeenCalled();
  });

  it('returns existing application state without repeating completed setup', async () => {
    const f = fixture(completed);

    expect(await f.useCase.execute(userId, organizationId, 'Ignored name')).toEqual(completed);
    expect(f.application.state).toHaveBeenCalledTimes(1);
    expect(f.trial.execute).not.toHaveBeenCalled();
    expect(f.billingName.execute).not.toHaveBeenCalled();
    expect(f.repository.completeBusinessSetup).not.toHaveBeenCalled();
  });

  it.each([
    { step: 'BILLING_REVIEW', code: 'MULTIPLE_SUBSCRIPTIONS' },
    { step: 'PAYMENT_PENDING', code: 'SUBSCRIPTION_REQUIRED' },
    { step: 'SELECT_PLAN', code: 'SUBSCRIPTION_REQUIRED' },
    { step: 'CREATE_BUSINESS', code: 'SUBSCRIPTION_REQUIRED' },
  ] as const)('blocks ineligible setup at $step', async ({ step, code }) => {
    const f = fixture({ step, trialEligible: false });

    await expect(f.useCase.execute(userId, organizationId, 'Fixture name')).rejects.toThrow(code);
    expect(f.trial.execute).not.toHaveBeenCalled();
    expect(f.billingName.execute).not.toHaveBeenCalled();
    expect(f.repository.completeBusinessSetup).not.toHaveBeenCalled();
  });

  it('rejects invalid names and unauthorized users before making changes', async () => {
    const f = fixture();

    await expect(f.useCase.execute(userId, organizationId, ' ')).rejects.toThrow('INVALID_ORGANIZATION_NAME');

    f.billing.assertOwner.mockRejectedValueOnce(new Error('OWNER_REQUIRED'));

    await expect(f.useCase.execute(userId, organizationId, 'Fixture name')).rejects.toThrow('OWNER_REQUIRED');
    expect(f.application.state).toHaveBeenCalledTimes(1);
    expect(f.trial.execute).not.toHaveBeenCalled();
    expect(f.repository.completeBusinessSetup).not.toHaveBeenCalled();
  });

  it('does not finalize paid setup if the billing name update fails', async () => {
    const f = fixture({ trialEligible: false, accessSource: 'SUBSCRIPTION' });
    f.billingName.execute.mockRejectedValueOnce(new Error('Fixture unavailable'));

    await expect(f.useCase.execute(userId, organizationId, 'Fixture name')).rejects.toThrow('Fixture unavailable');
    expect(f.repository.completeBusinessSetup).not.toHaveBeenCalled();
    expect(f.application.state).toHaveBeenCalledTimes(1);
  });
});
