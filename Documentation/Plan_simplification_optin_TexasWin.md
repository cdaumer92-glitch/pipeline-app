# Plan de simplification du process d'opt-in RGPD — TexasWin CRM

> Document de décision. Aucune modification de code à ce stade.
> Rédigé le 21/07/2026. Cible : rendre l'opt-in simple à utiliser (« je lance, je n'y touche plus »).

---

## 1. Le problème, en une phrase

Le module opt-in a l'ambition d'une petite automation marketing, **mais tout se fait à la main** : le système calcule quand relancer, sans jamais envoyer. L'utilisateur doit surveiller un tableau et cliquer. Trois causes concrètes, tout le reste en découle.

| # | Cause | Conséquence pour l'utilisateur |
|---|-------|-------------------------------|
| 1 | **Aucune automatisation.** Les échéances J+5 / J+10 sont calculées (`GET /api/optin/sequence`) mais jamais déclenchées. Le planificateur du projet (récaps mail, `server.js:6967-7046`) n'est pas branché sur l'opt-in. | Il faut revenir cliquer « Envoyer les relances dues » à chaque échéance. La modale de lancement promet pourtant « les relances suivront automatiquement » — c'est faux aujourd'hui. |
| 2 | **La séquence se règle à deux endroits, stockée en triple.** Définie à la création de campagne (`optin_campagnes.etapes_json`) *et* dans un constructeur global (`optin_config.etapes_json`), plus les colonnes anciennes `campagne_relance1/2_id`. | On ne sait pas lequel fait foi. Risque d'incohérence. |
| 3 | **Chaque relance = deux appels séparés** : `send-campaign` *puis* `avancer-etape`. | Si le second échoue, le mail est parti mais le contact réapparaît « à relancer ». |

