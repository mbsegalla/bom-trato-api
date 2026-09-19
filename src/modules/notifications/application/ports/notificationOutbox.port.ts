import type { EnqueueNotification } from '../types/notification.types.js';

export abstract class NotificationOutbox {
  abstract enqueue(input: EnqueueNotification): Promise<void>;
}
