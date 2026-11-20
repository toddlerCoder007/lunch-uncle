import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlacesRequest, formatPlaces, CT_HUB_2 } from "../src/tools.js";

test("Places search is centred on CT Hub 2", () => {
  const body = buildPlacesRequest({ query: "chicken rice" });
  assert.deepEqual(body.locationBias.circle.center, CT_HUB_2);
  assert.equal(body.textQuery, "chicken rice");
  assert.equal(body.openNow, false);
});

test("formatPlaces reports open status and tolerates missing fields", () => {
  const places = [
    {
      displayName: { text: "Lavender Kopitiam" },
      rating: 4.2,
      location: { latitude: 1.3073, longitude: 103.8631 },
      currentOpeningHours: { openNow: true },
    },
    { displayName: { text: "No Info" } },
  ];
  const [a, b] = formatPlaces(places, CT_HUB_2);
  assert.equal(a.name, "Lavender Kopitiam");
  assert.equal(a.open_now, true);
  assert.ok(a.distance_m > 400 && a.distance_m < 550, `got ${a.distance_m}`);
  assert.deepEqual(b, { name: "No Info", rating: null, distance_m: null, open_now: null });
});

import { formatForecast } from "../src/tools.js";

test("formatForecast does not throw when forecasts is missing", () => {
  assert.doesNotThrow(() => formatForecast({ data: { items: [{}] } }, "Kallang"));
});

import { executeTool } from "../src/tools.js";

const realFetch = globalThis.fetch;

function recordFetch() {
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify({}), { status: 200 });
  };
  return seen;
}

test("every tool fetch carries an abort signal so a hung upstream cannot stall the turn", async () => {
  const seen = recordFetch();
  try {
    await executeTool("find_lunch_places", { query: "ramen" }, { GOOGLE_PLACES_API_KEY: "k" });
    await executeTool("get_rain_forecast", {}, {});
    await executeTool("get_bus_arrivals", { stop_code: "07371" }, {});
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(seen.length, 3);
  for (const s of seen) {
    assert.ok(s.init.signal instanceof AbortSignal, s.url);
  }
});

test("tools reject bad arguments without calling upstream", async () => {
  const seen = recordFetch();
  try {
    for (const args of [{}, { stop_code: "7371" }, { stop_code: "Lavender" }, { stop_code: 7371 }, null]) {
      const out = JSON.parse(await executeTool("get_bus_arrivals", args, {}));
      assert.ok(out.error, JSON.stringify(args));
    }
    for (const args of [{}, { query: "" }, { query: "   " }, null]) {
      const out = JSON.parse(await executeTool("find_lunch_places", args, { GOOGLE_PLACES_API_KEY: "k" }));
      assert.ok(out.error, JSON.stringify(args));
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(seen.length, 0);
});

import { PLACES_FIELD_MASK, formatBusArrivals, MAX_BUS_SERVICES } from "../src/tools.js";

test("Places field mask asks only for fields the formatter uses", () => {
  const fields = PLACES_FIELD_MASK.split(",");
  assert.ok(!fields.includes("places.id"));
  for (const f of ["places.displayName", "places.location", "places.rating", "places.currentOpeningHours"]) {
    assert.ok(fields.includes(f), f);
  }
});

test("formatBusArrivals caps how many services it returns", () => {
  const services = Array.from({ length: 30 }, (_, i) => ({ no: String(i), next: { duration_ms: 60_000 } }));
  const out = formatBusArrivals({ services }, "07371");
  assert.equal(out.services.length, MAX_BUS_SERVICES);
});

import { WALKING_LIMIT_M } from "../src/tools.js";

test("formatPlaces drops places beyond walking distance", () => {
  const near = { displayName: { text: "Near" }, location: { latitude: 1.3073, longitude: 103.8631 } };
  const far = { displayName: { text: "Far" }, location: { latitude: 1.3500, longitude: 103.9500 } };
  const out = formatPlaces([far, near], CT_HUB_2);
  assert.deepEqual(out.map((p) => p.name), ["Near"]);
  assert.ok(out[0].distance_m <= WALKING_LIMIT_M);
});

test("Places search is not limited to type 'restaurant', so hawker centres can match", () => {
  assert.equal(buildPlacesRequest({ query: "hawker" }).includedType, undefined);
});
