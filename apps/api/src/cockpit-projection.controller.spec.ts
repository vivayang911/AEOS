import { EventEmitter } from "node:events";
import { ServiceUnavailableException } from "@nestjs/common";
import { Subject } from "rxjs";
import { CockpitProjectionController } from "./cockpit-projection.controller";

const auth = { activeOrganizationId: "org_session", userId: "user_session", role: "AUDITOR" } as any;

function response(writeResults: boolean[] = [true]) {
  const target = new EventEmitter() as any;
  target.status = jest.fn().mockReturnValue(target);
  target.set = jest.fn().mockReturnValue(target);
  target.flushHeaders = jest.fn();
  target.write = jest.fn().mockImplementation(() => writeResults.shift() ?? true);
  target.end = jest.fn();
  return target;
}

describe("CockpitProjectionController SSE transport", () => {
  it("does not commit SSE headers before asynchronous admission succeeds", async () => {
    const projections = { stream: jest.fn().mockRejectedValue(new ServiceUnavailableException({ code: "COCKPIT_STREAM_CAPACITY_EXHAUSTED" })) } as any;
    const controller = new CockpitProjectionController(projections);
    const request = new EventEmitter() as any;
    const output = response();

    await expect(controller.stream(auth, undefined, request, output)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(output.status).not.toHaveBeenCalled();
    expect(output.flushHeaders).not.toHaveBeenCalled();
  });

  it("bounds a blocked client to one coalesced pending SSE message", async () => {
    const events = new Subject<any>();
    const projections = { stream: jest.fn().mockResolvedValue(events) } as any;
    const controller = new CockpitProjectionController(projections);
    const request = new EventEmitter() as any;
    const output = response([false, true]);
    await controller.stream(auth, undefined, request, output);

    events.next({ id: "0x1", type: "projection", retry: 1000, data: { sequence: 1, assetExecutionAuthorized: false } });
    events.next({ id: "0x2", type: "projection", retry: 1000, data: { sequence: 2, assetExecutionAuthorized: false } });
    events.next({ id: "0x3", type: "projection", retry: 1000, data: { sequence: 3, assetExecutionAuthorized: false } });
    expect(output.write).toHaveBeenCalledTimes(1);
    output.emit("drain");
    expect(output.write).toHaveBeenCalledTimes(2);
    expect(output.write.mock.calls[1][0]).toContain("id: 0x3");
    expect(output.write.mock.calls[1][0]).not.toContain("0x2");

    request.emit("close");
    expect(events.observed).toBe(false);
  });
});
