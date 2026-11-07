// @ts-nocheck
// Hauteur d'œil : le GPS propose, il n'impose pas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { proposerCorrectionGps, decisionAuto, resumerAltitudes, solDuReliefFin } from '../../src/scene/oeil-gps.js';
import { ORIGINE_SOL } from '../../src/scene/hauteur-oeil.js';

/** n mesures (une par seconde) autour de `centre`, bruitées de ±`bruit` m, précision annoncée `prec`. */
const mesures = (n, centre, bruit, prec, t0 = 0) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 1000, altitudeM: centre + bruit * Math.sin(i * 2.4), precisionAltM: prec }));

test('mesures bruitées à ±15 m autour du sol : aucune proposition', () => {
  const p = proposerCorrectionGps({ mesures: mesures(30, 9, 15, 5), solM: 9 });
  assert.equal(p.proposee, false); assert.match(p.raison, /écart au sol/);
  const grosBruit = proposerCorrectionGps({ mesures: mesures(30, 9, 15, 15), solM: 9 }); // précision annoncée ±15 m
  assert.equal(grosBruit.proposee, false); assert.match(grosBruit.raison, /précision/);
});

test('+40 m stables avec une précision de 5 m : proposition de +40 m', () => {
  const p = proposerCorrectionGps({ mesures: mesures(25, 9 + 1.6 + 40, 0.5, 5), solM: 9 });
  assert.equal(p.proposee, true); assert.equal(p.correctionM, 40); assert.equal(p.precisionM, 5); assert.ok(Math.abs(p.ecartSolM - 41.6) < 0.2);
});

test('refus : trop peu de mesures, échantillon trop court, précision inconnue, sol inconnu', () => {
  assert.match(proposerCorrectionGps({ mesures: mesures(9, 60, 0, 5), solM: 9 }).raison, /pas assez de mesures/);
  assert.match(proposerCorrectionGps({ mesures: mesures(12, 60, 0, 5).map((m, i) => ({ ...m, t: i * 1000 })), solM: 9 }).raison, /trop court/); // 11 s
  assert.match(proposerCorrectionGps({ mesures: mesures(25, 60, 0, null), solM: 9 }).raison, /inconnue/);
  assert.match(proposerCorrectionGps({ mesures: mesures(25, 60, 0, 5), solM: NaN }).raison, /sol inconnu/);
});

test('le géoïde est retranché (Android : +49 m à Saint-Malo ne propose rien)', () => {
  const p = proposerCorrectionGps({ mesures: mesures(25, 9 + 49.2, 0.3, 5), solM: 9, ondulationM: 49.2 });
  assert.equal(p.proposee, false); assert.ok(Math.abs(p.medianeM - 9) < 0.5);
  assert.equal(proposerCorrectionGps({ mesures: mesures(25, 9 + 49.2, 0.3, 5), solM: 9, ondulationM: 0 }).proposee, true, 'sans correction du géoïde : le piège de +48 m');
});

test('résumé : médiane, dispersion des 10 dernières, étalement', () => {
  const r = resumerAltitudes(mesures(30, 100, 4, 6), 0);
  assert.equal(r.n, 30); assert.equal(r.dureeMs, 29000); assert.equal(r.precisionM, 6);
  assert.ok(r.dispersion.maxM - r.dispersion.minM <= 8.01 && r.dispersion.ecartTypeM > 0);
  assert.deepEqual(resumerAltitudes([], 0), { n: 0, dureeMs: 0, medianeM: null, precisionM: null, dispersion: null });
});

test('automatique : au plus toutes les 2 min, jamais sur le relief fin sous 15 m, jamais après un réglage manuel', () => {
  const proposition = (ecart) => proposerCorrectionGps({ mesures: mesures(25, 9 + ecart, 0.3, 5), solM: 9 });
  const base = { origineSol: ORIGINE_SOL.surface, derniereMs: 0, maintenantMs: 200000, manuel: false, obsHeight: 0 };
  assert.equal(decisionAuto({ ...base, proposition: proposition(41.6) }), 40, 'sol du modèle 30 m : applique');
  assert.equal(decisionAuto({ ...base, proposition: proposition(41.6), maintenantMs: 100000 }), null, 'dernier recalage il y a moins de 2 min');
  assert.equal(decisionAuto({ ...base, proposition: proposition(41.6), manuel: true }), null);
  assert.equal(decisionAuto({ ...base, origineSol: ORIGINE_SOL.finRelu, proposition: proposition(12) }), null, 'relief fin : 12 m, trop peu');
  assert.equal(decisionAuto({ ...base, origineSol: ORIGINE_SOL.finRelu, proposition: proposition(16) }), 14, 'relief fin : 16 m, assez');
  assert.equal(decisionAuto({ ...base, origineSol: ORIGINE_SOL.surface, proposition: proposition(12) }), 10, 'sol du modèle 30 m (hors de France) : 12 m suffit');
  assert.equal(decisionAuto({ ...base, proposition: proposition(41.6), obsHeight: 39 }), null, 'moins de 3 m de gain');
  assert.equal(decisionAuto({ ...base, proposition: proposition(3) }), null, 'pas de proposition');
  assert.equal(solDuReliefFin(ORIGINE_SOL.fin) && solDuReliefFin(ORIGINE_SOL.finRelu) && !solDuReliefFin(ORIGINE_SOL.surface) && !solDuReliefFin(ORIGINE_SOL.modele30), true);
});
