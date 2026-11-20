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
