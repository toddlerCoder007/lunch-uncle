import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlacesRequest, CT_HUB_2 } from "../src/tools.js";

test("Places search is centred on CT Hub 2", () => {
  const body = buildPlacesRequest({ query: "chicken rice" });
  assert.deepEqual(body.locationBias.circle.center, CT_HUB_2);
  assert.equal(body.textQuery, "chicken rice");
  assert.equal(body.openNow, false);
});
