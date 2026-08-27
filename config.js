/* =====================================================================
   Villes a l'horizon — configuration
   ---------------------------------------------------------------------
   Ce fichier n'est PAS ecrase quand la page principale est mise a jour :
   la cle reste en place d'une version a l'autre.

   IMPORTANT — ceci n'est pas un secret. Tout fichier servi par GitHub
   Pages est telechargeable par n'importe qui, y compris celui-ci. La
   separation sert au confort, pas a la confidentialite. Ne mettez ici
   que des cles gratuites, sans facturation, et revocables.
   ===================================================================== */

window.APP_CONFIG = {

  // Bateaux — cle gratuite a creer sur https://aisstream.io
  // Sans elle, la couche bateaux affiche « cle requise ».
  aisKey: '',

  // Avions — facultatif. Vide = acces anonyme OpenSky (~100 requetes/jour),
  // ce qui suffit pour un usage occasionnel.
  // A NE PAS REMPLIR sur un depot public : ces identifiants donnent acces
  // a votre compte OpenSky, contrairement a la cle AIS ci-dessus.
  openskyId: '',
  openskySecret: ''

};
