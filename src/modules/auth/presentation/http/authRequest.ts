import type { Request } from 'express';

import type { AuthenticatedUser } from '../../../users/domain/types/user.types.js';

export interface AuthContext {
  user: AuthenticatedUser;
  sessionId: string;
}

export interface AuthRequest extends Request {
  auth?: AuthContext;
}
