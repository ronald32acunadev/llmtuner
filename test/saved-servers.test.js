import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateServerUrl,
  addServer,
  removeServer,
  selectServer,
} from "../src/web/public/saved-servers.js";

// Define constants for use in tests
const local = { id: "local", name: "Local", url: "u" };
const r1 = { id: "r1", name: "Remote 1", url: "http://remote1" };

test("validateServerUrl - valid URLs", () => {
  assert.equal(validateServerUrl(" http://rig:7860/ "), "http://rig:7860");
  assert.equal(validateServerUrl("https://rig.example"), "https://rig.example");
});

test("validateServerUrl - invalid URLs", () => {
  const invalidUrls = ["", "ftp://x", "rig:7860", "http://user:pw@rig", "javascript:alert(1)"];
  for (const url of invalidUrls) {
    assert.equal(validateServerUrl(url), null);
  }
});

test("addServer - successful addition with trimmed values", () => {
  const settings = { servers: [local], activeServerId: "local" };
  const input = { name: " Rig ", url: "http://rig/", token: " t " };
  const newId = () => "srv_1";
  const result = addServer(settings, input, newId);
  assert.deepEqual(result, {
    ok: true,
    patch: {
      servers: [
        local,
        { id: "srv_1", name: "Rig", url: "http://rig", token: "t" },
      ],
    },
  });
});

test("addServer - empty token is saved as null", () => {
  const settings = { servers: [local], activeServerId: "local" };
  const input = { name: " Rig ", url: "http://rig/", token: "   " };
  const newId = () => "srv_2";
  const result = addServer(settings, input, newId);
  assert.deepEqual(result, {
    ok: true,
    patch: {
      servers: [
        local,
        { id: "srv_2", name: "Rig", url: "http://rig", token: null },
      ],
    },
  });
});

test("addServer - rejection on empty name", () => {
  const settings = { servers: [local], activeServerId: "local" };
  const input = { name: "  ", url: "http://rig/", token: "" };
  const newId = () => "srv_3";
  const result = addServer(settings, input, newId);
  assert.deepEqual(result, {
    ok: false,
    errorKey: "cli.serverNameRequired",
  });
});

test("addServer - rejection on invalid URL", () => {
  const settings = { servers: [local], activeServerId: "local" };
  const input = { name: "Rig", url: "nope", token: "" };
  const newId = () => "srv_4";
  const result = addServer(settings, input, newId);
  assert.deepEqual(result, {
    ok: false,
    errorKey: "cli.serverUrlInvalid",
  });
});

test("removeServer - cannot remove local server", () => {
  const settings = { servers: [local], activeServerId: "local" };
  const result = removeServer(settings, "local");
  assert.deepEqual(result, {
    ok: false,
    errorKey: "cli.serverLocalProtected",
  });
});

test("removeServer - remove active remote server", () => {
  const settings = { servers: [local, r1], activeServerId: "r1" };
  const result = removeServer(settings, "r1");
  assert.deepEqual(result, {
    ok: true,
    patch: {
      servers: [local],
      activeServerId: "local",
    },
  });
});

test("removeServer - remove inactive remote server", () => {
  const settings = { servers: [local, r1], activeServerId: "local" };
  const result = removeServer(settings, "r1");
  assert.deepEqual(result, {
    ok: true,
    patch: {
      servers: [local],
    },
  });
});

test("selectServer - successful selection", () => {
  const settings = { servers: [local, r1], activeServerId: "local" };
  const result = selectServer(settings, "r1");
  assert.deepEqual(result, {
    ok: true,
    patch: { activeServerId: "r1" },
  });
});

test("selectServer - unknown server id", () => {
  const settings = { servers: [local, r1], activeServerId: "local" };
  const result = selectServer(settings, "unknown");
  assert.deepEqual(result, {
    ok: false,
    errorKey: "cli.serverNotFound",
  });
});
