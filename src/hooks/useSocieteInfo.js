import * as React from 'react';
import { getEmptyProspect } from '../lib/shared.jsx';

// SocieteInfo : recherche/enrichissement d'entreprises via l'API SocieteInfo (window.SInfo),
// + creation de societe (modale) qui partage l'etat newCompanyData avec le flux d'enrichissement.
// Regroupe car fortement couple. Deplace a l'identique depuis App. Deps externes passees en
// parametres (liste/creation de prospects, interlocuteurs, devis/affaires pour charger les
// relations apres creation, navigation). Renvoie tout sous les MEMES noms que dans App.
export function useSocieteInfo({ user, API_URL, prospects, setProspects, fetchProspects, setSelectedProspect, setFormData, setShowForm, setIsDashboard, fetchInterlocuteurs, fetchDevis, fetchAffaires }) {
      const [showNewCompanyModal, setShowNewCompanyModal] = React.useState(false);
      const [newCompanyData, setNewCompanyData] = React.useState({
        name: '', statut_societe: '', assigned_to: '',
        siren: '', tel_standard: '', website: '',
        adresse: '', code_naf: '', marques: [], notes: ''
      });
      const [newCompanyErrors, setNewCompanyErrors] = React.useState({});

      // États du modal SocieteInfo (recherche + résultats + sélection)
      const [showSInfoModal, setShowSInfoModal] = React.useState(false);
      const [sInfoQuery, setSInfoQuery] = React.useState('');
      const [sInfoBroadSearch, setSInfoBroadSearch] = React.useState(false); // Recherche élargie (searchMode=keyword)
      const [sInfoCity, setSInfoCity] = React.useState('');           // Match précis : ville
      const [sInfoPostalCode, setSInfoPostalCode] = React.useState(''); // Match précis : code postal
      const [sInfoLoading, setSInfoLoading] = React.useState(false);
      const [sInfoResults, setSInfoResults] = React.useState([]);
      const [sInfoError, setSInfoError] = React.useState('');
      // Étape 2 : société sélectionnée + dirigeants
      const [sInfoStep, setSInfoStep] = React.useState(1); // 1=recherche, 2=soc.+dirigeants, 3=conflits
      const [sInfoSelectedCompany, setSInfoSelectedCompany] = React.useState(null);
      const [sInfoContacts, setSInfoContacts] = React.useState([]);
      const [sInfoSelectedContacts, setSInfoSelectedContacts] = React.useState({}); // { contact_id: true }
      const [sInfoFetchEmails, setSInfoFetchEmails] = React.useState(false); // checkbox "récupérer emails (consomme du quota)"
      // Mode enrichissement : appelé depuis la fiche prospect (RightPanel) pour mettre à jour une société existante
      const [sInfoMode, setSInfoMode] = React.useState('create'); // 'create' | 'enrich'
      const [sInfoEnrichTarget, setSInfoEnrichTarget] = React.useState(null); // le prospect existant à enrichir
      const [sInfoConflicts, setSInfoConflicts] = React.useState([]); // [{ field, label, current, sinfo, useNew }]

      // Modale de choix d'enrichissement : avant de payer 1 crédit, on demande à
      // l'utilisateur ce qu'il veut faire (mettre à jour les infos société OU
      // ajouter des contacts depuis SocieteInfo). Évite de cramer un crédit pour
      // rien si l'utilisateur cherchait juste les contacts d'une société qui en
      // n'a pas en base SocieteInfo.
      const [showEnrichChoiceModal, setShowEnrichChoiceModal] = React.useState(false);
      const [enrichChoiceTarget, setEnrichChoiceTarget] = React.useState(null);

      const openSInfoSearch = (initialQuery = '') => {
        setSInfoQuery(initialQuery);
        setSInfoResults([]);
        setSInfoError('');
        setSInfoStep(1);
        setSInfoSelectedCompany(null);
        setSInfoContacts([]);
        setSInfoSelectedContacts({});
        setSInfoFetchEmails(false);
        setSInfoMode('create');
        setSInfoEnrichTarget(null);
        setSInfoConflicts([]);
        setShowSInfoModal(true);
        if (initialQuery.trim().length >= 2) {
          handleSInfoSearch(initialQuery);
        }
      };

      // Mode enrichissement : appelé depuis la fiche prospect (RightPanel) pour mettre à jour une société existante
      // enrichMode :
      //   - 'infos'    : appelle uniquement getCompany pour mettre à jour les infos société (1 crédit)
      //   - 'contacts' : appelle uniquement getContacts pour proposer les dirigeants (gratuit en preview)
      //   - 'both'     : ancien comportement, fait les deux (1 crédit + preview contacts)
      const openSInfoEnrich = async (prospect, enrichMode) => {
        if (!prospect) return;
        const mode = enrichMode || 'both'; // valeur par défaut = comportement historique (compat ascendante)
        setSInfoMode('enrich');
        setSInfoEnrichTarget(prospect);
        setSInfoResults([]);
        setSInfoError('');
        setSInfoSelectedCompany(null);
        setSInfoContacts([]);
        setSInfoSelectedContacts({});
        setSInfoFetchEmails(false);
        setSInfoConflicts([]);
        setShowSInfoModal(true);

        // Cas 1 : on a déjà un SIREN → on saute directement à l'étape 2 (sélection dirigeants)
        const sirenClean = String(prospect.siren || '').replace(/\D/g, '');
        if (sirenClean.length === 9) {
          setSInfoStep(2);
          setSInfoLoading(true);
          try {
            // getCompany : payant (1 crédit). Appelé seulement si mode = 'infos' ou 'both'.
            // En mode 'contacts' seul, on récupère néanmoins les infos *anciennes* du
            // prospect (sans appel API) pour pouvoir afficher l'écran de sélection
            // dirigeants avec un récap minimal.
            if (mode === 'infos' || mode === 'both') {
              const data = await window.SInfo.getCompany(sirenClean);
              const company = data.result || data.company || data;
              const mapped = window.SInfo.companyToProspect(company);
              setSInfoSelectedCompany({ ...company, _mapped: mapped });
            } else {
              // Mode 'contacts' uniquement : on construit un objet société minimal
              // à partir du prospect existant pour l'affichage, sans appel API
              const fakeCompany = {
                registration_number: sirenClean,
                organization: { name: prospect.name || '' },
                _mapped: null,
                _contactsOnly: true
              };
              setSInfoSelectedCompany(fakeCompany);
            }

            // Charger les contacts. La clé "contacts" est celle que SocieteInfo
            // utilise réellement dans /v2/contacts.json, on la met en premier.
            // Les autres (result, results, items) sont des fallbacks pour anciennes
            // variantes ou autres endpoints éventuels.
            if (mode === 'contacts' || mode === 'both') {
              try {
                const cdata = await window.SInfo.getContacts(sirenClean);
                const contacts = cdata.contacts || cdata.result || cdata.results || cdata.items || [];
                setSInfoContacts(Array.isArray(contacts) ? contacts : []);
              } catch (e) { setSInfoContacts([]); }
            } else {
              // Mode 'infos' seul : on n'appelle pas getContacts, donc pas de dirigeants à proposer
              setSInfoContacts([]);
            }
          } catch (err) {
            setSInfoError('Erreur récupération société : ' + err.message);
            setSInfoStep(1);
            setSInfoQuery(prospect.name || '');
          } finally {
            setSInfoLoading(false);
          }
          return;
        }

        // Cas 2 : pas de SIREN → recherche par nom (pré-remplie). On ne peut pas
        // distinguer infos/contacts à ce stade : tant qu'on n'a pas matché une
        // société dans la search, on ne sait pas quel SIREN cibler.
        setSInfoStep(1);
        setSInfoQuery(prospect.name || '');
        if ((prospect.name || '').trim().length >= 2) {
          handleSInfoSearch(prospect.name);
        }
      };

      // Helper : ouvre la modale de choix avant d'appeler openSInfoEnrich.
      // Si le prospect n'a pas de SIREN, on saute la modale (le mode n'a pas
      // de sens : il faudra de toute façon faire une search par nom d'abord).
      const openEnrichChoice = (prospect) => {
        if (!prospect) return;
        const sirenClean = String(prospect.siren || '').replace(/\D/g, '');
        if (sirenClean.length !== 9) {
          // Pas de SIREN : on lance le flow classique (search par nom à l'étape 1)
          openSInfoEnrich(prospect, 'both');
          return;
        }
        setEnrichChoiceTarget(prospect);
        setShowEnrichChoiceModal(true);
      };

      // Expose la fonction globalement pour que RightPanel puisse l'appeler facilement
      React.useEffect(() => {
        window.openEnrichChoice = openEnrichChoice;
        window.openSInfoEnrich = openSInfoEnrich; // gardé pour compat ascendante
        return () => { delete window.openSInfoEnrich; delete window.openEnrichChoice; };
      });

      const handleSInfoSearch = async (q) => {
        const query = (q !== undefined ? q : sInfoQuery).trim();
        if (query.length < 2) {
          setSInfoError('Tapez au moins 2 caractères');
          return;
        }
        setSInfoError('');
        setSInfoLoading(true);
        try {
          // Si l'utilisateur a fourni Ville OU Code Postal → Match précis (Enrich Company, 1 seul résultat ciblé)
          // Sinon → Recherche classique (liste de résultats)
          const city = sInfoCity.trim();
          const cp = sInfoPostalCode.trim();
          const usePreciseMatch = city.length > 0 || cp.length > 0;

          if (usePreciseMatch) {
            const enrichRes = await window.SInfo.enrichCompany({
              name: query,
              city: city,
              postal_code: cp
            });
            // Format : { success, match_info: { score, sources }, result: { ...société } }
            if (enrichRes && enrichRes.success && enrichRes.result) {
              // On normalise au même format que searchByName pour réutiliser tout le code aval
              const item = enrichRes.result;
              // L'objet retourné par Enrich peut être imbriqué (organization.*) ou plat — on aplatit
              const flat = item.organization ? {
                id: item.id,
                registration_number: item.organization.registration_number,
                full_registration_number: item.organization.full_registration_number,
                name: item.organization.name,
                activity: (item.organization.activity && item.organization.activity.corporate_object) || item.organization.activity || '',
                formatted_address: (item.organization.address ?
                  `${item.organization.address.postal_code || ''} ${item.organization.address.city || ''}`.trim() : ''),
                lng: item.organization.address && item.organization.address.lng,
                lat: item.organization.address && item.organization.address.lat,
                _match_score: enrichRes.match_info && enrichRes.match_info.score
              } : { ...item, _match_score: enrichRes.match_info && enrichRes.match_info.score };
              setSInfoResults([flat]);
            } else {
              setSInfoResults([]);
              setSInfoError('Aucune correspondance précise pour "' + query + '"' +
                (city ? ' à ' + city : '') + (cp ? ' (' + cp + ')' : '') +
                '. Essayez sans Ville/CP pour une recherche plus large.');
            }
          } else {
            const data = await window.SInfo.searchByName(query, {
              searchMode: sInfoBroadSearch ? 'keyword' : 'name'
            });
            // SocieteInfo renvoie { success, total, result: [...], ... }
            // (attention : 'result' au singulier dans cette API, pas 'results')
            let items = data.result || data.results || data.items || data.companies || [];
            // Selon les modes, 'result' peut aussi être un objet contenant un tableau
            if (!Array.isArray(items) && items && typeof items === 'object') {
              items = items.items || items.companies || items.list || [];
            }
            setSInfoResults(Array.isArray(items) ? items : []);
            if (items.length === 0) {
              setSInfoError('Aucun résultat pour "' + query + '"');
            }
          }
        } catch (err) {
          setSInfoError(err.message || 'Erreur SocieteInfo');
          setSInfoResults([]);
        } finally {
          setSInfoLoading(false);
        }
      };

      // Au choix d'une société dans la liste : on passe à l'étape 2 (dirigeants)
      // → on autofill aussi les champs Société dans le modal Nouvelle société en background
      const handleSInfoSelect = async (item) => {
        const siren = String(item.registration_number || item.siren || item.companyId || item.id || '').replace(/\D/g, '').slice(0, 9);
        if (!siren) {
          window.showToast({title:'SIREN manquant dans le résultat', type:'error'});
          return;
        }
        // 1. Vérifier doublon
        try {
          const existing = await window.SInfo.checkDuplicateBySiren(siren);
          if (existing) {
            window.showToast({title:'Société déjà dans la base : ' + existing.name, type:'warning'});
            setShowSInfoModal(false);
            return;
          }
        } catch (e) { /* on continue, le serveur bloquera si vraiment doublon */ }

        // 2. Mapper les infos société (déjà disponibles dans `item` issu de la liste)
        //    → on évite getCompany() pour ne pas consommer un crédit en plus.
        setSInfoLoading(true);
        try {
          const mapped = window.SInfo.companyToProspect(item);
          setSInfoSelectedCompany({ ...item, _mapped: mapped });

          // 3. Autofill du modal "Nouvelle société" (en arrière-plan)
          setNewCompanyData(prev => ({
            ...prev,
            name:         mapped.name || prev.name,
            siren:        mapped.siren || prev.siren,
            adresse:      mapped.adresse || prev.adresse,
            tel_standard: mapped.tel_standard || prev.tel_standard,
            website:      mapped.website || prev.website,
            code_naf:     mapped.code_naf || prev.code_naf,
            marques:      (mapped.marques && mapped.marques.length) ? mapped.marques : prev.marques,
            import_source: 'SInfo',
            import_ref:    mapped.siren
          }));

          // 4. Charger les dirigeants (gratuit en mode anonymized).
          // La clé "contacts" est celle que SocieteInfo utilise réellement.
          try {
            const cdata = await window.SInfo.getContacts(siren);
            const contacts = cdata.contacts || cdata.result || cdata.results || cdata.items || [];
            setSInfoContacts(Array.isArray(contacts) ? contacts : []);
          } catch (e) {
            console.warn('[SInfo] getContacts:', e.message);
            setSInfoContacts([]);
          }

          // 5. Passer à l'étape 2
          setSInfoStep(2);
          setSInfoSelectedContacts({});
        } catch (err) {
          setSInfoError('Erreur : ' + err.message);
        } finally {
          setSInfoLoading(false);
        }
      };

      // Étape 2 : valide la sélection des dirigeants
      // - mode 'create' : stocke les interlocuteurs pour création au submit du modal Société
      // - mode 'enrich' : passe à l'étape 3 (conflits) ou applique direct si pas de conflit
      const handleSInfoConfirmContacts = async () => {
        const selectedIds = Object.keys(sInfoSelectedContacts).filter(id => sInfoSelectedContacts[id]);
        let contactsToImport = sInfoContacts.filter(c => selectedIds.includes(String(c.id)));

        // Garde-fou : confirmer l'utilisateur si la sélection est importante (> 20 contacts).
        // Évite les surprises de débit massif en un clic.
        const COST_THRESHOLD = 20;
        if (selectedIds.length > COST_THRESHOLD) {
          const ok = window.confirm(
            `⚠️ Vous allez importer ${selectedIds.length} contacts.\n\n` +
            `Cela consommera environ ${selectedIds.length} crédits SocieteInfo (1 crédit par contact pour récupérer les noms/emails/téléphones réels).\n\n` +
            `Continuer ?`
          );
          if (!ok) return;
        }

        // Récupération SYSTÉMATIQUE des détails contacts (noms/emails/téléphones réels).
        // Sans ça les contacts importés sont anonymisés (XXXXXXXX, xx@xx.xx) et inutilisables.
        // Coût : 1 crédit par contact sélectionné.
        if (selectedIds.length > 0) {
          setSInfoLoading(true);
          try {
            // En mode 'contacts uniquement' (enrich sans appel getCompany), _mapped est null.
            // On utilise alors le registration_number directement présent sur l'objet société.
            const siren = (sInfoSelectedCompany._mapped && sInfoSelectedCompany._mapped.siren)
                           || sInfoSelectedCompany.registration_number
                           || '';
            const dets = await window.SInfo.getContactsDetails(siren, selectedIds);
            // L'API SocieteInfo retourne {success, contacts_count, contacts: [...]} (clé "contacts"
            // en premier). Les autres clés sont des fallbacks pour anciennes variantes ou autres
            // endpoints éventuels.
            const enriched = dets.contacts || dets.result || dets.results || [];
            contactsToImport = contactsToImport.map(c => {
              const det = enriched.find(d => String(d.id) === String(c.id));
              return det ? { ...c, ...det } : c;
            });
          } catch (e) {
            window.showToast({title: 'Erreur récupération contacts: ' + e.message, type:'error'});
            setSInfoLoading(false);
            return;
          }
          setSInfoLoading(false);
        }

        // Mapper les dirigeants vers le format interlocuteur du CRM
        const newInterlocuteurs = contactsToImport.map(c => {
          const mapped = window.SInfo.contactToInterlocuteur(c);
          return {
            _localId: 'sinfo-' + (c.id || Math.random().toString(36).slice(2)),
            civilite: mapped.civilite,
            prenom:   mapped.prenom,
            nom:      mapped.nom,
            fonction: mapped.fonction,
            email:    mapped.email || '',
            telephone: mapped.telephone || '',
            telephone_direct: '',
            mobile: '',
            // linkedin_url : récupéré directement du contact SocieteInfo (jamais flouté
            // contrairement au nom/email, donc utilisable même avec sInfoFetchEmails=false)
            linkedin_url: c.linkedin_url || c.linkedinUrl || '',
            notes: ''
          };
        });

        // ─── MODE ENRICHISSEMENT ─────────────────────────────
        if (sInfoMode === 'enrich' && sInfoEnrichTarget) {
          // Cas spécial : mode 'contacts uniquement' (l'utilisateur a choisi
          // d'ajouter seulement les contacts sans toucher aux infos société).
          // Pas d'appel getCompany donc pas de _mapped, donc pas de conflits à
          // calculer. On applique directement les interlocuteurs sans toucher
          // aux infos société existantes.
          if (sInfoSelectedCompany && sInfoSelectedCompany._contactsOnly) {
            await applySInfoEnrichment(sInfoEnrichTarget, null, newInterlocuteurs, []);
            return;
          }

          // Calculer les conflits champ par champ entre la société existante et les données SocieteInfo
          const sinfoMapped = sInfoSelectedCompany._mapped;
          const fieldDefs = [
            { field: 'name',         label: 'Raison sociale' },
            { field: 'siren',        label: 'SIREN' },
            { field: 'adresse',      label: 'Adresse' },
            { field: 'tel_standard', label: 'Téléphone standard' },
            { field: 'website',      label: 'Site web' },
            { field: 'code_naf',     label: 'Code NAF' }
          ];
          const conflicts = [];
          for (const def of fieldDefs) {
            const current = (sInfoEnrichTarget[def.field] || '').toString().trim();
            const sinfo   = (sinfoMapped[def.field] || '').toString().trim();
            // Si SInfo apporte une info ET qu'elle est différente de l'actuelle (ou que l'actuelle est vide)
            if (sinfo && sinfo !== current) {
              conflicts.push({
                field: def.field, label: def.label, current, sinfo,
                useNew: !current  // par défaut : remplir si vide, garder l'actuel sinon
              });
            }
          }
          // Cas marques (tableau)
          const currentMarques = Array.isArray(sInfoEnrichTarget.marques) ? sInfoEnrichTarget.marques : [];
          const sinfoMarques = Array.isArray(sinfoMapped.marques) ? sinfoMapped.marques : [];
          if (sinfoMarques.length > 0) {
            // Marques nouvelles (pas dans currentMarques)
            const newM = sinfoMarques.filter(m => !currentMarques.includes(m));
            if (newM.length > 0) {
              conflicts.push({
                field: 'marques', label: 'Marques (à fusionner)',
                current: currentMarques.join(', ') || '(aucune)',
                sinfo:   newM.join(', '),
                useNew: true,
                _mergeMode: true,
                _newMarques: newM
              });
            }
          }

          if (conflicts.length > 0) {
            setSInfoConflicts(conflicts);
            // Stocker les interlocuteurs en attente pour l'étape finale
            setSInfoEnrichTarget(prev => ({ ...prev, _pendingInterlocuteurs: newInterlocuteurs }));
            setSInfoStep(3);
            return;
          }
          // Pas de conflit → on applique directement
          await applySInfoEnrichment(sInfoEnrichTarget, sinfoMapped, newInterlocuteurs, []);
          return;
        }

        // ─── MODE CREATE (par défaut) ────────────────────────
        if (newInterlocuteurs.length > 0) {
          window.showToast({
            title: `${newInterlocuteurs.length} dirigeant${newInterlocuteurs.length > 1 ? 's' : ''} importé${newInterlocuteurs.length > 1 ? 's' : ''}`,
            type: 'success'
          });
        } else {
          window.showToast({title: 'Société importée (sans dirigeants)', type: 'success'});
        }

        setNewCompanyData(prev => ({
          ...prev,
          _sinfo_interlocuteurs: newInterlocuteurs
        }));

        setShowSInfoModal(false);
      };

      // Applique l'enrichissement à la société existante : PUT + création des interlocuteurs.
      // sinfoMapped peut être null si on est en mode 'contacts uniquement' : dans ce cas
      // on n'altère AUCUN champ de la fiche société, on ajoute juste les interlocuteurs.
      const applySInfoEnrichment = async (target, sinfoMapped, interlocuteursToCreate, conflicts) => {
        const isContactsOnly = !sinfoMapped;
        // Construire l'objet à envoyer en PUT : on part du prospect existant et on remplace
        // les champs où l'utilisateur a choisi "useNew"
        const updated = { ...target };

        // Pour chaque conflit résolu (useNew), on applique la valeur SocieteInfo
        for (const c of conflicts) {
          if (!c.useNew) continue;
          if (c._mergeMode && c.field === 'marques') {
            // Fusion : on ajoute les nouvelles marques sans dédoublonner ce qui existe
            const existing = Array.isArray(target.marques) ? target.marques : [];
            updated.marques = [...new Set([...existing, ...c._newMarques])];
          } else if (sinfoMapped) {
            updated[c.field] = sinfoMapped[c.field];
          }
        }

        // Pour les champs qui ne sont PAS en conflit mais où SocieteInfo a une valeur que l'actuelle est vide,
        // on les remplit (on a déjà filtré ce cas dans `conflicts` avec useNew=true par défaut, donc rien à faire ici)

        // Métadonnées d'enrichissement : seulement en mode 'infos' ou 'both'.
        // En mode 'contacts uniquement', on ne touche pas à ces champs.
        if (!isContactsOnly) {
          updated.import_source = updated.import_source || 'SInfo';
          updated.import_ref    = (sinfoMapped && sinfoMapped.siren) || updated.import_ref;
          // import_date : on met à jour pour marquer la date du dernier enrichissement
          updated.import_date   = new Date().toISOString();
        }

        try {
          // PUT du prospect
          const res = await fetch(`${API_URL}/prospects/${target.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify(updated)
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          // POST des nouveaux interlocuteurs
          // RGPD : on marque la source explicitement pour pouvoir justifier l'origine
          // du contact en cas de demande d'opposition / audit.
          const siren = (sinfoMapped && sinfoMapped.siren) || target.siren || target.import_ref || 'inconnu';
          const todayISO = new Date().toISOString().slice(0, 10);
          for (const inter of interlocuteursToCreate) {
            try {
              await fetch(`${API_URL}/prospects/${target.id}/interlocuteurs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
                body: JSON.stringify({
                  civilite: inter.civilite || '', prenom: inter.prenom || '', nom: inter.nom || '',
                  fonction: inter.fonction || '', email: inter.email || '', telephone: inter.telephone || '',
                  telephone_direct: '', mobile: '', notes: '',
                  linkedin_url: inter.linkedin_url || '',
                  source: 'societeinfo',
                  source_detail: `societeinfo:siren=${siren}:date=${todayISO}:contact_id=${inter.id || 'unknown'}`
                })
              });
            } catch (e) { console.warn('[SInfo] Erreur interlocuteur:', e.message); }
          }

          // Feedback + refresh
          const nbConflicts = conflicts.filter(c => c.useNew).length;
          const nbInter = interlocuteursToCreate.length;
          let msg = 'Société enrichie';
          if (nbConflicts > 0) msg += ` (${nbConflicts} champ${nbConflicts > 1 ? 's' : ''})`;
          if (nbInter > 0) msg += ` · ${nbInter} dirigeant${nbInter > 1 ? 's' : ''}`;
          window.showToast({ title: msg, type: 'success' });

          // Mettre à jour le prospect en mémoire et rafraîchir la liste
          setSelectedProspect(updated);
          setProspects(prev => prev.map(p => p.id === target.id ? { ...p, ...updated } : p));
          if (typeof fetchInterlocuteurs === 'function') await fetchInterlocuteurs(target.id);

          setShowSInfoModal(false);
        } catch (err) {
          window.showToast({ title: 'Erreur enrichissement : ' + err.message, type: 'error' });
        }
      };

      // Étape 3 (mode enrich uniquement) : valide la résolution des conflits
      const handleSInfoConfirmConflicts = async () => {
        const target = sInfoEnrichTarget;
        const interlocuteursToCreate = (target && target._pendingInterlocuteurs) || [];
        await applySInfoEnrichment(target, sInfoSelectedCompany._mapped, interlocuteursToCreate, sInfoConflicts);
      };

      // ── Création depuis la modale "Nouvelle société" ──
      const handleNewCompanyChange = (field, value) => {
        setNewCompanyData(d => ({ ...d, [field]: value }));
        // Effacer l'erreur si le champ est rempli
        if (value && newCompanyErrors[field]) {
          setNewCompanyErrors(e => { const n = { ...e }; delete n[field]; return n; });
        }
      };

      const handleCreateFromModal = async () => {
        // Validation
        const errors = {};
        if (!newCompanyData.name.trim()) errors.name = 'Raison sociale requise';
        if (!newCompanyData.statut_societe) errors.statut_societe = 'Type requis';
        if (!newCompanyData.assigned_to) errors.assigned_to = 'Commercial requis';
        if (newCompanyData.siren && !/^\d{9}$/.test(newCompanyData.siren.trim())) errors.siren = 'SIREN = 9 chiffres';
        if (Object.keys(errors).length) {
          setNewCompanyErrors(errors);
          return;
        }

        // Construire le payload à partir d'un prospect vide + les champs de la modale
        const payload = {
          ...getEmptyProspect(),
          name: newCompanyData.name.trim(),
          statut_societe: newCompanyData.statut_societe,
          assigned_to: newCompanyData.assigned_to,
          siren: newCompanyData.siren.trim(),
          tel_standard: newCompanyData.tel_standard.trim(),
          website: newCompanyData.website.trim(),
          adresse: newCompanyData.adresse.trim(),
          code_naf: newCompanyData.code_naf,
          marques: newCompanyData.marques,
          notes: newCompanyData.notes.trim(),
          status: 'Prospection',
          // Traçabilité (import depuis SocieteInfo le cas échéant)
          import_source: newCompanyData.import_source || 'Manuel',
          import_date:   newCompanyData.import_source ? new Date().toISOString() : null,
          import_ref:    newCompanyData.import_ref || null,
        };

        try {
          const res = await fetch(`${API_URL}/prospects`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
          }
          const data = await res.json();
          const created = { ...payload, id: data.id || data.prospect_id };

          // Si des dirigeants SocieteInfo ont été sélectionnés, les créer comme interlocuteurs
          // RGPD : on marque la source pour traçabilité (cohérent avec applySInfoEnrichment).
          const sInfoInter = newCompanyData._sinfo_interlocuteurs || [];
          if (sInfoInter.length > 0) {
            const sirenForLog = payload.siren || payload.import_ref || 'inconnu';
            const todayISO = new Date().toISOString().slice(0, 10);
            for (const inter of sInfoInter) {
              try {
                await fetch(`${API_URL}/prospects/${created.id}/interlocuteurs`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                  },
                  body: JSON.stringify({
                    civilite: inter.civilite || '',
                    prenom:   inter.prenom || '',
                    nom:      inter.nom || '',
                    fonction: inter.fonction || '',
                    email:    inter.email || '',
                    telephone: inter.telephone || '',
                    telephone_direct: inter.telephone_direct || '',
                    mobile:   inter.mobile || '',
                    notes:    inter.notes || '',
                    source: 'societeinfo',
                    source_detail: `societeinfo:siren=${sirenForLog}:date=${todayISO}:contact_id=${inter.id || 'unknown'}`
                  })
                });
              } catch (e) {
                console.warn('[SInfo] Erreur création interlocuteur:', e.message);
              }
            }
          }

          // Fermer la modale, rafraîchir la liste, ouvrir la fiche créée
          setShowNewCompanyModal(false);
          // Si on est sur le Dashboard, basculer sur "Suivi activités" pour voir la fiche
          setIsDashboard(false);
          await fetchProspects();
          setSelectedProspect(created);
          setFormData(created);
          setShowForm(true);
          // Charger les relations pour la nouvelle fiche
          if (typeof fetchInterlocuteurs === 'function') await fetchInterlocuteurs(created.id);
          if (typeof fetchDevis === 'function') await fetchDevis(created.id);
          if (typeof fetchAffaires === 'function') await fetchAffaires(created.id);
        } catch (err) {
          window.showToast({title:'Erreur lors de la création : ' + err.message, type:'error'});
        }
      };


  return {
    showNewCompanyModal, setShowNewCompanyModal, newCompanyData, setNewCompanyData, newCompanyErrors, setNewCompanyErrors, showSInfoModal, setShowSInfoModal, sInfoQuery, setSInfoQuery, sInfoBroadSearch, setSInfoBroadSearch, sInfoCity, setSInfoCity, sInfoPostalCode, setSInfoPostalCode, sInfoLoading, setSInfoLoading, sInfoResults, setSInfoResults, sInfoError, setSInfoError, sInfoStep, setSInfoStep, sInfoSelectedCompany, setSInfoSelectedCompany, sInfoContacts, setSInfoContacts, sInfoSelectedContacts, setSInfoSelectedContacts, sInfoFetchEmails, setSInfoFetchEmails, sInfoMode, setSInfoMode, sInfoEnrichTarget, setSInfoEnrichTarget, sInfoConflicts, setSInfoConflicts, showEnrichChoiceModal, setShowEnrichChoiceModal, enrichChoiceTarget, setEnrichChoiceTarget, openSInfoSearch, openSInfoEnrich, openEnrichChoice, handleSInfoSearch, handleSInfoSelect, handleSInfoConfirmContacts, applySInfoEnrichment, handleSInfoConfirmConflicts, handleNewCompanyChange, handleCreateFromModal,
  };
}
