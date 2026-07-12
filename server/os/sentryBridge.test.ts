// ─────────────────────────────────────────────────────────────────────────────
//  SENTRY → bug_reports BRIDGE: dedup, fingerprinting, PII, fail-safety.
//
//  The contract under test:
//    • a captured error creates EXACTLY ONE bug_report
//    • a repeat with the same fingerprint increments occurrence_count and creates
//      NO duplicate — and does NOT re-run the (expensive, LLM-backed) architect agent
//    • the fingerprint is NORMALISED, so the same bug carrying different ids/URLs
//      still collapses onto one row (this is what ScrollFuel's exact-string dedup
//      gets wrong, and the reason a recurring bug there spawns a row per occurrence)
//    • PII never reaches the DB
//    • nothing here ever throws — a failure to record an error must not become a
//      second error on the request path
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureErrorToBugReport, fingerprintFor } from "./sentryBridge";

// A fake `sql` that models the ON CONFLICT upsert: first write of a fingerprint
// INSERTs (xmax=0 → inserted:true); a later write of the SAME fingerprint takes the
// DO UPDATE branch (inserted:false) and bumps the counter — exactly as Postgres
// would under the partial unique index.
function makeSql() {
  const rows = new Map<string, { id: string; count: number }>();
  const queries: string[] = [];
  const inserts: any[][] = [];
  let nextId = 1;

  const sql: any = (strings: TemplateStringsArray, ...vals: any[]) => {
    const q = strings.join(" ? ");
    queries.push(q);

    if (/INSERT INTO bug_reports/i.test(q)) {
      inserts.push(vals);
      // Only SIX values are bound; 'production_error', NULL, NULL, 'open' and 1 are
      // SQL literals, not params. Bound order: message, stack, source, route,
      // severity, fingerprint.
      const fingerprint = vals[5];
      const existing = rows.get(fingerprint);
      if (existing) {
        existing.count += 1;
        return Promise.resolve([
          { id: existing.id, occurrence_count: existing.count, inserted: false },
        ]);
      }
      const id = `bug-${nextId++}`;
      rows.set(fingerprint, { id, count: 1 });
      return Promise.resolve([{ id, occurrence_count: 1, inserted: true }]);
    }

    const p: any = Promise.resolve([]);
    return p;
  };

  return { sql, queries, inserts, rows };
}

const bugInserts = (queries: string[]) =>
  queries.filter((q) => /INSERT INTO bug_reports/i.test(q));

describe("dedup by fingerprint", () => {
  it("a captured error creates EXACTLY ONE bug_report", async () => {
    const { sql, queries } = makeSql();
    const architect = vi.fn(async () => {});

    const r = await captureErrorToBugReport(
      { message: "TypeError: cannot read 'id' of undefined", route: "/api/os/hq" },
      sql,
      architect,
    );

    expect(r.bugId).toBe("bug-1");
    expect(r.duplicate).toBe(false);
    expect(r.occurrenceCount).toBe(1);
    expect(bugInserts(queries).length).toBe(1);
    expect(architect).toHaveBeenCalledTimes(1);
  });

  it("a REPEAT increments the count and creates NO duplicate row", async () => {
    const { sql, rows } = makeSql();
    const architect = vi.fn(async () => {});
    const err = { message: "TypeError: cannot read 'id' of undefined", route: "/api/os/hq" };

    const first = await captureErrorToBugReport(err, sql, architect);
    const second = await captureErrorToBugReport(err, sql, architect);
    const third = await captureErrorToBugReport(err, sql, architect);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(third.duplicate).toBe(true);

    // Same row throughout, count climbing — one bug, three occurrences.
    expect(second.bugId).toBe(first.bugId);
    expect(third.occurrenceCount).toBe(3);
    expect(rows.size).toBe(1);
  });

  it("a repeat does NOT re-run the architect agent (no LLM, no new task)", async () => {
    const { sql } = makeSql();
    const architect = vi.fn(async () => {});
    const err = { message: "Boom happened", route: "/api/os/hq" };

    await captureErrorToBugReport(err, sql, architect);
    await captureErrorToBugReport(err, sql, architect);
    await captureErrorToBugReport(err, sql, architect);

    expect(architect).toHaveBeenCalledTimes(1); // only the first, genuinely-new bug
  });

  it("100 occurrences of one recurring bug → 1 row, 1 diagnosis", async () => {
    const { sql, rows } = makeSql();
    const architect = vi.fn(async () => {});

    for (let i = 0; i < 100; i++) {
      await captureErrorToBugReport(
        { message: "Recurring prod failure", route: "/api/campaigns" },
        sql,
        architect,
      );
    }

    expect(rows.size).toBe(1);
    expect(architect).toHaveBeenCalledTimes(1);
    expect([...rows.values()][0].count).toBe(100);
  });

  it("a DIFFERENT error still gets its own row", async () => {
    const { sql, rows } = makeSql();
    const architect = vi.fn(async () => {});

    await captureErrorToBugReport({ message: "Error A", route: "/a" }, sql, architect);
    await captureErrorToBugReport({ message: "Error B", route: "/b" }, sql, architect);

    expect(rows.size).toBe(2);
    expect(architect).toHaveBeenCalledTimes(2);
  });
});

