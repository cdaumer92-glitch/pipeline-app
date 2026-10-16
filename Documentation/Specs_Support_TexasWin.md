# Module Support TexasWin : spécifications

Point de départ : la maquette `Documents\1_ASTI\Commercial\Configurateur\texaswin-tickets.html` (mars 2026).
Cible : un module « Support » dans Pipeline (même serveur, même base, mêmes utilisateurs), pas un site à part.

## 1. Fondations

- Persistance en base Postgres, derrière l'authentification de Pipeline.
- Pas de base clients à part : un ticket se rattache à une société et à un contact du CRM ; la liste des modules proposée vient des licences réellement possédées par la société.
- Rôles : consultant, responsable support, commercial (lecture). Chaque commentaire est signé par son auteur réel.
- Référentiels : consultants, modules, catégories, priorités en base, pas codés en dur.

## 2. Cycle de vie du ticket

- Statuts : Ouvert, En cours, En attente client, Résolu, Fermé. « En attente client » suspend les délais.
- Règles déjà posées par la maquette, à conserver : pas de Résolu sans passer par En cours ; pas de Résolu sans temps saisi ; la première saisie de temps passe le ticket En cours ; un ticket Fermé bloque la saisie de temps.
- Règle à ajouter : Fermé n'est possible que depuis Résolu (sinon la règle du temps saisi se contourne).
- Délais d'engagement par priorité (première réponse / résolution), à paramétrer, par exemple Critique 4 h / 1 j, Haute 1 j / 3 j, Normale 2 j / 10 j, Basse 5 j / 30 j. Délai restant visible dans la liste et le tableau de bord ; alertes calculées côté serveur, pas seulement au chargement de la page.
- Réouverture d'un ticket Fermé, tracée.
- Cause de clôture : corrigé, non reproduit, évolution refusée, doublon, autre.
- Pièces jointes (captures, exports, logs) et version de TexasWin concernée.
- Liens entre tickets : doublon de, lié à. Passage d'une « Demande d'évolution » vers la roadmap ou un ticket Jira (cf. cadrage du pont CRM-Jira).

## 3. Entrées et sorties

- Création par mail : une adresse support crée le ticket ; les réponses se rattachent par le numéro de ticket dans l'objet.
- Notifications au client et au consultant à chaque changement de statut, d'assignation ou commentaire.
- Portail client (phase ultérieure) : voir ses tickets, en ouvrir, répondre.

## 4. Temps et facturation

- Contrat de maintenance par client : heures incluses, période, taux horaire. Compteur consommé / inclus sur la fiche client, alerte de dépassement avant facturation.
- Un seul modèle de saisie de temps, que l'on saisisse depuis un ticket ou depuis la feuille de temps.
- Le temps saisi sur un ticket tombe dans un projet de type Support du client (jamais dans un projet de déploiement ou de développement).
- Export mensuel du CRA par consultant et par client, vers la facturation.

## 5. Projets de développement : lignes de spécification

Un projet de développement est constitué de lignes, regroupables par lot. Une ligne porte :

- Description de la spécification.
- Assignation (consultant ou développeur).
- Temps estimé (vendu).
- Temps réalisé : calculé depuis les entrées de temps rattachées à la ligne, jamais saisi à la main. Une saisie de temps sur un projet de développement choisit obligatoirement sa ligne.
- Avancement 0 à 100 %, saisi par le développeur, distinct du ratio réalisé / estimé.
- Recette : à recetter, recettée le (date), par qui côté client, avec ou sans réserves. Une ligne recettée se verrouille.
- Facturable oui / non ; pour les lignes facturables : facturée ou non, référence de facture.

Au niveau du projet :

- Totaux : estimé, réalisé, reste à faire (estimé moins réalisé, plancher à zéro), avancement global pondéré par le temps estimé de chaque ligne.
- Alertes : réalisé supérieur à l'estimé ; forte consommation de temps pour un faible avancement ; ligne à 100 % non recettée depuis plus de N jours ; reste à faire supérieur au budget restant.
- Lien avec les affaires gagnées de Pipeline : le bon de commande « Développement » devient le projet, ses lignes deviennent les spécifications ; la facturation à la recette ou à l'avancement s'appuie sur les lignes facturables et retombe dans les factures de l'affaire.
- Vue par développeur : ses lignes en cours, triées par échéance, avec estimé / réalisé / avancement.

## 6. Reporting

- Respect des délais par priorité et par consultant, délai moyen de première réponse, tickets réouverts.
- Récurrence par module et par catégorie : où sont les bugs qui coûtent du support.
- Heures de support par client rapportées à son abonnement.

## 7. Incohérences de la maquette à corriger

- Deux listes de modules différentes (filtre et données de démonstration d'un côté, fiches client de l'autre) : une seule, celle des licences du CRM.
- Fermé n'exige rien alors que Résolu exige du temps saisi.
- Le projet « Support » auto-créé prend le premier projet du client quel que soit son type.
- Auteur des commentaires toujours « Service Client ».
- Alerte Critique calculée uniquement au chargement de la page.

## Ordre de réalisation proposé

1. Tickets rattachés aux sociétés et contacts du CRM, statuts complets, délais par priorité, pièces jointes, versions.
2. Saisie de temps unifiée, contrat de maintenance avec compteur d'heures.
3. Projets de développement avec lignes de spécification, totaux et alertes, lien avec les bons de commande.
4. Mail entrant et notifications.
5. Reporting qualité, puis portail client.
