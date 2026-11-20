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
