// @ts-check
/**
 * Contenu d'une fiche (ce qui s'ouvre quand on touche un nom) : titre, lignes d'information et liens, d'après l'élément touché. Pur : aucun DOM ; l'interface met en page (ui/fiches.js).
 * Reprend les fiches de la v1 : lieux et monuments (liens Wikipédia, Wikidata, carte), pylônes et couches perso (champs), avions (ADS-B Exchange, Flightradar24), bateaux (MarineTraffic, VesselFinder).
 */

/** @typedef {{titre: string, sousTitre: string, lignes: [string, string][], liens: [string, string][], plus: number}} Fiche */

const KM_H = 3.6, NOEUDS = 1.94384;
/** @param {number} km */ const km = (km) => (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace('.', ',') + ' km';
/** @param {number} deg */ const cap = (deg) => `${Math.round(((deg % 360) + 360) % 360)}°`;
/** Lien vers la carte OpenStreetMap, quand l'élément a une position. @param {any} e @returns {[string, string][]} */
const carte = (e) => (Number.isFinite(e.lat) && Number.isFinite(e.lon) ? [['Carte OpenStreetMap', `https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=15/${e.lat}/${e.lon}`]] : []);
/** @param {string} nom @returns {[string, string]} */
const wikipedia = (nom) => ['Wikipédia', `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(nom)}`];

const TYPES_LIEU = /** @type {Record<string, string>} */ ({ city: 'ville', town: 'ville', village: 'village', hamlet: 'hameau', isolated_dwelling: 'habitation isolée', lighthouse: 'phare', island: 'île', cape: 'cap', peak: 'sommet', rock: 'rocher', beach: 'plage', view: 'point de vue', heritage: 'patrimoine' });

/** @param {any} e @returns {[string, string][]} */
function lignesCommunes(e) {
  /** @type {[string, string][]} */
  const l = [];
  if (Number.isFinite(e.dist)) l.push(['Distance', km(e.dist)]);
  if (Number.isFinite(e.brg)) l.push(['Direction', cap(e.brg)]);
  return l;
}

/**
 * @param {{type: 'lieu' | 'monument' | 'bande' | 'avion' | 'bateau', principal: unknown, elements: unknown[]}} zone @returns {Fiche}
 */
export function contenuFiche(zone) {
  const e = /** @type {any} */ (zone.principal) || {}, plus = Math.max(0, (zone.elements || []).length - 1);
  /** @type {Fiche} */
  const f = { titre: String(e.name || 'Sans nom'), sousTitre: '', lignes: lignesCommunes(e), liens: [], plus };
  if (zone.type === 'lieu') {
    f.sousTitre = TYPES_LIEU[e.kind] || String(e.kind || 'lieu');
    if (Number.isFinite(e.ele) && e.ele !== null) f.lignes.push(['Altitude', `${Math.round(e.ele)} m`]);
    if (e.pop) f.lignes.push(['Population', String(e.pop).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')]);
    f.liens.push(wikipedia(f.titre), ...carte(e));
  } else if (zone.type === 'monument') {
    f.sousTitre = String(e.type || e.cat || 'monument');
    const h = e.htWd || e.htOsm; if (h) f.lignes.push(['Hauteur', `${Math.round(h)} m${e.htWd ? ' (Wikidata)' : ' (OpenStreetMap)'}`]); else f.lignes.push(['Hauteur', 'inconnue (supposée 12 m)']);
    if (Number.isFinite(e.links) && e.links) f.lignes.push(['Langues Wikipédia', String(e.links)]);
    if (e.operator) f.lignes.push(['Opérateur', String(e.operator)]);
    if (e.qid) f.liens.push(['Wikipédia', `https://www.wikidata.org/wiki/Special:GoToLinkedPage/frwiki/${e.qid}`], [`Fiche Wikidata ${e.qid}`, `https://www.wikidata.org/wiki/${e.qid}`]); else f.liens.push(wikipedia(f.titre));
    f.liens.push(...carte(e));
  } else if (zone.type === 'bande') {
    f.sousTitre = String(e.sousTitre || e.operateur || e.type || e.cat || 'site');
    for (const [k, v] of Object.entries(e.champs || e.fields || {})) if (v !== null && v !== undefined && String(v) !== '') f.lignes.push([k, String(v)]);
    if (Number.isFinite(e.ht) && e.ht) f.lignes.push(['Hauteur', `${Math.round(e.ht)} m`]);
    f.liens.push(...carte(e));
  } else if (zone.type === 'avion') {
    f.sousTitre = 'avion';
    if (Number.isFinite(e.alt)) f.lignes.push(['Altitude', `${Math.round(e.alt)} m`]);
    if (Number.isFinite(e.vel)) f.lignes.push(['Vitesse', `${Math.round(e.vel * KM_H)} km/h`]);
    if (Number.isFinite(e.trk)) f.lignes.push(['Cap', cap(e.trk)]);
    if (e.id) f.liens.push(['ADS-B Exchange', `https://globe.adsbexchange.com/?icao=${encodeURIComponent(e.id)}`]);
    if (e.name && e.name !== '?') f.liens.push(['Flightradar24', `https://www.flightradar24.com/${encodeURIComponent(e.name)}`]);
  } else {
    f.sousTitre = 'bateau';
    if (e.mmsi) f.lignes.push(['MMSI', String(e.mmsi)]);
    if (Number.isFinite(e.vel)) f.lignes.push(['Vitesse', `${(e.vel * NOEUDS).toFixed(1).replace('.', ',')} nœuds`]);
    if (Number.isFinite(e.trk)) f.lignes.push(['Cap', cap(e.trk)]);
    if (e.mmsi) f.liens.push(['MarineTraffic', `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${e.mmsi}`], ['VesselFinder', `https://www.vesselfinder.com/vessels/details/${e.mmsi}`]);
    f.liens.push(...carte(e));
  }
  return f;
}