Effets secondaires directs : deux vues répondant à la même question (`optin/sequence` par contact vs `optin/campaigns` par campagne, logique d'échéance dupliquée), et l'endpoint `backfill-sequences` qui existe uniquement pour rattraper des données mal structurées a posteriori.

---

## 2. La cible : le process idéal

Du point de vue de l'utilisateur, réduit à **3 gestes** :

1. **Créer une campagne** = un nom + la séquence d'emails Brevo (Mail 1, puis relances avec leurs délais). Un seul endroit.
2. **Lancer** = choisir les contacts, envoyer le Mail 1. Fin de l'intervention.
3. **Regarder** (optionnel) = un tableau de bord montre où en est chaque campagne. Les relances partent seules ; les contacts en bout de course sont clôturés seuls.

Le contact, lui, ne fait qu'un clic public (`confirm` / `refuse`) — **inchangé, ça marche déjà bien**.

---

## 3. Chantier A — Automatiser les relances *(le gros gain)*

**Principe** : brancher le planificateur existant (déjà utilisé pour les récaps, protégé par `SCHEDULER_KEY`, `checkSchedulerKey` `server.js:6967-6975`) sur l'opt-in.

**Nouveau job planifié** (1×/jour, ex. 8 h) :
1. Lire les contacts « dus » (même logique que `optin/sequence`, buckets `relance1/relance2/relanceSuivantes/cloture`).
2. Pour chaque contact dû : envoyer la relance de sa vague (réutiliser la mécanique `send-campaign` mode `opt_in_request`) **et** avancer l'étape — **dans une seule transaction** (voir Chantier B, envoi atomique).
3. Clôturer automatiquement les contacts arrivés au bout (`demande_optin=false`, `optin_etape=0`).
4. Journaliser chaque envoi automatique dans `campagnes_envois` (déjà le cas) pour l'historique.

**Garde-fous indispensables** :
- **Plafond quotidien** d'envois automatiques (anti-emballement si un bug remet tout le monde « dû »).
- **Interrupteur** par campagne et global (« pause des relances auto ») — l'utilisateur doit pouvoir stopper.
- **Idempotence** : ne jamais renvoyer deux fois la même vague au même contact le même jour (verrou sur `optin_dernier_envoi_at`).
- **Fenêtre horaire** ouvrée (déjà des jours ouvrés ; ajouter une heure d'envoi raisonnable).

**Effort** : moyen. **Risque** : réel — ça envoie de vrais emails sans clic humain. À tester avec un plafond bas et une liste de test avant activation.

---

## 4. Chantier B — Consolider l'écran et les concepts *(sans changer le comportement)*

### 4.1 Une seule définition de séquence
- **Garder** `optin_campagnes.etapes_json` (la définition nommée, réutilisable) comme **source unique**.
- **Supprimer** le constructeur global « Séquence de relances » (`CampagnesRelances` en mode `builder`) et l'écriture dans `optin_config.etapes_json`.
- `optin_config` ne garde qu'un pointeur `sequence_courante_id` vers la campagne active — plus de copie de la séquence.
- **Retirer** les colonnes anciennes `campagne_relance1/2_id` et le code de rétro-compat (`server.js:5155-5177`, `712-726`).

### 4.2 Un seul endroit pour agir
- Supprimer l'accordéon « Actions de relance groupées » (doublon des boutons déjà présents sur chaque carte de campagne dans « En cours »).
- Une fois le Chantier A en place, ces boutons manuels deviennent optionnels (un « forcer l'envoi maintenant » suffit).

### 4.3 Envoi atomique
- Créer **un endpoint** `POST /api/optin/relancer` qui, en une transaction : envoie via Brevo **et** avance l'étape (ou ne fait rien si l'envoi échoue). Remplace les deux appels `send-campaign` + `avancer-etape` côté front.
- Élimine la classe de bugs « mail parti mais étape non avancée ».

### 4.4 Une seule vue d'état
- Fusionner `optin/sequence` (par contact) et `optin/campaigns` (par campagne) en une seule source, la logique d'échéance écrite une fois.

**Effort** : moyen, surtout du front + un endpoint. **Risque** : faible (pas de changement de comportement d'envoi).

---

## 5. Nettoyage de données

- **Migration** : geler la séquence active dans la définition de campagne, puis abandonner `optin_config.etapes_json` et `campagne_relance1/2_id`.
- **`backfill-sequences`** : le garder le temps de la migration, puis le retirer (il ne sert qu'à rattraper l'ancien modèle).
- Aucune perte de données : `campagnes_envois` et `interlocuteurs_consents` (journal RGPD) restent intacts.

---

## 6. Points de vigilance RGPD *(à ne pas rater)*

Ce sont les points où une erreur a un coût légal, pas seulement technique.

1. **Ne jamais relancer un opt-out.** Le job automatique doit exclure `emailing_unsubscribed_at IS NOT NULL` à chaque passage (pas seulement au lancement).
2. **Traçabilité conservée.** Chaque envoi automatique doit continuer d'écrire dans `campagnes_envois`, et tout changement de consentement dans `interlocuteurs_consents` (journal immuable : `field`, `old/new_value`, `source`, `changed_at`, `ip`). L'automatisation ne doit pas court-circuiter ce journal — mettre `source = 'relance_auto'` pour distinguer.
3. **TTL du lien de confirmation** (`OPTIN_TOKEN_TTL_DAYS`, 30 j) : si une séquence auto s'étale au-delà, régénérer le token à chaque relance plutôt que réutiliser un token périmé.
4. **Double consentement clair** : `demande_optin` (sollicitation en cours) ≠ `accept_emailing` (consentement obtenu). L'auto-clôture remet `demande_optin=false` sans jamais toucher `accept_emailing` — un non-répondant ne devient pas opt-in par défaut.
5. **Preuve d'envoi** : garder le lien Mail 1 → relances via `sequence_id`/`sequence_etape` pour pouvoir prouver le parcours de sollicitation en cas de contrôle.

---

## 7. Ce qu'on NE touche pas

- Le parcours public `confirm` / `refuse` (`server.js:5830`, `5942`) — fiable, pages déjà stylées.
- Le journal `interlocuteurs_consents`.
- L'intégration Brevo (clonage de campagne + `sendNow` + attribut `OPTIN_LINK`).
- Les récaps internes nodemailer (canal séparé).

---

## 8. Ordre proposé & effort

| Étape | Contenu | Effort | Risque | Déploiement |
|-------|---------|--------|--------|-------------|
| 1 | **Chantier B** (consolidation, envoi atomique) | Moyen | Faible | Déployer et laisser tourner quelques jours |
| 2 | **Chantier A** (automatisation) avec plafond bas + interrupteur | Moyen | Élevé (vrais emails) | Activer d'abord sur une campagne test |
| 3 | **Nettoyage données** + retrait `backfill-sequences` | Faible | Faible | Après stabilisation |

Faire B avant A : on simplifie d'abord le socle (un seul endroit, envoi atomique), ce qui rend l'automatisation plus simple et plus sûre à brancher ensuite.

---

## 9. Décision attendue

- **Feu vert sur la cible** (§2) ?
- **Périmètre** : B seul (écran plus simple, toujours manuel) / B puis A (relances automatiques) / plan tel quel à affiner ?
- **Politique de relance auto** : plafond quotidien souhaité, heure d'envoi, faut-il un « brouillon » (préparer les relances et attendre une validation) ou envoi direct ?
