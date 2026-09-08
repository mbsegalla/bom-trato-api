import type { Request } from 'express';

import type { User } from '../../../users/domain/entities/user.entity.js';

export interface AuthPrincipal {
  user: User;
  sessionId: string;
}

export interface AuthRequest extends Request {
  auth?: AuthPrincipal;
}
