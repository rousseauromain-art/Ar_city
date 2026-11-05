// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { choisirCible, consigne, meilleurRepere } from '../../src/calage/guide.js';

const champ = { champHDeg: 60, champVDeg: 40 };
const repere = { nom: 'Tour Solidor', brg: 90, dist: 2 };

test('préférence : soleil, puis lune, puis repère, puis horizon', () => {
  const soleil = { azDeg: 200, elDeg: 30 }, lune = { azDeg: 120, elDeg: 20 };
  assert.equal(choisirCible({ soleil, lune, repere, capDeg: 0 }).type, 'soleil');
  assert.equal(choisirCible({ soleil: { azDeg: 200, elDeg: -5 }, lune, repere, capDeg: 0 }).type, 'lune', 'soleil couché : la lune');
  assert.equal(choisirCible({ soleil: { azDeg: 200, elDeg: 1 }, lune: { azDeg: 1, elDeg: -9 }, repere, capDeg: 0 }).type, 'repere', 'soleil trop bas, lune couchée : un repère');
  assert.equal(choisirCible({ soleil: null, lune: null, repere: null, capDeg: 33 }).type, 'relief');
  assert.equal(choisirCible({ soleil: null, lune: null, repere: null, capDeg: 33 }).azDeg, 33);
});

test('le repère choisi : le plus proche du cap actuel, puis le plus proche', () => {
  const r = [{ nom: 'A', brg: 10, dist: 5 }, { nom: 'B', brg: 100, dist: 1 }, { nom: 'C', brg: 20, dist: 12 }];
  assert.equal(meilleurRepere(r, 0).nom, 'A');
  assert.equal(meilleurRepere(r, 95).nom, 'B');
  assert.equal(meilleurRepere([], 0), null);
});

test('consigne : tourner, monter, dans le champ', () => {
  const soleil = { type: 'soleil', nom: 'le soleil', azDeg: 130, elDeg: 35 };
  const c = consigne(soleil, { capDeg: 40, inclinaisonDeg: 0 }, champ);
  assert.equal(c.dansLeChamp, false); assert.match(c.texte, /Visez le soleil : tournez de 90° vers la droite et montez de 35°/);
  const g = consigne({ ...soleil, azDeg: 350 }, { capDeg: 40, inclinaisonDeg: 30 }, champ); assert.match(g.texte, /tournez de 50° vers la gauche/); assert.doesNotMatch(g.texte, /montez|baissez/);
  const bas = consigne({ ...soleil, azDeg: 40, elDeg: 0 }, { capDeg: 40, inclinaisonDeg: 40 }, champ); assert.match(bas.texte, /baissez de 40°/);
  const dedans = consigne({ ...soleil, azDeg: 45, elDeg: 12 }, { capDeg: 40, inclinaisonDeg: 5 }, champ);
  assert.equal(dedans.dansLeChamp, true); assert.match(dedans.texte, /^Le soleil est dans le champ : ne bougez plus/);
});

test('repère : la distance est annoncée ; bord du champ : la marge de 5° compte', () => {
  const c = consigne({ type: 'repere', nom: 'Tour Solidor', azDeg: 90, elDeg: 0, distKm: 2.34 }, { capDeg: 0, inclinaisonDeg: 0 }, champ);
  assert.match(c.texte, /Visez Tour Solidor \(à 2\.3 km\) : tournez de 90° vers la droite/);
  assert.equal(consigne({ type: 'soleil', nom: 'le soleil', azDeg: 24, elDeg: 0 }, { capDeg: 0, inclinaisonDeg: 0 }, champ).dansLeChamp, true, '24° < 30° − 5°');
  assert.equal(consigne({ type: 'soleil', nom: 'le soleil', azDeg: 26, elDeg: 0 }, { capDeg: 0, inclinaisonDeg: 0 }, champ).dansLeChamp, false, '26° > 25°');
});

test('en ville : soleil, puis lune, puis la rue, puis les toits, puis comme ailleurs (repère, horizon) ; consigne de la rue', () => {
  const ville = { rue: { nom: 'Rue de Rivoli', axeDeg: 90 }, toits: true }, repere = { nom: 'Tour', brg: 10, dist: 2 }, vide = { soleil: null, lune: null, repere, capDeg: 0, ville };
  assert.equal(choisirCible({ ...vide, soleil: { azDeg: 200, elDeg: 30 } }).type, 'soleil');
  assert.equal(choisirCible({ ...vide, lune: { azDeg: 100, elDeg: 20 } }).type, 'lune');
  const rue = choisirCible(vide); assert.equal(rue.type, 'rue'); assert.equal(rue.azDeg, 90);
  assert.equal(choisirCible({ ...vide, ville: { rue: null, toits: true } }).type, 'toits');
  assert.equal(choisirCible({ ...vide, ville: { rue: null, toits: false } }).type, 'repere');
  assert.equal(choisirCible({ ...vide, repere: null, ville: null }).type, 'relief', 'hors ville : comme avant');
  assert.equal(choisirCible({ ...vide, ville: null }).type, 'repere');
  const c = consigne(rue, { capDeg: 10, inclinaisonDeg: 0 }, { champHDeg: 60, champVDeg: 40 });
  assert.match(c.texte, /point où se rejoignent les bords de la rue \(trottoirs, lignes des façades\)/); assert.equal(c.dansLeChamp, false, 'jamais d\'auto-calage : l\'utilisateur touche le bouton');
  assert.equal(consigne({ type: 'toits', nom: 'la ligne des toits', azDeg: 0, elDeg: 0 }, { capDeg: 0, inclinaisonDeg: 0 }, { champHDeg: 60, champVDeg: 40 }).dansLeChamp, true);
});
