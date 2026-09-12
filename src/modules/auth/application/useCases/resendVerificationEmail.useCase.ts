import type { AuthEmailSender } from '../services/authEmailSender.service.js';

export class ResendVerificationEmailUseCase {
  constructor(private readonly processor: AuthEmailSender) {}

  execute(email: string): Promise<void> {
    return this.processor.send(email, 'VERIFY_EMAIL');
  }
}
