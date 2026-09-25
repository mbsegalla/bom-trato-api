export type InAppNotificationErrorCode =
  'INVALID_NOTIFICATION' | 'MEMBER_REQUIRED' | 'NOTIFICATION_NOT_FOUND' | 'INVALID_STREAM_TICKET';

export class InAppNotificationError extends Error {
  constructor(readonly code: InAppNotificationErrorCode) {
    super(code);

    this.name = 'InAppNotificationError';
  }
}
