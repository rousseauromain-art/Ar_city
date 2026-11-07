// @ts-check
/**
 * Couches personnelles (KMZ / KML) de l'application : mémoire sur l'appareil (relue au démarrage), import d'un fichier, modification, suppression, recherche, distances et caps pour la position courante.
 * Le fichier est lu dans le navigateur, jamais envoyé. Entrées : les données de la scène (`D`), la Cache API, le journal, la notification de changement. Dépend de : donnees/kml.js, donnees/couches-perso.js.
 */
import { importerCouche, positionnerCouche, libellesCouche, marquerRecherche } from '../donnees/kml.js';
import { diagnosticKml } from '../donnees/kml-diagnostic.js';
import { creerMemoireCouches } from '../donnees/couches-perso.js';

/**
 * @param {{D: {pos: {lat: number, lon: number} | null, couchesPerso: import('../donnees/kml.js').CouchePerso[]}, caches?: CacheStorage, journal: {info: (m: string, msg: string, d?: unknown) => unknown, avert: (m: string, msg: string, d?: unknown) => unknown}, change: (quoi: string) => void}} o
 */
export function creerGestionCouches({ D, caches, journal, change }) {
  const memoire = creerMemoireCouches({ caches, journal });
  /** Distance et cap de chaque site, et les sites affichables, pour la position courante. */
  const recalculer = () => { if (D.pos) for (const L of D.couchesPerso) positionnerCouche(L, D.pos); };
  memoire.charger().then((l) => { if (!l.length) return; D.couchesPerso = l; recalculer(); change('couches'); }).catch((e) => journal.avert('app', 'couches personnelles illisibles', e));
  return {
    recalculer,
    methodes: {
      /** Les couches personnelles (KMZ/KML) chargées. */
      couchesPerso: () => D.couchesPerso,
      /**
       * Importe un fichier .kmz ou .kml (lu dans le navigateur, jamais envoyé) : couche ajoutée, mémorisée sur l'appareil, affichée comme les pylônes. Lève une erreur lisible (trop gros, aucun point…).
       * @param {File} fichier @returns {Promise<{couche: import('../donnees/kml.js').CouchePerso, coupe: boolean, memorisee: boolean}>}
       */
      async importerCouchePerso(fichier) {
        const r = await importerCouche({ octets: await fichier.arrayBuffer(), nom: fichier.name, taille: fichier.size, rang: D.couchesPerso.length });
        try { r.couche.diag = diagnosticKml(r.txt, r.meta, { doc: r.doc, res: r.res }).slice(0, 24000); } catch (e) { journal.avert('app', 'diagnostic du fichier impossible', e); }
        D.couchesPerso.push(r.couche); recalculer();
        const memorisee = await memoire.enregistrer(r.couche);
        journal.info('app', `couche « ${r.couche.name} » : ${r.couche.pts.length} point(s)${memorisee ? '' : ' (non mémorisée : stockage plein ?)'}`);
        change('couches');
        return { couche: r.couche, coupe: r.coupe, memorisee };
      },
      /**
       * Modifie une couche (nom, couleur, champ affiché, distance, visible) et la mémorise.
       * @param {string} id @param {{name?: string, color?: string, field?: string, max?: number, on?: boolean}} patch
       */
      async modifierCouchePerso(id, patch) {
        const L = D.couchesPerso.find((x) => x.id === id); if (!L) return;
        if (patch.on !== undefined) L.on = patch.on;
        if (patch.max !== undefined) L.max = patch.max;
        if (patch.name !== undefined) { L.name = patch.name.trim().slice(0, 60) || L.name; for (const it of L.items) it.lname = L.name; }
        if (patch.color !== undefined) { L.color = patch.color; for (const it of L.items) it.col = L.color; }
        if (patch.field !== undefined) { L.field = patch.field; libellesCouche(L); }
        recalculer(); change('couches'); await memoire.enregistrer(L);
      },
      /** @param {string} id */
      async supprimerCouchePerso(id) {
        D.couchesPerso = D.couchesPerso.filter((x) => x.id !== id); await memoire.supprimer(id); change('couches');
      },
      /** Recherche dans toutes les couches : les sites trouvés sont mis en gras sur la vue ; renvoie la liste (60 au plus par couche). @param {string} requete */
      rechercherSites(requete) {
        const trouves = /** @type {import('../donnees/kml.js').ItemPerso[]} */ ([]);
        for (const L of D.couchesPerso) { marquerRecherche(L, requete); if (L.on) trouves.push(...L.items.filter((it) => it.hl)); }
        recalculer(); change('couches');
        return trouves.sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
      },
    },
  };
}
