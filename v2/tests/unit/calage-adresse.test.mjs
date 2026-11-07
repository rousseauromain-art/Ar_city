// @ts-nocheck — données synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lireTexteAdresse, choisirAdresse, positionDepuisAdresse, motsCles, TROTTOIR_M } from '../../src/calage/adresse.js';
import { creerSourceAdresse } from '../../src/donnees/adresse.js';

const POS = { lat: 48.8566, lon: 2.3522 }, kLon = 111320 * Math.cos(POS.lat * Math.PI / 180);
const P = (N, E) => ({ lat: POS.lat + N / 111320, lon: POS.lon + E / kLon });
const dist = (a, b) => Math.hypot((b.lat - a.lat) * 111320, (b.lon - a.lon) * kLon);

test('lecture du texte de la plaque : numéro, type de voie, nom ; bruit d\'OCR toléré', () => {
  assert.deepEqual(lireTexteAdresse('12 RUE DE SEINE'), { numero: '12', rue: 'rue de seine', requete: '12 rue de seine' });
  assert.equal(lireTexteAdresse('RUE DE SEINE\n75006 PARIS').numero, '');
  assert.equal(lireTexteAdresse('RUE DE SEINE\n75006 PARIS').rue, 'rue de seine');
  assert.equal(lireTexteAdresse('L2 rue de Seine').numero, '12', 'l minuscule lu pour 1');
  assert.equal(lireTexteAdresse('14 bis, Avenue des Champs-Élysées').requete, '14 bis avenue des champs-elysees');
  assert.equal(lireTexteAdresse('Bd. Saint-Germain').rue, 'boulevard saint-germain');
  assert.equal(lireTexteAdresse('PL DE LA CONCORDE').requete, 'place de la concorde');
  assert.equal(lireTexteAdresse('|||  ~~ 3 ~~'), null); assert.equal(lireTexteAdresse(''), null); assert.equal(lireTexteAdresse('RUE'), null);
});

test('mots clés d\'une rue : ni articles ni types de voies', () => { assert.deepEqual(motsCles('rue de la Paix'), ['paix']); assert.deepEqual(motsCles('Avenue des Champs-Élysées'), ['champs', 'elysees']); });

const rivoli = { nom: 'Rue de Rivoli', points: [P(0, -200), P(0, 200)] }; // est-ouest, par le nord de l'observateur… à N = 0
const adr = (type, rue, numero, point) => ({ type, libelle: `${numero ? numero + ' ' : ''}${rue}, 75001 Paris`, point, numero, rue, distM: dist(POS, point) });

test('numéro pair puis impair : côtés opposés de la rue, à 4 m de l\'axe (le trottoir)', () => {
  const pair = adr('numero', 'Rue de Rivoli', '12', P(12, 60)), impair = adr('numero', 'Rue de Rivoli', '13', P(-11, 60));
  const a = positionDepuisAdresse({ adresse: pair, rues: [rivoli], pos: POS }), b = positionDepuisAdresse({ adresse: impair, rues: [rivoli], pos: POS });
  assert.equal(a.ok && b.ok, true);
  const nord = (p) => (p.lat - POS.lat) * 111320;
  assert.ok(Math.abs(nord(a.pos) - TROTTOIR_M) < 0.05, `nord ${nord(a.pos)}`); assert.ok(Math.abs(nord(b.pos) + TROTTOIR_M) < 0.05, `nord ${nord(b.pos)}`);
  assert.ok(Math.abs((a.pos.lon - POS.lon) * kLon - 60) < 0.05, 'le long de la rue, au droit du numéro');
});

test('un point d\'adresse déjà à moins de 4 m de l\'axe est gardé tel quel ; sans géométrie de la rue : le point d\'adresse', () => {
  const proche = adr('numero', 'Rue de Rivoli', '2', P(2, 10)); assert.ok(dist(positionDepuisAdresse({ adresse: proche, rues: [rivoli], pos: POS }).pos, P(2, 10)) < 0.01);
  assert.ok(dist(positionDepuisAdresse({ adresse: adr('numero', 'Rue Inconnue', '9', P(30, 40)), rues: [rivoli], pos: POS }).pos, P(30, 40)) < 0.01);
});

test('rue seule : la position actuelle est projetée sur la rue ; géométrie inconnue : refus', () => {
  const r = positionDepuisAdresse({ adresse: adr('rue', 'Rue de Rivoli', '', P(0, 0)), rues: [rivoli], pos: P(15, 37) });
  assert.equal(r.ok, true); assert.ok(dist(r.pos, P(0, 37)) < 0.05); assert.ok(Math.abs(r.ecartM - 15) < 0.05);
  const non = positionDepuisAdresse({ adresse: adr('rue', 'Rue de Seine', '', P(0, 0)), rues: [rivoli], pos: POS }); assert.equal(non.ok, false); assert.match(non.raison, /lisez un numéro/);
});

test('choix du résultat : le numéro lu d\'abord, sinon la rue', () => {
  const l = [adr('rue', 'Rue de Rivoli', '', P(0, 0)), adr('numero', 'Rue de Rivoli', '12', P(10, 5)), adr('numero', 'Rue de Rivoli', '14', P(10, 25))];
  assert.equal(choisirAdresse(l, { numero: '14', rue: 'rue de rivoli' }).numero, '14');
  assert.equal(choisirAdresse(l, { numero: '', rue: 'rue de rivoli' }).type, 'rue');
  assert.equal(choisirAdresse(l, { numero: '99', rue: 'rue de rivoli' }).type, 'rue', 'numéro inconnu : la rue');
  assert.equal(choisirAdresse([], { numero: '1', rue: 'x' }), null);
});

test('Base Adresse : requête, filtre à 300 m, plus proches d\'abord ; rien n\'est envoyé que le texte', async () => {
  const urls = [];
  const reseau = { requeter: async (url) => { urls.push(url); return { features: [
    { geometry: { coordinates: [P(0, 400).lon, P(0, 400).lat] }, properties: { type: 'housenumber', label: '1 Rue Loin', housenumber: '1', street: 'Rue Loin' } },
    { geometry: { coordinates: [P(40, 40).lon, P(40, 40).lat] }, properties: { type: 'housenumber', label: '12 Rue de Rivoli', housenumber: '12', street: 'Rue de Rivoli' } },
    { geometry: { coordinates: [P(5, 5).lon, P(5, 5).lat] }, properties: { type: 'street', label: 'Rue de Rivoli', name: 'Rue de Rivoli' } },
    { geometry: { coordinates: [P(5, 5).lon, P(5, 5).lat] }, properties: { type: 'municipality', label: 'Paris' } }] }; } };
  const r = await creerSourceAdresse({ reseau }).chercher({ texte: '12 rue de rivoli', pos: POS });
  assert.deepEqual(r.map((a) => a.type), ['rue', 'numero']); assert.equal(r[1].numero, '12');
  assert.match(urls[0], /data\.geopf\.fr\/geocodage\/search\/\?q=12%20rue%20de%20rivoli&lat=48\.856600&lon=2\.352200&limit=5/);
});