describe("fingerprint normalisation", () => {
  it("collapses varying ids onto ONE fingerprint", () => {
    const a = fingerprintFor("User 12345 not found", "/api/orgs");
    const b = fingerprintFor("User 98765 not found", "/api/orgs");
    expect(a).toBe(b);
  });

  it("collapses varying URLs onto ONE fingerprint", () => {
    const a = fingerprintFor("fetch failed for https://x.test/a/1", "/api/orgs");
    const b = fingerprintFor("fetch failed for https://y.test/b/2", "/api/orgs");
    expect(a).toBe(b);
  });

  it("keeps genuinely different errors apart", () => {
    expect(fingerprintFor("TypeError: x", "/a")).not.toBe(fingerprintFor("RangeError: y", "/a"));
  });

  it("separates the same message on different routes", () => {
    expect(fingerprintFor("boom", "/a")).not.toBe(fingerprintFor("boom", "/b"));
  });

  it("a recurring bug with a varying id dedupes to ONE row end-to-end", async () => {
    const { sql, rows } = makeSql();
    const architect = vi.fn(async () => {});

    for (const id of [1, 2, 3, 4, 5]) {
      await captureErrorToBugReport(
        { message: `Org ${id} lookup failed`, route: "/api/orgs" },
        sql,
        architect,
      );
    }

    expect(rows.size).toBe(1); // ScrollFuel's exact-string dedup would produce 5
    expect(architect).toHaveBeenCalledTimes(1);
  });
});

describe("PII never reaches the database", () => {
  it("scrubs an email out of the message and stack before insert", async () => {
    const { sql, inserts } = makeSql();

    await captureErrorToBugReport(
      {
        message: "Login failed for kaanari@mac.com",
        stack: "at auth (user=kaanari@mac.com)\n  at handler",
        route: "/api/auth",
      },
      sql,
      async () => {},
    );

    const flat = JSON.stringify(inserts[0]);
    expect(flat).not.toMatch(/kaanari@mac\.com/);
    expect(flat).toMatch(/\[redacted\]/);
  });

  it("scrubs bearer tokens and JWTs", async () => {
    const { sql, inserts } = makeSql();

    await captureErrorToBugReport(
      {
        message: "denied: Bearer abc123def456ghi789",
        stack: "token=eyJhbGciOi.eyJzdWIiOiI.SflKxwRJSM",
        route: "/api/x",
      },
      sql,
      async () => {},
    );

    const flat = JSON.stringify(inserts[0]);
    expect(flat).not.toMatch(/abc123def456ghi789/);
    expect(flat).not.toMatch(/eyJhbGciOi\.eyJzdWIiOiI\.SflKxwRJSM/);
  });

  it("never writes a user_email — the column is explicitly NULL", async () => {
    const { sql, queries } = makeSql();
    await captureErrorToBugReport({ message: "x", route: "/y" }, sql, async () => {});
    const insert = bugInserts(queries)[0];
    expect(insert).toMatch(/user_email/); // the column is named…
    // …and the value is the literal NULL in the VALUES list, not a bound param.
    expect(insert).toMatch(/VALUES[\s\S]*NULL, NULL,/);
  });

  it("strips the query string from the route (it carries emails/tokens)", async () => {
    const { sql, inserts } = makeSql();
    await captureErrorToBugReport(
      { message: "boom", route: "/api/x?email=kaanari@mac.com&token=secret123" },
      sql,
      async () => {},
    );
    const flat = JSON.stringify(inserts[0]);
    expect(flat).not.toMatch(/kaanari@mac\.com/);
    expect(flat).not.toMatch(/secret123/);
    expect(flat).toMatch(/\/api\/x/);
  });
});

