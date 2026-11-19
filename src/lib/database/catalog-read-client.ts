import "server-only";
import { Socket, type SocketConnectOpts } from "node:net";
import postgres, { type ISql } from "postgres";
import { OperationDeadlineError } from "@/lib/operation-deadline";
import { получитьАдресБазы, получитьРежимSsl } from "./config";
import { createDbLifecycleDiagnostics } from "./lifecycle-diagnostics";
import { boundDatabaseOperations } from "./operation-boundary";

const CATALOG_READ_TIMEOUT_MS = 12_000;

/** Each refresh owns one transport. Only canonical catalog reads use it. */
export async function withCatalogReadClient<T>(read: (sql: ISql) => Promise<T>): Promise<T> {
  const socket = new Socket() as Socket & { host?: string };
  // Postgres.js uses the host property to select TLS SNI. It owns TLS negotiation.
  let handedOff = false;
  const diagnostics = createDbLifecycleDiagnostics();
  // The documented custom socket option is absent from postgres.js 3.4.9's types.
  const options: postgres.Options<Record<never, never>> & { socket: () => Socket } = {
    ssl: получитьРежимSsl(),
    max: 1,
    prepare: false,
    connect_timeout: 10,
    debug: diagnostics.debug,
    socket: () => {
      if (handedOff || socket.destroyed) throw new Error("Catalog database transport closed");
      handedOff = true;
      return socket;
    },
  };
  const raw = postgres(получитьАдресБазы(), options);
  if (raw.options.host.length !== 1) {
    throw new Error("Catalog database transport requires one configured endpoint");
  }
  const [host] = raw.options.host;
  const [port] = raw.options.port;
  const address: SocketConnectOpts = raw.options.path ? { path: raw.options.path } : { host, port };
  socket.host = host;

  const timer = setTimeout(() => {
    // postgres.js moves its listeners to a TLSSocket after negotiation. Keep
    // the underlying socket's error handled when destroying it in either mode.
    socket.once("error", () => undefined);
    socket.destroy(new OperationDeadlineError());
  }, CATALOG_READ_TIMEOUT_MS);
  timer.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.connect(address, resolve);
    });
    const client = diagnostics.wrap(boundDatabaseOperations(raw, diagnostics.boundary, diagnostics));
    const { result } = await client.begin("read only", async (sql) => {
      // A disconnected client can leave a backend waiting on a database lock.
      // Scope both limits to this transaction so a pooled session cannot retain them.
      await sql`
        select set_config('statement_timeout', '10s', true),
               set_config('idle_in_transaction_session_timeout', '10s', true)
      `;
      return { result: await read(sql) };
    });
    return result;
  } finally {
    clearTimeout(timer);
    // Never end or replace the shared application client. Wait for the private
    // socket to close, and for postgres.js to settle the original work above.
    if (!socket.closed) {
      const closed = new Promise<void>((resolve) => { socket.once("close", resolve); });
      socket.destroy();
      await closed;
    }
  }
}
