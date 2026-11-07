// @ts-check
/** Point d'entrée de v2/ar.html : une page, deux entrées. Direct (caméra, GPS, capteurs) par défaut ; ?mode=photo : photo rejouée (même interface, comme la v1). */
import { demarrerPage } from './page.js';

demarrerPage({ mode: /[?&]mode=photo(&|$)/.test(location.search) ? 'photo' : 'direct' });
