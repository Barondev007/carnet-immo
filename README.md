# Carnet d'annonces immo

Appli web personnelle (smartphone et laptop) pour suivre les annonces immobilières de Bruxelles et de Tanger : liste filtrable, fiche détaillée, statut, note, commentaires, coût total (droits selon la région, notaire), travaux et loyer estimés.

- Données : Supabase (tables `bxl_annonces`, `tng_annonces`, `bxl_suivi`, `tng_suivi`, voir `schema.sql`). Accès limité aux adresses de la table `membres`.
- Connexion : lien magique par e-mail.
- Installable sur l'écran d'accueil (PWA), lecture hors ligne de la dernière liste chargée.
- `index.html` est généré à partir de la version claude.ai de l'appli ; ne pas le modifier à la main.
- Bibliothèque incluse : `vendor/supabase.js` (supabase-js 2.118.0, licence MIT, voir `vendor/SUPABASE_LICENSE`).
