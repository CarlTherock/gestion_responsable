# Suivi TEI — Gestion responsable

PWA de suivi de travaux d'instrumentation industrielle (installation et démantèlement), conçue pour fonctionner **entièrement hors serveur**, directement dans le navigateur, avec sauvegarde optionnelle sur un dossier local ou réseau déjà accessible dans Windows.

**Démo en ligne :** https://carltherock.github.io/gestion_responsable/

---

## Pourquoi cette application

Le suivi papier (fiches « Suivi des travaux d'installation instrumentation » et « Suivi travaux démantèlements instrumentation ») est repris ici sous forme numérique, sans dépendre d'un serveur interne, d'un VPN ou d'une connexion réseau constante. Tout le travail se fait localement dans le navigateur ; la sauvegarde vers un dossier (local ou réseau) est une action volontaire et jamais bloquante.

---

## Fonctionnalités

### Suivi par tâche
- Deux modes : **Suivi d'installation** et **Démantèlement TEI**, chacun avec ses propres listes de vérification fidèles aux fiches de référence.
- Chaque tâche peut être cochée, marquée **N/A** (avec raison) ou **Non conforme** (avec raison).
- Cocher une tâche fait apparaître une zone pour y joindre des documents ou photos (glisser-déposer, parcourir, ou Snagit).

### Onglets
`Identification` · `Plans` · `Programmation` · `Système` · `Mise à jour` (annotation d'images en direct) · `Information` · `Sécurité et général` · `VPO` (vérification pré-opérationnelle, liste libre) · `Non-conformité` (résumé automatique + ajouts manuels) · `Commentaire` · `Approbation`

### Sauvegarde et progression
- Brouillon sauvegardé en continu en local (IndexedDB) — jamais de perte de données, jamais bloquant.
- Sauvegarde officielle vers un dossier choisi (local ou lecteur réseau), nommé `numéro (B.T.) - AAAA-MM-JJ` pour conserver l'historique de l'évolution du dossier dans le temps.
- La sauvegarde officielle exige le nom et le rôle de l'employé (horodatage automatique, non modifiable).
- Avertissement (non bloquant) si des tâches restent incomplètes au moment de sauvegarder.
- Pastille de progression globale, calculée automatiquement, dont la couleur passe du rouge au vert selon l'avancement.

### Dashboard HTML autonome
À chaque sauvegarde officielle, un fichier `Dashboard - {numéro} ({B.T.}) - {date}.html` est généré dans le dossier — ouvrable directement dans un navigateur, sans l'application :
- Anneaux de progression par section + anneau global.
- Détail de chaque tâche (statut, raison, documents joints en aperçu).
- Résumé des non-conformités.
- Historique des sauvegardes officielles.
- QR code intégré et lien direct pour rouvrir le dossier dans l'application.

### Reprise rapide
- **Code QR** généré depuis l'application, pointant vers le dossier en cours (mode + numéro + B.T.).
- Sur le même appareil : réouverture instantanée du brouillon local.
- Sur un autre appareil : import complet (cases cochées, documents, photos) en choisissant directement le dossier réseau où le dossier a été sauvegardé.

### Hors ligne
Fonctionne sans connexion grâce à un service worker (mise en cache des fichiers essentiels) — utilisable en usine, même sans réseau.

---

## Structure du projet

```
index.html         Interface (écrans, onglets, formulaires)
app.js              Toute la logique (checklist, stockage local, sauvegarde,
                    dashboard, QR, import réseau)
style.css           Habillage visuel
base.css            Jetons de base (couleurs, espacements, typographie)
manifest.json       Manifeste PWA (installation sur téléphone/ordinateur)
sw.js               Service worker (cache hors ligne)
vendor/qrcode.min.js  Bibliothèque de génération de QR code (locale, hors ligne)
server.js           Backend optionnel, non requis par le fonctionnement
                    principal — réservé à une future synchronisation
package.json        Dépendances de server.js uniquement
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

---

## Utilisation

1. Choisir **Suivi d'installation** ou **Démantèlement TEI**.
2. Choisir l'emplacement de sauvegarde (local ou réseau), puis entrer le numéro de localisation et le B.T.
3. Remplir les onglets, cocher les tâches, joindre les documents.
4. Sauvegarder le dossier une fois terminé (nom et rôle requis).
5. Le dashboard HTML généré permet de consulter ou partager l'état du dossier sans ouvrir l'application.

---

## Licence

© 2026 Carl Desrochers. Conception, idée originale et développement intégral de ce logiciel.
Tous droits réservés — reproduction ou distribution interdite sans autorisation.
