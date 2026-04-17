-- =============================================================
-- Script de réinsertion : Antik Batik (id=30) + Barbara Bui (id=33)
-- Source : 195.154.69.163:29409  ->  Cible : 51.159.24.123:3035
-- Généré le : 2026-04-02T10:27:58.657Z
-- Vérification préalable : aucun conflit d'ID dans la base cible
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. PROSPECTS (2 lignes)
-- ---------------------------------------------------------------
INSERT INTO prospects (id, name, contact_name, email, phone, status, status_date, setup_amount, monthly_amount, annual_amount, training_amount, chance_percent, assigned_to, quote_date, decision_maker, notes, user_id, created_at, updated_at, pdf_url, solutions_en_place, adresse, tel_standard, statut_societe, website, tw_version, cp, ville, secteur, email_societe) VALUES (30, 'Antik Batik', 'M. Couadau', NULL, NULL, 'Prospection', '2026-01-28T23:00:00.000Z', '18100.00', '1637.00', '1736.00', '7445.00', 20, 'Roger', '2025-10-16T22:00:00.000Z', 'M. Eurin (DAF)', NULL, 1, '2026-01-29T13:58:07.000Z', '2026-03-27T14:11:02.298Z', 'prospect-30-1770028870437.pdf', 'Turbosoft de TSF qui a déposé le bilan en aout  +Btoc Shopify + 2 mags', '8, Rue du Foin 75003 Paris', '01 48 87 90 28', 'Suspect', 'https://www.antikbatik.com', NULL, NULL, NULL, NULL, NULL);
INSERT INTO prospects (id, name, contact_name, email, phone, status, status_date, setup_amount, monthly_amount, annual_amount, training_amount, chance_percent, assigned_to, quote_date, decision_maker, notes, user_id, created_at, updated_at, pdf_url, solutions_en_place, adresse, tel_standard, statut_societe, website, tw_version, cp, ville, secteur, email_societe) VALUES (33, 'Barbara Bui', 'Paul-Louis Michel', 'paul-louis.michel@barbarabui.fr', '+33 1 44 59 94 12 ', 'Prospection', '2026-01-28T23:00:00.000Z', '22270.00', '3504.00', '0.00', '16531.25', 60, 'Roger', '2025-12-02T23:00:00.000Z', 'Direction collégiale', NULL, 1, '2026-01-29T15:39:52.000Z', '2026-03-27T14:11:02.721Z', 'prospect-33-1770031098327.pdf', NULL, '32 Rue des Francs Bourgeois', NULL, 'Suspect', NULL, NULL, '75003', 'Paris', NULL, NULL);
SELECT setval('prospects_id_seq', GREATEST((SELECT MAX(id) FROM prospects), 158));

-- ---------------------------------------------------------------
-- 2. INTERLOCUTEURS (5 lignes)
-- ---------------------------------------------------------------
INSERT INTO interlocuteurs (id, prospect_id, nom, fonction, email, telephone, principal, created_at, updated_at, decideur, prenom, civilite) VALUES (8, 30, 'M. COUADAU', 'DAF', 'gc@daf-online.com', '', FALSE, '2026-02-05T11:44:25.790Z', '2026-02-06T14:30:22.695Z', TRUE, NULL, NULL);
INSERT INTO interlocuteurs (id, prospect_id, nom, fonction, email, telephone, principal, created_at, updated_at, decideur, prenom, civilite) VALUES (9, 30, 'M. Eurin', 'Comptable', 'g.eurin@antikbatik.fr', ' 01 48 87 99 59 ', TRUE, '2026-02-05T11:44:42.288Z', '2026-02-06T14:29:24.915Z', FALSE, NULL, NULL);
INSERT INTO interlocuteurs (id, prospect_id, nom, fonction, email, telephone, principal, created_at, updated_at, decideur, prenom, civilite) VALUES (12, 33, 'Paul-Louis Michel', 'DAF', 'paul-louis.michel@barbarabui.fr', '+33 1 44 59 94 12 ', TRUE, '2026-02-05T11:46:18.625Z', '2026-02-05T11:46:18.625Z', TRUE, NULL, NULL);
INSERT INTO interlocuteurs (id, prospect_id, nom, fonction, email, telephone, principal, created_at, updated_at, decideur, prenom, civilite) VALUES (153, 30, 'Barde', 'responsable logistique', 's.barde@antikbatik.fr', NULL, FALSE, '2026-03-27T14:11:14.238Z', '2026-03-27T14:11:14.238Z', FALSE, 'Stéphane', 'M.');
INSERT INTO interlocuteurs (id, prospect_id, nom, fonction, email, telephone, principal, created_at, updated_at, decideur, prenom, civilite) VALUES (154, 30, 'Cortese', NULL, 'g.cortese@antikbatik.fr', NULL, FALSE, '2026-03-27T14:11:14.271Z', '2026-03-27T14:11:14.271Z', FALSE, 'Gabriella', 'Mme');
SELECT setval('interlocuteurs_id_seq', GREATEST((SELECT MAX(id) FROM interlocuteurs), 905));

