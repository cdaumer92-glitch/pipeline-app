function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

const prospects = [
  {"id":30,"name":"Antik Batik","contact_name":"M. Couadau","email":null,"phone":null,"status":"Prospection","status_date":"2026-01-28T23:00:00.000Z","setup_amount":"18100.00","monthly_amount":"1637.00","annual_amount":"1736.00","training_amount":"7445.00","chance_percent":20,"assigned_to":"Roger","quote_date":"2025-10-16T22:00:00.000Z","decision_maker":"M. Eurin (DAF)","notes":null,"user_id":1,"created_at":"2026-01-29T13:58:07.000Z","updated_at":"2026-03-27T14:11:02.298Z","pdf_url":"prospect-30-1770028870437.pdf","solutions_en_place":"Turbosoft de TSF qui a déposé le bilan en aout  +Btoc Shopify + 2 mags","adresse":"8, Rue du Foin 75003 Paris","tel_standard":"01 48 87 90 28","statut_societe":"Suspect","website":"https://www.antikbatik.com","tw_version":null,"cp":null,"ville":null,"secteur":null,"email_societe":null},
  {"id":33,"name":"Barbara Bui","contact_name":"Paul-Louis Michel","email":"paul-louis.michel@barbarabui.fr","phone":"+33 1 44 59 94 12 ","status":"Prospection","status_date":"2026-01-28T23:00:00.000Z","setup_amount":"22270.00","monthly_amount":"3504.00","annual_amount":"0.00","training_amount":"16531.25","chance_percent":60,"assigned_to":"Roger","quote_date":"2025-12-02T23:00:00.000Z","decision_maker":"Direction collégiale","notes":null,"user_id":1,"created_at":"2026-01-29T15:39:52.000Z","updated_at":"2026-03-27T14:11:02.721Z","pdf_url":"prospect-33-1770031098327.pdf","solutions_en_place":null,"adresse":"32 Rue des Francs Bourgeois","tel_standard":null,"statut_societe":"Suspect","website":null,"tw_version":null,"cp":"75003","ville":"Paris","secteur":null,"email_societe":null}
];

const interlocuteurs = [
  {"id":8,"prospect_id":30,"nom":"M. COUADAU","fonction":"DAF","email":"gc@daf-online.com","telephone":"","principal":false,"created_at":"2026-02-05T11:44:25.790Z","updated_at":"2026-02-06T14:30:22.695Z","decideur":true,"prenom":null,"civilite":null},
  {"id":9,"prospect_id":30,"nom":"M. Eurin","fonction":"Comptable","email":"g.eurin@antikbatik.fr","telephone":" 01 48 87 99 59 ","principal":true,"created_at":"2026-02-05T11:44:42.288Z","updated_at":"2026-02-06T14:29:24.915Z","decideur":false,"prenom":null,"civilite":null},
  {"id":12,"prospect_id":33,"nom":"Paul-Louis Michel","fonction":"DAF","email":"paul-louis.michel@barbarabui.fr","telephone":"+33 1 44 59 94 12 ","principal":true,"created_at":"2026-02-05T11:46:18.625Z","updated_at":"2026-02-05T11:46:18.625Z","decideur":true,"prenom":null,"civilite":null},
  {"id":153,"prospect_id":30,"nom":"Barde","fonction":"responsable logistique","email":"s.barde@antikbatik.fr","telephone":null,"principal":false,"created_at":"2026-03-27T14:11:14.238Z","updated_at":"2026-03-27T14:11:14.238Z","decideur":false,"prenom":"Stéphane","civilite":"M."},
  {"id":154,"prospect_id":30,"nom":"Cortese","fonction":null,"email":"g.cortese@antikbatik.fr","telephone":null,"principal":false,"created_at":"2026-03-27T14:11:14.271Z","updated_at":"2026-03-27T14:11:14.271Z","decideur":false,"prenom":"Gabriella","civilite":"Mme"}
];

const affaires = [
  {"id":1,"prospect_id":30,"nom_affaire":"Antik Batik","description":"","statut_global":"En cours","created_at":"2026-01-29T13:58:07.000Z","updated_at":"2026-03-16T11:25:28.476Z"},
  {"id":4,"prospect_id":33,"nom_affaire":"Barbara Bui / Changement ERP","description":"Passage ERP Colombus vers TexasWin","statut_global":"Discussion","created_at":"2026-01-29T15:39:52.000Z","updated_at":"2026-03-22T10:14:11.214Z"}
];

