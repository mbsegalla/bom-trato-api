export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  selectedPlanPriceId: string | null;
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
}
