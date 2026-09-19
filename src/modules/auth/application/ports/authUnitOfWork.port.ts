import type { NotificationOutbox } from '../../../notifications/application/ports/notificationOutbox.port.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';

export interface AuthTransaction {
  auth: AuthRepository;
  notifications: NotificationOutbox;
}

export abstract class AuthUnitOfWork {
  abstract run<T>(operation: (tx: AuthTransaction) => Promise<T>): Promise<T>;
}