-- ---------------------------------------------------------------
-- 3. AFFAIRES (2 lignes)
-- ---------------------------------------------------------------
INSERT INTO affaires (id, prospect_id, nom_affaire, description, statut_global, created_at, updated_at) VALUES (1, 30, 'Antik Batik', '', 'En cours', '2026-01-29T13:58:07.000Z', '2026-03-16T11:25:28.476Z');
INSERT INTO affaires (id, prospect_id, nom_affaire, description, statut_global, created_at, updated_at) VALUES (4, 33, 'Barbara Bui / Changement ERP', 'Passage ERP Colombus vers TexasWin', 'Discussion', '2026-01-29T15:39:52.000Z', '2026-03-22T10:14:11.214Z');
SELECT setval('affaires_id_seq', GREATEST((SELECT MAX(id) FROM affaires), 42));

-- ---------------------------------------------------------------
-- 4. DEVIS (4 lignes)
-- ---------------------------------------------------------------
INSERT INTO devis (id, prospect_id, quote_date, setup_amount, monthly_amount, annual_amount, training_amount, chance_percent, pdf_url, modules, created_at, updated_at, comment, devis_name, devis_status, affaire_id) VALUES (23, 33, '2025-12-02T23:00:00.000Z', '22270.00', '3504.00', '0.00', '16531.25', 60, NULL, '{"biz":8,"fab":8,"mag":3}'::jsonb, '2026-01-29T15:39:52.000Z', '2026-03-16T16:58:53.136Z', NULL, 'Devis initial', 'Discussion', NULL);
INSERT INTO devis (id, prospect_id, quote_date, setup_amount, monthly_amount, annual_amount, training_amount, chance_percent, pdf_url, modules, created_at, updated_at, comment, devis_name, devis_status, affaire_id) VALUES (31, 30, '2024-10-16T22:00:00.000Z', '18100.00', '1637.00', '1736.00', '7445.00', 0, 'devis-pdfs/devis-31-1771502731970.pdf', '{}'::jsonb, '2026-01-29T13:58:07.000Z', '2026-03-24T09:29:55.076Z', NULL, 'Devis Initial avec Licence perpetuelle', 'Perdu', 1);
INSERT INTO devis (id, prospect_id, quote_date, setup_amount, monthly_amount, annual_amount, training_amount, chance_percent, pdf_url, modules, created_at, updated_at, comment, devis_name, devis_status, affaire_id) VALUES (45, 33, '2025-12-02T23:00:00.000Z', '27000.00', '3504.00', '0.00', '0.00', 100, 'devis-pdfs/devis-45-1773685469381.pdf', '{"biz":8,"fab":8,"mag":3}'::jsonb, '2026-03-16T17:23:40.132Z', '2026-03-17T13:36:12.628Z', NULL, 'Devis initial', 'Gagné', 4);
INSERT INTO devis (id, prospect_id, quote_date, setup_amount, monthly_amount, annual_amount, training_amount, chance_percent, pdf_url, modules, created_at, updated_at, comment, devis_name, devis_status, affaire_id) VALUES (49, 30, '2025-10-13T22:00:00.000Z', '18100.00', '1637.00', '1736.00', '7475.00', 40, 'devis-pdfs/devis-49-1774348028820.pdf', '{"biz":6,"jet":3,"mag":2,"flux_tiers":0,"compta_sage":true}'::jsonb, '2026-03-24T09:27:08.569Z', '2026-03-24T09:28:44.173Z', NULL, ' Proposition d''abonnement du 14-10-2025', 'Envoyé', 1);
SELECT setval('devis_id_seq', GREATEST((SELECT MAX(id) FROM devis), 49));