const devis = [
  {"id":23,"prospect_id":33,"quote_date":"2025-12-02T23:00:00.000Z","setup_amount":"22270.00","monthly_amount":"3504.00","annual_amount":"0.00","training_amount":"16531.25","chance_percent":60,"pdf_url":null,"modules":{"biz":8,"fab":8,"mag":3},"created_at":"2026-01-29T15:39:52.000Z","updated_at":"2026-03-16T16:58:53.136Z","comment":null,"devis_name":"Devis initial","devis_status":"Discussion","affaire_id":null},
  {"id":31,"prospect_id":30,"quote_date":"2024-10-16T22:00:00.000Z","setup_amount":"18100.00","monthly_amount":"1637.00","annual_amount":"1736.00","training_amount":"7445.00","chance_percent":0,"pdf_url":"devis-pdfs/devis-31-1771502731970.pdf","modules":{},"created_at":"2026-01-29T13:58:07.000Z","updated_at":"2026-03-24T09:29:55.076Z","comment":null,"devis_name":"Devis Initial avec Licence perpetuelle","devis_status":"Perdu","affaire_id":1},
  {"id":45,"prospect_id":33,"quote_date":"2025-12-02T23:00:00.000Z","setup_amount":"27000.00","monthly_amount":"3504.00","annual_amount":"0.00","training_amount":"0.00","chance_percent":100,"pdf_url":"devis-pdfs/devis-45-1773685469381.pdf","modules":{"biz":8,"fab":8,"mag":3},"created_at":"2026-03-16T17:23:40.132Z","updated_at":"2026-03-17T13:36:12.628Z","comment":null,"devis_name":"Devis initial","devis_status":"Gagné","affaire_id":4},
  {"id":49,"prospect_id":30,"quote_date":"2025-10-13T22:00:00.000Z","setup_amount":"18100.00","monthly_amount":"1637.00","annual_amount":"1736.00","training_amount":"7475.00","chance_percent":40,"pdf_url":"devis-pdfs/devis-49-1774348028820.pdf","modules":{"biz":6,"jet":3,"mag":2,"flux_tiers":0,"compta_sage":true},"created_at":"2026-03-24T09:27:08.569Z","updated_at":"2026-03-24T09:28:44.173Z","comment":null,"devis_name":" Proposition d'abonnement du 14-10-2025","devis_status":"Envoyé","affaire_id":1}
];

const next_actions = [
  {"id":14,"prospect_id":30,"action_type":"Relance","planned_date":"2026-02-05T23:00:00.000Z","actor":"Roger","completed":1,"completed_date":"2026-02-05T23:00:00.000Z","completed_note":"Le Daf Mr Couadau doit me rappeler cette semaine. Je le relancerai le lundi 09/02","user_id":4,"created_at":"2026-02-02T08:59:49.808Z","contact":null,"affaire_id":1,"contexte":null},
  {"id":46,"prospect_id":30,"action_type":"Relance","planned_date":"2026-02-08T23:00:00.000Z","actor":"Roger","completed":1,"completed_date":"2026-02-09T23:00:00.000Z","completed_note":"Reporter à lundi 09/02","user_id":4,"created_at":"2026-02-06T14:48:11.093Z","contact":null,"affaire_id":1,"contexte":null},
  {"id":69,"prospect_id":30,"action_type":"Appel","planned_date":"2026-02-09T23:00:00.000Z","actor":"Roger","completed":1,"completed_date":"2026-02-09T23:00:00.000Z","completed_note":"J'ai eu Mr Eurin qui me fait savoir que Mr Couadau a été très occupé la semaine dernière et ne manquera de lui faire part de mon appel..","user_id":4,"created_at":"2026-02-10T09:17:36.359Z","contact":null,"affaire_id":1,"contexte":null},
  {"id":75,"prospect_id":30,"action_type":"Appel","planned_date":"2026-02-16T23:00:00.000Z","actor":"Roger","completed":1,"completed_date":"2026-03-23T23:00:00.000Z","completed_note":null,"user_id":4,"created_at":"2026-02-10T11:12:04.826Z","contact":null,"affaire_id":1,"contexte":null},
  {"id":145,"prospect_id":33,"action_type":"Relance","planned_date":"2026-01-08T23:00:00.000Z","actor":"Roger","completed":1,"completed_date":"2026-03-16T23:00:00.000Z","completed_note":null,"user_id":1,"created_at":"2026-03-17T14:04:06.930Z","contact":"Paul-Louis Michel","affaire_id":4,"contexte":null},
  {"id":146,"prospect_id":33,"action_type":"Relance","planned_date":"2026-02-16T23:00:00.000Z","actor":"Roger","completed":1,"completed_date":"2026-03-16T23:00:00.000Z","completed_note":null,"user_id":1,"created_at":"2026-03-17T14:05:30.482Z","contact":"Paul-Louis Michel","affaire_id":4,"contexte":null},
  {"id":148,"prospect_id":33,"action_type":"A faire","planned_date":"2026-02-19T23:00:00.000Z","actor":"Christian","completed":1,"completed_date":"2026-03-16T23:00:00.000Z","completed_note":null,"user_id":1,"created_at":"2026-03-17T14:06:58.883Z","contact":"Interne","affaire_id":4,"contexte":null},
  {"id":149,"prospect_id":33,"action_type":"Appel","planned_date":"2026-02-26T23:00:00.000Z","actor":"Roger","completed":1,"completed_date":"2026-03-16T23:00:00.000Z","completed_note":null,"user_id":1,"created_at":"2026-03-17T14:08:03.847Z","contact":"Paul-Louis Michel","affaire_id":4,"contexte":null},
  {"id":167,"prospect_id":30,"action_type":"Relance","planned_date":"2026-03-29T22:00:00.000Z","actor":"Roger","completed":0,"completed_date":null,"completed_note":"Mr EURIN VA RELANCER DEMAIN MR COUADAU POUR FAIRE AVANCER LE PROJET\nSI PAS DE REPONSE J'ENVOIE UN MAIL","user_id":4,"created_at":"2026-03-23T13:23:00.724Z","contact":"M. Eurin","affaire_id":1,"contexte":null}
];

