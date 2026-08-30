import * as React from 'react';
import { styles } from '../lib/styles.js';
import { ACTION_TYPES } from '../lib/constants.js';
import { I, ICONS, IconBtn, calculateTotal, displayName, displayInitials, buildInfoForm, getProspectRealStatus, prospectDisplayName, AdresseAutocomplete } from '../lib/shared.jsx';
import { ActionCompleteModal } from './ActionCompleteModal.jsx';
import { ActivitiesSection } from './ActivitiesSection.jsx';
import { CommercialEditor } from './CommercialEditor.jsx';
import { ProspectForm } from './ProspectForm.jsx';

export function RightPanel({ selectedProspect, activities, nextActions, allActions, statusHistory, onEdit, onUpdateProspect, onDelete, onAddActivity, onAddNextAction, onToggleNextAction, onDeleteNextAction, fetchAllActions, fetchNextActions, fetchAffaires, showForm, formData, onFormChange, onSave, onCancel, newActionType, onActionTypeChange, newActionDate, onActionDateChange, newActionActor, onActionActorChange, newActionContact, onActionContactChange, newActionComment, onActionCommentChange, user, API_URL, interlocuteurs, showInterlocuteurForm, setShowInterlocuteurForm, interlocuteurForm, setInterlocuteurForm, handleSaveInterlocuteur, handleDeleteInterlocuteur, fetchInterlocuteurs, historyExpanded, setHistoryExpanded, historyLoading, setHistoryLoading, historyData, setHistoryData, historyError, setHistoryError, draggedContactId, setDraggedContactId, dragOverContactId, setDragOverContactId, devisList, showDevisForm, setShowDevisForm, editingDevisId, setEditingDevisId, editingDevis, setEditingDevis, devisFormData, setDevisFormData, devisPdfFile, setDevisPdfFile, isUploadingDevisPdf, handleAddDevis, handleAddDevisLibre, handleAddDevisTexasWin, showDevisTypeModal, setShowDevisTypeModal, handleEditDevis, handleSaveDevis, handleQuickDevisStatus, handleAnnulerRemplacer, handleSaveMotifPerte, handleDeleteDevis, handleRattacherDevisAffaire, handleUploadDevisPdf, handleUploadDevisPdfDirect, handleDeleteDevisPDF, affairesList, selectedAffaireId, setSelectedAffaireId, expandedActionId, setExpandedActionId, handleAddAffaire, handleEditAffaire, handleSaveAffaire, handleDeleteAffaire, showAffaireForm, setShowAffaireForm, editingAffaireId, setEditingAffaireId, affaireFormData, setAffaireFormData, affairesActions, handleOpenActionAffaireForm, handleToggleActionAffaire, handleDeleteActionAffaire, showActionAffaireForm, setShowActionAffaireForm, actionAffaireFormData, setActionAffaireFormData, handleSaveActionAffaire, users, codesNaf, prospects, onSelectProspect, fetchProspects, fetchDevis }) {
      const [newActivityType, setNewActivityType] = React.useState('Appel');
      const [newActivityDate, setNewActivityDate] = React.useState(new Date().toISOString().split('T')[0]);
      const [newActivityDesc, setNewActivityDesc] = React.useState('');
      const [newNextActionType, setNewNextActionType] = React.useState('');
      const [newNextActionDate, setNewNextActionDate] = React.useState('');
      const [newActivityActor, setNewActivityActor] = React.useState('');
      const [showAutresContacts, setShowAutresContacts] = React.useState(false);
      const [showAllDevis, setShowAllDevis] = React.useState(false);
      const [infoEdit, setInfoEdit] = React.useState(false);
      const [showCommForm, setShowCommForm] = React.useState(false);
      const [completingAction, setCompletingAction] = React.useState(null); // modale de complétion (résultat + prochaine action)
      const [commForm, setCommForm] = React.useState({action_type:'Appel',planned_date:new Date().toISOString().split('T')[0],actor:'',contact:'',comment:'',contexte_val:'',priority:1});
      const [infoForm, setInfoForm] = React.useState({
        name: selectedProspect?.name||'',
        adresse: selectedProspect?.adresse||'',
        website: selectedProspect?.website||'',
        tel_standard: selectedProspect?.tel_standard||'',
        assigned_to: selectedProspect?.assigned_to||'',
        notes: selectedProspect?.notes||'',
        siren: selectedProspect?.siren||'',
        code_naf: selectedProspect?.code_naf||'',
        created_at: selectedProspect?.created_at ? new Date(selectedProspect.created_at).toISOString().split('T')[0] : '',
        marques: Array.isArray(selectedProspect?.marques) ? selectedProspect.marques : [],
      });

      // ── Groupe de sociétés (rattachement holding/filiales) ──
      const [groupeAddMode, setGroupeAddMode] = React.useState(null); // 'parent' | 'filiale' | null
      const [groupeSearch, setGroupeSearch] = React.useState('');
      const [groupeOpen, setGroupeOpen] = React.useState(false); // accordéon replié par défaut

      // ── Contacts : dépliage fiche + association à d'autres sociétés ──
      const [expandedContactId, setExpandedContactId] = React.useState(null);
      const [assocOpenFor, setAssocOpenFor] = React.useState(null); // id du contact dont la recherche société est ouverte
      const [assocSearch, setAssocSearch] = React.useState('');

      // ── Journal de notes horodatées (remplace le champ libre prospects.notes) ──
      const [notesList, setNotesList] = React.useState([]);
      const [noteInput, setNoteInput] = React.useState('');
      const [editingNoteId, setEditingNoteId] = React.useState(null);
      const [editingNoteText, setEditingNoteText] = React.useState('');
      const fetchNotes = async (pid) => {
        try {
          const r = await fetch(`${API_URL}/prospects/${pid}/notes`, { headers: { 'Authorization': `Bearer ${user.token}` } });
          const data = await r.json();
          setNotesList(Array.isArray(data) ? data : []);
        } catch (_) { setNotesList([]); }
      };
      React.useEffect(() => {
        setNotesList([]); setNoteInput(''); setEditingNoteId(null);
        if (selectedProspect?.id) fetchNotes(selectedProspect.id);
      }, [selectedProspect?.id]);
      const handleAddNote = async () => {
        const contenu = noteInput.trim();
        if (!contenu) return;
        try {
          const r = await fetch(`${API_URL}/prospects/${selectedProspect.id}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
            body: JSON.stringify({ contenu })
          });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          setNoteInput('');
          fetchNotes(selectedProspect.id);
        } catch (err) { window.showToast({ title: 'Erreur : ' + err.message, type: 'error' }); }
      };
      const handleSaveNote = async (noteId) => {
        const contenu = editingNoteText.trim();
        if (!contenu) return;
        try {
          const r = await fetch(`${API_URL}/prospects/${selectedProspect.id}/notes/${noteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
            body: JSON.stringify({ contenu })
          });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          setEditingNoteId(null);
          fetchNotes(selectedProspect.id);
        } catch (err) { window.showToast({ title: 'Erreur : ' + err.message, type: 'error' }); }
      };
      const handleDeleteNote = async (noteId) => {
        if (!window.confirm('Supprimer cette note ?')) return;
        try {
          const r = await fetch(`${API_URL}/prospects/${selectedProspect.id}/notes/${noteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          fetchNotes(selectedProspect.id);
        } catch (err) { window.showToast({ title: 'Erreur : ' + err.message, type: 'error' }); }
      };
      // Transformer une note en action : bascule sur l'onglet Actions/Tâches avec le
      // formulaire « Nouvelle action » prérempli du contenu de la note.
      const handleNoteToAction = (n) => {
        setClientTab('communication');
        setCommForm({ ...commForm, comment: n.contenu });
        setShowCommForm(true);
      };

      // ── Anti-doublon contacts : suggestions de fiches existantes pendant la saisie ──
      const [dupSuggestions, setDupSuggestions] = React.useState([]);
      React.useEffect(() => {
        // Uniquement en CRÉATION de contact (pas en édition)
        if (!showInterlocuteurForm || interlocuteurForm.id) { setDupSuggestions([]); return; }
        const email = (interlocuteurForm.email || '').trim();
        const nomComplet = (((interlocuteurForm.prenom || '') + ' ' + (interlocuteurForm.nom || '')).trim());
        const q = email.length >= 2 ? email : nomComplet;
        if (q.length < 2) { setDupSuggestions([]); return; }
        const t = setTimeout(async () => {
          try {
            const r = await fetch(`${API_URL}/interlocuteurs/search?q=${encodeURIComponent(q)}&exclude_prospect_id=${selectedProspect?.id || 0}`,
              { headers: { 'Authorization': `Bearer ${user.token}` } });
            const data = await r.json();
            setDupSuggestions(Array.isArray(data) ? data : []);
          } catch (_) { setDupSuggestions([]); }
        }, 350);
        return () => clearTimeout(t);
      }, [interlocuteurForm.nom, interlocuteurForm.prenom, interlocuteurForm.email, showInterlocuteurForm, interlocuteurForm.id]);

      // ── Rattacher un contact EXISTANT (ex. d'un partenaire/prestataire) à cette société ──
      // Action délibérée : recherche parmi toutes les fiches, puis rattachement (pas de doublon).
      const [showAttachContact, setShowAttachContact] = React.useState(false);
      const [attachSearch, setAttachSearch] = React.useState('');
      const [attachResults, setAttachResults] = React.useState([]);
      React.useEffect(() => {
        if (!showAttachContact) { setAttachResults([]); return; }
        const q = attachSearch.trim();
        if (q.length < 2) { setAttachResults([]); return; }
        const t = setTimeout(async () => {
          try {
            const r = await fetch(`${API_URL}/interlocuteurs/search?q=${encodeURIComponent(q)}&exclude_prospect_id=${selectedProspect?.id || 0}`,
              { headers: { 'Authorization': `Bearer ${user.token}` } });
            const d = await r.json();
            setAttachResults(Array.isArray(d) ? d : []);
          } catch (_) { setAttachResults([]); }
        }, 300);
        return () => clearTimeout(t);
      }, [attachSearch, showAttachContact, selectedProspect?.id]);
      const attachExistingContact = async (contact) => {
        try {
          const fonction = Array.isArray(contact.societes) && contact.societes[0] ? (contact.societes[0].fonction || '') : '';
          const r = await fetch(`${API_URL}/prospects/${selectedProspect.id}/interlocuteurs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
            body: JSON.stringify({ existing_interlocuteur_id: contact.id, fonction })
          });
          if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + r.status)); }
          window.showToast({ title: 'Contact rattaché à la société', type: 'success' });
          setShowAttachContact(false); setAttachSearch(''); setAttachResults([]);
          if (typeof fetchInterlocuteurs === 'function') fetchInterlocuteurs(selectedProspect.id);
        } catch (err) { window.showToast({ title: 'Erreur : ' + err.message, type: 'error' }); }
      };

      // Rattacher une fiche contact existante à la société courante (pas de doublon créé)
      const handleRattacherContact = async (contact) => {
        try {
          const r = await fetch(`${API_URL}/prospects/${selectedProspect.id}/interlocuteurs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
            body: JSON.stringify({ existing_interlocuteur_id: contact.id, fonction: interlocuteurForm.fonction || '', principal: !!interlocuteurForm.principal, decideur: !!interlocuteurForm.decideur })
          });
          if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + r.status)); }
          window.showToast({ title: 'Contact existant rattaché à la société', type: 'success' });
          setShowInterlocuteurForm(false);
          setDupSuggestions([]);
          if (typeof fetchInterlocuteurs === 'function') fetchInterlocuteurs(selectedProspect.id);
        } catch (err) { window.showToast({ title: 'Erreur : ' + err.message, type: 'error' }); }
      };

      // ── Onglets fiche client ──
      const [clientTab, setClientTab] = React.useState('infos');
      const [clientLicences, setClientLicences] = React.useState([]);
      const [clientBoutiques, setClientBoutiques] = React.useState([]);
      const [clientMateriel, setClientMateriel] = React.useState([]);
      const [refLicences, setRefLicences] = React.useState([]);
      const [refMaterielTypes, setRefMaterielTypes] = React.useState([]);
      const [clientDataLoaded, setClientDataLoaded] = React.useState(false);

      // Modale ajout/modif licence
      const [showLicenceForm, setShowLicenceForm] = React.useState(false);
      const [showModuleDropdown, setShowModuleDropdown] = React.useState(false);
      const [editingLicence, setEditingLicence] = React.useState(null);
      const [licenceForm, setLicenceForm] = React.useState({licence_id:'',nb_utilisateurs:0,facturation:'saas_mensuel',hebergement:'cloud',maintenance:'aucune',date_contrat:'',notes:''});

      // Modale ajout/modif boutique
      const [showBoutiqueForm, setShowBoutiqueForm] = React.useState(false);
      const [editingBoutique, setEditingBoutique] = React.useState(null);
      const [boutiqueForm, setBoutiqueForm] = React.useState({nom:'',adresse:'',ville:'',cp:'',telephone:'',responsable_id:'',notes:''});

      // Modale ajout/modif site (établissement)
      const [clientSites, setClientSites] = React.useState([]);
      const [showSiteForm, setShowSiteForm] = React.useState(false);
      const [editingSite, setEditingSite] = React.useState(null);
      const [siteForm, setSiteForm] = React.useState({nom:'',type:'Siège',adresse:'',ville:'',cp:'',telephone:'',responsable_id:'',notes:''});
      const SITE_TYPES = ['Siège','Entrepôt','Showroom','Bureau','Dépôt','Autre'];

      // Modale ajout/modif matériel
      const [showMaterielForm, setShowMaterielForm] = React.useState(false);
      const [editingMateriel, setEditingMateriel] = React.useState(null);
      const [materielForm, setMaterielForm] = React.useState({boutique_id:'',materiel_type_id:'',marque:'',modele:'',os:'',version_os:'',nb_unites:1,localisation:'',date_achat:'',notes:''});

      const loadClientData = async (pid) => {
        if (!pid) return;
        try {
          const headers = { 'Authorization': `Bearer ${user.token}` };
          // Chaque appel est INDÉPENDANT : un échec (ex. endpoint récent pas encore
          // déployé, table absente…) ne doit PAS vider les autres sections. Sans ce
          // catch par appel, un seul 404/500 faisait tomber tout le lot Promise.all
          // → boutiques/licences/matériel affichés vides alors que les données existent.
          const j = (url) => fetch(url, {headers}).then(r => r.ok ? r.json() : []).catch(() => []);
          const [lics, bouts, sites, mats, refL, refM] = await Promise.all([
            j(`${API_URL}/prospects/${pid}/licences`),
            j(`${API_URL}/prospects/${pid}/boutiques`),
            j(`${API_URL}/prospects/${pid}/sites`),
            j(`${API_URL}/prospects/${pid}/materiel`),
            j(`${API_URL}/licences`),
            j(`${API_URL}/materiel-types`),
          ]);
          setClientLicences(Array.isArray(lics)?lics:[]);
          setClientBoutiques(Array.isArray(bouts)?bouts:[]);
          setClientSites(Array.isArray(sites)?sites:[]);
          setClientMateriel(Array.isArray(mats)?mats:[]);
          setRefLicences(Array.isArray(refL)?refL:[]);
          setRefMaterielTypes(Array.isArray(refM)?refM:[]);
          setClientDataLoaded(true);
        } catch(err) { console.error('Erreur loadClientData:', err); }
      };

      // Charger quand on arrive sur un client
      React.useEffect(() => {
        setClientDataLoaded(false);
        setClientTab('infos');
        setInfoEdit(false);
        setInfoForm(buildInfoForm(selectedProspect));
      }, [selectedProspect?.id]);

      // Re-synchronise infoForm quand le CONTENU de la fiche change sans changement d'id
      // (ex: enrichissement SocieteInfo qui met à jour la même société). Sans cet effet,
      // l'écran restait figé jusqu'à un rechargement manuel. On ne réécrit jamais pendant
      // une édition manuelle en cours (infoEdit) pour ne pas écraser la saisie de l'utilisateur.
      React.useEffect(() => {
        if (infoEdit) return;
        setInfoForm(buildInfoForm(selectedProspect));
      }, [
        selectedProspect?.name, selectedProspect?.adresse, selectedProspect?.website,
        selectedProspect?.tel_standard, selectedProspect?.code_naf, selectedProspect?.notes,
        selectedProspect?.marques, selectedProspect?.import_date,
      ]);

      React.useEffect(() => {
        if (selectedProspect?.statut_societe === 'Client') {
          loadClientData(selectedProspect.id);
        }
      }, [clientTab, selectedProspect?.id]);

      // Sauvegarder licence
      const handleSaveLicence = async () => {
        try {
          const headers = {'Content-Type':'application/json','Authorization':`Bearer ${user.token}`};
          const pid = selectedProspect.id;
          if (editingLicence) {
            await fetch(`${API_URL}/licences-client/${editingLicence.id}`, {method:'PUT',headers,body:JSON.stringify(licenceForm)});
          } else {
            await fetch(`${API_URL}/prospects/${pid}/licences`, {method:'POST',headers,body:JSON.stringify(licenceForm)});
          }
          setShowLicenceForm(false); setEditingLicence(null);
          setClientLicences([]); setClientDataLoaded(false); loadClientData(pid);
        } catch(err) { window.showToast({title:'Erreur: '+err.message, type:'error'}); }
      };

      const handleDeleteLicence = async (id) => {
        if (!window.confirm('Supprimer cette licence ?')) return;
        await fetch(`${API_URL}/licences-client/${id}`, {method:'DELETE',headers:{'Authorization':`Bearer ${user.token}`}});
        setClientDataLoaded(false); loadClientData(selectedProspect.id);
      };

      // Sauvegarder boutique
      const handleSaveBoutique = async () => {
        try {
          const headers = {'Content-Type':'application/json','Authorization':`Bearer ${user.token}`};
          const pid = selectedProspect.id;
          if (editingBoutique) {
            await fetch(`${API_URL}/boutiques/${editingBoutique.id}`, {method:'PUT',headers,body:JSON.stringify(boutiqueForm)});
          } else {
            await fetch(`${API_URL}/prospects/${pid}/boutiques`, {method:'POST',headers,body:JSON.stringify(boutiqueForm)});
          }
          setShowBoutiqueForm(false); setEditingBoutique(null);
          setClientBoutiques([]); setClientDataLoaded(false); loadClientData(pid);
        } catch(err) { window.showToast({title:'Erreur: '+err.message, type:'error'}); }
      };

      const handleDeleteBoutique = async (id) => {
        if (!window.confirm('Supprimer cette boutique ?')) return;
        await fetch(`${API_URL}/boutiques/${id}`, {method:'DELETE',headers:{'Authorization':`Bearer ${user.token}`}});
        setClientDataLoaded(false); loadClientData(selectedProspect.id);
      };

      // Sauvegarder site (établissement)
      const handleSaveSite = async () => {
        try {
          const headers = {'Content-Type':'application/json','Authorization':`Bearer ${user.token}`};
          const pid = selectedProspect.id;
          if (editingSite) {
            await fetch(`${API_URL}/sites/${editingSite.id}`, {method:'PUT',headers,body:JSON.stringify(siteForm)});
          } else {
            await fetch(`${API_URL}/prospects/${pid}/sites`, {method:'POST',headers,body:JSON.stringify(siteForm)});
          }
          setShowSiteForm(false); setEditingSite(null);
          setClientSites([]); setClientDataLoaded(false); loadClientData(pid);
        } catch(err) { window.showToast({title:'Erreur: '+err.message, type:'error'}); }
      };

      const handleDeleteSite = async (id) => {
        if (!window.confirm('Supprimer ce site ?')) return;
        await fetch(`${API_URL}/sites/${id}`, {method:'DELETE',headers:{'Authorization':`Bearer ${user.token}`}});
        setClientDataLoaded(false); loadClientData(selectedProspect.id);
      };

      // Sauvegarder matériel
      const handleSaveMateriel = async () => {
        try {
          const headers = {'Content-Type':'application/json','Authorization':`Bearer ${user.token}`};
          const pid = selectedProspect.id;
          if (editingMateriel) {
            await fetch(`${API_URL}/materiel-client/${editingMateriel.id}`, {method:'PUT',headers,body:JSON.stringify(materielForm)});
          } else {
            await fetch(`${API_URL}/prospects/${pid}/materiel`, {method:'POST',headers,body:JSON.stringify(materielForm)});
          }
          setShowMaterielForm(false); setEditingMateriel(null);
          setClientMateriel([]); setClientDataLoaded(false); loadClientData(pid);
        } catch(err) { window.showToast({title:'Erreur: '+err.message, type:'error'}); }
      };

      const handleDeleteMateriel = async (id) => {
        if (!window.confirm('Supprimer ce matériel ?')) return;
        await fetch(`${API_URL}/materiel-client/${id}`, {method:'DELETE',headers:{'Authorization':`Bearer ${user.token}`}});
        setClientDataLoaded(false); loadClientData(selectedProspect.id);
      };

      const saveInfos = async () => {
        try {
          await fetch(`${API_URL}/prospects/${selectedProspect.id}`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
            body: JSON.stringify({...selectedProspect, ...infoForm})
          });
          onUpdateProspect({...selectedProspect, ...infoForm});
          setInfoEdit(false);
        } catch(err) { window.showToast({title:'Erreur: '+err.message, type:'error'}); }
      };

      // ── Attribution commercial ──
      const [attribCommercial, setAttribCommercial] = React.useState(selectedProspect?.assigned_to || '');
      const [attribLoading, setAttribLoading] = React.useState(false);
      const [attribResult, setAttribResult] = React.useState(null);
      const [showAllContacts, setShowAllContacts] = React.useState(false);

      const handleAttribuer = async () => {
        if (!attribCommercial) return;
        setAttribLoading(true);
        setAttribResult(null);
        try {
          const res = await fetch(`${API_URL}/prospects/${selectedProspect.id}/attribuer`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
            body: JSON.stringify({ commercial_name: attribCommercial })
          });
          if (!res.ok) throw new Error('Erreur serveur');
          onUpdateProspect({...selectedProspect, assigned_to: attribCommercial});
          setInfoForm(f => ({...f, assigned_to: attribCommercial}));
          setAttribResult({ ok: true, msg: `✅ Attribué à ${attribCommercial} — mail envoyé` });
        } catch(e) {
          setAttribResult({ ok: false, msg: '❌ ' + e.message });
        } finally {
          setAttribLoading(false);
        }
      };

      const handleAddActivity = () => {
        if (newActivityDesc.trim()) {
          onAddActivity(selectedProspect.id, newActivityType, newActivityDesc);
          setNewActivityDesc('');
        }
      };

      if (showForm && !formData.id) {
        return <ProspectForm formData={formData} onFormChange={onFormChange} onSave={onSave} onCancel={onCancel} selectedProspect={selectedProspect} user={user} API_URL={API_URL} interlocuteurs={interlocuteurs} showInterlocuteurForm={showInterlocuteurForm} setShowInterlocuteurForm={setShowInterlocuteurForm} interlocuteurForm={interlocuteurForm} setInterlocuteurForm={setInterlocuteurForm} handleSaveInterlocuteur={handleSaveInterlocuteur} handleDeleteInterlocuteur={handleDeleteInterlocuteur} devisList={devisList} showDevisForm={showDevisForm} setShowDevisForm={setShowDevisForm} editingDevisId={editingDevisId} setEditingDevisId={setEditingDevisId} editingDevis={editingDevis} setEditingDevis={setEditingDevis} devisFormData={devisFormData} setDevisFormData={setDevisFormData} devisPdfFile={devisPdfFile} setDevisPdfFile={setDevisPdfFile} isUploadingDevisPdf={isUploadingDevisPdf} handleAddDevis={handleAddDevis} handleAddDevisLibre={handleAddDevisLibre} handleAddDevisTexasWin={handleAddDevisTexasWin} showDevisTypeModal={showDevisTypeModal} setShowDevisTypeModal={setShowDevisTypeModal} handleEditDevis={handleEditDevis} handleSaveDevis={handleSaveDevis} handleDeleteDevis={handleDeleteDevis} handleUploadDevisPdf={handleUploadDevisPdf} handleDeleteDevisPDF={handleDeleteDevisPDF} codesNaf={codesNaf} />;
      }

      if (!selectedProspect) {
        return <div style={styles.rightPanel}><p style={styles.emptyState}>Sélectionnez un prospect</p></div>;
      }

      const total = calculateTotal(selectedProspect);
      const expectedValue = total * (selectedProspect.chance_percent / 100);

      // ── Helpers header ──
      const initials = selectedProspect.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
      const statutColors = {Client:'var(--tw-teal)',Prospect:'var(--warning)',Suspect:'#999',Holding:'#0d7fb0',Prestataire:'#7b5ea7'};
      const statutBgs = {Client:'var(--tw-teal-light)',Prospect:'#fff8e1',Suspect:'#f5f5f5',Holding:'#e8f6fc',Prestataire:'#f1ecfa'};
      const realStatus = getProspectRealStatus(affairesList, devisList);

      return (
        <div style={styles.rightPanel}>
          <div style={styles.prospectDetail}>

            {/* ── HEADER PROSPECT/CLIENT (refonte 2026) ── */}
            <div style={{background:'white',border:'0.5px solid var(--tw-border)',borderRadius:'12px',padding:'18px 20px',marginBottom:'12px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:'14px'}}>
                {/* Avatar carré coloré (au lieu de gradient) */}
                <div style={{width:'48px',height:'48px',borderRadius:'10px',background:'var(--tw-teal)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',fontWeight:600,color:'white',flexShrink:0,letterSpacing:'-.3px'}}>{initials}</div>

                {/* Bloc infos */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap',marginBottom:'4px'}}>
                    <span style={{fontSize:'18px',fontWeight:500,color:'var(--tw-ink)',letterSpacing:'-.2px'}}>{prospectDisplayName(selectedProspect)}</span>
                    {/* Pill statut (pas de gros dropdown coloré) */}
                    <select value={selectedProspect.statut_societe||'Prospect'}
                      onChange={async (e) => {
                        const newStatut = e.target.value;
                        try {
                          await fetch(`${API_URL}/prospects/${selectedProspect.id}`, {
                            method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
                            body: JSON.stringify({...selectedProspect, statut_societe: newStatut})
                          });
                          onUpdateProspect({...selectedProspect, statut_societe: newStatut});
                        } catch(err) { window.showToast({title:'Erreur: '+err.message, type:'error'}); }
                      }}
                      style={{fontSize:'11px',fontWeight:500,cursor:'pointer',padding:'3px 10px',borderRadius:'12px',border:'none',
                        color:statutColors[selectedProspect.statut_societe]||'#999',
                        background:statutBgs[selectedProspect.statut_societe]||'#f5f5f5',
                        fontFamily:"'Inter',sans-serif",appearance:'none',paddingRight:'22px',backgroundImage:'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%278%27 height=%278%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27currentColor%27 stroke-width=%273%27><polyline points=%276 9 12 15 18 9%27/></svg>")',backgroundRepeat:'no-repeat',backgroundPosition:'right 8px center'}}>
                      <option value="Holding">Holding</option>
                      <option value="Suspect">Suspect</option>
                      <option value="Prospect">Prospect</option>
                      <option value="Client">Client</option>
                      <option value="Prestataire">Prestataire</option>
                    </select>
                    {/* Pastille cible : enrichir depuis SocieteInfo */}
                    <button
                      type="button"
                      title="Enrichir cette fiche depuis SocieteInfo"
                      onClick={() => {
                        // Ouvre la modale de choix (infos / contacts) si on a un SIREN,
                        // sinon part directement sur le flow classique de recherche.
                        if (window.openEnrichChoice) window.openEnrichChoice(selectedProspect);
                        else if (window.openSInfoEnrich) window.openSInfoEnrich(selectedProspect);
                      }}
                      style={{
                        display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'5px',
                        height:'24px',padding:'0 10px 0 7px',
                        background:'white',
                        border:'0.5px solid #f0c4c4',
                        borderRadius:'12px',
                        cursor:'pointer',
                        fontSize:'11px',fontWeight:600,color:'#a52d2d',fontFamily:"'Inter',sans-serif",
                        transition:'all .15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fef3f2'; e.currentTarget.style.borderColor = '#a52d2d'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#f0c4c4'; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a52d2d" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <circle cx="12" cy="12" r="6"/>
                        <circle cx="12" cy="12" r="2" fill="#a52d2d"/>
                      </svg>
                      Enrichir
                    </button>
                    {/* Badges client (style discret) */}
                    {selectedProspect.statut_societe === 'Client' && clientLicences.some(l=>l.licence_type==='perpetuelle') && (
                      <span style={{fontSize:'11px',fontWeight:500,padding:'2px 9px',borderRadius:'12px',background:'#fff8e1',color:'#b06e2a'}}>Licence perpétuelle</span>
                    )}
                    {selectedProspect.statut_societe === 'Client' && clientLicences.some(l=>l.licence_type==='saas') && (
                      <span style={{fontSize:'11px',fontWeight:500,padding:'2px 9px',borderRadius:'12px',background:'#d3edff',color:'#0a5085'}}>SaaS</span>
                    )}
                    {selectedProspect.statut_societe === 'Client' && clientLicences.some(l=>l.maintenance==='A3') && (
                      <span style={{fontSize:'11px',fontWeight:500,padding:'2px 9px',borderRadius:'12px',background:'#d8f0e3',color:'#0f6e56'}}>Maintenance A3</span>
                    )}
                    {selectedProspect.statut_societe === 'Client' && clientLicences.some(l=>l.maintenance==='A2') && !clientLicences.some(l=>l.maintenance==='A3') && (
                      <span style={{fontSize:'11px',fontWeight:500,padding:'2px 9px',borderRadius:'12px',background:'var(--tw-teal-light)',color:'var(--tw-teal)'}}>Maintenance A2</span>
                    )}
                  </div>

                  {/* Ligne 2 : contact principal */}
                  <div style={{fontSize:'13px',color:'var(--tw-slate)'}}>
                    {interlocuteurs.find(i=>i.principal)?.nom && <span>{interlocuteurs.find(i=>i.principal).nom}</span>}
                    {interlocuteurs.find(i=>i.principal)?.email && <span style={{marginLeft:'6px',color:'var(--tw-muted)'}}>· {interlocuteurs.find(i=>i.principal).email}</span>}
                    {selectedProspect.tel_standard && <span style={{marginLeft:'6px',color:'var(--tw-muted)'}}>· {selectedProspect.tel_standard}</span>}
                  </div>

                  {/* Ligne 3 : contexte (affaire en cours + commercial fusionnés) */}
                  <div style={{fontSize:'12px',color:'var(--tw-muted)',marginTop:'6px',display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
                    {realStatus && (
                      <span>
                        <span style={{color:'var(--tw-slate)'}}>Affaire :</span> <strong style={{color:'var(--tw-ink)',fontWeight:500}}>{realStatus.affaireName}</strong>
                        <span style={{marginLeft:'6px',fontWeight:500,color:realStatus.devisStatus==='Gagné'?'var(--tw-green)':realStatus.devisStatus==='Perdu'?'var(--tw-red)':'var(--tw-teal)'}}>{realStatus.devisStatus}</span>
                        {realStatus.probability > 0 && <span style={{marginLeft:'4px',color:'var(--tw-teal)',fontWeight:500}}>({realStatus.probability}%)</span>}
                        {realStatus.quoteDate && <span style={{marginLeft:'6px'}}>depuis le {new Date(realStatus.quoteDate).toLocaleDateString('fr-FR')}</span>}
                      </span>
                    )}
                    {realStatus && <span style={{color:'var(--tw-border)'}}>·</span>}
                    {/* Commercial : éditable par les admins, lecture seule pour les autres */}
                    {(['Christian','Frédéric','Frederic'].includes(user?.name)) ? (
                      <CommercialEditor
                        selectedProspect={selectedProspect}
                        users={users}
                        user={user}
                        API_URL={API_URL}
                        onUpdateProspect={onUpdateProspect}
                      />
                    ) : (
                      <span><span style={{color:'var(--tw-slate)'}}>Commercial :</span> <strong style={{color:selectedProspect.assigned_to?'var(--tw-ink)':'var(--tw-muted)',fontWeight:500}}>{selectedProspect.assigned_to || 'Non attribué'}</strong></span>
                    )}
                  </div>
                </div>

                {/* KPIs client (compact) */}
                {selectedProspect.statut_societe === 'Client' && (
                  <div style={{display:'flex',gap:'18px',flexShrink:0,paddingTop:'4px'}}>
                    {[
                      {val:clientBoutiques.length, lbl:'Boutiques'},
                      {val:clientLicences.length,  lbl:'Modules'},
                      {val:clientMateriel.length,  lbl:'Appareils'},
                    ].map(k => (
                      <div key={k.lbl} style={{textAlign:'center'}}>
                        <div style={{fontSize:'18px',fontWeight:500,color:'var(--tw-ink)',fontVariantNumeric:'tabular-nums'}}>{k.val}</div>
                        <div style={{fontSize:'10px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',marginTop:'2px'}}>{k.lbl}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bouton supprimer (discret avec icône SVG) */}
                <button onClick={() => onDelete(selectedProspect.id)}
                  title="Supprimer la société"
                  aria-label="Supprimer la société"
                  style={{flexShrink:0,width:'30px',height:'30px',borderRadius:'8px',background:'transparent',border:'0.5px solid var(--tw-border)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tw-muted)',transition:'all .15s'}}
                  onMouseEnter={(e) => { e.currentTarget.style.background='#fef2f2'; e.currentTarget.style.color='var(--tw-red)'; e.currentTarget.style.borderColor='#fecaca'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--tw-muted)'; e.currentTarget.style.borderColor='var(--tw-border)'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </div>
            </div>


          </div>

          {/* ── ONGLETS (Infos, Affaires, Communication + Client: Licences, Boutiques, Matériel) ── */}
          {(() => {
            const isClient = selectedProspect.statut_societe === 'Client';
            // Icônes SVG inline pour cohérence visuelle (au lieu d'images png + emojis)
            const TabIcon = ({path, size=14, fill='none', stroke='currentColor'}) => React.createElement('svg', {width:size, height:size, viewBox:'0 0 24 24', fill, stroke, strokeWidth:1.8, strokeLinecap:'round', strokeLinejoin:'round'}, path);
            const ICON = {
              info:    React.createElement(React.Fragment, null, React.createElement('circle',{cx:12,cy:12,r:10}), React.createElement('path',{d:'M12 16v-4M12 8h.01'})),
              key:     React.createElement(React.Fragment, null, React.createElement('path',{d:'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'})),
              bag:     React.createElement(React.Fragment, null, React.createElement('path',{d:'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0'})),
              hardware:React.createElement(React.Fragment, null, React.createElement('rect',{x:2,y:3,width:20,height:14,rx:2}), React.createElement('line',{x1:8,y1:21,x2:16,y2:21}), React.createElement('line',{x1:12,y1:17,x2:12,y2:21})),
              folder:  React.createElement('path',{d:'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'}),
              users:   React.createElement(React.Fragment, null, React.createElement('path',{d:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'}), React.createElement('circle',{cx:9,cy:7,r:4}), React.createElement('path',{d:'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'})),
              actions: React.createElement(React.Fragment, null, React.createElement('path',{d:'M9 11l3 3L22 4'}), React.createElement('path',{d:'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'})),
              building:React.createElement(React.Fragment, null, React.createElement('path',{d:'M3 21h18'}), React.createElement('path',{d:'M6 21V7l6-4 6 4v14'}), React.createElement('path',{d:'M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01'})),
            };
            return (
            <div style={{marginBottom:'16px',background:'white',border:'0.5px solid var(--tw-border)',borderRadius:'12px',overflow:'hidden'}}>
              {/* Nav onglets : style moderne, bordure inférieure simple */}
              <div style={{display:'flex',gap:'2px',borderBottom:'0.5px solid var(--tw-border)',overflowX:'auto',padding:'0 14px'}}>
                {(() => {
                  const nbAffaires = affairesList.filter(a => a.statut_global !== 'Perdu' && a.statut_global !== 'Gagné').length;
                  const tabs = [
                    {id:'infos',        label:'Informations',   icon: ICON.info},
                    {id:'contacts',     label:'Contacts',       icon: ICON.users, count: (interlocuteurs || []).length},
                    ...(isClient ? [
                      {id:'licences',  label:'Licences',  icon: ICON.key,      count: clientLicences.length},
                      // Sites et Boutiques côte à côte
                      {id:'sites',     label:'Sites',     icon: ICON.building, count: clientSites.length},
                      {id:'boutiques', label:'Boutiques', icon: ICON.bag,      count: clientBoutiques.length},
                      {id:'materiel',  label:'Matériel',  icon: ICON.hardware, count: clientMateriel.length},
                    ] : [
                      // Non-client : pas de boutiques/licences/matériel, mais les sites restent utiles
                      {id:'sites',     label:'Sites',     icon: ICON.building, count: clientSites.length},
                    ]),
                    // Dossier rempli bleu s'il y a au moins une affaire en cours, fond blanc sinon
                    {id:'affaires',     label:'Affaires',       icon: ICON.folder,  count: nbAffaires,
                      iconFill: nbAffaires > 0 ? '#10a0dc' : 'white',
                      iconStroke: nbAffaires > 0 ? '#10a0dc' : undefined},
                    {id:'communication',label:'Actions / Tâches', icon: ICON.actions},
                  ];
                  return tabs;
                })().map(t => {
                  const active = clientTab === t.id;
                  return (
                    <button key={t.id}
                      onClick={() => setClientTab(t.id)}
                      style={{padding:'8px 13px',fontFamily:"'Inter',sans-serif",fontSize:'13px',
                        fontWeight: active ? 600 : 500,
                        border: active ? '0.5px solid rgba(26,86,219,.25)' : '0.5px solid transparent',
                        background: active ? 'var(--primary-soft)' : 'transparent',
                        color: active ? 'var(--tw-teal)' : 'var(--tw-slate)',
                        borderRadius:'8px',
                        margin:'7px 0',
                        cursor:'pointer',whiteSpace:'nowrap',transition:'background .15s, color .15s, border-color .15s',
                        display:'flex',alignItems:'center',gap:'6px'}}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-hover)'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <TabIcon path={t.icon} fill={t.iconFill} stroke={t.iconStroke}/>
                      {t.label}
                      {t.count > 0 && (
                        <span style={{fontSize:'11px',fontWeight:600,padding:'1px 7px',borderRadius:'10px',
                          background: active ? 'var(--tw-teal)' : (t.id === 'affaires' ? 'var(--tw-teal)' : 'var(--tw-bg)'),
                          color: active ? 'white' : (t.id === 'affaires' ? 'white' : 'var(--tw-ink)'),
                          border: (active || t.id === 'affaires') ? 'none' : '0.5px solid var(--tw-border)'}}>{t.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{padding:'18px 16px'}}>

                {/* ── Onglet Infos ── */}
                {clientTab === 'infos' && (
                  <div>
                    {/* Coordonnées */}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                      <div style={{fontSize:'11.5px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--tw-slate)'}}>Coordonnées société</div>
                      {!infoEdit
                        ? <button onClick={() => setInfoEdit(true)} style={{padding:'4px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',fontSize:'12px',cursor:'pointer',color:'var(--tw-slate)',fontFamily:"'Inter',sans-serif"}}>✏️ Modifier</button>
                        : <div style={{display:'flex',gap:'8px'}}>
                            <button onClick={() => setInfoEdit(false)} style={{padding:'4px 12px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',fontSize:'12px',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>Annuler</button>
                            <button onClick={saveInfos} style={{padding:'4px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>✓ Enregistrer</button>
                          </div>
                      }
                    </div>
                    {(() => {
                      const champs = [
                        {lbl:'Raison sociale', field:'name'},
                        {lbl:'N° SIREN', field:'siren'},
                        {lbl:'Adresse siège', field:'adresse'},
                        {lbl:'Site web', field:'website'},
                        {lbl:'Téléphone standard', field:'tel_standard'},
                      ];
                      const rempli = (f) => !!(infoForm[f] && String(infoForm[f]).trim());
                      const lblStyle = {fontSize:'11.5px',color:'var(--tw-slate)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'4px'};
                      // En lecture, les champs vides sont repliés dans une ligne compacte
                      // « Non renseigné : ... » plutôt qu'affichés avec un « — » qui allonge la fiche.
                      const manquants = infoEdit ? [] : [
                        ...champs.filter(f => !rempli(f.field)).map(f => f.lbl),
                        ...(!rempli('code_naf') ? ['Code NAF'] : []),
                        ...(!rempli('created_at') ? ['Date entrée en relation'] : []),
                        ...((infoForm.marques||[]).length === 0 ? ['Marques'] : []),
                      ];
                      return (
                        <React.Fragment>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px',marginBottom: manquants.length ? '10px' : '20px'}}>
                            {champs.filter(f => infoEdit || rempli(f.field)).map(f => (
                              <div key={f.field}>
                                <div style={lblStyle}>{f.lbl}</div>
                                {infoEdit
                                  ? (f.field === 'adresse'
                                      ? <AdresseAutocomplete value={infoForm.adresse} onChange={v=>setInfoForm({...infoForm,adresse:v})}
                                          placeholder="Tapez le début de l'adresse…"
                                          inputStyle={{padding:'6px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                                      : <input type="text" value={infoForm[f.field]||''} onChange={e=>setInfoForm({...infoForm,[f.field]:e.target.value})}
                                          style={{width:'100%',padding:'6px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />)
                                  : f.field==='website' && infoForm[f.field]
                                    ? <a href={infoForm[f.field].startsWith('http')?infoForm[f.field]:'https://'+infoForm[f.field]} target="_blank" style={{fontSize:'13px',fontWeight:'500',color:'var(--tw-teal)'}}>{infoForm[f.field]}</a>
                                    : <div style={{fontSize:'13px',fontWeight:'500',color:infoForm[f.field]?'var(--tw-ink)':'var(--tw-muted)'}}>{infoForm[f.field]||'—'}</div>
                                }
                              </div>
                            ))}
                            {/* Code NAF */}
                            {(infoEdit || rempli('code_naf')) && (
                              <div>
                                <div style={lblStyle}>Code NAF</div>
                                {infoEdit
                                  ? <select value={infoForm.code_naf||''} onChange={e=>setInfoForm({...infoForm,code_naf:e.target.value})}
                                      style={{width:'100%',padding:'6px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                                      <option value="">— Sélectionner —</option>
                                      {(codesNaf||[]).map(c=>(
                                        <option key={c.code} value={c.code}>{c.code} – {c.libelle} ({c.categorie})</option>
                                      ))}
                                    </select>
                                  : (() => {
                                      const found = (codesNaf||[]).find(c=>c.code===infoForm.code_naf);
                                      return (
                                        <div>
                                          <div style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-ink)'}}>{infoForm.code_naf}</div>
                                          <div style={{fontSize:'12px',color:'var(--tw-slate)',marginTop:'2px'}}>{found?.libelle||''}</div>
                                          <div style={{fontSize:'11px',color:'var(--tw-teal)',marginTop:'1px'}}>{found?.categorie||''}</div>
                                        </div>
                                      );
                                    })()
                                }
                              </div>
                            )}
                            {(infoEdit || rempli('created_at')) && (
                              <div>
                                <div style={lblStyle}>Date entrée en relation</div>
                                {infoEdit
                                  ? <input type="date" value={infoForm.created_at||''} onChange={e=>setInfoForm({...infoForm,created_at:e.target.value})}
                                      style={{width:'100%',padding:'6px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                                  : <div style={{fontSize:'13px',fontWeight:'500',color:'var(--tw-ink)'}}>{infoForm.created_at?new Date(infoForm.created_at).toLocaleDateString('fr-FR'):''}</div>
                                }
                              </div>
                            )}
                          </div>
                          {manquants.length > 0 && (
                            <div style={{fontSize:'11.5px',color:'var(--tw-muted)',marginBottom:'20px'}}>
                              Non renseigné : {manquants.join(' · ')}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })()}

                    {/* ── Groupe de sociétés (holding / filiales) ── */}
                    {(() => {
                      const all = (prospects || []).filter(p => p.id !== undefined);
                      // Racine du groupe : on remonte toute la chaîne des maisons mères depuis la
                      // fiche courante (gère les groupes multi-niveaux : Holding → Sous-holding → Filiale)
                      let topRoot = selectedProspect, guardUp = 0;
                      while (topRoot.parent_id && guardUp++ < 20) {
                        const up = all.find(p => p.id === topRoot.parent_id);
                        if (!up) break;
                        topRoot = up;
                      }
                      const childrenOf = (id) => all.filter(p => p.parent_id === id).sort((a,b) => (a.name||'').localeCompare(b.name||''));
                      // Arbre complet du groupe : compteur du titre + exclusion des suggestions
                      const membres = [];
                      (function collect(n, depth) {
                        if (depth > 6) return;
                        membres.push(n);
                        childrenOf(n.id).forEach(c => collect(c, depth + 1));
                      })(topRoot, 0);
                      const isGroupe = membres.length > 1;

                      const patchParent = async (societeId, parentId) => {
                        try {
                          const r = await fetch(`${API_URL}/prospects/${societeId}/parent`, {
                            method:'PATCH',
                            headers:{'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
                            body: JSON.stringify({ parent_id: parentId })
                          });
                          if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || ('HTTP '+r.status)); }
                          setGroupeAddMode(null); setGroupeSearch('');
                          if (societeId === selectedProspect.id) onUpdateProspect({ ...selectedProspect, parent_id: parentId });
                          else if (fetchProspects) fetchProspects();
                        } catch(err) { window.showToast && window.showToast({title:'Erreur : '+err.message, type:'error'}); }
                      };

                      // Suggestions pour le rattachement : exclut la société courante, la relation
                      // déjà en place et les membres actuels du groupe (anti-cycle complet côté serveur)
                      const dejaDansGroupe = new Set(membres.map(m => m.id));
                      const suggestions = groupeSearch.trim().length < 2 ? [] : all
                        .filter(p => !dejaDansGroupe.has(p.id) && p.id !== selectedProspect.id)
                        .filter(p => (p.name||'').toLowerCase().includes(groupeSearch.trim().toLowerCase()))
                        .slice(0, 8);

                      const nbAffairesEnCours = (p) => (Array.isArray(p.affaires_detail) ? p.affaires_detail : [])
                        .filter(a => a.statut !== 'Gagné' && a.statut !== 'Perdu').length;

                      const carte = (p, opts = {}) => {
                        const isCurrent = p.id === selectedProspect.id;
                        const nbAff = nbAffairesEnCours(p);
                        return (
                          <div key={p.id}
                            onClick={() => { if (!isCurrent && onSelectProspect) onSelectProspect(p); }}
                            style={{background:'white',border: isCurrent ? '2px solid #10a0dc' : '0.5px solid var(--tw-border)',
                              borderRadius:'10px',padding:'9px 12px',minWidth:'170px',maxWidth:'230px',
                              cursor: isCurrent ? 'default' : 'pointer',position:'relative',
                              boxShadow: opts.isRoot ? '0 1px 3px rgba(17,24,39,.07)' : 'none'}}
                            onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background='var(--tw-bg)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background='white'; }}>
                            <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={opts.isRoot ? '#10a0dc' : 'var(--tw-slate)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                                <rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>
                              </svg>
                              <span style={{fontSize:'12.5px',fontWeight:600,color:'var(--tw-ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</span>
                              {opts.onDetach && (
                                <span title={isCurrent ? 'Se détacher du groupe' : 'Détacher cette filiale du groupe'}
                                  onClick={(e) => { e.stopPropagation(); if (window.confirm(`Détacher « ${p.name} » du groupe ?`)) opts.onDetach(); }}
                                  style={{marginLeft:'auto',color:'var(--tw-muted)',fontWeight:700,fontSize:'13px',lineHeight:1,cursor:'pointer',padding:'0 2px'}}>×</span>
                              )}
                            </div>
                            <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'3px',marginLeft:'22px'}}>
                              {opts.isRoot ? 'Maison mère' : (p.statut_societe || 'Prospect')}
                              {nbAff > 0 && <span style={{color:'#10a0dc',fontWeight:600}}> · {nbAff} affaire{nbAff>1?'s':''} en cours</span>}
                            </div>
                          </div>
                        );
                      };

                      const searchBox = (mode) => (
                        <div style={{position:'relative',maxWidth:'320px'}}>
                          <input type="text" autoFocus value={groupeSearch} onChange={e=>setGroupeSearch(e.target.value)}
                            placeholder={mode === 'parent' ? 'Nom de la maison mère…' : 'Nom de la société à rattacher…'}
                            onKeyDown={e => { if (e.key === 'Escape') { setGroupeAddMode(null); setGroupeSearch(''); } }}
                            style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'7px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          {/* Liste en flux normal (pas en absolu) : un dropdown absolu serait rogné
                              par l'overflow du conteneur de l'organigramme */}
                          {suggestions.length > 0 && (
                            <div style={{background:'white',border:'0.5px solid var(--tw-border)',borderRadius:'8px',marginTop:'4px',boxShadow:'0 8px 24px rgba(17,24,39,.10)',maxHeight:'220px',overflowY:'auto'}}>
                              {suggestions.map(p => (
                                <div key={p.id}
                                  onClick={() => { if (mode === 'parent') patchParent(selectedProspect.id, p.id); else patchParent(p.id, selectedProspect.id); }}
                                  style={{padding:'7px 12px',fontSize:'13px',cursor:'pointer',display:'flex',justifyContent:'space-between',gap:'8px'}}
                                  onMouseEnter={(e)=>e.currentTarget.style.background='var(--tw-bg)'}
                                  onMouseLeave={(e)=>e.currentTarget.style.background='white'}>
                                  <span style={{fontWeight:500,color:'var(--tw-ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</span>
                                  <span style={{fontSize:'11px',color:'var(--tw-muted)',flexShrink:0}}>{p.statut_societe || 'Prospect'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {groupeSearch.trim().length >= 2 && suggestions.length === 0 && (
                            <div style={{fontSize:'12px',color:'var(--tw-muted)',fontStyle:'italic',marginTop:'6px',padding:'4px 2px'}}>Aucune société trouvée (déjà dans le groupe ou nom inconnu)</div>
                          )}
                          <div style={{fontSize:'10px',color:'var(--tw-muted)',marginTop:'3px'}}>Échap pour annuler · tapez au moins 2 lettres</div>
                        </div>
                      );

                      const btnDiscret = (label, onClick) => (
                        <button onClick={onClick}
                          style={{background:'white',border:'0.5px solid var(--tw-border)',padding:'5px 11px',borderRadius:'7px',fontSize:'12px',color:'var(--tw-slate)',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}
                          onMouseEnter={(e)=>{e.currentTarget.style.background='var(--tw-bg)';}}
                          onMouseLeave={(e)=>{e.currentTarget.style.background='white';}}>
                          {label}
                        </button>
                      );

                      return (
                        <div style={{marginBottom:'20px'}}>
                          <div onClick={() => setGroupeOpen(o => !o)}
                            style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',userSelect:'none',fontSize:'11px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--tw-ink)',marginBottom: groupeOpen ? '8px' : 0}}>
                            <span style={{display:'inline-flex',color:'var(--tw-muted)'}}>{I(groupeOpen ? ICONS.chevron : ICONS.chevronR, 11)}</span>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isGroupe ? '#10a0dc' : 'var(--tw-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                              <rect x="9" y="2" width="6" height="6" rx="1"/><path d="M12 8v4M5 12h14M5 12v4M19 12v4"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/>
                            </svg>
                            <span>Groupe de sociétés{isGroupe && <span style={{color:'var(--tw-muted)',fontWeight:500}}> · </span>}{isGroupe && <span style={{color:'#10a0dc'}}>{membres.length}</span>}</span>
                            {!isGroupe && <span style={{color:'var(--tw-muted)',fontWeight:500,textTransform:'none',letterSpacing:0,fontStyle:'italic'}}>— société indépendante</span>}
                          </div>
                          {groupeOpen && (!isGroupe ? (
                            <div style={{background:'var(--tw-bg)',border:'0.5px dashed var(--tw-border)',borderRadius:'10px',padding:'12px 14px'}}>
                              {groupeAddMode === null ? (
                                <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
                                  <span style={{fontSize:'12px',color:'var(--tw-muted)',fontStyle:'italic'}}>Société indépendante — aucun groupe</span>
                                  {btnDiscret('Rattacher à une maison mère', () => { setGroupeAddMode('parent'); setGroupeSearch(''); })}
                                  {btnDiscret('Ajouter une filiale', () => { setGroupeAddMode('filiale'); setGroupeSearch(''); })}
                                </div>
                              ) : searchBox(groupeAddMode)}
                            </div>
                          ) : (
                            <div style={{background:'var(--tw-bg)',border:'0.5px solid var(--tw-border)',borderRadius:'10px',padding:'14px',overflowX:'auto'}}>
                              {/* Arbre complet du groupe, rendu récursivement niveau par niveau */}
                              {(function renderNode(p, depth) {
                                const kids = childrenOf(p.id);
                                return (
                                  <div key={p.id} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:0}}>
                                    {carte(p, { isRoot: depth === 0, onDetach: depth > 0 ? () => patchParent(p.id, null) : null })}
                                    {kids.length > 0 && depth < 6 && (
                                      <React.Fragment>
                                        <div style={{width:'1px',height:'14px',borderLeft:'1px solid #c9d2dd'}}></div>
                                        <div style={{display:'flex',gap:'10px',alignItems:'flex-start',justifyContent:'center',flexWrap:'wrap'}}>
                                          {kids.map(k => renderNode(k, depth + 1))}
                                        </div>
                                      </React.Fragment>
                                    )}
                                  </div>
                                );
                              })(topRoot, 0)}
                              {/* Ajouter une filiale : rattachée à la société dont on consulte la fiche */}
                              <div style={{display:'flex',justifyContent:'center',marginTop:'12px'}}>
                                {groupeAddMode === 'filiale' ? searchBox('filiale') : btnDiscret(`+ Ajouter une filiale à « ${selectedProspect.name} »`, () => { setGroupeAddMode('filiale'); setGroupeSearch(''); })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Marques : replié quand vide en mode lecture (signalé dans « Non renseigné ») */}
                    {(infoEdit || (infoForm.marques||[]).length > 0) && (
                    <div style={{marginBottom:'20px'}}>
                      <div>
                        <div style={{fontSize:'11.5px',color:'var(--tw-slate)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'4px'}}>Marques</div>
                        {infoEdit
                          ? <div>
                              <div style={{display:'flex',flexWrap:'wrap',gap:'6px',padding:'6px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',minHeight:'36px',alignItems:'center',background:'white'}}>
                                {(infoForm.marques||[]).map((m,i) => (
                                  <span key={i} style={{background:'var(--tw-teal-light)',color:'var(--tw-teal)',padding:'2px 8px',borderRadius:'12px',fontSize:'12px',fontWeight:'600',display:'flex',alignItems:'center',gap:'4px'}}>
                                    {m}
                                    <span onClick={()=>setInfoForm({...infoForm,marques:(infoForm.marques||[]).filter((_,j)=>j!==i)})} style={{cursor:'pointer',fontWeight:'700',fontSize:'14px',lineHeight:1}}>×</span>
                                  </span>
                                ))}
                                <input type="text"
                                  placeholder={infoForm.marques?.length?'Ajouter…':'ex: PABLO, GERARD DAREL'}
                                  style={{border:'none',outline:'none',fontSize:'13px',minWidth:'120px',flex:1,fontFamily:"'Inter',sans-serif"}}
                                  onKeyDown={e=>{
                                    if((e.key==='Enter'||e.key===',')&&e.target.value.trim()){
                                      e.preventDefault();
                                      const val=e.target.value.trim().replace(/,$/,'');
                                      if(val&&!(infoForm.marques||[]).includes(val)) setInfoForm({...infoForm,marques:[...(infoForm.marques||[]),val]});
                                      e.target.value='';
                                    }
                                  }}
                                  onBlur={e=>{
                                    const val=e.target.value.trim().replace(/,$/,'');
                                    if(val&&!(infoForm.marques||[]).includes(val)){
                                      setInfoForm(f=>({...f,marques:[...(f.marques||[]),val]}));
                                      e.target.value='';
                                    }
                                  }}
                                />
                              </div>
                              <div style={{fontSize:'10px',color:'#999',marginTop:'2px'}}>Entrée ou virgule pour ajouter</div>
                            </div>
                          : (infoForm.marques||[]).length > 0
                            ? <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                                {(infoForm.marques||[]).map((m,i)=>(
                                  <span key={i} style={{background:'var(--tw-teal-light)',color:'var(--tw-teal)',padding:'2px 10px',borderRadius:'12px',fontSize:'12px',fontWeight:'600'}}>{m}</span>
                                ))}
                              </div>
                            : null
                        }
                      </div>
                    </div>
                    )}

                    {/* Notes : journal horodaté (une note = une entrée datée et signée),
                        chaque note peut être transformée en action (onglet Actions/Tâches) */}
                    <div style={{marginBottom:'20px'}}>
                      <div style={{fontSize:'11.5px',color:'var(--tw-slate)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'6px'}}>
                        Notes {notesList.length > 0 && <span style={{color:'#10a0dc'}}>· {notesList.length}</span>}
                      </div>
                      <div style={{display:'flex',gap:'8px',alignItems:'flex-start',marginBottom:'10px'}}>
                        <textarea value={noteInput} onChange={e=>setNoteInput(e.target.value)}
                          placeholder="Ajouter une note… (Ctrl+Entrée pour enregistrer)"
                          rows={noteInput ? 3 : 1}
                          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleAddNote(); } }}
                          style={{flex:1,padding:'8px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",resize:'vertical'}} />
                        <button onClick={handleAddNote} disabled={!noteInput.trim()}
                          style={{padding:'7px 14px',background: noteInput.trim() ? 'var(--tw-teal)' : 'var(--tw-bg)',color: noteInput.trim() ? 'white' : 'var(--tw-muted)',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:600,cursor: noteInput.trim() ? 'pointer' : 'default',fontFamily:"'Inter',sans-serif"}}>
                          Ajouter
                        </button>
                      </div>
                      {notesList.length === 0 ? (
                        <div style={{fontSize:'12px',color:'var(--tw-muted)',fontStyle:'italic'}}>Aucune note</div>
                      ) : notesList.map(n => (
                        <div key={n.id} style={{background:'var(--tw-bg)',borderRadius:'8px',padding:'9px 12px',marginBottom:'6px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                            <span style={{fontSize:'11px',color:'var(--tw-muted)',fontVariantNumeric:'tabular-nums'}}>
                              {new Date(n.created_at).toLocaleDateString('fr-FR')} {new Date(n.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
                            </span>
                            {n.created_by && <span style={{fontSize:'11px',color:'var(--tw-slate)',fontWeight:600}}>{n.created_by}</span>}
                            {n.updated_at && <span style={{fontSize:'10px',color:'var(--tw-muted)',fontStyle:'italic'}}>(modifiée)</span>}
                            <span style={{flex:1}}></span>
                            <button onClick={() => handleNoteToAction(n)} title="Créer une action à partir de cette note"
                              style={{background:'white',border:'0.5px solid var(--tw-border)',padding:'2px 9px',borderRadius:'9px',fontSize:'11px',fontWeight:600,color:'#0d7fb0',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>→ Action</button>
                            <IconBtn title="Modifier la note" onClick={() => { setEditingNoteId(n.id); setEditingNoteText(n.contenu); }}>{I(ICONS.edit, 12)}</IconBtn>
                            <IconBtn title="Supprimer la note" danger onClick={() => handleDeleteNote(n.id)}>{I(ICONS.trash, 12)}</IconBtn>
                          </div>
                          {editingNoteId === n.id ? (
                            <div>
                              <textarea value={editingNoteText} onChange={e=>setEditingNoteText(e.target.value)} rows={3}
                                style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",resize:'vertical',boxSizing:'border-box'}} />
                              <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',marginTop:'4px'}}>
                                <button onClick={() => setEditingNoteId(null)} style={{padding:'4px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',fontSize:'12px',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>Annuler</button>
                                <button onClick={() => handleSaveNote(n.id)} style={{padding:'4px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:600,cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>Enregistrer</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{fontSize:'13px',color:'var(--tw-slate)',lineHeight:'1.6',whiteSpace:'pre-line'}}>{n.contenu}</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {isClient && (<>
                    {/* Installation TexasWin */}
                    <div style={{fontSize:'11.5px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--tw-slate)',marginBottom:'12px'}}>Installation TexasWin</div>
                    <div style={{background:'linear-gradient(135deg,var(--tw-ink) 0%,#2a5555 100%)',borderRadius:'10px',padding:'18px 22px',color:'white',marginBottom:'20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div>
                        <div style={{fontSize:'11px',color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'4px'}}>Version installée</div>
                        <div style={{fontSize:'22px',fontWeight:'700',opacity:selectedProspect.tw_version?1:.5}}>{selectedProspect.tw_version||'Non renseignée — voir onglet Licences'}</div>
                        <div style={{fontSize:'12px',color:'rgba(255,255,255,.4)',marginTop:'3px'}}>
                          {clientLicences.some(l=>l.hebergement==='cloud')?'Hébergement cloud ASTI':'Hébergement on-premise'}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:'28px'}}>
                        {[
                          {val: clientLicences.reduce((s,l)=>s+(parseInt(l.nb_utilisateurs)||0),0)||'—', lbl:'Utilisateurs'},
                          {val: clientLicences.find(l=>l.maintenance==='A3')?'A3':clientLicences.find(l=>l.maintenance==='A2')?'A2':'—', lbl:'Maintenance'},
                          {val: clientLicences.some(l=>l.hebergement==='cloud')?'Cloud':'On-premise', lbl:'Hébergement'},
                        ].map(k => (
                          <div key={k.lbl} style={{textAlign:'center'}}>
                            <div style={{fontSize:'20px',fontWeight:'700',color:'#4dd9e6'}}>{k.val}</div>
                            <div style={{fontSize:'10px',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.4px',marginTop:'2px'}}>{k.lbl}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    </>)}

                    {/* Solutions en place — Suspect/Prospect */}
                    {!isClient && selectedProspect.solutions_en_place && (
                      <div style={{marginBottom:'20px'}}>
                        <div style={{fontSize:'11.5px',color:'var(--tw-slate)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'6px'}}>Solutions en place</div>
                        <div style={{fontSize:'13px',color:'var(--tw-slate)',background:'var(--tw-bg)',padding:'10px 12px',borderRadius:'6px',lineHeight:'1.6',whiteSpace:'pre-line'}}>{selectedProspect.solutions_en_place}</div>
                      </div>
                    )}

                  </div>
                )}

                {/* ── Onglet Contacts ── */}
                {clientTab === 'contacts' && (
                  <div>
                    {(() => {
                      // Helper : reset propre du formulaire ET du collapse historique
                      const closeContactForm = () => {
                        setShowInterlocuteurForm(false);
                        setHistoryExpanded(false);
                        setHistoryData([]);
                        setHistoryError(null);
                      };

                      // Helper : ouvrir/fermer le collapse historique. Charge les données à la 1re ouverture.
                      const toggleHistory = async () => {
                        if (historyExpanded) {
                          setHistoryExpanded(false);
                          return;
                        }
                        setHistoryExpanded(true);
                        if (!interlocuteurForm.id) return; // pas d'historique en mode création
                        setHistoryLoading(true);
                        setHistoryError(null);
                        try {
                          const r = await fetch(`${API_URL}/interlocuteurs/${interlocuteurForm.id}/consents`, {
                            headers: { 'Authorization': `Bearer ${user.token}` }
                          });
                          if (!r.ok) throw new Error(`HTTP ${r.status}`);
                          const data = await r.json();
                          setHistoryData(data.events || []);
                        } catch (err) {
                          console.error('Erreur fetch historique consents:', err);
                          setHistoryError(err.message);
                          setHistoryData([]);
                        } finally {
                          setHistoryLoading(false);
                        }
                      };

                      // Mapping libellés source pour affichage humain
                      const sourceLabel = (s) => ({
                        'manual_crm_create': 'Création',
                        'manual_crm_update': 'Modif. fiche',
                        'webhook_brevo': 'Désabo Brevo',
                        'import_csv': 'Import CSV',
                        'rgpd_request': 'Demande RGPD',
                      }[s] || s);
                      const fieldLabel = (f) => {
                        if (f === 'accept_emailing') return <React.Fragment><span style={{display:'inline-flex',verticalAlign:'middle',marginRight:'4px',color:'#166534'}}>{I(ICONS.mail, 12)}</span>Emailing</React.Fragment>;
                        if (f === 'accept_notes_info') return <React.Fragment><span style={{display:'inline-flex',verticalAlign:'middle',marginRight:'4px',color:'#1e40af'}}>{I(ICONS.bell, 12)}</span>Notes</React.Fragment>;
                        return f;
                      };

                      // Composant formulaire (utilisé en haut pour création + sous chaque ligne pour édition)
                      const renderContactForm = (isEdit) => (
                        <div style={{background:'var(--tw-bg)',border:'1px solid var(--tw-border)',borderRadius:'8px',padding:'16px',marginBottom:'12px'}}>
                          {/* Prénom + Nom sur la première ligne, en 2 colonnes 1/3 + 2/3.
                              Saisie séparée pour permettre la personnalisation Brevo
                              (ex: "Bonjour {{contact.PRENOM}}, ..."). Le prénom est
                              optionnel (contacts génériques type contact@), le nom est
                              obligatoire (utilisé pour l'identification visuelle). */}
                          <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:'10px',marginBottom:'10px'}}>
                            <input type="text" placeholder="Prénom"
                              value={interlocuteurForm.prenom||''}
                              onChange={e=>setInterlocuteurForm({...interlocuteurForm,prenom:e.target.value})}
                              style={{padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                            <input type="text" placeholder="Nom *"
                              value={interlocuteurForm.nom||''}
                              onChange={e=>setInterlocuteurForm({...interlocuteurForm,nom:e.target.value})}
                              style={{padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          </div>
                          {/* Anti-doublon : ce nom/email existe déjà dans la base → proposer le rattachement */}
                          {!isEdit && dupSuggestions.length > 0 && (
                            <div style={{border:'1px solid #b5d9ea',background:'#e8f6fc',borderRadius:'8px',padding:'10px 12px',marginBottom:'10px'}}>
                              <div style={{fontSize:'12px',fontWeight:600,color:'#0d5f85',marginBottom:'6px'}}>Ce contact existe peut-être déjà — le rattacher à cette société plutôt que créer un doublon :</div>
                              {dupSuggestions.map(s => (
                                <div key={s.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0',fontSize:'12.5px'}}>
                                  <span style={{fontWeight:600,color:'var(--tw-ink)',flexShrink:0}}>{[s.prenom, s.nom].filter(Boolean).join(' ')}</span>
                                  {s.email && <span style={{color:'var(--tw-muted)',flexShrink:0}}>{s.email}</span>}
                                  <span style={{color:'var(--tw-slate)',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                    {(s.societes || []).map(so => so.name + (so.fonction ? ' — ' + so.fonction : '')).join(' · ')}
                                  </span>
                                  <button onClick={() => handleRattacherContact(s)}
                                    style={{background:'var(--tw-teal)',color:'white',border:'none',padding:'4px 10px',borderRadius:'6px',fontSize:'11.5px',fontWeight:600,cursor:'pointer',fontFamily:"'Inter',sans-serif",flexShrink:0}}>
                                    Rattacher ici
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                            {[
                              {ph:'Fonction', field:'fonction'},
                              {ph:'Email', field:'email', type:'email'},
                              {ph:'Tél. mobile', field:'telephone', type:'tel'},
                              {ph:'Tél. fixe', field:'telephone_fixe', type:'tel'},
                            ].map(({ph,field,type='text'}) => (
                              <input key={field} type={type} placeholder={ph}
                                value={interlocuteurForm[field]||''}
                                onChange={e=>setInterlocuteurForm({...interlocuteurForm,[field]:e.target.value})}
                                style={{padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                            ))}
                          </div>
                          {/* LinkedIn URL : pleine largeur, optionnel. Pré-rempli si import depuis SocieteInfo. */}
                          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
                            <span title="Profil LinkedIn" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'28px',height:'28px',borderRadius:'5px',background:'#0a66c2',color:'white',fontSize:'12px',fontWeight:700,flexShrink:0}}>in</span>
                            <input type="url" placeholder="URL LinkedIn (https://linkedin.com/in/...)"
                              value={interlocuteurForm.linkedin_url||''}
                              onChange={e=>setInterlocuteurForm({...interlocuteurForm,linkedin_url:e.target.value})}
                              style={{flex:1,padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          </div>
                          <div style={{display:'flex',gap:'16px',marginBottom:'12px',flexWrap:'wrap'}}>
                            <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'13px',cursor:'pointer'}}>
                              <input type="checkbox" checked={!!interlocuteurForm.principal} onChange={e=>setInterlocuteurForm({...interlocuteurForm,principal:e.target.checked})} />
                              Contact principal
                            </label>
                            <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'13px',cursor:'pointer'}}>
                              <input type="checkbox" checked={!!interlocuteurForm.decideur} onChange={e=>setInterlocuteurForm({...interlocuteurForm,decideur:e.target.checked})} />
                              Décideur
                            </label>
                          </div>
                          {/* Rattachement : société (siège) OU un site OU une boutique */}
                          <div style={{marginBottom:'12px'}}>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Rattaché à</label>
                            <select
                              value={interlocuteurForm.site_id ? `s:${interlocuteurForm.site_id}` : interlocuteurForm.boutique_id ? `b:${interlocuteurForm.boutique_id}` : ''}
                              onChange={e => {
                                const v = e.target.value;
                                if (v.startsWith('s:')) setInterlocuteurForm({...interlocuteurForm, site_id: parseInt(v.slice(2)), boutique_id: ''});
                                else if (v.startsWith('b:')) setInterlocuteurForm({...interlocuteurForm, boutique_id: parseInt(v.slice(2)), site_id: ''});
                                else setInterlocuteurForm({...interlocuteurForm, site_id: '', boutique_id: ''});
                              }}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="">Siège (adresse de la société)</option>
                              {clientSites.length > 0 && (
                                <optgroup label="Sites">
                                  {clientSites.map(s => <option key={'s'+s.id} value={`s:${s.id}`}>{s.nom}{s.type?` (${s.type})`:''}</option>)}
                                </optgroup>
                              )}
                              {clientBoutiques.length > 0 && (
                                <optgroup label="Boutiques">
                                  {clientBoutiques.map(b => <option key={'b'+b.id} value={`b:${b.id}`}>{b.nom}</option>)}
                                </optgroup>
                              )}
                            </select>
                          </div>
                          {/* Consentements RGPD - opt-in séparés pour communications */}
                          <div style={{display:'flex',gap:'16px',marginBottom:'12px',flexWrap:'wrap',padding:'8px 10px',background:'var(--bg)',borderRadius:'6px',border:'0.5px dashed #cde0e0'}}>
                            <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                              <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',cursor:'pointer',color:'#4a6868'}} title="Le contact accepte de recevoir des campagnes commerciales (offres, promos, sollicitations)">
                                <input type="checkbox" checked={!!interlocuteurForm.accept_emailing} onChange={e=>setInterlocuteurForm({...interlocuteurForm,accept_emailing:e.target.checked})} />
                                <span style={{display:'inline-flex',alignItems:'center'}}>{I(ICONS.mail, 13)}</span>
                                Emailing commercial
                              </label>
                              {/* Affichage du statut RGPD côté fiche interlocuteur :
                                    - opt-in (case cochée) : pas de message
                                    - opt-out explicite (case décochée + date désabo) : message rouge "Désabonné le ..."
                                    - non sollicité (case décochée + pas de date désabo) : message gris neutre */}
                              {!interlocuteurForm.accept_emailing && interlocuteurForm.emailing_unsubscribed_at && (() => {
                                const dt = new Date(interlocuteurForm.emailing_unsubscribed_at);
                                const dtStr = dt.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
                                const src = interlocuteurForm.emailing_unsubscribed_source || '';
                                // Libellé lisible selon la source
                                const srcLabel = src === 'webhook_brevo' ? 'via Brevo'
                                               : src === 'manuel' ? 'manuellement'
                                               : src ? `via ${src}` : '';
                                return (
                                  <div style={{fontSize:'11px',color:'#A32D2D',marginLeft:'22px',display:'flex',alignItems:'center',gap:'4px'}}>
                                    <span style={{fontSize:'10px'}}>❌</span>
                                    Désabonné le {dtStr} {srcLabel}
                                  </div>
                                );
                              })()}
                              {!interlocuteurForm.accept_emailing && !interlocuteurForm.emailing_unsubscribed_at && interlocuteurForm.id && (
                                <div title="Aucune demande de consentement n'a été envoyée à ce contact. Il n'est pas opt-out — il est juste en attente de sollicitation." style={{fontSize:'11px',color:'#5a6573',marginLeft:'22px',display:'flex',alignItems:'center',gap:'4px',fontStyle:'italic'}}>
                                  <span style={{fontSize:'10px'}}>○</span>
                                  Consentement jamais demandé
                                </div>
                              )}
                            </div>
                            <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',cursor:'pointer',color:'#4a6868'}} title="Le contact accepte de recevoir des notes d'information (changements tarifs, infos produit, alertes service)">
                              <input type="checkbox" checked={!!interlocuteurForm.accept_notes_info} onChange={e=>setInterlocuteurForm({...interlocuteurForm,accept_notes_info:e.target.checked})} />
                              <span style={{display:'inline-flex',alignItems:'center'}}>{I(ICONS.bell, 13)}</span>
                              Notes d'information
                            </label>
                            {/* Case "Demande d'opt-in" :
                                Visible pour Suspect/Prospect (règle métier) + contact pas déjà opt-in.
                                Comportement :
                                  - En édition (fiche déjà en BDD) : toggle persiste immédiatement
                                    via POST /api/interlocuteurs/:id/demande-optin (changement à chaud).
                                  - En création (fiche pas encore sauvegardée) : mise à jour du state
                                    local uniquement. La valeur sera envoyée dans le POST de création
                                    via le champ demande_optin du body. */}
                            {['Suspect', 'Prospect'].includes(selectedProspect?.statut_societe) &&
                             !interlocuteurForm.accept_emailing && (
                              <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',cursor:'pointer',color:'#4a6868'}} title="Marquer ce contact pour qu'il reçoive un email de demande d'opt-in (lien de confirmation à cliquer)">
                                <input
                                  type="checkbox"
                                  checked={!!interlocuteurForm.demande_optin}
                                  onChange={async (e) => {
                                    const newValue = e.target.checked;
                                    // Cas 1 : création (pas encore d'id) → simple update state local
                                    if (!interlocuteurForm.id) {
                                      setInterlocuteurForm(f => ({...f, demande_optin: newValue}));
                                      return;
                                    }
                                    // Cas 2 : édition → optimistic update + persistance API
                                    setInterlocuteurForm(f => ({...f, demande_optin: newValue}));
                                    try {
                                      const r = await fetch(`${API_URL}/interlocuteurs/${interlocuteurForm.id}/demande-optin`, {
                                        method: 'POST',
                                        headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ value: newValue })
                                      });
                                      const data = await r.json();
                                      if (!r.ok) {
                                        // Rollback en cas d'erreur
                                        setInterlocuteurForm(f => ({...f, demande_optin: !newValue}));
                                        alert('Erreur : ' + (data.error || 'Impossible de mettre à jour'));
                                      }
                                    } catch (err) {
                                      setInterlocuteurForm(f => ({...f, demande_optin: !newValue}));
                                      alert('Erreur réseau : ' + err.message);
                                    }
                                  }}
                                />
                                <span style={{display:'inline-flex',alignItems:'center',color:'#b97800'}}>{I(ICONS.mail, 13)}</span>
                                Demande d'opt-in
                              </label>
                            )}
                          </div>
                          {/* Bouton Historique RGPD : visible uniquement en mode édition */}
                          {isEdit && (
                            <div style={{marginBottom:'12px'}}>
                              <button type="button" onClick={toggleHistory}
                                style={{display:'inline-flex',alignItems:'center',gap:'6px',padding:'5px 10px',background:'white',border:'0.5px solid var(--tw-border)',borderRadius:'6px',fontSize:'12px',color:'var(--tw-slate)',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                                {I(ICONS.clock, 12)}
                                {historyExpanded ? 'Masquer l\u2019historique RGPD' : 'Afficher l\u2019historique RGPD'}
                              </button>
                              {historyExpanded && (
                                <div style={{marginTop:'8px',padding:'10px 12px',background:'white',border:'0.5px solid var(--tw-border)',borderRadius:'6px',maxHeight:'240px',overflowY:'auto'}}>
                                  {historyLoading && <div style={{fontSize:'12px',color:'var(--tw-muted)',fontStyle:'italic'}}>Chargement…</div>}
                                  {historyError && <div style={{fontSize:'12px',color:'var(--tw-red)'}}>Erreur : {historyError}</div>}
                                  {!historyLoading && !historyError && historyData.length === 0 && (
                                    <div style={{fontSize:'12px',color:'var(--tw-muted)',fontStyle:'italic'}}>Aucun événement enregistré.</div>
                                  )}
                                  {!historyLoading && !historyError && historyData.length > 0 && (
                                    <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                                      {historyData.map(ev => {
                                        const dt = ev.changed_at ? new Date(ev.changed_at) : null;
                                        const dtStr = dt ? dt.toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '?';
                                        const fromTo = ev.old_value === null
                                          ? (ev.new_value ? '✅ activé' : '❌ désactivé')
                                          : `${ev.old_value ? '✅' : '❌'} → ${ev.new_value ? '✅' : '❌'}`;
                                        return (
                                          <div key={ev.id} style={{display:'flex',gap:'10px',alignItems:'baseline',fontSize:'12px',padding:'4px 0',borderBottom:'0.5px solid var(--tw-bg)'}}>
                                            <span style={{color:'var(--tw-muted)',fontFamily:'monospace',whiteSpace:'nowrap',fontSize:'11px'}}>{dtStr}</span>
                                            <span style={{fontWeight:'600',color:'var(--tw-ink)'}}>{fieldLabel(ev.field)}</span>
                                            <span>{fromTo}</span>
                                            <span style={{color:'var(--tw-muted)',fontSize:'11px'}}>· {sourceLabel(ev.source)}{ev.changed_by ? ` · ${ev.changed_by}` : ''}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                            <button onClick={closeContactForm} style={{padding:'6px 14px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',cursor:'pointer',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>Annuler</button>
                            <button onClick={async () => { await handleSaveInterlocuteur(); setHistoryExpanded(false); setHistoryData([]); }} style={{padding:'6px 14px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontWeight:'600',fontFamily:"'Inter',sans-serif"}}>Enregistrer</button>
                          </div>
                        </div>
                      );

                      // Mode création = formulaire ouvert ET pas d'id (donc nouveau contact)
                      const isCreating = showInterlocuteurForm && !interlocuteurForm.id;
                      // Mode édition = formulaire ouvert AVEC un id
                      const editingId = (showInterlocuteurForm && interlocuteurForm.id) ? interlocuteurForm.id : null;

                      // ─── Drag & drop des contacts ───────────────────────────
                      // États draggedContactId / dragOverContactId définis au niveau App
                      // (passés en props à RightPanel) pour respecter les règles des hooks React.

                      const handleDragStart = (e, contactId) => {
                        setDraggedContactId(contactId);
                        e.dataTransfer.effectAllowed = 'move';
                        // Note : nécessaire pour Firefox sinon le drag ne démarre pas
                        try { e.dataTransfer.setData('text/plain', String(contactId)); } catch (_) {}
                      };
                      const handleDragOver = (e, contactId) => {
                        e.preventDefault(); // autorise le drop
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverContactId !== contactId) setDragOverContactId(contactId);
                      };
                      const handleDragEnd = () => {
                        setDraggedContactId(null);
                        setDragOverContactId(null);
                      };
                      const handleDrop = async (e, targetContactId) => {
                        e.preventDefault();
                        const sourceId = draggedContactId;
                        setDraggedContactId(null);
                        setDragOverContactId(null);
                        if (!sourceId || sourceId === targetContactId) return;

                        // Calculer le nouvel ordre côté front (optimistic update)
                        const currentList = [...interlocuteurs];
                        const fromIdx = currentList.findIndex(c => c.id === sourceId);
                        const toIdx = currentList.findIndex(c => c.id === targetContactId);
                        if (fromIdx < 0 || toIdx < 0) return;
                        const [moved] = currentList.splice(fromIdx, 1);
                        currentList.splice(toIdx, 0, moved);
                        const orderedIds = currentList.map(c => c.id);

                        // Appel API pour persister
                        try {
                          const res = await fetch(`${API_URL}/prospects/${selectedProspect.id}/interlocuteurs/reorder`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
                            body: JSON.stringify({ orderedIds })
                          });
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          // Recharger pour avoir l'ordre persisté
                          if (typeof fetchInterlocuteurs === 'function') await fetchInterlocuteurs(selectedProspect.id);
                        } catch (err) {
                          console.error('Erreur reorder:', err);
                          window.showToast({ title: 'Erreur réorganisation : ' + err.message, type: 'error' });
                        }
                      };

                      // Reset de l'ordre custom : tous les contacts repassent au tri auto
                      const handleResetOrder = async () => {
                        try {
                          const res = await fetch(`${API_URL}/prospects/${selectedProspect.id}/interlocuteurs/reset-order`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${user.token}` }
                          });
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          window.showToast({ title: 'Ordre réinitialisé', type: 'success' });
                          if (typeof fetchInterlocuteurs === 'function') await fetchInterlocuteurs(selectedProspect.id);
                        } catch (err) {
                          window.showToast({ title: 'Erreur reset : ' + err.message, type: 'error' });
                        }
                      };

                      // Détection : au moins un contact a un display_order custom ?
                      const hasCustomOrder = interlocuteurs.some(c => c.display_order != null);

                      // ── Association d'un contact à d'autres sociétés (depuis sa fiche dépliée) ──
                      const associerContactA = async (contact, soc) => {
                        const fonction = window.prompt(`Fonction de ${displayName(contact)} chez « ${soc.name} » (optionnel) :`, '');
                        if (fonction === null) return; // annulé
                        try {
                          const r = await fetch(`${API_URL}/prospects/${soc.id}/interlocuteurs`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
                            body: JSON.stringify({ existing_interlocuteur_id: contact.id, fonction: fonction.trim() })
                          });
                          if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + r.status)); }
                          window.showToast({ title: `Contact associé à ${soc.name}`, type: 'success' });
                          setAssocOpenFor(null); setAssocSearch('');
                          await fetchInterlocuteurs(selectedProspect.id);
                        } catch (err) { window.showToast({ title: 'Erreur : ' + err.message, type: 'error' }); }
                      };
                      const detacherContactDe = async (contact, soc) => {
                        if (!window.confirm(`Détacher ${displayName(contact)} de « ${soc.name} » ?`)) return;
                        try {
                          const r = await fetch(`${API_URL}/prospects/${soc.id}/interlocuteurs/${contact.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${user.token}` }
                          });
                          if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + r.status)); }
                          window.showToast({ title: `Contact détaché de ${soc.name}`, type: 'success' });
                          await fetchInterlocuteurs(selectedProspect.id);
                        } catch (err) { window.showToast({ title: 'Erreur : ' + err.message, type: 'error' }); }
                      };

                      return (
                        <React.Fragment>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                            <div style={{fontSize:'11.5px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--tw-slate)',display:'flex',alignItems:'center',gap:'10px'}}>
                              Contacts
                              {hasCustomOrder && (
                                <button onClick={handleResetOrder}
                                  title="Revenir au tri automatique (Principal/Décideur en haut)"
                                  style={{padding:'2px 8px',background:'transparent',border:'0.5px solid var(--tw-border)',borderRadius:'10px',fontSize:'10px',fontWeight:'500',color:'var(--tw-muted)',cursor:'pointer',fontFamily:"'Inter',sans-serif",textTransform:'none',letterSpacing:0}}>
                                  ↺ Réinitialiser l'ordre
                                </button>
                              )}
                            </div>
                            <div style={{display:'flex',gap:'6px'}}>
                              <button onClick={() => { setShowAttachContact(v=>!v); setAttachSearch(''); }}
                                title="Rattacher un contact existant (ex. d'un partenaire) à cette société"
                                style={{padding:'5px 12px',background:'white',color:'var(--tw-teal)',border:'1px solid var(--tw-teal)',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>+ Contact existant</button>
                              <button onClick={() => { setHistoryExpanded(false); setHistoryData([]); setInterlocuteurForm({prenom:'',nom:'',fonction:'',email:'',telephone:'',telephone_fixe:'',linkedin_url:'',principal:false,decideur:false,accept_emailing:false,accept_notes_info:false,demande_optin:false,site_id:'',boutique_id:''}); setShowInterlocuteurForm(true); }}
                                style={{padding:'5px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>+ Contact</button>
                            </div>
                          </div>

                          {/* Rattacher un contact existant (d'un partenaire / prestataire, ou d'une autre société) */}
                          {showAttachContact && (
                            <div style={{background:'var(--tw-bg)',border:'1px solid var(--tw-border)',borderRadius:'8px',padding:'14px',marginBottom:'12px'}}>
                              <div style={{fontSize:'12px',color:'var(--tw-slate)',marginBottom:'8px'}}>Chercher une personne déjà en base (nom ou email) — utile pour ajouter le contact d'un partenaire (ESN, e-commerce, logistique…) sans le recréer.</div>
                              <input autoFocus type="text" value={attachSearch} onChange={e=>setAttachSearch(e.target.value)}
                                placeholder="Nom, prénom ou email…"
                                onKeyDown={e=>{ if(e.key==='Escape'){ setShowAttachContact(false); setAttachSearch(''); } }}
                                style={{width:'100%',padding:'8px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                              {attachSearch.trim().length >= 2 && (
                                <div style={{marginTop:'8px',display:'flex',flexDirection:'column',gap:'4px'}}>
                                  {attachResults.length === 0 ? (
                                    <div style={{fontSize:'12px',color:'var(--tw-muted)',fontStyle:'italic',padding:'4px 0'}}>Aucune personne trouvée (ou déjà rattachée ici).</div>
                                  ) : attachResults.map(s => (
                                    <div key={s.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 8px',background:'white',border:'0.5px solid var(--tw-border)',borderRadius:'6px',fontSize:'12.5px'}}>
                                      <span style={{fontWeight:600,color:'var(--tw-ink)',flexShrink:0}}>{[s.prenom,s.nom].filter(Boolean).join(' ')}</span>
                                      {s.email && <span style={{color:'var(--tw-muted)',flexShrink:0}}>{s.email}</span>}
                                      <span style={{color:'var(--tw-slate)',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                        {(s.societes||[]).map(so => so.name + (so.statut ? ` [${so.statut}]` : '') + (so.fonction ? ' — ' + so.fonction : '')).join(' · ')}
                                      </span>
                                      <button onClick={() => attachExistingContact(s)}
                                        style={{background:'var(--tw-teal)',color:'white',border:'none',padding:'4px 10px',borderRadius:'6px',fontSize:'11.5px',fontWeight:600,cursor:'pointer',fontFamily:"'Inter',sans-serif",flexShrink:0}}>Rattacher</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Formulaire CRÉATION : en haut, uniquement si pas d'id */}
                          {isCreating && renderContactForm(false)}

                          {interlocuteurs.length === 0 ? (
                            <div style={{fontSize:'13px',color:'var(--tw-muted)',fontStyle:'italic',padding:'10px 0'}}>Aucun contact</div>
                          ) : interlocuteurs.map(c => {
                            const avatarColors = ['var(--tw-teal)','#667eea','var(--warning)','var(--success)','var(--danger)','#9b59b6'];
                            const col = avatarColors[c.id % avatarColors.length];
                            const ini = displayInitials(c);
                            const isEditingThis = editingId === c.id;
                            const isDragging = draggedContactId === c.id;
                            const isDragOver = dragOverContactId === c.id && draggedContactId !== c.id;
                            const isExpanded = expandedContactId === c.id;
                            return (
                              <React.Fragment key={c.id}>
                                <div
                                  draggable={!isEditingThis}
                                  onDragStart={(e) => handleDragStart(e, c.id)}
                                  onDragOver={(e) => handleDragOver(e, c.id)}
                                  onDragEnd={handleDragEnd}
                                  onDrop={(e) => handleDrop(e, c.id)}
                                  onClick={(e) => {
                                    // Clic sur le bandeau = déplier/replier la fiche du contact.
                                    // Les liens, boutons et le handle de drag ne déclenchent pas le toggle.
                                    if (isEditingThis) return;
                                    if (e.target.closest && e.target.closest('a,button,input,[data-noexpand]')) return;
                                    setExpandedContactId(isExpanded ? null : c.id);
                                    setAssocOpenFor(null); setAssocSearch('');
                                  }}
                                  style={{
                                    display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'6px',background:'var(--tw-bg)',marginBottom: (isExpanded && !isEditingThis) ? 0 : '6px',
                                    opacity: isDragging ? 0.4 : 1,
                                    border: isDragOver ? '2px dashed var(--tw-teal)' : '2px solid transparent',
                                    transition: 'opacity 0.15s, border-color 0.15s',
                                    cursor: isEditingThis ? 'default' : 'pointer'
                                  }}>
                                  {/* Handle drag : icône à grip à gauche, visible mais discrète.
                                      Toute la ligne est draggable, mais le handle indique visuellement la prise. */}
                                  <span data-noexpand title="Glisser pour réordonner" style={{flexShrink:0,color:'var(--tw-muted)',fontSize:'14px',cursor:'grab',userSelect:'none',lineHeight:1}}>⋮⋮</span>
                                  <span style={{flexShrink:0,color:'var(--tw-muted)',display:'inline-flex'}}>{I(isExpanded ? ICONS.chevron : ICONS.chevronR, 11)}</span>
                                  <div style={{width:'34px',height:'34px',borderRadius:'50%',background:col,color:'white',fontWeight:'600',fontSize:'12px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{ini}</div>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-ink)'}}>{displayName(c)}</div>
                                    <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'2px',display:'flex',gap:'10px',flexWrap:'wrap'}}>
                                      {c.fonction && <span>{c.fonction}</span>}
                                      {c.email && <a href={`mailto:${c.email}`} style={{color:'var(--tw-teal)',textDecoration:'none'}}>✉ {c.email}</a>}
                                      {c.telephone && <a href={`tel:${c.telephone}`} title="Mobile" style={{color:'var(--tw-slate)',textDecoration:'none'}}>📱 {c.telephone}</a>}
                                      {c.telephone_fixe && <a href={`tel:${c.telephone_fixe}`} title="Fixe" style={{color:'var(--tw-slate)',textDecoration:'none'}}>📞 {c.telephone_fixe}</a>}
                                      {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" title="Profil LinkedIn" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'18px',height:'18px',borderRadius:'3px',background:'#0a66c2',color:'white',fontSize:'9px',fontWeight:700,textDecoration:'none'}}>in</a>}
                                    </div>
                                    {/* Rattachement du contact : site ou boutique (le siège reste implicite) */}
                                    {(c.site_id || c.boutique_id) && (() => {
                                      const s = c.site_id ? clientSites.find(x => x.id === c.site_id) : null;
                                      const b = c.boutique_id ? clientBoutiques.find(x => x.id === c.boutique_id) : null;
                                      const lbl = s ? `🏢 ${s.nom}${s.type ? ' · ' + s.type : ''}` : b ? `🏪 ${b.nom}` : (c.site_id ? '🏢 Site' : '🏪 Boutique');
                                      return (
                                        <div style={{marginTop:'4px'}}>
                                          <span title="Rattachement du contact" style={{fontSize:'10px',fontWeight:600,padding:'1px 8px',borderRadius:'9px',background:'var(--tw-teal-light)',color:'var(--tw-teal)'}}>{lbl}</span>
                                        </div>
                                      );
                                    })()}
                                    {/* Contact multi-sociétés : badges des autres sociétés où il est rattaché */}
                                    {Array.isArray(c.autres_societes) && c.autres_societes.length > 0 && (
                                      <div style={{display:'flex',gap:'5px',flexWrap:'wrap',marginTop:'4px',alignItems:'center'}}>
                                        <span style={{fontSize:'10px',color:'var(--tw-muted)'}}>Aussi chez :</span>
                                        {c.autres_societes.map(so => {
                                          const target = (prospects || []).find(p => p.id === so.id);
                                          return (
                                            <span key={so.id}
                                              onClick={() => { if (target && onSelectProspect) onSelectProspect(target); }}
                                              title={(so.fonction ? `${so.name} — ${so.fonction}` : so.name) + (target ? ' (cliquer pour ouvrir la fiche)' : '')}
                                              style={{fontSize:'10px',fontWeight:600,padding:'1px 8px',borderRadius:'9px',background:'#e8f6fc',color:'#0d7fb0',cursor: target ? 'pointer' : 'default'}}>
                                              {so.name}{so.fonction ? ' · ' + so.fonction : ''}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{display:'flex',gap:'5px',alignItems:'center',flexShrink:0}}>
                                    {c.accept_emailing && <span title="Accepte les emailings commerciaux" style={{display:'inline-flex',alignItems:'center',padding:'3px 5px',borderRadius:'8px',background:'#dcfce7',color:'#166534'}}>{I(ICONS.mail, 12)}</span>}
                                    {c.accept_notes_info && <span title="Accepte les notes d'information" style={{display:'inline-flex',alignItems:'center',padding:'3px 5px',borderRadius:'8px',background:'#dbeafe',color:'#1e40af'}}>{I(ICONS.bell, 12)}</span>}
                                    {c.decideur && <span style={{fontSize:'10px',fontWeight:'600',padding:'2px 7px',borderRadius:'8px',background:'#fdecea',color:'var(--tw-red)'}}>Décideur</span>}
                                    {c.principal && <span style={{fontSize:'10px',fontWeight:'600',padding:'2px 7px',borderRadius:'8px',background:'var(--tw-teal-light)',color:'var(--tw-teal)'}}>Principal</span>}
                                    <IconBtn title="Modifier le contact"
                                      onClick={() => { setHistoryExpanded(false); setHistoryData([]); setInterlocuteurForm({id:c.id,prenom:c.prenom||'',nom:c.nom||'',fonction:c.fonction||'',email:c.email||'',telephone:c.telephone||'',telephone_fixe:c.telephone_fixe||'',linkedin_url:c.linkedin_url||'',principal:!!c.principal,decideur:!!c.decideur,accept_emailing:!!c.accept_emailing,accept_notes_info:!!c.accept_notes_info,demande_optin:!!c.demande_optin,site_id:c.site_id||'',boutique_id:c.boutique_id||'',emailing_unsubscribed_at:c.emailing_unsubscribed_at||null,emailing_unsubscribed_source:c.emailing_unsubscribed_source||null}); setShowInterlocuteurForm(true); }}
                                    >{I(ICONS.edit, 13)}</IconBtn>
                                    <IconBtn title={Array.isArray(c.autres_societes) && c.autres_societes.length > 0 ? 'Retirer de cette société (le contact reste rattaché à ses autres sociétés)' : 'Supprimer le contact'} danger
                                      onClick={() => handleDeleteInterlocuteur(c.id, Array.isArray(c.autres_societes) && c.autres_societes.length > 0)}
                                    >{I(ICONS.trash, 13)}</IconBtn>
                                  </div>
                                </div>
                                {/* Fiche dépliée (clic sur le bandeau) : détails + sociétés du contact */}
                                {isExpanded && !isEditingThis && (() => {
                                  const socsContact = [
                                    { id: selectedProspect.id, name: selectedProspect.name, fonction: c.fonction, courante: true },
                                    ...(Array.isArray(c.autres_societes) ? c.autres_societes : []),
                                  ];
                                  const dejaIds = new Set(socsContact.map(s => s.id));
                                  const assocSuggestions = (assocOpenFor === c.id && assocSearch.trim().length >= 2)
                                    ? (prospects || []).filter(p => !dejaIds.has(p.id) && (p.name||'').toLowerCase().includes(assocSearch.trim().toLowerCase())).slice(0, 8)
                                    : [];
                                  const lblMini = {fontSize:'10.5px',color:'var(--tw-slate)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'4px'};
                                  return (
                                    <div style={{background:'white',border:'1px solid var(--tw-border)',borderRadius:'0 0 8px 8px',padding:'12px 16px',marginBottom:'6px'}}>
                                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'12px'}}>
                                        <div>
                                          <div style={lblMini}>Email</div>
                                          <div style={{fontSize:'13px'}}>{c.email ? <a href={`mailto:${c.email}`} style={{color:'var(--tw-teal)',textDecoration:'none'}}>{c.email}</a> : <span style={{color:'var(--tw-muted)'}}>—</span>}</div>
                                        </div>
                                        <div>
                                          <div style={lblMini}>Tél. mobile</div>
                                          <div style={{fontSize:'13px'}}>{c.telephone ? <a href={`tel:${c.telephone}`} style={{color:'var(--tw-ink)',textDecoration:'none'}}>{c.telephone}</a> : <span style={{color:'var(--tw-muted)'}}>—</span>}</div>
                                        </div>
                                        <div>
                                          <div style={lblMini}>Tél. fixe</div>
                                          <div style={{fontSize:'13px'}}>{c.telephone_fixe ? <a href={`tel:${c.telephone_fixe}`} style={{color:'var(--tw-ink)',textDecoration:'none'}}>{c.telephone_fixe}</a> : <span style={{color:'var(--tw-muted)'}}>—</span>}</div>
                                        </div>
                                        <div>
                                          <div style={lblMini}>Consentements</div>
                                          <div style={{fontSize:'12px',color:'var(--tw-slate)'}}>{[c.accept_emailing && 'Emailing', c.accept_notes_info && "Notes d'info", c.optin_confirme_at && 'Opt-in confirmé'].filter(Boolean).join(' · ') || 'Aucun'}</div>
                                        </div>
                                        <div>
                                          <div style={lblMini}>Rattaché à</div>
                                          <div style={{fontSize:'13px',color:'var(--tw-ink)'}}>{(() => {
                                            const s = c.site_id ? clientSites.find(x => x.id === c.site_id) : null;
                                            const b = c.boutique_id ? clientBoutiques.find(x => x.id === c.boutique_id) : null;
                                            if (s) return `🏢 ${s.nom}${s.type ? ' · ' + s.type : ''}`;
                                            if (b) return `🏪 ${b.nom}`;
                                            if (c.site_id) return '🏢 Site';
                                            if (c.boutique_id) return '🏪 Boutique';
                                            return <span style={{color:'var(--tw-muted)'}}>Siège</span>;
                                          })()}</div>
                                        </div>
                                      </div>
                                      <div style={lblMini}>Sociétés rattachées</div>
                                      <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}}>
                                        {socsContact.map(s => (
                                          <span key={s.id} style={{display:'inline-flex',alignItems:'center',gap:'5px',fontSize:'11.5px',fontWeight:600,padding:'3px 10px',borderRadius:'11px',background:'#e8f6fc',color:'#0d7fb0',border: s.courante ? '1px solid #10a0dc' : '1px solid transparent'}}>
                                            {s.name}{s.fonction ? ' · ' + s.fonction : ''}
                                            {!s.courante && (
                                              <span title={`Détacher de ${s.name}`} onClick={() => detacherContactDe(c, s)}
                                                style={{cursor:'pointer',fontWeight:700,lineHeight:1}}>×</span>
                                            )}
                                          </span>
                                        ))}
                                        {assocOpenFor === c.id ? (
                                          <input autoFocus type="text" value={assocSearch} onChange={e=>setAssocSearch(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Escape') { setAssocOpenFor(null); setAssocSearch(''); } }}
                                            placeholder="Nom de la société…"
                                            style={{padding:'4px 10px',border:'1px solid var(--tw-border)',borderRadius:'11px',fontSize:'12px',fontFamily:"'Inter',sans-serif",width:'190px'}} />
                                        ) : (
                                          <button onClick={() => { setAssocOpenFor(c.id); setAssocSearch(''); }}
                                            style={{background:'white',border:'0.5px solid var(--tw-border)',padding:'3px 10px',borderRadius:'11px',fontSize:'11.5px',color:'var(--tw-slate)',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                                            + Associer à une société
                                          </button>
                                        )}
                                      </div>
                                      {assocOpenFor === c.id && assocSuggestions.length > 0 && (
                                        <div style={{marginTop:'6px',background:'white',border:'0.5px solid var(--tw-border)',borderRadius:'8px',maxHeight:'180px',overflowY:'auto',maxWidth:'320px',boxShadow:'0 6px 18px rgba(17,24,39,.08)'}}>
                                          {assocSuggestions.map(p => (
                                            <div key={p.id} onClick={() => associerContactA(c, p)}
                                              style={{padding:'6px 12px',fontSize:'12.5px',cursor:'pointer',display:'flex',justifyContent:'space-between',gap:'8px'}}
                                              onMouseEnter={(e)=>e.currentTarget.style.background='var(--tw-bg)'}
                                              onMouseLeave={(e)=>e.currentTarget.style.background='white'}>
                                              <span style={{fontWeight:500,color:'var(--tw-ink)'}}>{p.name}</span>
                                              <span style={{fontSize:'11px',color:'var(--tw-muted)',flexShrink:0}}>{p.statut_societe || 'Prospect'}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {assocOpenFor === c.id && assocSearch.trim().length >= 2 && assocSuggestions.length === 0 && (
                                        <div style={{marginTop:'6px',fontSize:'12px',color:'var(--tw-muted)',fontStyle:'italic'}}>Aucune société trouvée (déjà associée ou nom inconnu)</div>
                                      )}
                                    </div>
                                  );
                                })()}
                                {/* Formulaire ÉDITION : sous la ligne du contact concerné */}
                                {isEditingThis && renderContactForm(true)}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })()}
                  </div>
                )}

                                {/* ── Onglet Licences ── */}
                {clientTab === 'licences' && (
                  <div>
                    {/* Version TexasWin dans Licences */}
                    <div style={{display:'flex',alignItems:'center',gap:'12px',background:'var(--tw-bg)',borderRadius:'8px',padding:'10px 14px',marginBottom:'16px'}}>
                      <span style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',flexShrink:0}}>Version TexasWin</span>
                      <input type="text"
                        value={selectedProspect.tw_version||''}
                        placeholder="Ex: 12.4.2"
                        onChange={async (e) => {
                          const v = e.target.value;
                          onUpdateProspect({...selectedProspect, tw_version: v});
                        }}
                        onBlur={async (e) => {
                          try {
                            await fetch(`${API_URL}/prospects/${selectedProspect.id}`, {
                              method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
                              body: JSON.stringify({...selectedProspect, tw_version: e.target.value})
                            });
                          } catch(err) { console.error(err); }
                        }}
                        style={{flex:1,padding:'5px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",background:'white'}}
                      />
                    </div>

                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                      <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px'}}>Licences actives</span>
                      <button onClick={() => { setEditingLicence(null); setLicenceForm({licence_id:'',nb_utilisateurs:0,facturation:'saas_mensuel',hebergement:'cloud',maintenance:'aucune',date_contrat:'',notes:''}); setShowLicenceForm(true); }}
                        style={{padding:'5px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                        + Licence
                      </button>
                    </div>

                    {showLicenceForm && (
                      <div style={{background:'var(--tw-bg)',border:'1px solid var(--tw-border)',borderRadius:'8px',padding:'16px',marginBottom:'14px'}}>
                        {/* Ligne 1 : tous les champs sauf Notes */}
                        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr auto 1fr 1fr 1fr',gap:'8px',marginBottom:'10px',alignItems:'end'}}>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Module</label>
                            <div style={{position:'relative'}}>
                              <div onClick={() => setShowModuleDropdown(s=>!s)}
                                style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",background:'white',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <span style={{color:licenceForm.licence_id?'var(--tw-ink)':'var(--tw-muted)'}}>
                                  {licenceForm.licence_id ? (refLicences.find(l=>String(l.id)===String(licenceForm.licence_id))?.nom||'— Choisir —') : '— Choisir —'}
                                </span>
                                <span style={{fontSize:'10px',color:'var(--tw-muted)'}}>▼</span>
                              </div>
                              {showModuleDropdown && (
                                <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:999,background:'white',border:'1px solid var(--tw-border)',borderRadius:'6px',boxShadow:'0 4px 16px rgba(0,0,0,.12)',maxHeight:'280px',overflowY:'auto',marginTop:'2px'}}>
                                  {[
                                    {groupe:'Famille Biz/Fab', modules:['Biz','Biz + Fab','Fab']},
                                    {groupe:'Famille Net', modules:['Net B2B','Net Agents seuls','Net B2B + Agents']},
                                    {groupe:'Famille Commerce', modules:['Mag','VRP','Col']},
                                    {groupe:'Famille Logistique', modules:['Log','Jet']},
                                    {groupe:'Standalone', modules:['Kub','Flux','Facturation Électronique','Compta SAGE']},
                                  ].map((g, gi) => (
                                    <div key={g.groupe}>
                                      {gi > 0 && <div style={{height:'1px',background:'var(--tw-border)',margin:'4px 0'}}></div>}
                                      <div style={{padding:'6px 12px 3px',fontSize:'11px',fontWeight:'700',color:'var(--tw-ink)',textTransform:'uppercase',letterSpacing:'.4px',pointerEvents:'none'}}>{g.groupe}</div>
                                      {g.modules.map(nom => {
                                        const l = refLicences.find(r => r.nom === nom);
                                        if (!l) return null;
                                        return (
                                          <div key={l.id}
                                            onClick={() => { setLicenceForm({...licenceForm,licence_id:String(l.id)}); setShowModuleDropdown(false); }}
                                            style={{padding:'7px 12px 7px 22px',fontSize:'13px',color:'var(--tw-slate)',cursor:'pointer',background:String(licenceForm.licence_id)===String(l.id)?'var(--tw-teal-light)':'white'}}
                                            onMouseEnter={e=>e.currentTarget.style.background='var(--tw-teal-light)'}
                                            onMouseLeave={e=>e.currentTarget.style.background=String(licenceForm.licence_id)===String(l.id)?'var(--tw-teal-light)':'white'}
                                          >{l.nom}</div>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Facturation</label>
                            <select value={licenceForm.facturation||'saas_mensuel'} onChange={e=>setLicenceForm({...licenceForm,facturation:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="perpetuelle">🔑 Perpétuelle</option>
                              <option value="saas_mensuel">📅 SaaS mensuel</option>
                              <option value="saas_annuel">📆 SaaS annuel</option>
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Nb utilisateurs</label>
                            <input type="number" value={licenceForm.nb_utilisateurs} onChange={e=>setLicenceForm({...licenceForm,nb_utilisateurs:parseInt(e.target.value)||0})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Hébergement</label>
                            <select value={licenceForm.hebergement} onChange={e=>setLicenceForm({...licenceForm,hebergement:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="cloud">☁️ Cloud ASTI</option>
                              <option value="onpremise">🏢 On-premise</option>
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:(licenceForm.facturation||'saas_mensuel')!=='perpetuelle'?'#ccc':'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Maintenance</label>
                            <select value={licenceForm.maintenance}
                              disabled={(licenceForm.facturation||'saas_mensuel')!=='perpetuelle'}
                              onChange={e=>setLicenceForm({...licenceForm,maintenance:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",
                                background:(licenceForm.facturation||'saas_mensuel')!=='perpetuelle'?'#f5f5f5':'white',
                                color:(licenceForm.facturation||'saas_mensuel')!=='perpetuelle'?'#ccc':'var(--tw-ink)',
                                cursor:(licenceForm.facturation||'saas_mensuel')!=='perpetuelle'?'not-allowed':'pointer'}}>
                              <option value="aucune">Aucune</option>
                              <option value="A2">A2 — Support technique</option>
                              <option value="A3">A3 — Support + Évolutions</option>
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Date contrat</label>
                            <input type="date" value={licenceForm.date_contrat} onChange={e=>setLicenceForm({...licenceForm,date_contrat:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          </div>
                        </div>
                        {/* Notes sur ligne séparée */}
                        <div style={{marginBottom:'10px'}}>
                          <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Notes</label>
                          <textarea value={licenceForm.notes} onChange={e=>setLicenceForm({...licenceForm,notes:e.target.value})}
                            placeholder="Optionnel" rows={2}
                            style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",resize:'vertical'}} />
                        </div>
                        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                          <button onClick={() => setShowLicenceForm(false)} style={{padding:'6px 14px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',cursor:'pointer',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>Annuler</button>
                          <button onClick={handleSaveLicence} style={{padding:'6px 14px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontWeight:'600',fontFamily:"'Inter',sans-serif"}}>Enregistrer</button>
                        </div>
                      </div>
                    )}

                    {clientLicences.length === 0 ? (
                      <div style={{textAlign:'center',padding:'20px',color:'var(--tw-muted)',fontStyle:'italic',fontSize:'13px'}}>Aucune licence enregistrée</div>
                    ) : (
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                        <thead>
                          <tr style={{background:'var(--tw-bg)'}}>
                            {['Module','Facturation','Nb users','Hébergement','Maintenance','Depuis',''].map(h => (
                              <th key={h} style={{textAlign:'left',padding:'7px 10px',fontSize:'11px',fontWeight:'600',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {clientLicences.map(l => (
                            <tr key={l.id} style={{borderBottom:'1px solid #f5f5f5'}}>
                              <td style={{padding:'8px 10px',fontWeight:'600'}}>{l.licence_nom}</td>
                              <td style={{padding:'8px 10px'}}>
                                <span style={{fontSize:'11px',fontWeight:'600',padding:'2px 8px',borderRadius:'8px',
                                  background:l.facturation==='perpetuelle'?'#fff8e1':l.facturation==='saas_annuel'?'#e8f8f0':'#e8f4fd',
                                  color:l.facturation==='perpetuelle'?'#f57c00':l.facturation==='saas_annuel'?'var(--tw-green)':'var(--tw-blue)'}}>
                                  {l.facturation==='perpetuelle'?'🔑 Perpétuelle':l.facturation==='saas_annuel'?'📆 SaaS annuel':'📅 SaaS mensuel'}
                                </span>
                              </td>
                              <td style={{padding:'8px 10px',fontVariantNumeric:'tabular-nums'}}>{l.nb_utilisateurs||'—'}</td>
                              <td style={{padding:'8px 10px',fontSize:'12px',color:'var(--tw-slate)'}}>{l.hebergement==='cloud'?'☁️ Cloud':'🏢 On-premise'}</td>
                              <td style={{padding:'8px 10px'}}>
                                <span style={{fontSize:'11px',fontWeight:'600',padding:'2px 7px',borderRadius:'6px',
                                  background:l.maintenance==='A3'?'#e8f8f0':l.maintenance==='A2'?'var(--tw-teal-light)':'#f5f5f5',
                                  color:l.maintenance==='A3'?'var(--tw-green)':l.maintenance==='A2'?'var(--tw-teal)':'var(--tw-muted)'}}>
                                  {l.maintenance==='aucune'?'—':l.maintenance}
                                </span>
                              </td>
                              <td style={{padding:'8px 10px',fontSize:'12px',color:'var(--tw-muted)'}}>{l.date_contrat?new Date(l.date_contrat).toLocaleDateString('fr-FR'):'—'}</td>
                              <td style={{padding:'8px 10px'}}>
                                <div style={{display:'flex',gap:'4px'}}>
                                  <button onClick={() => { setEditingLicence(l); setLicenceForm({licence_id:l.licence_id,nb_utilisateurs:l.nb_utilisateurs||0,facturation:l.facturation||'saas_mensuel',hebergement:l.hebergement||'cloud',maintenance:l.maintenance||'aucune',date_contrat:l.date_contrat?l.date_contrat.split('T')[0]:'',notes:l.notes||''}); setShowLicenceForm(true); }}
                                    style={{padding:'3px 7px',border:'1px solid var(--tw-border)',borderRadius:'4px',background:'white',cursor:'pointer',fontSize:'11px'}}>✏️</button>
                                  <button onClick={() => handleDeleteLicence(l.id)}
                                    style={{padding:'3px 7px',border:'none',borderRadius:'4px',background:'#f79d8d',color:'white',cursor:'pointer',fontSize:'11px'}}>🗑️</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* ── Onglet Sites (établissements) ── */}
                {clientTab === 'sites' && (
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                      <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px'}}>Sites / établissements <span style={{textTransform:'none',fontWeight:400}}>(le siège reste l'adresse de la société)</span></span>
                      <button onClick={() => { setEditingSite(null); setSiteForm({nom:'',type:'Siège',adresse:'',ville:'',cp:'',telephone:'',responsable_id:'',notes:''}); setShowSiteForm(true); }}
                        style={{padding:'5px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                        + Site
                      </button>
                    </div>

                    {showSiteForm && (
                      <div style={{background:'var(--tw-bg)',border:'1px solid var(--tw-border)',borderRadius:'8px',padding:'16px',marginBottom:'14px'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Nom du site</label>
                            <input type="text" value={siteForm.nom} onChange={e=>setSiteForm({...siteForm,nom:e.target.value})}
                              placeholder="Ex: Entrepôt Nord" style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Type</label>
                            <select value={siteForm.type} onChange={e=>setSiteForm({...siteForm,type:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              {SITE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Adresse</label>
                            <AdresseAutocomplete value={siteForm.adresse}
                              onChange={v=>setSiteForm({...siteForm,adresse:v})}
                              onSelect={s=>setSiteForm({...siteForm,adresse:s.name||s.label,cp:s.cp||siteForm.cp,ville:s.ville||siteForm.ville})}
                              placeholder="Numéro et rue"
                              inputStyle={{padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          </div>
                          {[{lbl:'Ville',field:'ville',placeholder:'Ville'},{lbl:'Code postal',field:'cp',placeholder:'59000'},{lbl:'Téléphone',field:'telephone',placeholder:'+33 ...'}].map(({lbl,field,placeholder}) => (
                            <div key={field}>
                              <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>{lbl}</label>
                              <input type="text" value={siteForm[field]} onChange={e=>setSiteForm({...siteForm,[field]:e.target.value})}
                                placeholder={placeholder} style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                            </div>
                          ))}
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Responsable</label>
                            <select value={siteForm.responsable_id} onChange={e=>setSiteForm({...siteForm,responsable_id:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="">— Aucun —</option>
                              {interlocuteurs.map(i => <option key={i.id} value={i.id}>{i.nom}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{marginBottom:'10px'}}>
                          <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Notes</label>
                          <input type="text" value={siteForm.notes} onChange={e=>setSiteForm({...siteForm,notes:e.target.value})}
                            style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} placeholder="Optionnel" />
                        </div>
                        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                          <button onClick={() => setShowSiteForm(false)} style={{padding:'6px 14px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',cursor:'pointer',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>Annuler</button>
                          <button onClick={handleSaveSite} style={{padding:'6px 14px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontWeight:'600',fontFamily:"'Inter',sans-serif"}}>Enregistrer</button>
                        </div>
                      </div>
                    )}

                    {clientSites.length === 0 ? (
                      <div style={{textAlign:'center',padding:'20px',color:'var(--tw-muted)',fontStyle:'italic',fontSize:'13px'}}>Aucun site enregistré. Le siège reste l'adresse de la société.</div>
                    ) : clientSites.map(s => {
                      const contactsSite = (interlocuteurs || []).filter(i => i.site_id === s.id);
                      return (
                        <div key={s.id} style={{border:'1px solid var(--tw-border)',borderRadius:'8px',overflow:'hidden',marginBottom:'10px'}}>
                          <div style={{padding:'10px 14px',background:'var(--tw-teal-light)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <div>
                              <div style={{fontWeight:'600',fontSize:'13px',color:'var(--tw-teal)'}}>{s.nom} <span style={{fontSize:'11px',fontWeight:600,background:'white',color:'var(--tw-teal)',borderRadius:'10px',padding:'1px 8px',marginLeft:'4px'}}>{s.type||'Autre'}</span></div>
                              <div style={{fontSize:'12px',color:'var(--tw-teal)',opacity:.8,marginTop:'2px'}}>{[s.adresse,s.cp,s.ville].filter(Boolean).join(', ')||'Adresse non renseignée'}</div>
                            </div>
                            <div style={{display:'flex',gap:'5px'}}>
                              <button onClick={() => { setEditingSite(s); setSiteForm({nom:s.nom,type:s.type||'Autre',adresse:s.adresse||'',ville:s.ville||'',cp:s.cp||'',telephone:s.telephone||'',responsable_id:s.responsable_id||'',notes:s.notes||''}); setShowSiteForm(true); }}
                                style={{padding:'3px 8px',border:'1px solid var(--tw-teal)',borderRadius:'4px',background:'white',color:'var(--tw-teal)',cursor:'pointer',fontSize:'12px'}}>✏️</button>
                              <button onClick={() => handleDeleteSite(s.id)}
                                style={{padding:'3px 8px',border:'none',borderRadius:'4px',background:'#f79d8d',color:'white',cursor:'pointer',fontSize:'12px'}}>🗑️</button>
                            </div>
                          </div>
                          <div style={{padding:'12px 14px',background:'white',fontSize:'12px'}}>
                            <div style={{marginBottom: contactsSite.length ? '8px':'0'}}><span style={{color:'var(--tw-muted)'}}>Responsable : </span><span style={{fontWeight:'500'}}>{s.responsable_nom||'—'}</span>{s.telephone && <span style={{color:'var(--tw-muted)'}}> · {s.telephone}</span>}</div>
                            {contactsSite.length > 0 && (
                              <div><span style={{color:'var(--tw-muted)'}}>Contacts rattachés : </span>{contactsSite.map((i,idx)=>(<span key={i.id}>{idx>0?', ':''}<span style={{fontWeight:500}}>{[i.prenom,i.nom].filter(Boolean).join(' ')}</span>{i.fonction?` (${i.fonction})`:''}</span>))}</div>
                            )}
                            {s.notes && <div style={{color:'var(--tw-muted)',marginTop:'6px'}}>{s.notes}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Onglet Boutiques ── */}
                {clientTab === 'boutiques' && (
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                      <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px'}}>Boutiques</span>
                      <button onClick={() => { setEditingBoutique(null); setBoutiqueForm({nom:'',adresse:'',ville:'',cp:'',telephone:'',responsable_id:'',notes:''}); setShowBoutiqueForm(true); }}
                        style={{padding:'5px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                        + Boutique
                      </button>
                    </div>

                    {showBoutiqueForm && (
                      <div style={{background:'var(--tw-bg)',border:'1px solid var(--tw-border)',borderRadius:'8px',padding:'16px',marginBottom:'14px'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                          {[
                            {lbl:'Nom boutique',field:'nom',placeholder:'Ex: Paris - Etienne Marcel'},
                            {lbl:'Adresse',field:'adresse',placeholder:'Numéro et rue'},
                            {lbl:'Ville',field:'ville',placeholder:'Ville'},
                            {lbl:'Code postal',field:'cp',placeholder:'75001'},
                            {lbl:'Téléphone',field:'telephone',placeholder:'+33 1 ...'},
                          ].map(({lbl,field,placeholder}) => (
                            <div key={field}>
                              <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>{lbl}</label>
                              {field === 'adresse'
                                ? <AdresseAutocomplete value={boutiqueForm.adresse}
                                    onChange={v=>setBoutiqueForm({...boutiqueForm,adresse:v})}
                                    onSelect={s=>setBoutiqueForm({...boutiqueForm,adresse:s.name||s.label,cp:s.cp||boutiqueForm.cp,ville:s.ville||boutiqueForm.ville})}
                                    placeholder={placeholder}
                                    inputStyle={{padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                                : <input type="text" value={boutiqueForm[field]} onChange={e=>setBoutiqueForm({...boutiqueForm,[field]:e.target.value})}
                                    placeholder={placeholder}
                                    style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                              }
                            </div>
                          ))}
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Responsable</label>
                            <select value={boutiqueForm.responsable_id} onChange={e=>setBoutiqueForm({...boutiqueForm,responsable_id:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="">— Aucun —</option>
                              {interlocuteurs.map(i => <option key={i.id} value={i.id}>{i.nom}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{marginBottom:'10px'}}>
                          <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Notes</label>
                          <input type="text" value={boutiqueForm.notes} onChange={e=>setBoutiqueForm({...boutiqueForm,notes:e.target.value})}
                            style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} placeholder="Optionnel" />
                        </div>
                        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                          <button onClick={() => setShowBoutiqueForm(false)} style={{padding:'6px 14px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',cursor:'pointer',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>Annuler</button>
                          <button onClick={handleSaveBoutique} style={{padding:'6px 14px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontWeight:'600',fontFamily:"'Inter',sans-serif"}}>Enregistrer</button>
                        </div>
                      </div>
                    )}

                    {clientBoutiques.length === 0 ? (
                      <div style={{textAlign:'center',padding:'20px',color:'var(--tw-muted)',fontStyle:'italic',fontSize:'13px'}}>Aucune boutique enregistrée</div>
                    ) : clientBoutiques.map(b => {
                      const matsB = clientMateriel.filter(m => m.boutique_id === b.id);
                      return (
                        <div key={b.id} style={{border:'1px solid var(--tw-border)',borderRadius:'8px',overflow:'hidden',marginBottom:'10px'}}>
                          <div style={{padding:'10px 14px',background:'var(--tw-teal-light)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <div>
                              <div style={{fontWeight:'600',fontSize:'13px',color:'var(--tw-teal)'}}>🏪 {b.nom}</div>
                              <div style={{fontSize:'12px',color:'var(--tw-teal)',opacity:.8,marginTop:'2px'}}>{[b.adresse,b.ville,b.cp].filter(Boolean).join(', ')||'Adresse non renseignée'}</div>
                            </div>
                            <div style={{display:'flex',gap:'5px'}}>
                              <button onClick={() => { setEditingBoutique(b); setBoutiqueForm({nom:b.nom,adresse:b.adresse||'',ville:b.ville||'',cp:b.cp||'',telephone:b.telephone||'',responsable_id:b.responsable_id||'',notes:b.notes||''}); setShowBoutiqueForm(true); }}
                                style={{padding:'3px 8px',border:'1px solid var(--tw-teal)',borderRadius:'4px',background:'white',color:'var(--tw-teal)',cursor:'pointer',fontSize:'12px'}}>✏️</button>
                              <button onClick={() => handleDeleteBoutique(b.id)}
                                style={{padding:'3px 8px',border:'none',borderRadius:'4px',background:'#f79d8d',color:'white',cursor:'pointer',fontSize:'12px'}}>🗑️</button>
                            </div>
                          </div>
                          <div style={{padding:'12px 14px',background:'white'}}>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'10px',fontSize:'12px'}}>
                              <div><span style={{color:'var(--tw-muted)'}}>Responsable : </span><span style={{fontWeight:'500'}}>{b.responsable_nom||'—'}</span></div>
                              <div><span style={{color:'var(--tw-muted)'}}>Tél : </span><span style={{fontWeight:'500'}}>{b.telephone||'—'}</span></div>
                            </div>
                            {matsB.length > 0 && (
                              <div>
                                <div style={{fontSize:'11.5px',color:'var(--tw-slate)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'6px'}}>Matériel</div>
                                <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                                  {matsB.map(m => (
                                    <span key={m.id} style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 9px',background:'var(--tw-bg)',border:'1px solid var(--tw-border)',borderRadius:'12px',fontSize:'12px',color:'var(--tw-slate)'}}>
                                      {m.type_icone} {m.type_nom} <strong style={{color:'var(--tw-ink)'}}>×{m.nb_unites}</strong> <span style={{color:'var(--tw-muted)',fontSize:'11px'}}>{m.marque} {m.modele}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Onglet Matériel ── */}
                {clientTab === 'materiel' && (
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                      <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px'}}>Parc matériel</span>
                      <button onClick={() => { setEditingMateriel(null); setMaterielForm({boutique_id:'',materiel_type_id:'',marque:'',modele:'',os:'',version_os:'',nb_unites:1,localisation:'',date_achat:'',notes:''}); setShowMaterielForm(true); }}
                        style={{padding:'5px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                        + Appareil
                      </button>
                    </div>

                    {showMaterielForm && (
                      <div style={{background:'var(--tw-bg)',border:'1px solid var(--tw-border)',borderRadius:'8px',padding:'16px',marginBottom:'14px'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Type</label>
                            <select value={materielForm.materiel_type_id} onChange={e=>setMaterielForm({...materielForm,materiel_type_id:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="">— Choisir —</option>
                              {refMaterielTypes.map(t => <option key={t.id} value={t.id}>{t.icone} {t.nom}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Boutique</label>
                            <select value={materielForm.boutique_id} onChange={e=>setMaterielForm({...materielForm,boutique_id:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="">Siège / Non défini</option>
                              {clientBoutiques.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                            </select>
                          </div>
                          {[
                            {lbl:'Marque',field:'marque',placeholder:'Ex: Honeywell'},
                            {lbl:'Modèle',field:'modele',placeholder:'Ex: CT45'},
                            {lbl:'OS',field:'os',placeholder:'Ex: Android'},
                            {lbl:'Version OS',field:'version_os',placeholder:'Ex: 12'},
                            {lbl:'Localisation',field:'localisation',placeholder:'Ex: Entrepôt Paris'},
                          ].map(({lbl,field,placeholder}) => (
                            <div key={field}>
                              <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>{lbl}</label>
                              <input type="text" value={materielForm[field]} onChange={e=>setMaterielForm({...materielForm,[field]:e.target.value})}
                                placeholder={placeholder}
                                style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                            </div>
                          ))}
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Nb unités</label>
                            <input type="number" value={materielForm.nb_unites} onChange={e=>setMaterielForm({...materielForm,nb_unites:parseInt(e.target.value)||1})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Date achat</label>
                            <input type="date" value={materielForm.date_achat} onChange={e=>setMaterielForm({...materielForm,date_achat:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          </div>
                        </div>
                        <div style={{marginBottom:'10px'}}>
                          <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Notes</label>
                          <input type="text" value={materielForm.notes} onChange={e=>setMaterielForm({...materielForm,notes:e.target.value})}
                            style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} placeholder="Optionnel" />
                        </div>
                        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                          <button onClick={() => setShowMaterielForm(false)} style={{padding:'6px 14px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',cursor:'pointer',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>Annuler</button>
                          <button onClick={handleSaveMateriel} style={{padding:'6px 14px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontWeight:'600',fontFamily:"'Inter',sans-serif"}}>Enregistrer</button>
                        </div>
                      </div>
                    )}

                    {clientMateriel.length === 0 ? (
                      <div style={{textAlign:'center',padding:'20px',color:'var(--tw-muted)',fontStyle:'italic',fontSize:'13px'}}>Aucun matériel enregistré</div>
                    ) : (
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                        <thead>
                          <tr style={{background:'var(--tw-bg)'}}>
                            {['Type','Marque / Modèle','OS','Qté','Localisation','Date achat',''].map(h => (
                              <th key={h} style={{textAlign:'left',padding:'7px 10px',fontSize:'11px',fontWeight:'600',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {clientMateriel.map(m => (
                            <tr key={m.id} style={{borderBottom:'1px solid #f5f5f5'}}>
                              <td style={{padding:'8px 10px'}}><span style={{fontSize:'16px'}}>{m.type_icone||'💻'}</span> {m.type_nom||'—'}</td>
                              <td style={{padding:'8px 10px',fontWeight:'600'}}>{m.marque||'—'} <span style={{fontWeight:'400',color:'var(--tw-slate)'}}>{m.modele||''}</span></td>
                              <td style={{padding:'8px 10px'}}><span style={{fontSize:'11px',padding:'2px 7px',borderRadius:'6px',background:'#f0f0f0',color:'var(--tw-slate)',fontWeight:'500'}}>{[m.os,m.version_os].filter(Boolean).join(' ')||'—'}</span></td>
                              <td style={{padding:'8px 10px',fontWeight:'700',fontVariantNumeric:'tabular-nums'}}>{m.nb_unites}</td>
                              <td style={{padding:'8px 10px',fontSize:'12px',color:'var(--tw-slate)'}}>{m.boutique_nom||m.localisation||'Siège'}</td>
                              <td style={{padding:'8px 10px',fontSize:'12px',color:'var(--tw-muted)'}}>{m.date_achat?new Date(m.date_achat).toLocaleDateString('fr-FR'):'—'}</td>
                              <td style={{padding:'8px 10px'}}>
                                <div style={{display:'flex',gap:'4px'}}>
                                  <button onClick={() => { setEditingMateriel(m); setMaterielForm({boutique_id:m.boutique_id||'',materiel_type_id:m.materiel_type_id||'',marque:m.marque||'',modele:m.modele||'',os:m.os||'',version_os:m.version_os||'',nb_unites:m.nb_unites||1,localisation:m.localisation||'',date_achat:m.date_achat?m.date_achat.split('T')[0]:'',notes:m.notes||''}); setShowMaterielForm(true); }}
                                    style={{padding:'3px 7px',border:'1px solid var(--tw-border)',borderRadius:'4px',background:'white',cursor:'pointer',fontSize:'11px'}}>✏️</button>
                                  <button onClick={() => handleDeleteMateriel(m.id)}
                                    style={{padding:'3px 7px',border:'none',borderRadius:'4px',background:'#f79d8d',color:'white',cursor:'pointer',fontSize:'11px'}}>🗑️</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* ── Onglet Affaires ── */}
                {clientTab === 'affaires' && (
                  <ActivitiesSection
                    nextActions={nextActions}
                    statusHistory={statusHistory}
                    onAddNextAction={onAddNextAction}
                    onToggleNextAction={onToggleNextAction}
                    onDeleteNextAction={onDeleteNextAction}
                    newActionType={newActionType}
                    onActionTypeChange={onActionTypeChange}
                    newActionDate={newActionDate}
                    onActionDateChange={onActionDateChange}
                    newActionActor={newActionActor}
                    onActionActorChange={onActionActorChange}
                    newActionContact={newActionContact}
                    onActionContactChange={onActionContactChange}
                    newActionComment={newActionComment}
                    onActionCommentChange={onActionCommentChange}
                    user={user}
                    API_URL={API_URL}
                    interlocuteurs={interlocuteurs}
                    affairesList={affairesList}
                    fetchAffaires={fetchAffaires}
                    selectedAffaireId={selectedAffaireId}
                    setSelectedAffaireId={setSelectedAffaireId}
                    expandedActionId={expandedActionId}
                    setExpandedActionId={setExpandedActionId}
                    handleAddAffaire={handleAddAffaire}
                    handleEditAffaire={handleEditAffaire}
                    handleSaveAffaire={handleSaveAffaire}
                    handleDeleteAffaire={handleDeleteAffaire}
                    showAffaireForm={showAffaireForm}
                    setShowAffaireForm={setShowAffaireForm}
                    editingAffaireId={editingAffaireId}
                    setEditingAffaireId={setEditingAffaireId}
                    affaireFormData={affaireFormData}
                    setAffaireFormData={setAffaireFormData}
                    affairesActions={affairesActions}
                    handleOpenActionAffaireForm={handleOpenActionAffaireForm}
                    handleToggleActionAffaire={handleToggleActionAffaire}
                    handleDeleteActionAffaire={handleDeleteActionAffaire}
                    showActionAffaireForm={showActionAffaireForm}
                    setShowActionAffaireForm={setShowActionAffaireForm}
                    actionAffaireFormData={actionAffaireFormData}
                    setActionAffaireFormData={setActionAffaireFormData}
                    handleSaveActionAffaire={handleSaveActionAffaire}
                    devisList={devisList}
                    onEdit={onEdit}
                    showDevisForm={showDevisForm}
                    setShowDevisForm={setShowDevisForm}
                    editingDevisId={editingDevisId}
                    setEditingDevisId={setEditingDevisId}
                    editingDevis={editingDevis}
                    setEditingDevis={setEditingDevis}
                    devisFormData={devisFormData}
                    setDevisFormData={setDevisFormData}
                    devisPdfFile={devisPdfFile}
                    setDevisPdfFile={setDevisPdfFile}
                    isUploadingDevisPdf={isUploadingDevisPdf}
                    handleAddDevis={handleAddDevis} handleAddDevisLibre={handleAddDevisLibre} handleAddDevisTexasWin={handleAddDevisTexasWin} showDevisTypeModal={showDevisTypeModal} setShowDevisTypeModal={setShowDevisTypeModal}
                    handleEditDevis={handleEditDevis}
                    handleSaveDevis={handleSaveDevis}
                    handleQuickDevisStatus={handleQuickDevisStatus}
                    handleAnnulerRemplacer={handleAnnulerRemplacer}
                    handleSaveMotifPerte={handleSaveMotifPerte}
                    handleDeleteDevis={handleDeleteDevis}
                    handleDeleteDevisPDF={handleDeleteDevisPDF}
                    handleUploadDevisPdfDirect={handleUploadDevisPdfDirect}
                    handleRattacherDevisAffaire={handleRattacherDevisAffaire}
                    selectedProspect={selectedProspect}
                    onRequestCompleteAction={setCompletingAction}
                    fetchDevis={fetchDevis}
                  />
                )}

                {/* ── Onglet Actions/Tâches ── */}
                {clientTab === 'communication' && (
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                      <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px'}}>Toutes les actions</span>
                      <button
                        onClick={() => setShowCommForm(s => !s)}
                        style={{padding:'5px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                        + Nouvelle action
                      </button>
                    </div>

                    {showCommForm && (
                      <div style={{background:'var(--tw-bg)',border:'1px solid var(--tw-border)',borderRadius:'8px',padding:'16px',marginBottom:'14px'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.5fr',gap:'10px',marginBottom:'10px'}}>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Type</label>
                            <select value={commForm.action_type} onChange={e=>setCommForm({...commForm,action_type:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              {ACTION_TYPES.map(t=><option key={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Date</label>
                            <input type="date" value={commForm.planned_date} onChange={e=>setCommForm({...commForm,planned_date:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Affaire / Marketing</label>
                            <select value={commForm.contexte_val} onChange={e=>setCommForm({...commForm,contexte_val:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="">-- Aucun --</option>
                              <option value="marketing">Marketing</option>
                              {affairesList.length > 0 && <option disabled>──────────</option>}
                              {affairesList.map(a=><option key={a.id} value={`affaire_${a.id}`}>{a.nom_affaire}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>De (Acteur)</label>
                            <select value={commForm.actor} onChange={e=>setCommForm({...commForm,actor:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="">-- Acteur --</option>
                              {['Christian','Roger','Frederic'].map(n=><option key={n}>{n}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Vers (Contact)</label>
                            <select value={commForm.contact} onChange={e=>setCommForm({...commForm,contact:e.target.value})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value="">-- Contact --</option>
                              <option value="Interne">Interne</option>
                              {interlocuteurs.map(i=><option key={i.id} value={i.nom}>{i.nom}{i.fonction?' ('+i.fonction+')':''}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Priorité</label>
                            <select value={commForm.priority} onChange={e=>setCommForm({...commForm,priority:Number(e.target.value)})}
                              style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>
                              <option value={1}>Normale</option>
                              <option value={2}>Haute</option>
                            </select>
                          </div>
                        </div>
                        <div style={{marginBottom:'10px'}}>
                          <label style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',display:'block',marginBottom:'4px'}}>Commentaire</label>
                          <textarea value={commForm.comment} onChange={e=>setCommForm({...commForm,comment:e.target.value})}
                            placeholder="Optionnel"
                            style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",minHeight:'60px',resize:'vertical'}} />
                        </div>
                        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                          <button onClick={() => setShowCommForm(false)} style={{padding:'6px 14px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',cursor:'pointer',fontSize:'13px',fontFamily:"'Inter',sans-serif"}}>Annuler</button>
                          <button onClick={async () => {
                            if (!commForm.action_type) return;
                            const isAffaire = commForm.contexte_val.startsWith('affaire_');
                            const affaire_id = isAffaire ? parseInt(commForm.contexte_val.replace('affaire_','')) : null;
                            const contexte = commForm.contexte_val === 'marketing' ? 'Marketing' : null;
                            await fetch(`${API_URL}/prospects/${selectedProspect.id}/next_actions`, {
                              method:'POST',
                              headers:{'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
                              body: JSON.stringify({action_type:commForm.action_type, planned_date:commForm.planned_date, actor:commForm.actor, contact:commForm.contact, completed_note:commForm.comment, affaire_id, contexte, priority:commForm.priority})
                            });
                            fetchAllActions(selectedProspect.id);
                            fetchNextActions(selectedProspect.id);
                            setCommForm({action_type:'Appel',planned_date:new Date().toISOString().split('T')[0],actor:'',contact:'',comment:'',contexte_val:'',priority:1});
                            setShowCommForm(false);
                          }} style={{padding:'6px 14px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontWeight:'600',fontFamily:"'Inter',sans-serif"}}>Enregistrer</button>
                        </div>
                      </div>
                    )}

                    {allActions.length === 0 ? (
                      <div style={{textAlign:'center',padding:'20px',color:'var(--tw-muted)',fontStyle:'italic',fontSize:'13px'}}>Aucune action enregistrée</div>
                    ) : (() => {
                      // Regrouper les actions par affaire (ou Marketing / Sans affaire)
                      const groupsMap = {};
                      allActions.forEach(a => {
                        const key = a.affaire_id ? `affaire_${a.affaire_id}` : (a.contexte === 'Marketing' ? 'marketing' : 'autres');
                        if (!groupsMap[key]) {
                          groupsMap[key] = {
                            key,
                            title: a.nom_affaire || (a.contexte === 'Marketing' ? 'Marketing' : 'Sans affaire'),
                            actions: [],
                            lastDate: 0
                          };
                        }
                        const t = a.planned_date ? new Date(a.planned_date).getTime() : 0;
                        groupsMap[key].actions.push(a);
                        if (t > groupsMap[key].lastDate) groupsMap[key].lastDate = t;
                      });
                      const groups = Object.values(groupsMap);
                      // Plus récentes en haut dans chaque groupe
                      groups.forEach(g => g.actions.sort((x, y) => {
                        const tx = x.planned_date ? new Date(x.planned_date).getTime() : 0;
                        const ty = y.planned_date ? new Date(y.planned_date).getTime() : 0;
                        return ty - tx;
                      }));
                      // Le groupe avec l'action la plus récente en premier
                      groups.sort((g1, g2) => g2.lastDate - g1.lastDate);

                      return groups.map(g => (
                        <div key={g.key} style={{marginBottom:'18px'}}>
                          <div style={{fontSize:'11px',fontWeight:'700',color:'var(--tw-teal)',textTransform:'uppercase',letterSpacing:'.5px',padding:'0 0 5px',marginBottom:'8px',borderBottom:'2px solid var(--tw-teal-light)'}}>
                            {g.title}
                          </div>
                          {g.actions.map(a => {
                            const today = new Date(); today.setHours(0,0,0,0);
                            const d = a.planned_date ? new Date(a.planned_date) : null;
                            const isLate = d && d < today && !a.completed;
                            return (
                              <div key={a.id} style={{display:'flex',alignItems:'flex-start',gap:'12px',padding:'10px 14px',borderRadius:'6px',background:a.completed?'var(--tw-bg)':'white',border:'1px solid var(--tw-border)',marginBottom:'6px',opacity:a.completed?.7:1}}>
                                <input type="checkbox" checked={!!a.completed} onChange={() => { if (a.completed) { onToggleNextAction(a.id, a.completed); } else { setCompletingAction(a); } }}
                                  style={{width:'16px',height:'16px',cursor:'pointer',accentColor:'var(--tw-teal)',flexShrink:0,marginTop:'2px'}} />
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                                    <span style={{fontSize:'13px',fontWeight:'600',color:a.completed?'var(--tw-muted)':'var(--tw-ink)',textDecoration:a.completed?'line-through':'none'}}>
                                      {a.action_type}
                                    </span>
                                  </div>
                                  <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'3px',display:'flex',gap:'10px',flexWrap:'wrap'}}>
                                    <span style={{color:isLate?'var(--tw-red)':a.completed?'var(--tw-green)':'var(--tw-slate)',fontWeight:isLate?'600':'400'}}>
                                      {d?d.toLocaleDateString('fr-FR'):'—'}{isLate?' ⚠️':''}
                                    </span>
                                    {a.actor && <span>{a.actor}</span>}
                                    {a.contact && <span>→ {a.contact}</span>}
                                  </div>
                                  {a.completed_note && <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'3px',fontStyle:'italic'}}>{a.completed_note}</div>}
                                </div>
                                <button onClick={() => onDeleteNextAction(a.id)}
                                  style={{padding:'3px 7px',border:'none',borderRadius:'4px',background:'#f79d8d',color:'white',cursor:'pointer',fontSize:'11px',flexShrink:0}}>🗑️</button>
                              </div>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                )}

                {/* Modale de complétion : partagée entre l'onglet Actions/Tâches et les actions
                    d'une affaire (onglet Affaires) — même formulaire dans les deux cas */}
                {completingAction && (
                  <ActionCompleteModal action={completingAction} prospectId={selectedProspect && selectedProspect.id} API_URL={API_URL} token={user.token} affairesList={affairesList} interlocuteurs={interlocuteurs} onClose={() => setCompletingAction(null)} onCompleted={() => { if (selectedProspect) { fetchNextActions(selectedProspect.id); fetchAllActions(selectedProspect.id); fetchAffaires(selectedProspect.id); } }} />
                )}

              </div>
            </div>
            );
          })()}

        </div>
      );
    }

