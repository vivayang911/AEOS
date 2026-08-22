import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "./database.service";
import { AuthContext } from "./auth.service";
import { hashValue } from "./decision-engine";

const makeId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

@Injectable()
export class OrganizationService {
  constructor(private readonly db: DatabaseService) {}

  async create(context: AuthContext, name: string) {
    const organizationId = makeId("org");
    return this.db.runWithTenant(organizationId, context.userId, "ADMIN", () => this.db.transaction(async (client) => {
      const membershipId = makeId("membership");
      const organization = (await client.query("INSERT INTO organizations(id,name,status) VALUES($1,$2,'ACTIVE') RETURNING id,name,status,created_at", [organizationId, name.trim()])).rows[0];
      await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES($1,$2,$3,'ADMIN','ACTIVE')", [membershipId, organizationId, context.userId]);
      await client.query("UPDATE auth_sessions SET active_organization_id=$1 WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL", [organizationId, context.sessionId, context.userId]);
      const data = { membershipId, role: "ADMIN", status: "ACTIVE", assetExecutionAuthorized: false };
      const payload = { eventType: "organization.created", organizationId, objectType: "organization", objectId: organizationId, data };
      await client.query("INSERT INTO audit_events(id,organization_id,event_type,actor,action,object_type,object_id,data,payload_hash) VALUES($1,$2,'organization.created',$3,'organization.created','organization',$2,$4,$5)", [makeId("audit"), organizationId, { type: "human", id: context.userId, walletAddress: context.walletAddress }, data, hashValue(payload)]);
      return { ...this.mapOrganization(organization), membership: { id: membershipId, role: "ADMIN", status: "ACTIVE" }, selected: true, assetExecutionAuthorized: false };
    }));
  }

  async list(context: AuthContext) {
    const result = await this.db.runWithUser(context.userId, () => this.db.query(`SELECT o.id,o.name,o.status,o.created_at,m.id AS membership_id,m.role,m.status AS membership_status
      FROM memberships m JOIN organizations o ON o.id=m.organization_id
      WHERE m.user_id=$1 AND m.status='ACTIVE' AND o.status='ACTIVE' ORDER BY o.created_at,o.id`, [context.userId]));
    return { items: result.rows.map((row) => ({ ...this.mapOrganization(row), membership: { id: row.membership_id, role: row.role, status: row.membership_status }, selected: row.id === context.activeOrganizationId })) };
  }

  async memberships(context: AuthContext, organizationId: string) {
    if (context.activeOrganizationId !== organizationId) throw new NotFoundException("Organization not found");
    const result = await this.db.query(`SELECT m.id,m.role,m.status,m.created_at,u.id AS user_id,u.wallet_address
      FROM memberships m JOIN users u ON u.id=m.user_id
      WHERE m.organization_id=$1 ORDER BY m.created_at,m.id`, [organizationId]);
    return { organizationId, items: result.rows.map((row) => ({ id: row.id, role: row.role, status: row.status, user: { id: row.user_id, walletAddress: row.wallet_address }, createdAt: new Date(row.created_at).toISOString() })) };
  }

  private mapOrganization(row: any) { return { id: row.id, name: row.name, status: row.status, createdAt: new Date(row.created_at).toISOString() }; }
}
