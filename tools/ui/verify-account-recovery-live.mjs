#!/usr/bin/env node
/* Non-destructive smoke test against the deployed LBT account-recovery API.
   Uses a freshly generated, unregistered recovery key and the read-only "get"
   action. It never creates, updates, or restores a vault. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const source = readFileSync(new URL("../../js/cloud-backup.js", import.meta.url), "utf8");
const urlMatch = source.match(/const SUPABASE_URL = "([^"]+)";/);
const keyMatch = source.match(/const SUPABASE_PUBLISHABLE_KEY = "([^"]+)";/);
assert.ok(urlMatch, "Could not read SUPABASE_URL from the app source.");
assert.ok(keyMatch, "Could not read the public Supabase publishable key from the app source.");

const supabaseUrl = urlMatch[1].replace(/\/$/, "");
const publishableKey = keyMatch[1];
const apiUrl = `${supabaseUrl}/functions/v1/lbt-account-recovery`;
const appOrigin = "https://lbtstudio.github.io";
const neverRegisteredKey = "LBT1-" + randomBytes(32).toString("base64url");

const preflight = await fetch(apiUrl, {
  method: "OPTIONS",
  headers: {
    origin: appOrigin,
    "access-control-request-method": "POST",
    "access-control-request-headers": "apikey,content-type"
  }
});
assert.equal(preflight.status, 200, `Recovery endpoint CORS preflight returned ${preflight.status}.`);
assert.equal(preflight.headers.get("access-control-allow-origin"), appOrigin,
  "Recovery endpoint did not allow the published LBT app origin.");

const response = await fetch(apiUrl, {
  method: "POST",
  headers: {
    apikey: publishableKey,
    "content-type": "application/json",
    origin: appOrigin
  },
  body: JSON.stringify({ action: "get", recoveryKey: neverRegisteredKey })
});
const body = await response.json().catch(() => null);
assert.equal(response.status, 200,
  `Recovery API read failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
assert.ok(body && typeof body === "object", "Recovery API did not return JSON.");
assert.equal(body.found, false,
  `The randomly generated recovery key unexpectedly resolved to a vault: ${JSON.stringify(body)}`);
assert.equal(Number(body.revision), 0,
  `An unregistered recovery key should return revision 0: ${JSON.stringify(body)}`);
assert.equal(body.payload, null,
  `An unregistered recovery key should not return a payload: ${JSON.stringify(body)}`);

console.log("PASS: deployed account-recovery endpoint is reachable, accepts the app's CORS origin,");
console.log("and performs a read-only lookup for an unregistered recovery key without writing data.");

const settingsResponse = await fetch(`${supabaseUrl}/auth/v1/settings`, {
  headers: { apikey: publishableKey, origin: appOrigin }
});
assert.equal(settingsResponse.status, 200,
  `Supabase Auth settings endpoint returned HTTP ${settingsResponse.status}.`);
const settings = await settingsResponse.json();
const external = settings && typeof settings.external === "object" ? settings.external : {};
const providerState = (name) => typeof external[name] === "boolean"
  ? (external[name] ? "enabled" : "disabled")
  : "unknown";
console.log(`OAuth configuration status reported by Supabase Auth: Google=${providerState("google")}, X=${providerState("x")}.`);
if (providerState("google") === "disabled" || providerState("x") === "disabled") {
  console.warn("WARNING: one or more OAuth providers are disabled; online recovery-key/JSON paths remain independent.");
}
