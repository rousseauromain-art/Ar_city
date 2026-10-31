// Résumé de la parité avec la v1 : lit les rapports JSON de Playwright (un par partie) et écrit du Markdown (scènes testées, écarts) sur la sortie standard.
// Usage : node tests/helpers/resumer-parite.mjs <dossier des rapports> <nombre de parties> — code de sortie 1 s'il y a un écart, un test ignoré ou un rapport manquant.
// Environnement facultatif : BRANCHE, COMMIT (affichés en tête).
import fs from 'node:fs';
import path from 'node:path';

/** @typedef {{fichier: string, titre: string, statut: 'réussi' | 'échoué' | 'ignoré', ecart: string}} Resultat */

/** Tous les tests d'un rapport Playwright, à plat. @param {any} rapport @returns {Resultat[]} */
export function resultats(rapport) {
  /** @type {Resultat[]} */
  const sortie = [];
  const parcourir = (/** @type {any} */ suite, /** @type {string[]} */ chemin) => {
    const titre = suite.title ? [...chemin, suite.title] : chemin;
    for (const sp of suite.specs || []) for (const t of sp.tests || []) {
      const rs = t.results || [], dernier = rs[rs.length - 1] || {};
      const statut = t.status === 'skipped' || dernier.status === 'skipped' ? 'ignoré' : t.status === 'expected' || t.status === 'flaky' ? 'réussi' : 'échoué';
      const erreur = (dernier.error && dernier.error.message) || (dernier.errors && dernier.errors[0] && dernier.errors[0].message) || '';
      sortie.push({ fichier: sp.file || titre[0] || '?', titre: [...titre.slice(1), sp.title].join(' › '), statut, ecart: String(erreur).replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join('\n') });
    }
    for (const s of suite.suites || []) parcourir(s, titre);
  };
  for (const s of rapport.suites || []) parcourir(s, []);
  return sortie;
}

/** Nom de la scène réelle d'après le titre du test (« … sur la scène réelle saint-malo-rempart »). @param {string} titre */
export const sceneDuTitre = (titre) => { const m = /sc[èe]ne r[ée]elle\s+([\w-]+)/i.exec(titre); return m ? m[1] : null; };

/**
 * @param {Resultat[]} tous @param {{manquants: number[], total: number, branche?: string, commit?: string}} o
 * @returns {{markdown: string, ok: boolean}}
 */
export function resumer(tous, { manquants, total, branche = '', commit = '' }) {
  const n = (/** @type {string} */ st) => tous.filter((r) => r.statut === st).length;
  const echecs = tous.filter((r) => r.statut === 'échoué'), ignores = tous.filter((r) => r.statut === 'ignoré');
  const ok = !echecs.length && !ignores.length && !manquants.length && tous.length > 0;
  const scenes = [...new Set(tous.map((r) => sceneDuTitre(r.titre)).filter(Boolean))].sort();
  const parFichier = new Map();
  for (const r of tous) { const f = parFichier.get(r.fichier) || { reussi: 0, echoue: 0, ignore: 0 }; f[r.statut === 'réussi' ? 'reussi' : r.statut === 'échoué' ? 'echoue' : 'ignore']++; parFichier.set(r.fichier, f); }
  const L = [ok ? '## ✅ Parité avec la v1 : OK' : `## ❌ Parité avec la v1 : ${echecs.length ? `${echecs.length} écart(s)` : 'incomplète'}`, ''];
  L.push(`Branche **${branche || '?'}**, commit \`${(commit || '?').slice(0, 9)}\``, '');
  L.push(`**${tous.length} test(s)** : ${n('réussi')} réussi(s), ${echecs.length} échoué(s), ${ignores.length} ignoré(s). Scènes réelles testées : ${scenes.length ? scenes.join(', ') : '—'}.`, '');
  if (manquants.length) L.push(`⚠️ Rapport(s) manquant(s) pour la/les partie(s) ${manquants.join(', ')} sur ${total} : la partie a échoué avant de produire un rapport (voir son journal).`, '');
  if (ignores.length) L.push('⚠️ Tests ignorés (interdit : un test de parité sauté est un faux vert) :', ...ignores.map((r) => `- ${r.fichier} › ${r.titre}`), '');
  L.push('| Fichier | Réussis | Échoués | Ignorés |', '|---|---|---|---|', ...[...parFichier].sort().map(([f, c]) => `| ${f} | ${c.reussi} | ${c.echoue} | ${c.ignore} |`), '');
  if (echecs.length) { L.push('### Écarts', ''); for (const r of echecs) L.push(`**${r.fichier} › ${r.titre}**`, '```', r.ecart || '(pas de message)', '```', ''); }
  return { markdown: L.join('\n'), ok };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const dossier = process.argv[2], total = +process.argv[3] || 4, tous = /** @type {Resultat[]} */ ([]), manquants = [];
  for (let i = 1; i <= total; i++) {
    const f = path.join(dossier, `rapport-parite-${i}.json`);
    if (!fs.existsSync(f)) { manquants.push(i); continue; }
    tous.push(...resultats(JSON.parse(fs.readFileSync(f, 'utf8'))));
  }
  const r = resumer(tous, { manquants, total, branche: process.env.BRANCHE, commit: process.env.COMMIT });
  process.stdout.write(r.markdown + '\n');
  process.exit(r.ok ? 0 : 1);
}
