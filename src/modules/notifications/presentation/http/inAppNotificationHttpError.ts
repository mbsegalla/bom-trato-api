import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { InAppNotificationErrorCode } from '../../domain/errors/inAppNotification.error.js';
import { InAppNotificationError } from '../../domain/errors/inAppNotification.error.js';

const statuses = {
  INVALID_NOTIFICATION: HttpStatus.BAD_REQUEST,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  NOTIFICATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_STREAM_TICKET: HttpStatus.UNAUTHORIZED,
} satisfies Record<InAppNotificationErrorCode, HttpStatus>;

export function inAppNotificationOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is InAppNotificationError => error instanceof InAppNotificationError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