const boutiques = [
  {"id":4,"prospect_id":33,"nom":"Boutique Montaigne","adresse":"50 Avenue Montaigne","ville":"Paris","cp":"75008","telephone":"+33 1 42 25 05 25","responsable_id":null,"notes":null,"created_at":"2026-03-25T13:20:32.818Z","updated_at":"2026-03-25T13:20:32.818Z"},
  {"id":5,"prospect_id":33,"nom":"Boutiques Saints-Pères","adresse":"67 Rue des Saints-Pères","ville":"Paris","cp":"75006","telephone":"+33 1 45 44 37 21","responsable_id":null,"notes":null,"created_at":"2026-03-25T13:21:59.792Z","updated_at":"2026-03-25T13:21:59.792Z"},
  {"id":6,"prospect_id":33,"nom":"Boutique Grenelle","adresse":"1 Rue de Grenelle","ville":"Paris","cp":"75006","telephone":"+33 1 83 62 06 22","responsable_id":null,"notes":null,"created_at":"2026-03-25T13:23:16.032Z","updated_at":"2026-03-25T13:23:16.032Z"}
];

let sql = '';
sql += '-- =============================================================\n';
sql += '-- Script de réinsertion : Antik Batik (id=30) + Barbara Bui (id=33)\n';
sql += '-- Source : 195.154.69.163:29409  ->  Cible : 51.159.24.123:3035\n';
sql += '-- Généré le : ' + new Date().toISOString() + '\n';
sql += '-- Vérification préalable : aucun conflit d\'ID dans la base cible\n';
sql += '-- =============================================================\n\n';
sql += 'BEGIN;\n\n';

// PROSPECTS
sql += '-- ---------------------------------------------------------------\n';
sql += '-- 1. PROSPECTS (2 lignes)\n';
sql += '-- ---------------------------------------------------------------\n';
for (const r of prospects) {
  sql += 'INSERT INTO prospects (id, name, contact_name, email, phone, status, status_date, setup_amount, monthly_amount, annual_amount, training_amount, chance_percent, assigned_to, quote_date, decision_maker, notes, user_id, created_at, updated_at, pdf_url, solutions_en_place, adresse, tel_standard, statut_societe, website, tw_version, cp, ville, secteur, email_societe) VALUES (';
  sql += [r.id, r.name, r.contact_name, r.email, r.phone, r.status, r.status_date, r.setup_amount, r.monthly_amount, r.annual_amount, r.training_amount, r.chance_percent, r.assigned_to, r.quote_date, r.decision_maker, r.notes, r.user_id, r.created_at, r.updated_at, r.pdf_url, r.solutions_en_place, r.adresse, r.tel_standard, r.statut_societe, r.website, r.tw_version, r.cp, r.ville, r.secteur, r.email_societe].map(esc).join(', ');
  sql += ');\n';
}
sql += "SELECT setval('prospects_id_seq', GREATEST((SELECT MAX(id) FROM prospects), 158));\n\n";