-- ---------------------------------------------------------------
-- 5. NEXT_ACTIONS (9 lignes)
-- ---------------------------------------------------------------
INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (14, 30, 'Relance', '2026-02-05T23:00:00.000Z', 'Roger', 1, '2026-02-05T23:00:00.000Z', 'Le Daf Mr Couadau doit me rappeler cette semaine. Je le relancerai le lundi 09/02', 4, '2026-02-02T08:59:49.808Z', NULL, 1, NULL);
INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (46, 30, 'Relance', '2026-02-08T23:00:00.000Z', 'Roger', 1, '2026-02-09T23:00:00.000Z', 'Reporter à lundi 09/02', 4, '2026-02-06T14:48:11.093Z', NULL, 1, NULL);
INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (69, 30, 'Appel', '2026-02-09T23:00:00.000Z', 'Roger', 1, '2026-02-09T23:00:00.000Z', 'J''ai eu Mr Eurin qui me fait savoir que Mr Couadau a été très occupé la semaine dernière et ne manquera de lui faire part de mon appel..', 4, '2026-02-10T09:17:36.359Z', NULL, 1, NULL);
INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (75, 30, 'Appel', '2026-02-16T23:00:00.000Z', 'Roger', 1, '2026-03-23T23:00:00.000Z', NULL, 4, '2026-02-10T11:12:04.826Z', NULL, 1, NULL);
INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (145, 33, 'Relance', '2026-01-08T23:00:00.000Z', 'Roger', 1, '2026-03-16T23:00:00.000Z', NULL, 1, '2026-03-17T14:04:06.930Z', 'Paul-Louis Michel', 4, NULL);
INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (146, 33, 'Relance', '2026-02-16T23:00:00.000Z', 'Roger', 1, '2026-03-16T23:00:00.000Z', NULL, 1, '2026-03-17T14:05:30.482Z', 'Paul-Louis Michel', 4, NULL);
INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (148, 33, 'A faire', '2026-02-19T23:00:00.000Z', 'Christian', 1, '2026-03-16T23:00:00.000Z', NULL, 1, '2026-03-17T14:06:58.883Z', 'Interne', 4, NULL);
INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (149, 33, 'Appel', '2026-02-26T23:00:00.000Z', 'Roger', 1, '2026-03-16T23:00:00.000Z', NULL, 1, '2026-03-17T14:08:03.847Z', 'Paul-Louis Michel', 4, NULL);
INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (167, 30, 'Relance', '2026-03-29T22:00:00.000Z', 'Roger', 0, NULL, 'Mr EURIN VA RELANCER DEMAIN MR COUADAU POUR FAIRE AVANCER LE PROJET
SI PAS DE REPONSE J''ENVOIE UN MAIL', 4, '2026-03-23T13:23:00.724Z', 'M. Eurin', 1, NULL);
SELECT setval('next_actions_id_seq', GREATEST((SELECT MAX(id) FROM next_actions), 181));

-- ---------------------------------------------------------------
-- 6. BOUTIQUES (3 lignes — Barbara Bui uniquement)
-- ---------------------------------------------------------------
INSERT INTO boutiques (id, prospect_id, nom, adresse, ville, cp, telephone, responsable_id, notes, created_at, updated_at) VALUES (4, 33, 'Boutique Montaigne', '50 Avenue Montaigne', 'Paris', '75008', '+33 1 42 25 05 25', NULL, NULL, '2026-03-25T13:20:32.818Z', '2026-03-25T13:20:32.818Z');
INSERT INTO boutiques (id, prospect_id, nom, adresse, ville, cp, telephone, responsable_id, notes, created_at, updated_at) VALUES (5, 33, 'Boutiques Saints-Pères', '67 Rue des Saints-Pères', 'Paris', '75006', '+33 1 45 44 37 21', NULL, NULL, '2026-03-25T13:21:59.792Z', '2026-03-25T13:21:59.792Z');
INSERT INTO boutiques (id, prospect_id, nom, adresse, ville, cp, telephone, responsable_id, notes, created_at, updated_at) VALUES (6, 33, 'Boutique Grenelle', '1 Rue de Grenelle', 'Paris', '75006', '+33 1 83 62 06 22', NULL, NULL, '2026-03-25T13:23:16.032Z', '2026-03-25T13:23:16.032Z');
SELECT setval('boutiques_id_seq', GREATEST((SELECT MAX(id) FROM boutiques), 6));

COMMIT;
