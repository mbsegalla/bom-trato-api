import type { OrganizationTrialProps } from '../../../organizations/domain/entities/organizationTrial.entity.js';

export const TRIAL_LIFECYCLE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const TrialLifecycleStage = {
  Welcome: 'WELCOME',
  FirstQuote: 'FIRST_QUOTE',
  GettingStarted: 'GETTING_STARTED',
  ExpiringInThreeDays: 'EXPIRING_IN_THREE_DAYS',
  ExpiringTomorrow: 'EXPIRING_TOMORROW',
  Expired: 'EXPIRED',
} as const;

export type TrialLifecycleStage = (typeof TrialLifecycleStage)[keyof typeof TrialLifecycleStage];

export interface TrialLifecycleWindow {
  stage: TrialLifecycleStage;
  availableAt: Date;
  expiresAt: Date;
}

export class TrialLifecyclePolicy {
  static resolve(trial: OrganizationTrialProps, now: Date): TrialLifecycleWindow | null {
    if (!this.isEligible(trial, now)) {
      return null;
    }

    return this.windows(trial).find((window) => window.availableAt <= now && window.expiresAt > now) ?? null;
  }

  static key(trialId: string, stage: TrialLifecycleStage): string {
    return `trial-lifecycle/${trialId}/${stage}`;
  }

  private static isEligible(trial: OrganizationTrialProps, now: Date): boolean {
    return (
      trial.organizationId !== null &&
      trial.convertedAt === null &&
      trial.revokedAt === null &&
      Number.isFinite(trial.startsAt.getTime()) &&
      Number.isFinite(trial.expiresAt.getTime()) &&
      trial.expiresAt > trial.startsAt &&
      trial.startsAt <= now
    );
  }

  private static windows(trial: OrganizationTrialProps): TrialLifecycleWindow[] {
    const startsAt = trial.startsAt.getTime();
    const expiresAt = trial.expiresAt.getTime();

    const day = TRIAL_LIFECYCLE_WINDOW_MS;

    return [
      this.window(TrialLifecycleStage.Expired, expiresAt, expiresAt + day),
      this.activeWindow(TrialLifecycleStage.ExpiringTomorrow, expiresAt - day, trial),
      this.activeWindow(TrialLifecycleStage.ExpiringInThreeDays, expiresAt - 3 * day, trial),
      this.activeWindow(TrialLifecycleStage.GettingStarted, startsAt + 7 * day, trial),
      this.activeWindow(TrialLifecycleStage.FirstQuote, startsAt + 3 * day, trial),
      this.activeWindow(TrialLifecycleStage.Welcome, startsAt, trial),
    ];
  }

  private static activeWindow(
    stage: TrialLifecycleStage,
    availableAt: number,
    trial: OrganizationTrialProps,
  ): TrialLifecycleWindow {
    return this.window(
      stage,
      Math.max(availableAt, trial.startsAt.getTime()),
      Math.min(availableAt + TRIAL_LIFECYCLE_WINDOW_MS, trial.expiresAt.getTime()),
    );
  }

  private static window(stage: TrialLifecycleStage, availableAt: number, expiresAt: number): TrialLifecycleWindow {
    return {
      stage,
      availableAt: new Date(availableAt),
      expiresAt: new Date(expiresAt),
    };
  }
}
