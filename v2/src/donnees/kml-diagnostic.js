// @ts-check
/**
 * Diagnostic de STRUCTURE d'un fichier KML/KMZ, sans jamais reproduire une valeur : pour chaque texte, seulement sa longueur et sa « forme »
 * (chiffre → 9, minuscule → a, majuscule → A, ponctuation conservée). Les NOMS de champs (en-têtes de colonnes) sont repris entre ⟦ ⟧ : l'affichage peut les
 * masquer (champ#1, champ#2…). Permet de déboguer un import à distance sans voir de données confidentielles. Reprend `kmlDiag` et `dg*` de la v1.
 * Entrées : texte du KML, description de l'archive, analyse déjà faite. Sortie : texte brut. Dépend de : donnees/kml.js.
 */
import { analyserKml, domNavigateur } from './kml.js';

/** @typedef {import('./kml.js').AnalyseurDom} AnalyseurDom */

/** Nom de champ protégé par ⟦ ⟧. @param {unknown} n */
const dgK = (n) => '⟦' + String(n === null || n === undefined ? '' : n).replace(/[⟦⟧]/g, '').trim().slice(0, 40) + '⟧';
/** Longueur et forme d'un texte (jamais son contenu). @param {unknown} v */
const dgShape = (v) => {
  const s = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
  return `${s.length} car. « ${Array.from(s).slice(0, 26).map((c) => /[0-9]/.test(c) ? '9' : /[a-zß-ÿ]/.test(c) ? 'a' : /[A-ZÀ-Þ]/.test(c) ? 'A' : c).join('')}${s.length > 26 ? '…' : ''} »`;
};

