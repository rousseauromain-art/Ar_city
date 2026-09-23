/* =====================================================================
   Villes a l'horizon — configuration
   ---------------------------------------------------------------------
   Ce fichier n'est PAS ecrase quand la page principale est mise a jour.
   A placer a cote de villes-horizon.html, a la racine du depot.

   Il ne contient AUCUN secret : il est public, comme tout le site.
   Les cles (AISStream, OpenSky) sont stockees dans le relais Cloudflare,
   en tant que « secrets » du Worker, invisibles depuis l'exterieur.
   ===================================================================== */

window.APP_CONFIG = {

  // Adresse de votre relais Cloudflare Worker, par exemple :
  // relay: 'https://villes-horizon-relais.votre-sous-domaine.workers.dev',
  // Vide = avions en acces anonyme direct (quota reduit), pas de bateaux.
  relay: 'https://villes-horizon-relais.rousseau-romain.workers.dev/health'

};
