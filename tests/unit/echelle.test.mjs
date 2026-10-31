// @ts-nocheck
// Échelle du champ : le champ et le cap sont retrouvés à partir de deux repères dont on connaît les relèvements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calerEchelle } from '../../src/calage/echelle.js';
import { champAffiche } from '../../src/noyau/projection.js';

const RAD = Math.PI / 180, ECRAN = { largeurPx: 915, hauteurPx: 412 }, ch = (cam) => champAffiche(cam, ECRAN, { largeurPx: 4000, hauteurPx: 3000 });
/** Position écran d'un relèvement vu par une caméra de champ `camFov` visant `capReel`. */
const ecran = (rel, capReel, camFov, roulis = 0) => { const f = (ECRAN.largeurPx / 2) / Math.tan(ch(camFov) / 2 * RAD), dx = f * Math.tan((((rel - capReel + 540) % 360) - 180) * RAD), dy = -12; const r = roulis * RAD; return { x: ECRAN.largeurPx / 2 + dx * Math.cos(r) - dy * Math.sin(r), y: ECRAN.hauteurPx / 2 + dx * Math.sin(r) + dy * Math.cos(r) }; };
const cas = (rel1, rel2, capReel, camFov, capAffiche, roulis = 0) => ({ ecran: ECRAN, roulisDeg: roulis, capDeg: capAffiche, champAffiche: ch, points: [{ ...ecran(rel1, capReel, camFov, roulis), relevementDeg: rel1 }, { ...ecran(rel2, capReel, camFov, roulis), relevementDeg: rel2 }] });

test('le champ et le cap réels sont retrouvés (plusieurs champs, caps, repères, roulis)', () => {
  for (const [camFov, capReel, r1, r2, roulis] of [[67, 210, 190, 232, 0], [75, 40, 20, 58, 0], [58, 355, 345, 12, 0], [67, 120, 100, 140, 4], [90, 300, 262, 330, -3]]) {
    const r = calerEchelle(cas(r1, r2, capReel, camFov, capReel + 7, roulis));
    assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(Math.abs(r.camFov - camFov) <= 0.5, `champ ${r.camFov} / ${camFov}`); assert.ok(Math.abs(r.correctionCapDeg + 7) < 0.3, `cap ${r.correctionCapDeg}`);
  }
});
test('refus : repères trop proches, points trop proches sur l\'écran, ordre inversé, champ impossible', () => {
  assert.match(calerEchelle(cas(200, 205, 205, 67, 205)).message, /ne sont écartés que de/);
  const c = cas(190, 232, 210, 67, 210); c.points[1] = { ...c.points[0], relevementDeg: 232 }; assert.match(calerEchelle(c).message, /trop proches sur l’écran/);
  const inv = cas(190, 232, 210, 67, 210); inv.points = [inv.points[1], inv.points[0]]; inv.points[0].relevementDeg = 190; inv.points[1].relevementDeg = 232; assert.match(calerEchelle(inv).message, /ordre inverse/);
  const faux = cas(190, 232, 210, 67, 210); faux.points[1].relevementDeg = 300; assert.equal(calerEchelle(faux).ok === false || calerEchelle(faux).camFov !== 67, true);
});
