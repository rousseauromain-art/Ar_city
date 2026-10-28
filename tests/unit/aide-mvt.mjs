// @ts-nocheck — fabrique de tuiles vectorielles de test (aucune logique de l'application).
const varint = (n) => { const o = []; while (n >= 0x80) { o.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); } o.push(n); return o; };
const champ = (num, type, octets) => [...varint((num << 3) | type), ...octets];
const chaine = (num, s) => { const b = [...Buffer.from(s, 'utf8')]; return champ(num, 2, [...varint(b.length), ...b]); };
const zig = (n) => (n << 1) ^ (n >> 31);
const empile = (num, nombres) => { const b = nombres.flatMap((n) => varint(n)); return champ(num, 2, [...varint(b.length), ...b]); };

/** Couche de points : features = [{x, y, tags: {clé: valeur chaîne}}]. */
export function coucheMVT(nom, features, extent = 4096) {
  const keys = [], values = [];
  const idx = (liste, v) => { let i = liste.indexOf(v); if (i < 0) { i = liste.length; liste.push(v); } return i; };
  const feats = features.map((f) => {
    const tags = Object.entries(f.tags).flatMap(([k, v]) => [idx(keys, k), idx(values, String(v))]);
    const geom = [(1 << 3) | 1, zig(f.x), zig(f.y)];
    const b = [...empile(2, tags), ...champ(3, 0, varint(1)), ...empile(4, geom)];
    return champ(2, 2, [...varint(b.length), ...b]);
  });
  const corps = [...chaine(1, nom), ...feats.flat(), ...keys.flatMap((k) => chaine(3, k)), ...values.flatMap((v) => { const b = chaine(1, v); return champ(4, 2, [...varint(b.length), ...b]); }), ...champ(5, 0, varint(extent))];
  return champ(3, 2, [...varint(corps.length), ...corps]);
}
export const tuileMVT = (...couches) => Uint8Array.from(couches.flat());