// INTERLOCUTEURS
sql += '-- ---------------------------------------------------------------\n';
sql += '-- 2. INTERLOCUTEURS (5 lignes)\n';
sql += '-- ---------------------------------------------------------------\n';
for (const r of interlocuteurs) {
  sql += 'INSERT INTO interlocuteurs (id, prospect_id, nom, fonction, email, telephone, principal, created_at, updated_at, decideur, prenom, civilite) VALUES (';
  sql += [r.id, r.prospect_id, r.nom, r.fonction, r.email, r.telephone, r.principal, r.created_at, r.updated_at, r.decideur, r.prenom, r.civilite].map(esc).join(', ');
  sql += ');\n';
}
sql += "SELECT setval('interlocuteurs_id_seq', GREATEST((SELECT MAX(id) FROM interlocuteurs), 905));\n\n";

// AFFAIRES
sql += '-- ---------------------------------------------------------------\n';
sql += '-- 3. AFFAIRES (2 lignes)\n';
sql += '-- ---------------------------------------------------------------\n';
for (const r of affaires) {
  sql += 'INSERT INTO affaires (id, prospect_id, nom_affaire, description, statut_global, created_at, updated_at) VALUES (';
  sql += [r.id, r.prospect_id, r.nom_affaire, r.description, r.statut_global, r.created_at, r.updated_at].map(esc).join(', ');
  sql += ');\n';
}
sql += "SELECT setval('affaires_id_seq', GREATEST((SELECT MAX(id) FROM affaires), 42));\n\n";

// DEVIS
sql += '-- ---------------------------------------------------------------\n';
sql += '-- 4. DEVIS (4 lignes)\n';
sql += '-- ---------------------------------------------------------------\n';
for (const r of devis) {
  sql += 'INSERT INTO devis (id, prospect_id, quote_date, setup_amount, monthly_amount, annual_amount, training_amount, chance_percent, pdf_url, modules, created_at, updated_at, comment, devis_name, devis_status, affaire_id) VALUES (';
  sql += [r.id, r.prospect_id, r.quote_date, r.setup_amount, r.monthly_amount, r.annual_amount, r.training_amount, r.chance_percent, r.pdf_url, r.modules, r.created_at, r.updated_at, r.comment, r.devis_name, r.devis_status, r.affaire_id].map(esc).join(', ');
  sql += ');\n';
}
sql += "SELECT setval('devis_id_seq', GREATEST((SELECT MAX(id) FROM devis), 49));\n\n";

// NEXT_ACTIONS
sql += '-- ---------------------------------------------------------------\n';
sql += '-- 5. NEXT_ACTIONS (9 lignes)\n';
sql += '-- ---------------------------------------------------------------\n';
for (const r of next_actions) {
  sql += 'INSERT INTO next_actions (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at, contact, affaire_id, contexte) VALUES (';
  sql += [r.id, r.prospect_id, r.action_type, r.planned_date, r.actor, r.completed, r.completed_date, r.completed_note, r.user_id, r.created_at, r.contact, r.affaire_id, r.contexte].map(esc).join(', ');
  sql += ');\n';
}
sql += "SELECT setval('next_actions_id_seq', GREATEST((SELECT MAX(id) FROM next_actions), 181));\n\n";

// BOUTIQUES
sql += '-- ---------------------------------------------------------------\n';
sql += '-- 6. BOUTIQUES (3 lignes — Barbara Bui uniquement)\n';
sql += '-- ---------------------------------------------------------------\n';
for (const r of boutiques) {
  sql += 'INSERT INTO boutiques (id, prospect_id, nom, adresse, ville, cp, telephone, responsable_id, notes, created_at, updated_at) VALUES (';
  sql += [r.id, r.prospect_id, r.nom, r.adresse, r.ville, r.cp, r.telephone, r.responsable_id, r.notes, r.created_at, r.updated_at].map(esc).join(', ');
  sql += ');\n';
}
sql += "SELECT setval('boutiques_id_seq', GREATEST((SELECT MAX(id) FROM boutiques), 6));\n\n";

sql += 'COMMIT;\n';

const fs = require('fs');
fs.writeFileSync('reinsertion_barbara_bui_antik_batik.sql', sql, 'utf8');
console.log('Script généré avec succès : reinsertion_barbara_bui_antik_batik.sql');
console.log('Taille :', sql.length, 'caractères');
