export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
}
