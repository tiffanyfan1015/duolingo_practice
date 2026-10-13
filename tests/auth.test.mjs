import test from "node:test";
import assert from "node:assert/strict";
import worker from "../server/worker.ts";
const password = "test-only-password-long-enough";
const authorization = (value) => "Basic " + btoa(value);
let reads = 0;
const env = {
  SITE_PASSWORD: password,
  ASSETS: {
    fetch: async () => {
      reads++;
      return new Response("private vocabulary");
    },
  },
};

test("missing or short secret fails closed for all assets", async () => {
  for (const path of [
    "/",
    "/data.json",
    "/index.html",
    "/src/app-controller.mjs",
  ]) {
    const response = await worker.fetch(
      new Request("https://example.test" + path),
      { ...env, SITE_PASSWORD: "" },
    );
    assert.equal(response.status, 503);
  }
  assert.equal(reads, 0);
});

test("anonymous, incorrect and malformed credentials cannot read vocabulary", async () => {
  const before = reads;
  for (const header of [
    "",
    "Bearer abc",
    "Basic !!!",
    authorization("owner:wrong"),
    authorization("other:" + password),
  ]) {
    const response = await worker.fetch(
      new Request("https://example.test/data.json", {
        headers: { Authorization: header },
      }),
      env,
    );
    assert.equal(response.status, 401);
    assert.match(response.headers.get("WWW-Authenticate"), /^Basic /);
  }
  assert.equal(reads, before);
});

test("only correct credentials reach assets and responses cannot be cached publicly", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/data.json", {
      headers: { Authorization: authorization("owner:" + password) },
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "private vocabulary");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