/** @param {unknown} raw @param {(l: string) => void} out @param {string} ind @param {AnalyseurDom} dom */
function dgDesc(raw, out, ind, dom) {
  const r = String(raw || '');
  if (!r) { out(ind + 'description : vide'); return; }
  const html = /<[a-z!/][^>]*>/i.test(r);
  out(`${ind}description : ${r.length} car., ${html ? 'HTML' : 'texte brut'}`);
  const d = dom.html(r.replace(/<br\s*\/?>/gi, '\n')), tags = /** @type {Record<string, number>} */ ({});
  for (const e of d.body.querySelectorAll('*')) tags[e.localName] = (tags[e.localName] || 0) + 1;
  if (html) out(`${ind}  balises : ${Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ' ' + v).join(', ') || 'aucune'}`);
  const trs = [...d.body.querySelectorAll('tr')], hist = /** @type {Record<number, number>} */ ({}), cells = (/** @type {Element} */ tr) => [...tr.children].filter((x) => /^t[dh]$/i.test(x.localName));
  if (trs.length) {
    for (const tr of trs) { const n = cells(tr).length; hist[n] = (hist[n] || 0) + 1; }
    let depth = 0;
    for (const t of d.body.querySelectorAll('table')) { let k = 0, n = t.parentElement; while (n) { if (n.localName === 'table') k++; n = n.parentElement; } depth = Math.max(depth, k + 1); }
    out(`${ind}  tableau : ${d.body.querySelectorAll('table').length} table(s), imbrication ${depth}, ${trs.length} ligne(s) ; lignes par nombre de cellules : ${Object.entries(hist).map(([k, v]) => k + ' cell.→' + v).join(', ')}`);
    trs.slice(0, 60).forEach((tr, i) => {
      const c = cells(tr), th = c.some((x) => x.localName === 'th'), nested = tr.querySelector('table') ? ' [contient un sous-tableau]' : '';
      out(`${ind}    ligne ${i + 1} (${c.length} cell.${th ? ', en-tête' : ''})${nested} : ` + (c.length === 2 ? `${dgK(c[0].textContent)} → ${dgShape(c[1].textContent)}` : c.slice(0, 5).map((x) => dgShape(x.textContent)).join(' | ')));
    });
    if (trs.length > 60) out(`${ind}    … ${trs.length - 60} ligne(s) de plus`);
  }
  const lines = (d.body.textContent || '').split('\n').map((x) => x.trim()).filter(Boolean), kv = lines.filter((x) => /^[^:]{1,40}:\s*\S/.test(x));
  out(`${ind}  texte : ${lines.length} ligne(s), dont ${kv.length} de forme « libellé : valeur »`);
  kv.slice(0, 10).forEach((x) => { const i = x.indexOf(':'); out(`${ind}    ${dgK(x.slice(0, i))} → ${dgShape(x.slice(i + 1))}`); });
  const lk = (r.match(/https?:\/\//g) || []).length;
  if (lk) out(`${ind}  liens http(s) : ${lk}`);
}

/**
 * @param {string} txt @param {{zip?: boolean, size?: number, ents?: {name: string, meth: number, csz: number}[] | null, pick?: string}} [meta]
 * @param {{doc: Document, res: ReturnType<typeof analyserKml>}} [pre] analyse déjà faite @param {AnalyseurDom} [dom]
 */
export function diagnosticKml(txt, meta = {}, pre, dom = domNavigateur) {
  /** @type {string[]} */
  const L = [];
  const out = (/** @type {string} */ x) => L.push(x);
  out('== Fichier ==');
  out(`type : ${meta.zip ? 'KMZ (archive ZIP)' : 'KML (XML brut)'} · ${meta.size !== undefined && meta.size !== null ? Math.round(meta.size / 1024) + ' Ko' : ''}`);
  if (meta.ents) {
    out(`archive : ${meta.ents.length} entrée(s), KML lu : ${meta.pick || 'aucun'}`);
    meta.ents.slice(0, 15).forEach((e) => out(`  ${e.name} (compression ${e.meth}, ${e.csz} octets)`));
    if (meta.ents.length > 15) out(`  … ${meta.ents.length - 15} de plus`);
  }
  const doc = pre ? pre.doc : dom.xml(txt);
  if (doc.getElementsByTagName('parsererror').length) { out('XML illisible'); return L.join('\n'); }
  const all = [...doc.getElementsByTagName('*')], cnt = /** @type {Record<string, number>} */ ({});
  let maxD = 0;
  for (const e of all) { cnt[e.localName] = (cnt[e.localName] || 0) + 1; let d = 0, n = /** @type {Node} */ (e); while (n.parentNode && n.parentNode.nodeType === 1) { d++; n = n.parentNode; } if (d > maxD) maxD = d; }
  out(`XML : racine ${doc.documentElement.localName}, ${all.length} éléments, profondeur ${maxD}, ${txt.length} caractères`);
  out('éléments (nombre) : ' + Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, v]) => k + ' ' + v).join(', '));
  const pms = [...doc.getElementsByTagName('Placemark')], paths = /** @type {Record<string, number>} */ ({}), geo = /** @type {Record<string, number>} */ ({ sans: 0 });
  for (const pm of pms) {
    const a = []; let n = pm.parentElement;
    while (n) { a.unshift(n.localName); n = n.parentElement; }
    const k = a.join('/');
    paths[k] = (paths[k] || 0) + 1;
    let g = 0;
    for (const t of ['Point', 'LineString', 'LinearRing', 'Polygon', 'MultiGeometry', 'Track', 'Model']) if (pm.getElementsByTagName(t).length) { geo[t] = (geo[t] || 0) + 1; g = 1; }
    if (!g) geo.sans++;
  }
  out(''); out('== Placemarks ==');
  out(`${pms.length} Placemark(s) ; géométries : ${Object.entries(geo).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join(', ')}`);
  Object.entries(paths).slice(0, 8).forEach(([k, v]) => out(`  emplacement : ${k} ×${v}`));
  /** @type {(el: Element, d: number) => string} */
  const skel = (el, d) => {
    const kids = [...el.children];
    if (!kids.length || d > 4) return el.localName;
    const g = /** @type {{t: string, n: number, e: Element}[]} */ ([]);
    for (const k of kids) { const l = g[g.length - 1]; if (l && l.t === k.localName) l.n++; else g.push({ t: k.localName, n: 1, e: k }); }
    return el.localName + '{' + g.map((x) => skel(x.e, d + 1) + (x.n > 1 ? '×' + x.n : '')).join(',') + '}';
  };
  const sig = new Map();
  for (const pm of pms) { const k = skel(pm, 0); if (!sig.has(k)) sig.set(k, { n: 0, pm }); sig.get(k).n++; }
  const sigs = [...sig.entries()].sort((a, b) => b[1].n - a[1].n);
  out(`${sigs.length} structure(s) distincte(s) de Placemark :`);
  sigs.slice(0, 6).forEach(([k, v], i) => out(`  #${i + 1} ×${v.n} : ${k.length > 300 ? k.slice(0, 300) + '…' : k}`));
  sigs.slice(0, 3).forEach(([, v], i) => {
    out(''); out(`-- détail de la structure #${i + 1} (1er exemple, valeurs masquées) --`);
    for (const c of /** @type {Element} */ (v.pm).children) {
      const t = c.localName;
      if (t === 'description') { dgDesc(c.textContent, out, '  ', dom); continue; }
      if (t === 'ExtendedData') {
        const rows = [...c.getElementsByTagName('*')].filter((e) => e.localName === 'Data' || e.localName === 'SimpleData');
        out(`  ExtendedData : ${rows.length} champ(s) (${[...new Set(rows.map((e) => e.localName))].join(', ') || 'aucun'})${[...c.children].some((e) => e.localName === 'SchemaData') ? ', via SchemaData' : ''}`);
        rows.slice(0, 45).forEach((e) => out(`    ${e.localName} ${dgK(e.getAttribute('name'))} → ${dgShape(e.localName === 'Data' ? ((([...e.children].find((x) => x.localName === 'value')) || e).textContent) : e.textContent)}`));
        if (rows.length > 45) out(`    … ${rows.length - 45} de plus`);
        continue;
      }
      if (c.children.length) { out(`  ${t} : élément composé (${[...c.children].map((x) => x.localName).slice(0, 8).join(', ')}) [attributs : ${[...c.attributes].map((a) => a.name).join(',') || 'aucun'}]`); continue; }
      out(`  ${t} : ${dgShape(c.textContent)}${c.attributes.length ? ' [attributs : ' + [...c.attributes].map((a) => a.name).join(',') + ']' : ''}`);
    }
  });
  // ce que l'application retient réellement de ces données
  out(''); out("== Retenu par l'application ==");
  const r = pre ? pre.res : analyserKml(txt, doc, dom);
  out(`${r.pts.length} point(s) retenu(s), ${r.ignored} Placemark(s) sans point ignoré(s)`);
  const fc = r.cols.map((_, i) => r.pts.reduce((a, q) => a + (q[5][i] ? 1 : 0), 0));
  out(r.cols.length ? `${r.cols.length} champ(s) détecté(s), dans l'ordre du fichier (n° = ordre de la liste déroulante) :` : 'AUCUN champ détecté (la liste déroulante ne proposera que Nom et Description)');
  r.cols.slice(0, 60).forEach((k, i) => { const q = r.pts.find((p) => p[5][i]); out(`  n°${i + 1} ${dgK(k)} : renseigné sur ${fc[i]}/${r.pts.length} point(s) ; exemple ${dgShape(q ? q[5][i] : '')}`); });
  if (r.pts.length) out(`nom : ${dgShape(r.pts[0][2])} (1er point) ; description conservée : ${r.pts.filter((q) => q[3]).length}/${r.pts.length} point(s) (vide quand les champs la remplacent)`);
  return L.join('\n');
}

/** Affichage : noms de champs visibles, ou masqués (champ#1, champ#2… par ordre d'apparition). @param {unknown} t @param {boolean} masquer */
export function afficherDiagnostic(t, masquer) {
  const m = new Map();
  return String(t || '').replace(/⟦([^⟧]*)⟧/g, (_x, n) => (masquer ? ('champ#' + (m.has(n) ? m.get(n) : (m.set(n, m.size + 1), m.size))) : n));
}
