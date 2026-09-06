# Suivi TEI — Gestion responsable

PWA de suivi de travaux d'instrumentation industrielle (installation et démantèlement), conçue pour fonctionner **entièrement hors serveur**, directement dans le navigateur, avec sauvegarde optionnelle sur un dossier local ou réseau déjà accessible dans Windows.

**Démo en ligne :** https://carltherock.github.io/gestion_responsable/

---

## Pourquoi cette application

Le suivi papier (fiches « Suivi des travaux d'installation instrumentation » et « Suivi travaux démantèlements instrumentation ») est repris ici sous forme numérique, sans dépendre d'un serveur interne, d'un VPN ou d'une connexion réseau constante. Tout le travail se fait localement dans le navigateur ; la sauvegarde vers un dossier (local ou réseau) est une action volontaire et jamais bloquante.

---

## Fonctionnalités

### Identification du dossier
- Numéro de localisation obligatoire (lettres, chiffres et tirets).
- B.T. obligatoire — n'importe quel contenu est accepté, aucune contrainte de format.
- Emplacement de sauvegarde (local ou réseau) choisi avant de commencer à remplir le dossier.

### Suivi par tâche
- Deux modes : **Suivi d'installation** et **Démantèlement TEI**, chacun avec ses propres listes de vérification fidèles aux fiches de référence.
- Chaque tâche peut être cochée, marquée **N/A** (avec raison) ou **Non conforme** (avec raison).
- Cocher une tâche fait apparaître une zone pour y joindre des documents ou photos (glisser-déposer, parcourir, ou Snagit).

### Onglets
`Aperçu` (vue d'ensemble, écran par défaut) · `Identification` · `Plans` · `Programmation` · `Système` · `Mise à jour` (annotation d'images en direct) · `Information` · `Sécurité et général` · `VPO` (vérification pré-opérationnelle — liste libre extensible avec bouton « + ») · `Non-conformité` (résumé automatique + ajouts manuels) · `Commentaire` · `Approbation`

### Aperçu (écran d'accueil du dossier)
Premier écran visible à l'ouverture d'un dossier : anneau de progression globale, cartes de statistiques (tâches complétées, documents/photos, non-conformités, sauvegardes officielles) et un anneau par section — cliquer sur une section y accède directement.

### Non-conformités
- Détectées automatiquement dès qu'une tâche (ou une ligne VPO) est marquée « Non conforme ».
- Des non-conformités supplémentaires, non liées à une tâche précise, peuvent être ajoutées manuellement dans l'onglet dédié.

### Sauvegarde et progression
- Brouillon sauvegardé en continu en local (IndexedDB) — jamais de perte de données, jamais bloquant.
- Sauvegarde officielle vers le dossier choisi (local ou lecteur réseau), nommé `numéro (B.T.) - AAAA-MM-JJ` pour conserver l'évolution dans le temps.
- Chaque sauvegarde officielle exige de **retaper le nom de l'employé** (jamais réutilisé automatiquement) et son rôle ; la date et l'heure sont ajoutées automatiquement à l'historique, sans possibilité de modification.
- Un sous-dossier `Historique/` conserve un instantané horodaté (`suivi_...json` + `resume_...txt`) de chaque sauvegarde, pour comparer les versions dans le temps.
- Avertissement (non bloquant) si des tâches restent incomplètes au moment de sauvegarder — la sauvegarde reste toujours possible.
- Pastille de progression globale, calculée automatiquement, dont la couleur passe du rouge au vert selon l'avancement.

### Dashboard HTML autonome
À chaque sauvegarde officielle, un fichier `Dashboard - {numéro} ({B.T.}) - {date}.html` est généré dans le dossier — ouvrable directement dans un navigateur, sans l'application :
- Anneaux de progression par section + anneau global, sections repliables avec pourcentage visible.
- Détail de chaque tâche (statut, raison, documents joints en aperçu) — clic sur un anneau pour sauter à la section correspondante.
- Résumé des non-conformités, historique des sauvegardes officielles.
- QR code intégré et lien direct pour rouvrir le dossier dans l'application.
- Avis de copyright.

### Reprise rapide
- **Code QR** (vignette cliquable) généré depuis l'application, pointant vers le dossier en cours (mode + numéro + B.T.).
- Sur le même appareil : réouverture instantanée du brouillon local.
- Sur un autre appareil, ou pour reprendre un dossier existant : le bouton « Importer un dossier existant » ouvre directement le sélecteur — une fois le dossier choisi, le numéro de localisation et le B.T. se remplissent automatiquement à partir de ce qui a été sauvegardé (cases cochées, documents, photos inclus).

### Présentation
- Écran d'ouverture (splash screen, 3 secondes, ignorable en touchant l'écran).
- Barre de copyright permanente en bas de l'écran.

### Hors ligne
Fonctionne sans connexion grâce à un service worker (mise en cache des fichiers essentiels, y compris la bibliothèque de QR code) — utilisable en usine, même sans réseau.

---

## Structure du projet

```
index.html            Interface (écrans, onglets, formulaires)
app.js                Toute la logique (checklist, stockage local, sauvegarde,
                      dashboard, QR, import réseau)
style.css             Habillage visuel
base.css              Jetons de base (couleurs, espacements, typographie)
manifest.json         Manifeste PWA (installation sur téléphone/ordinateur)
sw.js                 Service worker (cache hors ligne)
vendor/qrcode.min.js  Bibliothèque de génération de QR code (locale, hors ligne)
server.js             Backend optionnel, non requis par le fonctionnement
                      principal — réservé à une future synchronisation
package.json          Dépendances de server.js uniquement
```

---

## Compatibilité navigateur

| Fonction | Chrome / Edge (ordinateur) | Safari / navigateurs mobiles |
|---|---|---|
| Remplir le dossier, cocher les tâches | ✅ | ✅ |
| Sauvegarde dans un dossier local/réseau | ✅ (File System Access API) | ❌ — brouillon local seulement |
| Génération de QR code | ✅ | ✅ |
| Fonctionnement hors ligne | ✅ | ✅ |

La sauvegarde physique dans un dossier nécessite Chrome ou Edge sur ordinateur. Sur les autres navigateurs, le dossier reste modifiable en brouillon local, sans perte de données.

Interface adaptée pour mobile (mise en page tactile, boutons pleine largeur, fenêtres limitées à la hauteur d'écran) sans aucun changement à l'affichage sur ordinateur.

---

## Utilisation

1. Choisir **Suivi d'installation** ou **Démantèlement TEI**.
2. Choisir l'emplacement de sauvegarde (local ou réseau), puis entrer le numéro de localisation et le B.T. — ou importer un dossier déjà existant.
3. Cliquer sur **Continuer** : l'aperçu du dossier s'affiche, puis remplir les onglets, cocher les tâches, joindre les documents.
4. Sauvegarder le dossier (nom de l'employé et rôle requis à chaque fois).
5. Le dashboard HTML généré permet de consulter ou partager l'état du dossier sans ouvrir l'application.

---

## Licence

© 2026 Carl Desrochers. Conception, idée originale et développement intégral de ce logiciel.
Tous droits réservés — reproduction ou distribution interdite sans autorisation.
