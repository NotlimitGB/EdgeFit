import { createServer } from "vite";
import path from "node:path";

// This entrypoint runs only on the protected default branch, never from PRs.
const kind = process.argv[2];
if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/main" ||
    !["schedule", "workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME) ||
    !["weekly", "retry"].includes(kind)) {
  console.error("analytics_direct_runner: execution_not_authorized");
  process.exitCode = 1;
} else {
  let vite;
  try {
    const root = process.cwd();
    vite = await createServer({
      configFile: false, root, appType: "custom", server: { middlewareMode: true }, logLevel: "silent",
      resolve: { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "node_modules/next/dist/compiled/server-only/empty.js") } },
    });
    const { runDirectDelivery } = await vite.ssrLoadModule("/src/lib/analytics/direct-runner.ts");
    const result = await runDirectDelivery(kind);
    const statuses = ["sent", "partial_sent", "noop", "busy", "pending", "failed", "conflict"];
    const categories = ["delivery_disabled", "delivery_config_missing", "database_config_invalid",
      "metrika_config_invalid", "invalid_operation", "direct_execution_failed", "historical_week_not_supported",
      "historical_w44_requires_owner_action",
      "missed_week_reconciliation_required", "weekly_identity_mismatch", "provider_reconciliation_required",
      "provider_rate_limited", "provider_request_rejected", "delivery_lease_lost", "report_generation_failed",
      "first_party_unavailable", "delivery_storage_unavailable", "stored_digest_invalid", "stored_digest_hash_mismatch",
      "logical_id_content_conflict", "provider_idempotency_conflict", "delivery_attempts_exhausted"];
    const status = statuses.includes(result.status) ? result.status : "failed";
    const category = categories.includes(result.category) ? result.category : result.category ? "other_failure" : undefined;
    const logicalId = typeof result.logicalId === "string" && /^(weekly:\d{4}-W\d{2}|daily:\d{4}-\d{2}-\d{2})$/.test(result.logicalId)
      ? result.logicalId : undefined;
    console.log(JSON.stringify({ status, category, logicalId }));
    if (!["sent", "partial_sent", "noop"].includes(status)) process.exitCode = 1;
  } catch {
    console.error("analytics_direct_runner: execution_failed");
    process.exitCode = 1;
  } finally {
    await vite?.close();
  }
}
