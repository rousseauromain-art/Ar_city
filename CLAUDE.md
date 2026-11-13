# Villes à l'horizon — contexte pour Claude

Lu au début de chaque session. **La spécification en vigueur est `docs/REFONTE-V3.md`** : elle prime sur `v2/REFONTE.md` et sur l'historique. Tenir ce fichier à jour à chaque décision importante.

## Le projet
Réalité augmentée dans le navigateur, comme une table d'orientation : par-dessus la caméra, noms des lieux et monuments, relief, bateaux (AIS), avions, équipements télécom.
- **v3 = la version active** : `v3/villes-horizon.html`, copie de la v1 (j) + greffes venues de la v2, chacune derrière un interrupteur **éteint par défaut**.
- **v1 = la référence**, figée : `v1/villes-horizon.html`, version `2026-10-25 (j)`. **Ne jamais la modifier.**
- **v2 = gelée** (tag `v2-fin`, branche `archive/v2-fin`) : `v2/`. Source des greffes ; on n'y travaille plus. À retirer du dépôt quand la v3 aura remplacé la v1 sur le terrain.
- Relais Cloudflare Worker `villes-horizon-relais` (`relais/`, ne pas déplacer) ; `config.js` (adresse du relais, public, sans secret) reste à la racine : la v1 et la v3 le lisent en `../config.js`.

