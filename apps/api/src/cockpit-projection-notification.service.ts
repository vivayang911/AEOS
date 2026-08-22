import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Client, Notification } from "pg";
import { filter, Observable, Subject } from "rxjs";
import { DatabaseService } from "./database.service";

const CHANNEL = "aeos_cockpit_projection_v1";
const APPLICATION_NAME = `aeos-cockpit-fanout:${process.pid}`;
const ORGANIZATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
export type CockpitProjectionWakeup = { schemaVersion: "aeos.cockpit.wakeup.v1"; organizationId: string; eventId: string; advisoryOnly: true; assetExecutionAuthorized: false };

export function parseCockpitProjectionWakeup(payload: string | undefined): CockpitProjectionWakeup | null {
  if (!payload || payload.length > 512) return null;
  try {
    const value = JSON.parse(payload) as Record<string, unknown>;
    if (value.schemaVersion !== "aeos.cockpit.wakeup.v1" || typeof value.organizationId !== "string" || !ORGANIZATION_ID.test(value.organizationId) || typeof value.eventId !== "string" || !EVENT_ID.test(value.eventId)) return null;
    return { schemaVersion: "aeos.cockpit.wakeup.v1", organizationId: value.organizationId, eventId: value.eventId, advisoryOnly: true, assetExecutionAuthorized: false };
  } catch { return null; }
}

@Injectable()
export class CockpitProjectionNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly wakeups = new Subject<CockpitProjectionWakeup>();
  private client: Client | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private connected = false;
  private notificationsTotal = 0;
  private rejectedNotificationsTotal = 0;
  private reconnectsTotal = 0;

  constructor(private readonly db: DatabaseService) {}
  async onModuleInit() { void this.db; await this.connect(); }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const client = this.client; this.client = null; this.connected = false;
    if (client) await client.end().catch(() => undefined);
    this.wakeups.complete();
  }

  forOrganization(organizationId: string): Observable<CockpitProjectionWakeup> {
    return this.wakeups.pipe(filter((event) => event.organizationId === organizationId));
  }
  policy() { return { mode: "POSTGRESQL_LISTEN_NOTIFY_WITH_PERSISTED_FALLBACK", channelVersion: "aeos.cockpit.wakeup.v1", payload: "ORGANIZATION_AND_IMMUTABLE_AUDIT_EVENT_ID_ONLY", tenantPayloadExposed: false, advisoryOnly: true, assetExecutionAuthorized: false } as const; }
  metrics() { return { fanoutListenerConnected: this.connected ? 1 : 0, fanoutNotificationsTotal: this.notificationsTotal, fanoutRejectedNotificationsTotal: this.rejectedNotificationsTotal, fanoutReconnectsTotal: this.reconnectsTotal, tenantLabelsExposed: false }; }

  private async connect() {
    if (this.stopping || this.client) return;
    const client = new Client({ connectionString: process.env.DATABASE_URL, application_name: APPLICATION_NAME });
    this.client = client;
    client.on("notification", (notification) => this.onNotification(notification));
    client.on("error", () => this.disconnected(client));
    client.on("end", () => this.disconnected(client));
    try { await client.connect(); await client.query(`LISTEN ${CHANNEL}`); this.connected = true; }
    catch (error) { this.disconnected(client); throw error; }
  }
  private onNotification(notification: Notification) {
    if (notification.channel !== CHANNEL) return;
    const parsed = parseCockpitProjectionWakeup(notification.payload);
    if (!parsed) { this.rejectedNotificationsTotal += 1; return; }
    this.notificationsTotal += 1;
    this.wakeups.next(parsed);
  }
  private disconnected(client: Client) {
    if (this.client !== client) return;
    this.client = null; this.connected = false;
    void client.end().catch(() => undefined);
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null; this.reconnectsTotal += 1;
      void this.connect().catch(() => this.disconnected(this.client as Client));
    }, 1_000);
    this.reconnectTimer.unref();
  }
}
