# Match MARC

**Comparez deux corpus bibliographiques, identifiez les doublons et préparez vos imports.**

Application statique, locale au navigateur, pour préparer une migration **PMB → Koha** :

- **Doublon certain → exemplariser** une notice Koha existante.
- **À vérifier → décider humainement** entre doublon et notice distincte.
- **Notice seule → importer** la notice PMB originale.

Application publique : [Match MARC](https://didierthebault-web.github.io/match-marc/).

## Fonctionnalités

Deux zones de dépôt, statistiques par corpus, contrôle du parsing, Web Worker pour parsing/normalisation/indexation/matching, progression et annulation, configuration UNIMARC, recherche, filtres, pagination de 50 lignes, comparaison côte à côte et explications des scores.

Les décisions initiales restent distinctes des décisions humaines. Les validations sont sauvegardées dans IndexedDB : empreintes SHA-256 des deux fichiers + mapping, puis index stable de notice, identifiants et positions PMB/Koha. Le même fichier rechargé permet de retrouver ses validations, y compris en cas d’identifiant répété. Les identifiants répétés sont signalés. Les validations ne sont pas transférées à des fichiers modifiés : cette prudence évite de réappliquer une décision au mauvais enregistrement.

Analyse des exemplaires des doublons validés : `A_CREER`, `DEJA_PRESENT`, `CONFLIT`. Un code-barres absent, répété côté PMB ou Koha, ou présent sur une autre notice cible, empêche une proposition simple de création. Le CSV d’exemplarisation conserve les conflits pour leur examen ; il ne constitue pas un script d’import automatique.

Exports :

- CSV UTF-8 avec BOM et séparateur `;`, une ligne par exemplaire pour les doublons (ou une ligne vide de données exemplaire si aucun n’existe).
- CSV de contrôle des notices seules.
- CSV des cas à vérifier, une ligne par candidat retenu.
- ISO 2709 `.mrc` des notices seules et des notices déclarées distinctes par l’utilisateur, **sans reconstruire les notices**.
- Rapport JSON avec métadonnées, empreintes, paramètres, statistiques, rapprochements, notices seules, exemplaires et anomalies.

## Formats supportés

**ISO 2709 / UNIMARC** : `.mrc`, `.marc`, `.dat`. Le parseur lit les octets : leader, longueur, adresse de base, carte des entrées, répertoire, indicateurs et séparateurs `1F`, `1E`, `1D`. Les positions, longueurs, zones structurées et octets originaux restent en mémoire dans le worker. Les notices mal formées sont isolées et signalées ; elles ne sont jamais exportées comme notices valides. La récupération s’effectue après le prochain séparateur de notice.

UTF-8 prioritaire ; repli automatique avec avertissement vers le décodeur Web `ISO-8859-1`, qui correspond à Windows-1252 selon l’Encoding Standard. Le choix manuel est disponible séparément pour chaque fichier. Le leader est conservé, mais son caractère 9 ne permet pas d’identifier tous les encodages UNIMARC historiques. L’application ne prétend donc pas détecter ISO 5426 ou MARC-8. Vérifier les accents après lecture.

**MARCXML, ISO 5426 et MARC-8 ne sont pas pris en charge en V1.**

## Méthode de rapprochement

Le moteur est déterministe et explicable. Il n’utilise aucune intelligence artificielle et aucun score pondéré opaque.

1. Tous les ISBN de chaque notice sont conservés dans leur forme originale, validés par clé de contrôle, puis les ISBN-10 sont convertis en ISBN-13. Les ISBN erronés sont signalés et ignorés comme clés fiables.
2. Les ISBN valides servent à interroger un index `Map<isbn, indices[]>` de Koha. Un candidat unique n’est certain que si le titre atteint le seuil et s’il n’existe aucune divergence majeure connue sur auteur, date ou édition/publication. Un ISBN partagé par plusieurs notices impose une vérification.
3. Sans ISBN commun, recherche dans plusieurs blocs indexés : titre exact, auteurs normalisés et mots significatifs du titre. Les blocs les plus petits sont traités en premier. Il n’y a pas de comparaison globale N × M. Les candidats doivent présenter un titre au-dessus du minimum, un auteur suffisant et des années compatibles.
4. Les rapprochements Titre/Auteur/Date restent **À vérifier**, même si tous les signaux concordent. Entre le seuil candidat et le seuil titre sans ISBN, le candidat est explicitement marqué faible. Le seuil titre sans ISBN est un repère de contrôle humain ; il n’autorise jamais une décision automatique.
5. Les titres font l’objet de quatre mesures indépendantes : ratio de distance Levenshtein globale, ratio partiel, ratio de mots triés et Dice sur l’ensemble de mots. Le score décisionnel est `max(global, min(triés, ensemble))`. Le partiel est informatif : un titre inclus dans un titre différent n’obtient pas automatiquement 100 pour la décision.
6. Les auteurs sont comparés après normalisation Unicode, casse, ponctuation et tri des tokens, conservant les formes originales. Cette simplification rend « Hugo, Victor » et « Victor Hugo » comparables, sans prétendre résoudre les identités ou autorités.
7. Les années sont extraites de `214$d`, puis `210$d` en repli. Toutes les années plausibles présentes sont conservées ; si deux notices ont plusieurs années, la distance minimale est utilisée. Une proximité de ±1 an n’est pas une égalité et bloque le statut certain sur ISBN. Les dates codées de `100$a` ne sont pas exploitées en V1.

Valeurs recommandées : candidat titre 80, titre doublon ISBN 85, repère titre sans ISBN 90, auteur sans ISBN 85, tolérance date 0. Sur ISBN, un auteur comparable inférieur à 85 ou une date différente déclenche une vérification. Auteur ou date manquant : le contrôle partiel est explicité.

Pour borner le coût, un bloc sans ISBN dépassant 2 000 notices n’est pas parcouru et l’ensemble des candidats comparés est limité à 2 000. Sur ISBN très répété, seuls 100 candidats sont évalués. Toute recherche tronquée impose **À vérifier**, même sans candidat retenu : ces notices ne sont jamais proposées automatiquement à l’import. Les titres comparés sont limités à 600 caractères ; un titre plus long empêche le statut certain.

## Mapping

Valeurs UNIMARC par défaut, modifiables dans **Paramètres** :

| Donnée | Zone / sous-champ |
| --- | --- |
| Identifiant | `001` |
| ISBN | `010$a` |
| Titre | `200$a,200$e,200$h,200$i` |
| Auteurs et collectivités | `700,701,702,710,711,712`, sous-champs `a/b` |
| Année | `214$d`, puis `210$d` |
| Édition / publication | `205$a,214$a,214$c,210$a,210$c` |
| Description matérielle | `215$a,215$c,215$d` |
| Exemplaires | zone `995` |
| Site, localisation, code-barres, fonds, type de prêt | `b`, `e`, `f`, `8`, `r` |

Les zones locales dépendent de la configuration de votre SIGB. Le mapping de cette V1 est commun aux deux corpus : si PMB utilise une autre zone exemplaire que Koha, harmoniser les exports au préalable ou adapter cette fonctionnalité. Modifier le mapping exige de recharger les fichiers. Le MARC exporté contient toutes les zones originales, y compris les zones locales : il faut contrôler le paramétrage d’import de Koha, les identifiants et les exemplaires avant utilisation.

## Utilisation

1. Ouvrir le site et charger PMB puis Koha, ou cliquer sur **Essayer les données de démonstration**.
2. Vérifier les nombres de notices, les erreurs, les accents et le mapping.
3. Lancer la comparaison et suivre sa progression.
4. Examiner **À vérifier**, choisir le candidat Koha approprié et confirmer le doublon ou les notices distinctes. **À revoir plus tard** conserve le cas à vérifier.
5. Examiner les exemplaires et leurs conflits, puis télécharger les exports.
6. Utiliser **Nouvelle comparaison** pour libérer les corpus et résultats. Une confirmation est demandée. Les décisions sauvegardées restent disponibles ; un bouton séparé permet de les effacer.

La démonstration contient seulement des **données synthétiques**, sans données de production : 20 notices PMB, 30 Koha, 8 doublons ISBN, 3 rapprochements sans ISBN, 2 ambiguïtés, 7 notices seules, un exemplaire déjà présent et un conflit sur une autre notice.

## Confidentialité

**Vos fichiers sont analysés localement dans votre navigateur. Ils ne sont transmis à aucun serveur.** Aucun outil d’analytique, police distante, CDN ou service tiers n’est utilisé. Le site charge seulement ses fichiers statiques et, à la demande, ses corpus de démonstration. Les choix de fichiers restent des objets locaux envoyés à un worker du navigateur.

Les corpus et résultats ne sont pas persistés après fermeture. La configuration est dans localStorage ; seules les validations et leurs métadonnées sont dans IndexedDB. Un ordinateur partagé peut donc conserver les identifiants associés aux validations : utiliser **Effacer les décisions enregistrées** pour les supprimer. Si le stockage est indisponible, l’application le signale et les décisions restent seulement en mémoire.

Les CSV neutralisent les cellules commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot, afin de limiter l’interprétation de formules par les tableurs. Le MARC original n’est jamais modifié par cette protection.

## Installation locale

Pas de compilation ni dépendance d’exécution. Servir ce répertoire en HTTP sur localhost ; l’ouverture directe en `file://` ne permet pas les workers ES modules.

```sh
python -m http.server 8080
```

Puis ouvrir `http://localhost:8080/`. Ce serveur statique sert au développement, il n’analyse ni ne reçoit de corpus. Un navigateur moderne avec Web Workers, IndexedDB et Web Crypto est requis.

## Tests et performances

Node 20+ pour les tests du moteur (sans dépendances) :

```sh
npm test
npm run samples
npm run bench
```

Les tests couvrent les cas A–H de la mission, les ISBN multiples, erreurs de structure MARC, octets multioctets, récupération après erreur, dates divergentes, exemplaires et conflits, exports, protection CSV, et limites de blocs.

Tests navigateur avec Playwright installé localement : définir `PLAYWRIGHT_MODULE` vers le module Playwright, puis :

```sh
node tests/browser.cjs
node tests/browser.cjs https://didierthebault-web.github.io/match-marc/
node tests/browser-large.cjs
```

Les scripts QA utilisent un petit serveur statique local éphémère, hors de l’application de production. `browser.cjs` vérifie chargements réels, matching dans le worker, choix d’un candidat, reprise après rechargement, exports CSV/JSON, MARC identique octet par octet, filtres, mapping, responsive et absence de requêtes externes ou d’envoi de données. `browser-large.cjs` teste 100 000 notices par corpus, l’affichage limité à 50 lignes et l’annulation.

Les mesures Node sur 1 000, 10 000 et 100 000 notices par corpus sont dans `tests/benchmark-results.json`. Elles dépendent de la machine et des données et ne sont pas une garantie pour tous les exports. Le jeu synthétique utilise un ISBN unique par notice ; il ne représente pas le pire cas de candidats ambigus. La consommation mémoire peut atteindre plusieurs centaines de Mo à plus d’un Go dans le navigateur. La V1 conserve les données et index en RAM et ne fait pas de streaming sur disque.

## GitHub Pages

Publication statique simple depuis la branche **main**, dossier racine `/`, avec `.nojekyll`. Aucun backend ni secret de production. Dans **Settings → Pages**, sélectionner **Deploy from a branch**, `main`, `/ (root)`. L’URL est `https://didierthebault-web.github.io/match-marc/`.

Ne jamais ajouter des exports de production au dépôt. Les seuls `.mrc` versionnés sont les démonstrations générées par `scripts/generate-samples.js`. Aucun workflow Actions n’est nécessaire pour cette méthode de publication.

## Architecture

`js/marc-parser.js` : structure ISO 2709 et accès aux champs ; `normalization.js` : extraction et normalisation ; `similarity.js` : mesures indépendantes ; `matching.js` : index, règles et exemplaires ; `exports.js` : CSV et téléchargements ; `storage.js` : IndexedDB ; `app.js` : interface ; `workers/matching-worker.js` : traitement hors du thread principal.

`getRecordAsMarcText(record)` prépare une future intégration avec Notice Exploder, sans transmettre de notice à un service externe.

## Limites

- Outil de préparation : aucune écriture dans PMB ou Koha. Il ne remplace pas la recette d’une migration ni la vérification bibliographique.
- Une publication n’équivaut pas à une certification RGAA. HTML sémantique, labels, focus, clavier, messages accessibles et états textuels sont prévus ; un audit humain complet reste à réaliser.
- Blocking lexical susceptible de manquer un rapprochement si titre et auteur sont entièrement différents. Faux négatifs possibles ; les seuils ne constituent pas une preuve d’identité.
- Pas de détection exhaustive des doublons internes : ISBN et codes-barres partagés sont signalés.
- Le rapport JSON peut être volumineux et sa génération peut ralentir le thread principal. La pagination limite les lignes affichées, pas la mémoire totale.
- Changer de corpus, de mapping, de navigateur ou de profil de navigateur empêche la reprise automatique des validations. Aucun corpus n’est sauvegardé pour une reprise autonome.

## Sources méthodologiques

- [Structure des enregistrements MARC, Library of Congress](https://www.loc.gov/marc/specifications/specrecstruc.html), pour les offsets et séparateurs de la structure ISO 2709 (la sémantique des champs de l’application est UNIMARC).
- [Alban-Peyrat/Find_and_Compare_Records](https://github.com/Alban-Peyrat/Find_and_Compare_Records), inspiration demandée pour la recherche progressive et la traçabilité. Aucun code de ce projet ni appel à ses API n’est incorporé.

Les algorithmes JavaScript sont écrits pour ce projet, sans bibliothèque de matching ni dépendance CDN.

## Feuille de route

Mappings distincts PMB et Koha ; MARCXML ; gestion des encodages historiques ; lecture et indexation progressive pour de très gros corpus ; comparaison détaillée des zones ; import/export portable de validations ; connexions explicites à SRU, BnF, Notice Exploder et Bibliographic DNA.

## Licence

Aucune licence open source n’a été ajoutée. Le propriétaire du dépôt conserve la décision relative à la licence.