describe("degraded path — the partial unique index is missing", () => {
  // If ON CONFLICT is unavailable, Postgres raises "no unique or exclusion
  // constraint matching...". Unguarded, that would silently stop us recording bugs
  // at all — the worst possible failure for an error pipeline. It must fall back.
  function makeSqlWithoutIndex() {
    const rows: Array<{ id: string; fingerprint: string; count: number }> = [];
    let nextId = 1;
    const sql: any = (strings: TemplateStringsArray, ...vals: any[]) => {
      const q = strings.join(" ? ");

      if (/INSERT INTO bug_reports/i.test(q) && /ON CONFLICT/i.test(q)) {
        return Promise.reject(
          new Error("there is no unique or exclusion constraint matching the ON CONFLICT specification"),
        );
      }
      if (/SELECT id, occurrence_count FROM bug_reports/i.test(q)) {
        const hit = rows.find((r) => r.fingerprint === vals[0]);
        return Promise.resolve(hit ? [{ id: hit.id, occurrence_count: hit.count }] : []);
      }
      if (/UPDATE bug_reports/i.test(q)) {
        const hit = rows.find((r) => r.id === vals[0]);
        if (hit) hit.count += 1;
        return Promise.resolve([]);
      }
      if (/INSERT INTO bug_reports/i.test(q)) {
        const id = `bug-${nextId++}`;
        rows.push({ id, fingerprint: vals[5], count: 1 });
        return Promise.resolve([{ id, occurrence_count: 1 }]);
      }
      return Promise.resolve([]);
    };
    return { sql, rows };
  }

  it("still records the bug instead of dropping it", async () => {
    const { sql, rows } = makeSqlWithoutIndex();
    const r = await captureErrorToBugReport({ message: "boom", route: "/x" }, sql, async () => {});
    expect(r.bugId).toBe("bug-1");
    expect(rows.length).toBe(1);
  });

  it("still dedupes a repeat (non-atomically) rather than duplicating", async () => {
    const { sql, rows } = makeSqlWithoutIndex();
    const architect = vi.fn(async () => {});
    const err = { message: "boom", route: "/x" };

    const a = await captureErrorToBugReport(err, sql, architect);
    const b = await captureErrorToBugReport(err, sql, architect);

    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.bugId).toBe(a.bugId);
    expect(rows.length).toBe(1);
    expect(architect).toHaveBeenCalledTimes(1);
  });
});

describe("fail-safety", () => {
  it("returns a null bugId instead of throwing when the DB is down", async () => {
    const dead: any = () => Promise.reject(new Error("connection refused"));
    const r = await captureErrorToBugReport({ message: "x", route: "/y" }, dead, async () => {});
    expect(r.bugId).toBeNull(); // did not throw
  });

  it("still records the bug when the architect agent throws", async () => {
    const { sql } = makeSql();
    const r = await captureErrorToBugReport(
      { message: "x", route: "/y" },
      sql,
      async () => { throw new Error("LLM down"); },
    );
    expect(r.bugId).toBe("bug-1"); // the row survives a failed diagnosis
    expect(r.diagnosed).toBe(false);
  });

  it("handles an empty message without producing an empty row", async () => {
    const { sql, inserts } = makeSql();
    const r = await captureErrorToBugReport({ message: "" }, sql, async () => {});
    expect(r.bugId).toBe("bug-1");
    expect(inserts[0][0]).toBe("unknown error");
  });
});
