// Scènes de la sortie de Pont-en-Royans (14/11), à part des SCENES de la caractérisation (qui servent à la parité v1/v3).
// Données dans le dépôt privé : sous-dossier Dump_20261114_pontenroyan (exports du cache et photos avec EXIF).
import { REGLAGES_COMMUNS } from './scenes.mjs';

const D = 'Dump_20261114_pontenroyan/';
export const POS_BELVEDERE = { lat: 45.06352, lon: 5.34728 };
/** Écran du téléphone en paysage. */
export const ECRAN_TEL = { width: 812, height: 380 };
/** Les 17 greffes allumées sur le téléphone le 14/11. */
export const GREFFES_TEL = ['soleil2', 'permutation', 'oeil', 'icones', 'rotation', 'plaque', 'montagne', 'champAuto', 'nettete', 'projection', 'degage', 'hauteurs', 'oeilLieu', 'horizonPhoto', 'champPhoto', 'soleilReflet', 'nommer'];
/** Réglages du téléphone : « Visibilité d'après la photo » cochée (les mesures du 15/11 avaient été faites sans). */
export const REGLAGES_TEL = { ...REGLAGES_COMMUNS, photoVis: true };

const base = { ecran: ECRAN_TEL, radius: 25, heure: '2026-11-14T14:59:16Z' };
// noms des tables d'orientation (plan du 15/11, §0), par vue
export const ATTENDUS_EST = ['Presles', 'Le Grand Serre', 'Choranche', 'Choranche-les-Bains', 'crête de Chalimont'];
// noms de zones : pas dans nos sources aujourd'hui (lot 8), mesurés à part
export const ZONES_ATTENDUES = ['Les Coulmes', 'gorges de la Bourne', 'Rochers de Presles', 'forêt de Chambaran', 'montagne de l’Arp'];
export const ATTENDUS_OUEST = ['Royans', 'Font d’Urle', 'serre de Montué', 'roc de Toulau', 'col de la Bataille', 'Musan', 'château de Rochechinard', 'Saint-Nazaire-en-Royans'];
export const ATTENDUS_SUD = ['Mont Baret', 'montagne de l’Arp'];

/** @type {import('./scenes.mjs').Scene[] & {attendus?:string[]}[]} */
export const SCENES_PONT = [
  { id: 'pont-est', lieu: 'Pont-en-Royans, belvédère, vers l’est (sans photo)', pos: POS_BELVEDERE, capDeg: 72, inclinaisonDeg: 0, ...base, attendus: ATTENDUS_EST },
  { id: 'pont-ouest', lieu: 'Pont-en-Royans, belvédère, vers l’ouest (sans photo)', pos: POS_BELVEDERE, capDeg: 231, inclinaisonDeg: 0, ...base, attendus: ATTENDUS_OUEST },
  { id: 'pont-photo-plaine', lieu: 'photo 15:56 : la Bourne, la plaine du Royans (≈ 278°)', photo: D + 'PXL_20261114_145654886.jpg', ...base, heure: '2026-11-14T14:56:54Z', attendus: ['Royans'] },
  { id: 'pont-photo-gorges', lieu: 'photo 15:57 : les gorges de la Bourne (≈ 67°)', photo: D + 'PXL_20261114_145735322.jpg', ...base, heure: '2026-11-14T14:57:35Z', attendus: ['Choranche'] },
  { id: 'pont-photo-24mm', lieu: 'photo 16:01, 24 mm : Pont-en-Royans, crêtes (≈ 210°)', photo: D + 'PXL_20261114_150133093.jpg', ...base, heure: '2026-11-14T15:01:33Z', attendus: ['Musan', 'serre de Montué', 'roc de Toulau'] },
  { id: 'pont-photo-12mm', lieu: 'photo 16:01, 12 mm : la même vue (≈ 216°)', photo: D + 'PXL_20261114_150138972.jpg', ...base, heure: '2026-11-14T15:01:38Z', attendus: ['Musan', 'serre de Montué', 'roc de Toulau'] },
];
