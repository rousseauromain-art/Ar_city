# 002 — Les dumps de caractérisation restent dans le dépôt privé

- **Date :** 27/10/2026. **Décision :** photos, exports de cache et dumps (`dumps/<scène>.<mode>.json`) sont dans `Ar_city-photos`, jamais dans `Ar_city` (public).
- **Pourquoi :** un dump contient des noms de lieux, des positions et des dates de prise de vue (vacances, domicile).
- **Conséquence :** dans la CI, les tests de caractérisation sont ignorés sans jeton de lecture sur `Ar_city-photos` (secret GitHub, à créer plus tard par Romain). Les dumps sont produits localement par `npm run dump:v1`.
