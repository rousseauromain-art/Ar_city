// Position de la lune : comparée à une éphéméride (PyEphem, topocentrique, réfraction standard) en huit lieux et instants. Précision attendue : quelques dixièmes de degré.
import test from 'node:test';
import assert from 'node:assert/strict';
import { positionLune } from '../../src/noyau/astro.js';

const REF = [ // [ms UTC, lat, lon, azimut, élévation]
  [1790530500000, 38.99113, 1.5748, 73.616, -4.239], [1792927320000, 48.6459, -2.0281, 3.183, -29.464], [1792706400000, 45.0805, 7.6705, 206.913, 37.532], [1793325600000, 48.8566, 2.3522, 138.104, 63.743],
  [1787594040000, 48.2318, -4.5189, 129.836, 0.217], [1793907000000, 43.2965, 5.3698, 332.454, -47.877], [1797045300000, -33.87, 151.21, 56.715, 73.05], [1800486600000, 64.14, -21.9, 159.66, 50.81],
];
test('la lune calculée est à moins de 0,6° de l\'éphéméride (azimut et élévation)', () => {
  for (const [t, lat, lon, az, el] of REF) {
    const p = positionLune(t, lat, lon), daz = Math.abs(((p.azDeg - az + 540) % 360) - 180) * Math.cos(Math.max(-85, Math.min(85, el)) * Math.PI / 180), del = Math.abs(p.elDeg - el);
    assert.ok(daz < 0.6 && del < 0.6, `${new Date(t).toISOString()} ${lat},${lon} : calculé ${p.azDeg.toFixed(2)}° / ${p.elDeg.toFixed(2)}°, attendu ${az}° / ${el}° (écarts ${daz.toFixed(2)}° / ${del.toFixed(2)}°)`);
  }
});
