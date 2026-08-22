import { Controller, Get, Header, Headers, Req, Res, UseGuards } from "@nestjs/common";
import { AuthContext } from "./auth.service";
import { CockpitProjectionService } from "./cockpit-projection.service";
import { activeOrganizationId, CurrentAuth, ORGANIZATION_ROLES, RequireRoles, SessionGuard } from "./session.guard";

type SseRequest = { once(event: "close", listener: () => void): unknown };
type SseResponse = {
  status(code: number): SseResponse;
  set(headers: Record<string, string>): SseResponse;
  flushHeaders(): void;
  write(chunk: string): boolean;
  end(): void;
  once(event: "drain", listener: () => void): unknown;
  removeListener(event: "drain", listener: () => void): unknown;
};

@Controller("cockpit")
@UseGuards(SessionGuard)
@RequireRoles(...ORGANIZATION_ROLES)
export class CockpitProjectionController {
  constructor(private readonly projections: CockpitProjectionService) {}

  @Get("projection")
  @Header("Cache-Control", "no-store")
  snapshot(@CurrentAuth() auth: AuthContext) {
    activeOrganizationId(auth);
    return this.projections.snapshot(auth);
  }

  @Get("stream-policy")
  @Header("Cache-Control", "no-store")
  policy() { return this.projections.streamPolicy(); }

  @Get("stream")
  async stream(@CurrentAuth() auth: AuthContext, @Headers("last-event-id") lastEventId: string | undefined, @Req() request: SseRequest, @Res() response: SseResponse) {
    activeOrganizationId(auth);
    // Admission is asynchronous and must finish before HTTP 200/SSE headers are
    // committed, otherwise capacity rejection degrades into an in-stream error.
    const events = await this.projections.stream(auth, lastEventId);
    response.status(200);
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders();

    let blocked = false;
    let pending: any | null = null;
    let closed = false;
    const encode = (message: any) => `${message.id ? `id: ${message.id}\n` : ""}${message.type ? `event: ${message.type}\n` : ""}${message.retry ? `retry: ${message.retry}\n` : ""}data: ${JSON.stringify(message.data)}\n\n`;
    const flush = () => {
      blocked = false;
      const next = pending;
      pending = null;
      if (next) write(next);
    };
    const write = (message: any) => {
      if (closed) return;
      if (blocked) { pending = message; return; }
      blocked = !response.write(encode(message));
      if (blocked) response.once("drain", flush);
    };
    const subscription = events.subscribe({
      next: write,
      error: () => { closed = true; response.end(); },
      complete: () => { closed = true; response.end(); }
    });
    request.once("close", () => {
      closed = true;
      pending = null;
      response.removeListener("drain", flush);
      subscription.unsubscribe();
    });
  }
}
