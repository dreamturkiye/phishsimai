// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — mapping authorization. A partner may only map an org onto its OWN connection, and
//  only for an org that is its OWN customer. Both checks are enforced in upsertMapping. Here getDb
//  is mocked with a scripted query queue so the guards are exercised without a live DB.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

// A scripted query stub. The `db` object itself is NOT thenable (so `await getDb()` yields it
// intact); each query it starts returns a thenable chain whose every builder method returns the
// chain, and awaiting the chain pops the next scripted result off the queue.
let queue: any[] = [];
function makeQuery() {
  const chain: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (resolve: any) => resolve(queue.length ? queue.shift() : []);
      return () => chain;
    },
  });
  return chain;
}
function makeDb() {
  return { select: () => makeQuery(), insert: () => makeQuery(), update: () => makeQuery(), delete: () => makeQuery() };
}

vi.mock("../db", () => ({ getDb: vi.fn(async () => makeDb()) }));

import { upsertMapping } from "./db";

describe("upsertMapping authorization", () => {
  beforeEach(() => { queue = []; });

  it("rejects mapping an org onto a connection that is not this MSP's (cross-partner)", async () => {
    // First lookup (connection owned by this MSP) returns nothing → the guard fires.
    queue = [[]];
    await expect(upsertMapping({ mspTenantId: 2, connectionId: 99, orgId: 7, externalCompanyId: "250" }))
      .rejects.toThrow(/Connection not found for this MSP/);
  });

  it("rejects mapping an org that is not this MSP's customer", async () => {
    // Connection is owned, but the org is not a customer of this MSP → second guard fires.
    queue = [[{ id: 99, mspTenantId: 2 }], []];
    await expect(upsertMapping({ mspTenantId: 2, connectionId: 99, orgId: 7, externalCompanyId: "250" }))
      .rejects.toThrow(/not a customer of this MSP/);
  });

  it("allows a mapping when the connection and the org both belong to this MSP", async () => {
    // conn owned, org is a customer, no existing mapping → insert path, resolves without throwing.
    queue = [[{ id: 99, mspTenantId: 2 }], [{ id: 1, orgId: 7, mspTenantId: 2 }], []];
    await expect(upsertMapping({ mspTenantId: 2, connectionId: 99, orgId: 7, externalCompanyId: "250", externalCompanyName: "Acme" }))
      .resolves.toBeUndefined();
  });
});
