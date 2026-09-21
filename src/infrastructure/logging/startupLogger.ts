import { ConsoleLogger } from '@nestjs/common';

import { safeError } from './safeError.js';

export class StartupLogger extends ConsoleLogger {
  override error(error: unknown): void {
    super.error({
      message: 'Application initialization failed',
      ...safeError(error),
    });
  }
}
