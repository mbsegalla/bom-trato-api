import type { AuthEmailSender } from '../services/authEmailSender.service.js';

export class RequestPasswordResetUseCase {
  constructor(private readonly processor: AuthEmailSender) {}

  execute(email: string): Promise<void> {
    return this.processor.send(email, 'RESET_PASSWORD');
  }
}