## Règles de la v3 (`docs/REFONTE-V3.md` §3)
1. **Tout éteint = v1** : toutes greffes éteintes, même trame de dessin et même interface que la v1 sur les scènes réelles (`v3/tests/tout-eteint-v1.spec.js`).
2. **Une greffe = un fichier `v3/greffes/<id>.js` + un interrupteur**, éteint par défaut, branchée par un point d'entrée court (`G.actif('lune')&&G.lune.caler()`). Son fichier n'est chargé que si elle est allumée. Elle recopie le code utile de la v2 ; **elle n'importe rien de `v2/`**.
3. Deux types : *ajout* (une fonction en plus) ou *remplacement* (l'interrupteur choisit entre la v1 et la v2).
4. Tests : chaque greffe seule, puis toutes allumées ; pas toutes les combinaisons.
5. Validée : elle devient la règle (on retire l'interrupteur et l'ancien code). Rejetée : on supprime son fichier. **Seul Romain change l'état « terrain » de `docs/ETAT.md`.**
6. Panneau « Greffes v2 » dans les Réglages (interrupteur, phrase, état) ; aussi par l'adresse : `?g=lune,permutation`, `?g=tout`. Les greffes allumées sont dans le Diagnostic et dans chaque mesure du carnet de calage.
7. **Le code de la v1 n'est pas réécrit** dans la v3 : seuls les points d'entrée, les pierres tombales `tombe('id')` (§6 : compteurs de passage du code suspect, affichés dans le Diagnostic) et le correctif du glisser avec roulis (§5). Ni renommage, ni reformatage.
8. La v3 reste une page unique ; les greffes se chargent à la demande.
9. Données : la v3 partage les caches de la v1 (mêmes noms, même format) ; ses réglages sont sous `vh3_settings` (recopiés une fois depuis `vh_settings_v2`), les interrupteurs sous `vh3_greffes`, les pierres tombales sous `vh3_tombes`. Une greffe ne modifie jamais les réglages de la v1.
10. **Règle de travail — toute greffe ajoutée ou modifiée :**
    1. Une nouvelle branche par demande.
    2. En local, seulement la vérification de syntaxe et le test propre à la greffe. Pas de suite complète, pas de scènes réelles.
    3. Claude ouvre la PR. La CI GitHub (`tests.yml`) lance « tout éteint = v1 » et les tests de la v3.
    4. CI verte : Claude fusionne la PR (squash), vérifie que la publication Pages est verte, et donne en une ligne le nom de l'interrupteur à allumer.
    5. CI rouge : Claude corrige, sans demander.
    6. Exception : si une ligne de la v1 change hors des points d'entrée, s'arrêter et demander à Romain avant de fusionner.

## Où est quoi
- `index.html` : page d'accueil, seule page à la racine (v3 en premier, v1 « référence », v2 « gelée »).
- `v3/villes-horizon.html` (page), `v3/greffes.js` (registre, panneau, pierres tombales), `v3/greffes/` (une greffe par fichier ; `_astre.js`, `_geoide-egm96.js` : outils partagés, pas des greffes), `v3/tests/` (tests de la v3 et de la v1 de référence).
- `v2/` : `ar.html`, `photo.html`, `outils.html`, `src/`, `construction/construire.mjs`, `tests/`, `docs/`, `REFONTE.md`, `eslint.config.mjs`, `tsconfig.json`.
- `tests/commun/` : harnais partagé (serveur de test qui injecte le crochet `hook.js` dans v1 et v3, `app.js`, rejeu des caches `cache.js`, scènes réelles `scenes-reelles.js`, enregistreur des traces, banc de vitesse `banc.mjs`, écarts acceptés, caractérisation `dump-v1`).
- `debug/` : outils (trafic, profondeur, lieux, export du cache `debug-cache.html`).
- `docs/` : `REFONTE-V3.md`, `ETAT.md` (une ligne par sujet et par greffe), `VEILLE-ANCRAGE.md`, `decisions/`.
- `.github/workflows/` : `tests.yml` (v3 à chaque envoi ; v2 seulement si `v2/` change), `pages.yml` (publication à chaque fusion sur `main`), `parite.yml` (à la main : v1 contre v3, greffes éteintes, sur les scènes réelles), `tag-v2-fin.yml` (pose le tag `v2-fin` une fois, à supprimer ensuite).

## Tests
- `npm run test:v3` (unitaires des greffes, rapides), `npx playwright test --project=v3` (v3 et v1 dans la page), `--project=v2` (v2 gelée). Lint, types, unitaires et intégration de la v2 : `npm run lint`, `types`, `test:unit`, `test:integration`.
- Les tests sur scènes réelles lisent le dépôt privé `rousseauromain-art/Ar_city-photos` (`PHOTOS_DIR`, photos avec EXIF et exports du cache) ; ils sont ignorés sans lui, sauf avec `PARITE_OBLIGATOIRE=1`. Ne jamais committer photos ni exports dans `Ar_city`.
- Réseau des sessions cloud limité aux registres et à GitHub : les tests simulent relief, Overpass, Wikidata et relais. Aucune livraison sans tests verts. Bug signalé : le reproduire d'abord avec la version d'avant.

## Romain, l'utilisateur
- Français, réponses concises, livrables finis plutôt qu'un récit. Il conteste fermement les erreurs : reconnaître les siennes sans détour.
- Fonctions génériques ; une correction s'applique à tous les cas semblables. Uniquement des solutions gratuites.
- Données réelles d'équipements TDF/ARCAD confidentielles : ne jamais les demander.
- **Il travaille uniquement sur son téléphone** (Pixel, Android, Chrome) : jamais de commande git ni de terminal à lui demander. Claude fait commits, branches, envois et PR ; Romain teste, fusionne (bouton « Merge ») et dépose des fichiers par le site GitHub. Consignes en gestes sur le téléphone.

## Règles de travail
- Une branche par sujet, une PR par lot ; **chaque PR met à jour `docs/ETAT.md`**.
- Historique dans les messages de commit, pas dans des commentaires datés.
- Les sessions cloud ne peuvent pas pousser d'étiquette git : passer par un workflow (comme `tag-v2-fin.yml`).

## Faits établis sur le terrain (à garder)
- Pixel : direction EXIF décalée de +90° en paysage, peu fiable en portrait. Saint-Malo : EXIF faux d'environ 14°. Boussole : 30 à 40° d'erreur près du métal, 30 à 50° en voiture.
- Turin : concordances fortuites de repères en ville dense (cap −19,4° à tort) → greffe `permutation`.
- Altitude GPS d'Android au-dessus de l'ellipsoïde (géoïde 49 m en Bretagne) → greffe `oeil`, qui le retranche.
- Silhouettes proches (Les Horizons, 0,3 km) : le plafond de taille de la v1 ne joue que pied à l'écran → la silhouette rétrécit quand on baisse le téléphone → greffe `tailleReelle`.
- Rotation automatique coupée : écran resté en portrait, téléphone en paysage → greffe `rotation` et correctif §5 du glisser.
- Vercors (11/11) : champ réglé à 45° pour une caméra d'environ 62° (réglée ensuite à l'œil) → le tracé glisse dès qu'on tourne (ce n'est pas le gyroscope) → greffe `champAuto`. Image floue après avoir visé le soleil → greffe `nettete`. La projection de la v1 est approchée hors du centre (environ 1° aux bords en montagne) : `docs/VEILLE-ANCRAGE.md` §5 → greffe `projection` (accord de Romain du 12/11 : elle déplace les points pendant le dessin, sans réécrire les lignes de la v1).
- Turin, piazza San Carlo (13/11) : statue de 4,4 m dessinée à 40 m (la v1 donne la hauteur d'une tour d'OSM au premier monument à moins de 120 m) → greffe `hauteurs`. En paysage, puces et bandeau de la photo couvrent un quart de l'écran : 62 noms sans place → greffe `degage`. Banc sur les photos réelles : `v3/tests/photos-reelles.spec.js`.
- Les pièces jointes du chat perdent leurs EXIF : déposer les originaux dans `Ar_city-photos`.
