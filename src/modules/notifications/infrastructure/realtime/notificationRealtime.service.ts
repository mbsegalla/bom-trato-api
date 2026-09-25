import type { MessageEvent, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Client, type Notification } from 'pg';
import { filter, interval, map, merge, Observable, of, Subject } from 'rxjs';

import { databaseConfig } from '../../../../config/database.config.js';

import { IN_APP_NOTIFICATION_CHANNEL } from './notificationRealtime.constants.js';

interface NotificationSignal {
  userId: string;
  organizationId: string;
}

const reconnectDelayMs = 5000;
const heartbeatIntervalMs = 25_000;

@Injectable()
export class NotificationRealtimeService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationRealtimeService.name);
  private readonly signals = new Subject<NotificationSignal>();

  private client: Client | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connecting = false;
  private shuttingDown = false;

  constructor(
    @Inject(databaseConfig.KEY)
    private readonly database: ConfigType<typeof databaseConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  stream(userId: string, organizationId: string): Observable<MessageEvent> {
    const notifications = this.signals.pipe(
      filter((signal) => signal.userId === userId && signal.organizationId === organizationId),
      map((): MessageEvent => ({
        type: 'notifications-changed',
        data: {},
      })),
    );

    const heartbeat = interval(heartbeatIntervalMs).pipe(
      map((): MessageEvent => ({
        comment: 'keep-alive',
      })),
    );

    return merge(
      of<MessageEvent>({
        comment: 'connected',
      }),
      notifications,
      heartbeat,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.signals.complete();

    const client = this.client;

    this.client = null;

    if (client !== null) {
      client.removeAllListeners();

      await client.end().catch(() => undefined);
    }
  }

  private async connect(): Promise<void> {
    if (this.shuttingDown || this.connecting || this.client !== null) {
      return;
    }

    this.connecting = true;

    const client = new Client({
      connectionString: this.database.url,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      application_name: 'bom-trato-notification-realtime',
    });

    try {
      await client.connect();

      await client.query(`LISTEN "${IN_APP_NOTIFICATION_CHANNEL}"`);

      if (this.shuttingDown) {
        await client.end();

        return;
      }

      client.on('notification', (notification) => this.handleNotification(notification));

      client.once('error', () => {
        this.handleDisconnect(client);
      });

      client.once('end', () => {
        this.handleDisconnect(client);
      });

      this.client = client;

      this.logger.log('In-app notification realtime listener connected');
    } catch {
      await client.end().catch(() => undefined);

      this.logger.warn('Could not connect in-app notification realtime listener; reconnect scheduled');

      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private handleNotification(notification: Notification): void {
    if (notification.channel !== IN_APP_NOTIFICATION_CHANNEL || !notification.payload) {
      return;
    }

    try {
      const payload: unknown = JSON.parse(notification.payload);

      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('userId' in payload) ||
        !('organizationId' in payload) ||
        typeof payload.userId !== 'string' ||
        typeof payload.organizationId !== 'string'
      ) {
        return;
      }

      this.signals.next({
        userId: payload.userId,
        organizationId: payload.organizationId,
      });
    } catch {
      this.logger.warn('Ignoring malformed in-app notification realtime payload');
    }
  }

  private handleDisconnect(client: Client): void {
    if (this.client !== client) {
      return;
    }

    this.client = null;

    client.removeAllListeners();

    void client.end().catch(() => undefined);

    if (!this.shuttingDown) {
      this.logger.warn('In-app notification realtime listener disconnected; reconnect scheduled');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer !== null) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      void this.connect();
    }, reconnectDelayMs);
  }
}
