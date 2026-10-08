import { afterEach, expect, it, vi } from "vitest";
import postgres from "postgres";
import { createServer, type Socket } from "node:net";
import { boundDatabaseOperations } from "./operation-boundary";
import { runPublicDbWork } from "./public-work";
import { createDbLifecycleDiagnostics } from "./lifecycle-diagnostics";
vi.mock("server-only", () => ({}));
afterEach(() => vi.restoreAllMocks());

function msg(type: string, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(5); header.write(type); header.writeInt32BE(payload.length + 4, 1);
  return Buffer.concat([header, payload]);
}
function description() {
  const metadata = Buffer.alloc(18); metadata.writeInt32BE(25, 6); metadata.writeInt16BE(-1, 10); metadata.writeInt32BE(-1, 12);
  return msg("T", Buffer.concat([Buffer.from([0, 1]), Buffer.from("value\0"), metadata]));
}

async function wire() {
  const peers = new Set<Socket>(), commands: string[] = [], lines: string[] = [];
  let holdCommit = false, commitObserved!: () => void;
  let releaseCommit: () => void = () => undefined;
  const committing = new Promise<void>(resolve => { commitObserved = resolve; });
  const server = createServer(socket => {
    peers.add(socket); let startup = true, input = Buffer.alloc(0), statement = "", state = "I", waitingCommit = false, heldSync = false;
    function execute(simple: boolean) {
      const command = statement.trim().split(/\s+/u)[0].toLowerCase(); commands.push(command);
      if (command === "begin") state = "T";
      if (command === "commit" || (command === "rollback" && !statement.includes(" to "))) state = "I";
      const reply = () => {
        const value = Buffer.from("ok"), size = Buffer.alloc(4); size.writeInt32BE(value.length);
        socket.write(Buffer.concat([...(command === "select" ? [
          ...(simple ? [description()] : []), msg("D", Buffer.concat([Buffer.from([0, 1]), size, value]))] : []),
          msg("C", Buffer.from((command === "select" ? "SELECT 1" : command.toUpperCase()) + "\0")),
          ...(simple ? [msg("Z", Buffer.from(state))] : [])]));
      };
      if (command === "commit" && holdCommit) {
        waitingCommit = true;
        releaseCommit = () => { reply(); waitingCommit = false; if (heldSync) socket.write(msg("Z", Buffer.from(state))); };
        commitObserved();
      } else reply();
    }
    socket.on("data", chunk => {
      input = Buffer.concat([input, chunk]);
      while (input.length >= (startup ? 4 : 5)) {
        const length = input.readInt32BE(startup ? 0 : 1) + (startup ? 0 : 1); if (input.length < length) break;
        const frame = input.subarray(0, length), type = startup ? "startup" : String.fromCharCode(frame[0]); input = input.subarray(length);
        if (type === "startup") { startup = false; socket.write(Buffer.concat([msg("R", Buffer.alloc(4)), msg("Z", Buffer.from("I"))])); }
        else if (type === "Q") { statement = frame.subarray(5, -1).toString(); execute(true); }
        else if (type === "P") {
          const nameEnd = frame.indexOf(0, 5), sqlEnd = frame.indexOf(0, nameEnd + 1);
          statement = frame.subarray(nameEnd + 1, sqlEnd).toString(); socket.write(msg("1"));
        } else if (type === "D") socket.write(Buffer.concat([msg("t", Buffer.from([0, 1, 0, 0, 0, 25])), statement.startsWith("select") ? description() : msg("n")]));
        else if (type === "B") socket.write(msg("2"));
        else if (type === "E") execute(false);
        else if (type === "S") { if (waitingCommit) heldSync = true; else socket.write(msg("Z", Buffer.from(state))); }
        else if (type === "X") socket.end();
      }
    }); socket.on("close", () => peers.delete(socket));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const diagnostics = createDbLifecycleDiagnostics(line => lines.push(line));
  const raw = postgres({ host: "127.0.0.1", port: (server.address() as { port: number }).port, max: 1, prepare: false, fetch_types: false, debug: diagnostics.debug });
  const end = vi.spyOn(raw, "end"), sql = diagnostics.wrap(boundDatabaseOperations(raw, diagnostics.boundary));
  return { sql, commands, lines, end, committing, hold: () => { holdCommit = true; }, release: () => releaseCommit(),
    cleanup: async () => { for (const peer of peers) peer.destroy(); await raw.end({ timeout: 0 }); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

it("actual driver retains parameters/fragments, active callbacks, nested savepoints, rollback and commit", async () => {
  const h = await wire();
  try {
    const result = await runPublicDbWork("critical", 1000, () => h.sql.begin(async tx => {
      const fragment = tx`select ${"private parameter"} as value`;
      expect((await tx`${fragment}`)[0].value).toBe("ok");
      await tx.savepoint(async nested => { expect((await nested.unsafe("select 1"))[0].value).toBe("ok"); });
      const original = new Error("private rollback error");
      await expect(tx.savepoint(async () => { throw original; })).rejects.toBe(original);
      return "transaction-result";
    }));
    expect(result).toBe("transaction-result");
    expect(h.commands).toContain("savepoint"); expect(h.commands).toContain("rollback"); expect(h.commands.at(-1)).toBe("commit");
    const original = new Error("private transaction error");
    await expect(runPublicDbWork("critical", 1000, () => h.sql.begin(async () => { throw original; }))).rejects.toBe(original);
    expect(h.commands.at(-1)).toBe("rollback"); expect(h.end).not.toHaveBeenCalled();
    expect(h.lines.join()).not.toMatch(/private parameter|private rollback|private transaction/);
  } finally { await h.cleanup(); }
}, 5000);

it("commit may complete after caller timeout without synthetic success, replay or teardown", async () => {
  const h = await wire(); h.hold();
  try {
    let original!: Promise<unknown>, settled = false;
    const caller = runPublicDbWork("critical", 100, () => {
      original = h.sql.begin(async tx => { await tx.unsafe("select 1"); return "committed"; }) as Promise<unknown>;
      void original.then(() => { settled = true; }); return original;
    }).catch(error => error);
    await h.committing;
    expect((await caller).code).toBe("OPERATION_DEADLINE"); expect(settled).toBe(false);
    expect(h.end).not.toHaveBeenCalled(); expect(h.commands.filter(c => c === "begin")).toHaveLength(1);
    h.release(); expect(await original).toBe("committed");
    expect(h.commands.filter(c => c === "commit")).toHaveLength(1);
    expect((await runPublicDbWork("critical", 1000, () => h.sql.unsafe("select 1")))[0].value).toBe("ok");
  } finally { await h.cleanup(); }
}, 5000);
