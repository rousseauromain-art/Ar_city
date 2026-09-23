/* =====================================================================
   Villes a l'horizon — configuration
   ---------------------------------------------------------------------
   Ce fichier n'est PAS ecrase quand la page principale est mise a jour :
   les valeurs restent en place d'une version a l'autre.
   A placer a cote de villes-horizon.html, a la racine du depot.

   IMPORTANT — ceci n'est pas un secret. Tout fichier servi par GitHub
   Pages est telechargeable par n'importe qui, y compris celui-ci.
   ===================================================================== */

window.APP_CONFIG = {

  // Bateaux — AISStream REFUSE les connexions directes depuis un navigateur
  // (voir leur documentation). La cle seule ne suffit donc pas : il faut un
  // relais serveur (ex. Cloudflare Worker) qui detient la cle et retransmet
  // le flux. Renseignez ici l'adresse wss:// de ce relais une fois en place.
  aisProxy: '',

  // Cle AISStream : a mettre dans le RELAIS, pas ici (elle y serait publique).
  // Conservee uniquement pour information dans le diagnostic.
  aisKey: '',

  // Avions — facultatif. Vide = acces anonyme OpenSky (~100 requetes/jour).
  // A NE PAS REMPLIR sur un depot public : ces identifiants donnent acces
  // a votre compte OpenSky.
  openskyId: '',
  openskySecret: ''

};
