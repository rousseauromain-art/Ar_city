// Types communs de la v2 (REFONTE.md §3 et §7). Fichier de déclarations : aucun code.

export interface Position { lat: number; lon: number; altM: number | null }

/** Ce qu'on regarde : produite par entrees/direct.js ou entrees/photo.js, consommée par scene, calage et rendu. */
export interface Vue {
  image: ImageData | null;
  pos: Position;
  heure: Date;
  capDeg: number | null;
  inclinaisonDeg: number | null;
  champDeg: number;
  source: 'direct' | 'photo';
  meta: Record<string, unknown>;
}

export type EtatElement = 'net' | 'transparent' | 'absent';

/** Résultat de classer() : un élément, son état d'affichage et la raison. */
export interface ElementClasse { el: unknown; etat: EtatElement; raison: string | null }

export interface Calque {
  id: string;
  libelle: string;
  charger(zone: unknown, donnees: unknown): Promise<unknown[]>;
  classer(elements: unknown[], scene: unknown, reglages: Record<string, unknown>): ElementClasse[];
  preparer(classes: ElementClasse[], vue: import('./noyau/projection.js').VueRendu, contexte?: unknown): unknown[];
}

export type NiveauJournal = 'info' | 'avert' | 'erreur';

export interface EntreeJournal {
  t: number;
  niveau: NiveauJournal;
  module: string;
  message: string;
  donnees?: unknown;
}

export interface RapportV2 {
  format: 'vh2-rapport-1';
  cree: string;
  version: string;
  navigateur: { agent: string; langue: string; ecran: string };
  reglages: Record<string, unknown>;
  drapeaux: Record<string, boolean>;
  derniereVue: Record<string, unknown> | null;
  calage: Record<string, unknown> | null;
  chronos: Record<string, number>;
  journal: EntreeJournal[];
}
