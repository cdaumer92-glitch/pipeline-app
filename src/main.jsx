import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
// Overlay palette (Ctrl+K) : importé en side-effect pour monter son propre root #twnav-root.
import './overlay.jsx';
import { CampagnesPage } from './components/Campagnes.jsx';
import { styles } from './lib/styles.js';
import { ACTION_TYPES } from './lib/constants.js';
import { LoginForm } from './components/LoginForm.jsx';
import { I, displayName, ICONS, IconBtn, typeChip, getActionStatus, prospectDisplayName, getEmptyProspect, calculateTotal, formatCurrency, formatNumber, getStatusColor, getProspectCountByCommercial, getProspectRealStatus } from './lib/shared.jsx';
import { ProspectForm } from './components/ProspectForm.jsx';
import { ActivitiesSection } from './components/ActivitiesSection.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ListesView } from './components/ListesView.jsx';
import { Header } from './components/Header.jsx';
import { LeftPanel } from './components/LeftPanel.jsx';
import { DashboardConsultant } from './components/DashboardConsultant.jsx';
import { NavTabBar } from './components/NavTabBar.jsx';
import { ActionCompleteModal } from './components/ActionCompleteModal.jsx';
import { MotifPerteField } from './components/MotifPerteField.jsx';
import { RecapModal } from './components/RecapModal.jsx';
import { ModulesDisplay } from './components/ModulesDisplay.jsx';
import { AttributionView } from './components/AttributionView.jsx';
import { Settings } from './components/Settings.jsx';
import { SuspectsNonAttribuesPanel } from './components/SuspectsNonAttribuesPanel.jsx';
import { ImportPanel } from './components/ImportPanel.jsx';
import { CommercialEditor } from './components/CommercialEditor.jsx';
// Reconstitue l'objet ReactDOM global attendu par le code existant (createRoot + createPortal).
const ReactDOM = { createRoot, createPortal };

    // ================== APP PRINCIPALE ==================
    console.log('[Pipeline] Version chargée: ' + new Date().toISOString());
    const API_URL = '/api';

    // ==================== HELPERS SOCIETEINFO : débit maîtrisé ====================
    // L'API SocieteInfo limite le débit (429 Too Many Requests) : enchaîner des dizaines
    // d'appels en parallèle la fait cracher (429/500). Ces deux helpers encadrent tous
    // nos traitements en lot (marquage contacts, enrichissement à l'import).

    // Réexécute un appel SInfo en cas d'erreur transitoire (429 rate-limit / 500),
    // avec back-off exponentiel. Les autres erreurs (404, etc.) remontent immédiatement.
    // Les erreurs SInfo portent err.status (cf. call() dans societeinfo.js).
    async function siCallWithRetry(fn, { retries = 2, baseDelay = 600 } = {}) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn();
        } catch (err) {
          const transient = err && (err.status === 429 || err.status === 500);
          if (!transient || attempt >= retries) throw err;
          await new Promise(r => setTimeout(r, baseDelay * (attempt + 1)));
        }
      }
    }

    // Applique `worker` à chaque item avec une concurrence bornée (pool de N workers
    // tirant dans une file commune). Retourne un tableau aligné sur `items` :
    // { value } en cas de succès, { error } si le worker a échoué (sans interrompre les autres).
    async function mapWithConcurrency(items, worker, concurrency = 4) {
      const results = new Array(items.length);
      let cursor = 0;
      const run = async () => {
        while (cursor < items.length) {
          const idx = cursor++;
          try {
            results[idx] = { value: await worker(items[idx], idx) };
          } catch (error) {
            results[idx] = { error };
          }
        }
      };
      const pool = Array.from({ length: Math.min(concurrency, items.length) }, run);
      await Promise.all(pool);
      return results;
    }

    // Construit l'objet `infoForm` de la fiche société à partir d'un prospect.
    // Factorisé pour être réutilisé par les deux effets de synchronisation
    // (init au changement de fiche + re-sync quand le contenu change, ex. enrichissement).
    function buildInfoForm(p) {
      return {
        name: p?.name || '',
        adresse: p?.adresse || '',
        website: p?.website || '',
        tel_standard: p?.tel_standard || '',
        assigned_to: p?.assigned_to || '',
        notes: p?.notes || '',
        siren: p?.siren || '',
        code_naf: p?.code_naf || '',
        created_at: p?.created_at ? new Date(p.created_at).toISOString().split('T')[0] : '',
        marques: Array.isArray(p?.marques) ? p.marques : [],
      };
    }

    // ==================== HELPER NOMS INTERLOCUTEURS ====================
    // Combinaison prenom + nom pour affichage. Gère les 3 cas :
    //  - prenom + nom    → "Maurice Leblanc"
    //  - juste nom       → "Leblanc" (anciens contacts non splittés ou contacts sans prénom)
    //  - juste prenom    → "Maurice" (rare, mais cohérent)
    //  - rien            → "" (jamais affiché en pratique)
    // Source unique pour toute l'app : si on change le format un jour, c'est ici.
    // Variante "initiales" pour les avatars (max 2 lettres)
    function displayInitials(c) {
      if (!c) return '?';
      const p = (c.prenom || '').trim();
      const n = (c.nom || '').trim();
      // Priorité : 1ère lettre prénom + 1ère lettre nom, sinon 2 premières du nom
      if (p && n) return (p[0] + n[0]).toUpperCase();
      const src = p || n || '?';
      return src.split(/\s+/).map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || '?';
    }


    // ================== INTERCEPTEUR 401 + DÉTECTEUR D'INACTIVITÉ ==================
    // Patche window.fetch pour intercepter les 401 sur les routes /api/* et déclencher
    // une déconnexion propre + redirection vers le login.
    // Inclut un message contextuel selon la raison (session forcée / inactivité).
    (function setupAuthInterceptor() {
      const originalFetch = window.fetch;
      let alreadyRedirecting = false;

      window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        // On n'intercepte que les 401 sur les routes API (pas les ressources externes ni les téléchargements)
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        if (response.status === 401 && url.startsWith('/api/') && !alreadyRedirecting) {
          alreadyRedirecting = true;
          try {
            const errBody = await response.clone().json().catch(() => ({}));
            const code = errBody.code;
            let message = 'Votre session a expiré. Veuillez vous reconnecter.';
            if (code === 'SESSION_INACTIVE') {
              message = 'Votre session a été fermée par un administrateur. Veuillez vous reconnecter.';
            } else if (code === 'SESSION_EXPIRED_INACTIVITY') {
              message = 'Votre session a expiré après 1h d\'inactivité. Veuillez vous reconnecter.';
            }
            // Nettoyer le localStorage et rediriger
            localStorage.removeItem('user');
            alert(message);
            window.location.href = '/';
          } catch (e) {
            // Si on n'arrive pas à parser la réponse, on déconnecte quand même
            localStorage.removeItem('user');
            window.location.href = '/';
          }
        }
        return response;
      };
    })();
    // ================== FIN INTERCEPTEUR ==================

    // ================== UTILITAIRES (définis avant App) ==================

    // ── Icônes SVG line-icons + bouton icône réutilisable ──
    // Anciennement défini en local dans la section Affaires (RightPanel) ;
    // remonté ici pour réutilisation depuis n'importe quel composant
    // (Contacts, Affaires, Devis, Historique RGPD, etc.)


    // ══════════════════════════════════════════════════
    // NAVTABBAR — onglets façon navigateur (phase 2 nav rapide)
    // Composant autonome piloté UNIQUEMENT par props : il gère sa liste d'onglets ;
    // l'onglet actif reflète la vue courante de l'app (prop currentView) ; changer
    // d'onglet restaure une vue via onRestore(descriptor). Aucun couplage externe.
    // ══════════════════════════════════════════════════

    // ══════════════════════════════════════════════════
    // LISTESVIEW — 3 listes transverses (devis en cours / sociétés / actions)
    // Filtrées par droits (non-admin = ses données) + filtre commercial (admin).
    // Clic sur une ligne = ouvre la fiche (event tw:navigate, réutilise la nav).
    // ══════════════════════════════════════════════════
    function App() {
      const [user, setUser] = React.useState(null);
      const [isDashboard, setIsDashboard] = React.useState(true);
      const [listeView, setListeView] = React.useState(null); // null | 'devis' | 'societes' | 'actions' (listes transverses)
      const [showAttribution, setShowAttribution] = React.useState(false);
      const [showCampagnes, setShowCampagnes] = React.useState(false);
      const isUserAdmin = (u) => u && ['Christian', 'Frédéric', 'Frederic'].includes(u.name);
      const [selectedCommercial, setSelectedCommercial] = React.useState(null);
      const [showSettings, setShowSettings] = React.useState(false);
      const [showRecap, setShowRecap] = React.useState(false);
      const [recapCommercial, setRecapCommercial] = React.useState(null);
      const [recapPeriod, setRecapPeriod] = React.useState('jour'); // 'jour', 'semaine', 'mois'
      const [recapDate, setRecapDate] = React.useState(new Date().toISOString().split('T')[0]);
      const [prospects, setProspects] = React.useState([]);
      const [codesNaf, setCodesNaf] = React.useState([]);
      const [appUsers, setAppUsers] = React.useState([]);
      const [activities, setActivities] = React.useState({});
      const [nextActions, setNextActions] = React.useState([]);
      const [allActions, setAllActions] = React.useState([]);
      const [statusHistory, setStatusHistory] = React.useState([]);
      const [actionNotes, setActionNotes] = React.useState({});
      const [prospectActionsInfo, setProspectActionsInfo] = React.useState({});
      const [newActionType, setNewActionType] = React.useState('Appel');
      const [newActionDate, setNewActionDate] = React.useState(new Date().toISOString().split('T')[0]);
      const [newActionComment, setNewActionComment] = React.useState('');
      const [newActionActor, setNewActionActor] = React.useState('');
      const [newActionContact, setNewActionContact] = React.useState('');
      const [tempActionComments, setTempActionComments] = React.useState({});
      const [selectedProspect, setSelectedProspect] = React.useState(null);
      const [showForm, setShowForm] = React.useState(false);
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

      const [formData, setFormData] = React.useState(getEmptyProspect());
      const [interlocuteurs, setInterlocuteurs] = React.useState([]);
      const [showInterlocuteurForm, setShowInterlocuteurForm] = React.useState(false);

      // RGPD - États pour le collapse "Historique consentements" du formulaire d'édition
      const [historyExpanded, setHistoryExpanded] = React.useState(false);
      // Drag & drop des contacts : états gérés au niveau App pour passage en props
      // à RightPanel (les hooks ne peuvent pas être appelés dans une IIFE).
      const [draggedContactId, setDraggedContactId] = React.useState(null);
      const [dragOverContactId, setDragOverContactId] = React.useState(null);

      // Repli du panneau de gauche : volontairement non persisté entre sessions.
      // Le panneau est toujours ouvert au chargement pour éviter les écrans vides
      // (ex : onglet Suivi activités sans prospect sélectionné, panneau replié → écran blanc).
      const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(false);
      const [historyLoading, setHistoryLoading] = React.useState(false);
      const [historyData, setHistoryData] = React.useState([]);
      const [historyError, setHistoryError] = React.useState(null);
      
      // STATE MODAL COMPTEURS (au niveau App pour éviter problèmes de rendu)
      const [showCompteurModal, setShowCompteurModal] = React.useState(false);
      const [compteurModalData, setCompteurModalData] = React.useState({ title: '', prospects: [] });
      
      const [interlocuteurForm, setInterlocuteurForm] = React.useState({
        id: null,
        prenom: '',
        nom: '',
        fonction: '',
        email: '',
        telephone: '',
        linkedin_url: '',
        principal: false,
        decideur: false,
        accept_emailing: false,
        accept_notes_info: false,
        demande_optin: false
      });
      // États pour les devis
      const [devisList, setDevisList] = React.useState([]);
      const [showDevisForm, setShowDevisForm] = React.useState(false);
      const [showDevisTypeModal, setShowDevisTypeModal] = React.useState(false);
      const [editingDevisId, setEditingDevisId] = React.useState(null);
      const [editingDevis, setEditingDevis] = React.useState(null); // Devis complet en édition (avec pdf_url)
      const [devisFormData, setDevisFormData] = React.useState({
        devis_name: '',
        devis_status: 'En cours',
        quote_date: '',
        setup_amount: 0,
        monthly_amount: 0,
        annual_amount: 0,
        training_amount: 0,
        chance_percent: 0,
        modules: {},
        comment: ''
      });
      const [devisPdfFile, setDevisPdfFile] = React.useState(null);
      const [isUploadingDevisPdf, setIsUploadingDevisPdf] = React.useState(false);
      
      // States Affaires
      const [affairesList, setAffairesList] = React.useState([]);
      const [affairesActions, setAffairesActions] = React.useState({}); // {affaire_id: [actions]}
      const [showAffaireForm, setShowAffaireForm] = React.useState(false);
      const [showActionAffaireForm, setShowActionAffaireForm] = React.useState(false);
      const [selectedAffaireForAction, setSelectedAffaireForAction] = React.useState(null);
      const [actionAffaireFormData, setActionAffaireFormData] = React.useState({
        action_type: 'Appel',
        action_date: new Date().toISOString().split('T')[0],
        action_actor: '',
        action_contact: '',
        action_comment: ''
      });
      const [editingAffaireId, setEditingAffaireId] = React.useState(null);
      const [affaireFormData, setAffaireFormData] = React.useState({
        nom_affaire: '',
        description: '',
        statut_global: 'En cours'
      });
      const [selectedAffaireId, setSelectedAffaireId] = React.useState(null);
      const [expandedActionId, setExpandedActionId] = React.useState(null);
      
      const [filterSocietyType, setFilterSocietyType] = React.useState('Tous');
      // Filtre statut : tableau de statuts à inclure. [] = tous (pas de filtre).
      // Permet la multi-sélection (ex: ['En cours','Envoyé','Discussion','Négociation'] = devis en cours).
      const [filterStatus, setFilterStatus] = React.useState([]);
      const [filterCommercial, setFilterCommercial] = React.useState('Tous');
      const [filterAttribution, setFilterAttribution] = React.useState('Toutes');
      const [searchTerm, setSearchTerm] = React.useState('');
      const [sortBy, setSortBy] = React.useState('name');

      // 🔥 AJOUT : Charger le token depuis localStorage au démarrage
      React.useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            setUser(userData);
          } catch (err) {
            console.error('Erreur parse user:', err);
            localStorage.removeItem('user');
          }
        }
      }, []);

      React.useEffect(() => {
        if (user) {
          fetchProspects();
          fetch(`${API_URL}/users`, { headers: { 'Authorization': `Bearer ${user.token}` } })
            .then(r => r.json()).then(data => { if (Array.isArray(data)) setAppUsers(data); });
          fetch(`${API_URL}/codes-naf`, { headers: { 'Authorization': `Bearer ${user.token}` } })
            .then(r => r.json()).then(data => { if (Array.isArray(data)) setCodesNaf(data); });
        }
      }, [user]);

      // Charger les actions de tous les prospects après le chargement
      React.useEffect(() => {
        if (prospects.length > 0 && user) {
          prospects.forEach(prospect => {
            fetchNextActions(prospect.id);
          });
        }
      }, [prospects.length, user]);

      const fetchProspects = async () => {
        try {
          // UNE SEULE requête optimisée côté backend (devis + actions inclus)
          const res = await fetch(`${API_URL}/prospects/enriched`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          const data = await res.json();
          
          console.log('[DEBUG] Prospects enrichis chargés:', data.length, '- avec devis:', data.filter(p => p.real_status).length);

          
          setProspects(data);

          // Pré-alimenter prospectActionsInfo depuis les données enrichies (évite N requêtes)
          const actionsMap = {};
          data.forEach(p => {
            actionsMap[p.id] = {
              hasAction: !!p.action_has_action,
              isLate: !!p.action_next_is_late,
              nextActionDate: p.action_next_date || null,
              nextActionType: p.action_next_type || null,
              nextActionActor: p.action_next_actor || null,
              nextActionContact: p.action_next_contact || null
            };
          });
          setProspectActionsInfo(actionsMap);
        } catch (err) {
          console.error('[ERROR] fetchProspects:', err);
        }
      };

      const fetchActivities = async (prospectId) => {
        try {
          const res = await fetch(`${API_URL}/prospects/${prospectId}/activities`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          const data = await res.json();
          setActivities(prev => ({ ...prev, [prospectId]: data }));
        } catch (err) {
          console.error('Erreur:', err);
        }
      };

      const fetchNextActions = async (prospectId) => {
        try {
          const res = await fetch(`${API_URL}/prospects/${prospectId}/next_actions`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          const data = await res.json();
          setNextActions(data || []);
          
          // Ne mettre à jour prospectActionsInfo que si l'enriched n'a pas déjà trouvé des actions
          // (évite d'écraser les actions d'affaire avec la route qui ne retourne que les actions directes)
          setProspectActionsInfo(prev => {
            const existing = prev[prospectId];
            // Si l'enriched a déjà détecté une action, on garde ses infos
            if (existing?.hasAction) return prev;
            const actionInfo = getActionStatus(data || []);
            return {...prev, [prospectId]: actionInfo};
          });
        } catch (err) {
          console.error('Erreur:', err);
        }
      };

      const fetchAllActions = async (prospectId) => {
        try {
          const res = await fetch(`${API_URL}/prospects/${prospectId}/actions-all`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          const data = await res.json();
          setAllActions(Array.isArray(data) ? data : []);
        } catch (err) {
          console.error('Erreur fetchAllActions:', err);
        }
      };

      const fetchStatusHistory = async (prospectId) => {
        try {
          const res = await fetch(`${API_URL}/prospects/${prospectId}/status_history`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          const data = await res.json();
          setStatusHistory(data || []);
        } catch (err) {
          console.error('Erreur:', err);
        }
      };

      const fetchInterlocuteurs = async (prospectId) => {
        try {
          const res = await fetch(`${API_URL}/prospects/${prospectId}/interlocuteurs`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          const data = await res.json();
          setInterlocuteurs(data || []);
        } catch (err) {
          console.error('Erreur fetch interlocuteurs:', err);
        }
      };

      const handleSaveInterlocuteur = async () => {
        if (!interlocuteurForm.nom.trim()) {
          window.showToast({title:'Le nom est obligatoire', type:'warning'});
          return;
        }

        try {
          const method = interlocuteurForm.id ? 'PUT' : 'POST';
          const url = interlocuteurForm.id
            ? `${API_URL}/prospects/${selectedProspect.id}/interlocuteurs/${interlocuteurForm.id}`
            : `${API_URL}/prospects/${selectedProspect.id}/interlocuteurs`;

          const res = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify(interlocuteurForm)
          });

          if (res.ok) {
            window.showToast({title: interlocuteurForm.id ? 'Interlocuteur modifié' : 'Interlocuteur ajouté', type:'success'});
            await fetchInterlocuteurs(selectedProspect.id);
            setShowInterlocuteurForm(false);
            setInterlocuteurForm({
              id: null,
              prenom: '',
              nom: '',
              fonction: '',
              email: '',
              telephone: '',
              linkedin_url: '',
              principal: false,
              decideur: false,
              accept_emailing: false,
              accept_notes_info: false,
              demande_optin: false
            });
          } else {
            window.showToast({title:'Erreur lors de la sauvegarde', type:'error'});
          }
        } catch (err) {
          console.error('Erreur:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleDeleteInterlocuteur = async (interlocuteurId) => {
        if (!confirm('Supprimer cet interlocuteur ?')) return;

        try {
          const res = await fetch(`${API_URL}/prospects/${selectedProspect.id}/interlocuteurs/${interlocuteurId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
          });

          if (res.ok) {
            window.showToast({title:'Interlocuteur supprimé', type:'success'});
            await fetchInterlocuteurs(selectedProspect.id);
          } else {
            window.showToast({title:'Erreur lors de la suppression', type:'error'});
          }
        } catch (err) {
          console.error('Erreur:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      // ============ DEVIS ============
      const fetchDevis = async (prospectId) => {
        try {
          const res = await fetch(`${API_URL}/prospects/${prospectId}/devis`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          if (res.ok) {
            const devis = await res.json();
            setDevisList(devis || []);
          } else {
            setDevisList([]);
          }
        } catch (err) {
          console.error('Erreur fetchDevis:', err);
          setDevisList([]);
        }
      };

      // ── Écoute les messages du configurateur TexasWin ──
      // Quand le configurateur enregistre ou met à jour un devis, il poste
      // { type:'devis_saved'|'devis_updated', prospect_id } vers window.opener → on rafraîchit.
      React.useEffect(() => {
        const onMessage = (event) => {
          // Même origine exigée (sécurité)
          if (event.origin !== window.location.origin) return;
          const data = event.data || {};
          if ((data.type === 'devis_saved' || data.type === 'devis_updated') && data.prospect_id) {
            // Si le prospect concerné est celui actuellement ouvert, on rafraîchit
            if (selectedProspect && String(selectedProspect.id) === String(data.prospect_id)) {
              fetchDevis(selectedProspect.id);
            }
          }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
      }, [selectedProspect]);

      const handleAddDevis = () => {
        setShowDevisTypeModal(true);
      };

      const handleAddDevisLibre = () => {
        setShowDevisTypeModal(false);
        setDevisFormData({
          devis_name: '',
          devis_status: 'En cours',
          quote_date: new Date().toISOString().split('T')[0],
          setup_amount: 0,
          monthly_amount: 0,
          annual_amount: 0,
          training_amount: 0,
          chance_percent: 0,
          modules: {},
          comment: ''
        });
        setEditingDevisId(null);
        setDevisPdfFile(null);
        setShowDevisForm(true);
      };

      const handleAddDevisTexasWin = () => {
        setShowDevisTypeModal(false);
        const prospect = selectedProspect;
        if (!prospect) return;
        const params = new URLSearchParams({
          prospect_id: prospect.id,
          societe: prospect.name || '',
          adresse: [prospect.adresse, prospect.cp, prospect.ville].filter(Boolean).join(', '),
          commercial: prospect.assigned_to || 'christian',
        });
        // Si une affaire est sélectionnée dans l'UI, on la passe au configurateur
        if (selectedAffaireId) {
          params.set('affaire_id', selectedAffaireId);
        }
        window.open('/configurateur?' + params.toString(), '_blank');
      };;

      const handleEditDevis = (devis) => {
        // ── Détection : est-ce un Devis TexasWin ? ──
        // Règle : un devis TexasWin a un champ `moduleState` dans son JSON `modules`
        let modulesObj = devis.modules;
        if (typeof modulesObj === 'string') {
          try { modulesObj = JSON.parse(modulesObj); } catch { modulesObj = {}; }
        }
        const isTexasWin = modulesObj && typeof modulesObj === 'object' && modulesObj.moduleState;

        if (isTexasWin) {
          // → Route vers le configurateur en mode édition
          const prospect = selectedProspect;
          const params = new URLSearchParams({
            devis_id: devis.id,
            prospect_id: devis.prospect_id || prospect?.id || '',
            societe: prospect?.name || modulesObj.societe || '',
            adresse: [prospect?.adresse, prospect?.cp, prospect?.ville].filter(Boolean).join(', '),
            commercial: prospect?.assigned_to || modulesObj.commercial || 'christian',
          });
          if (devis.affaire_id) params.set('affaire_id', devis.affaire_id);
          window.open('/configurateur?' + params.toString(), '_blank');
          return;
        }

        // ── Sinon : Devis libre (comportement existant inchangé) ──
        // Formater la date PostgreSQL en YYYY-MM-DD pour input HTML
        let formattedDate = '';
        if (devis.quote_date) {
          const d = new Date(devis.quote_date);
          if (!isNaN(d.getTime())) {
            formattedDate = d.toISOString().split('T')[0];
          }
        }
        
        setDevisFormData({
          devis_name: devis.devis_name || '',
          devis_status: devis.devis_status || 'En cours',
          quote_date: formattedDate,
          setup_amount: devis.setup_amount || 0,
          monthly_amount: devis.monthly_amount || 0,
          annual_amount: devis.annual_amount || 0,
          training_amount: devis.training_amount || 0,
          chance_percent: devis.chance_percent || 0,
          modules: modulesObj || {},
          comment: devis.comment || ''
        });
        setSelectedAffaireId(devis.affaire_id || null);
        setEditingDevisId(devis.id);
        setEditingDevis(devis); // Stocker devis complet pour accéder à pdf_url
        setDevisPdfFile(null);
        setShowDevisForm(true);
      };

      const handleSaveDevis = async () => {
        try {
          if (!selectedProspect?.id) {
            window.showToast({title:'Veuillez d\'abord créer la société', type:'warning'});
            return;
          }

          // Si pas d'affaire sélectionnée, créer automatiquement une affaire tempo
          let affaireIdToUse = selectedAffaireId;
          if (!affaireIdToUse) {
            // Créer affaire tempo
            const resAffaire = await fetch(`${API_URL}/prospects/${selectedProspect.id}/affaires`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${user.token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                nom_affaire: `${selectedProspect.name} / Affaire Tempo`,
                description: 'Affaire créée automatiquement',
                statut_global: 'En cours'
              })
            });

            if (resAffaire.ok) {
              const newAffaire = await resAffaire.json();
              affaireIdToUse = newAffaire.id;
              setSelectedAffaireId(affaireIdToUse);
              await fetchAffaires(selectedProspect.id);
            }
          }

          // Si on crée un nouveau devis ET qu'une affaire est sélectionnée, utiliser la route affaire
          let url, method;
          if (editingDevisId) {
            url = `${API_URL}/devis/${editingDevisId}`;
            method = 'PUT';
          } else {
            // Nouveau devis : créer dans l'affaire
            if (affaireIdToUse) {
              url = `${API_URL}/affaires/${affaireIdToUse}/devis`;
            } else {
              url = `${API_URL}/prospects/${selectedProspect.id}/devis`;
            }
            method = 'POST';
          }

          const res = await fetch(url, {
            method,
            headers: {
              'Authorization': `Bearer ${user.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              ...devisFormData,
              affaire_id: affaireIdToUse || selectedAffaireId || null
            })
          });

          if (res.ok) {
            const savedDevis = await res.json();
            window.showToast({title: editingDevisId ? 'Devis modifié' : 'Devis créé', type:'success'});

            // Si le devis est "Gagné", proposer de passer l'affaire parente en "Gagné"
            // (même logique que la bascule rapide handleQuickDevisStatus).
            if (devisFormData.devis_status === 'Gagné') {
              const affaireId = savedDevis.affaire_id || affaireIdToUse || selectedAffaireId;
              const aff = affaireId ? affairesList.find(a => a.id === affaireId) : null;
              if (aff && aff.statut_global !== 'Gagné') {
                const autresActifs = devisList.filter(d =>
                  d.affaire_id === affaireId && d.id !== savedDevis.id &&
                  !['Perdu','Annulé','Gagné'].includes(d.devis_status)
                );
                let msg = 'Voulez-vous passer l\'affaire entière en "Gagné" ?';
                if (autresActifs.length > 0) {
                  msg = `Cette affaire a encore ${autresActifs.length} devis actif(s).\n\n` + msg;
                }
                if (window.confirm(msg)) {
                  await fetch(`${API_URL}/affaires/${affaireId}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ statut_global: 'Gagné' })
                  });
                  window.showToast({title:'Affaire passée en "Gagné"', type:'success'});
                }
              }
            }

            // Upload PDF si présent
            if (devisPdfFile) {
              await handleUploadDevisPdf(savedDevis.id);
            }

            await fetchDevis(selectedProspect.id);
            await fetchAffaires(selectedProspect.id);
            setShowDevisForm(false);
            setEditingDevisId(null);
            setEditingDevis(null); // Reset devis en édition
            setDevisFormData({
              devis_name: '',
              devis_status: 'En cours',
              quote_date: '',
              setup_amount: 0,
              monthly_amount: 0,
              annual_amount: 0,
              training_amount: 0,
              chance_percent: 0,
              modules: {}
            });
            setDevisPdfFile(null);
          } else {
            window.showToast({title:'Erreur lors de la sauvegarde du devis', type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleSaveDevis:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      // Changement rapide du statut d'un devis depuis la carte résumé (sans ouvrir le formulaire).
      // Met à jour devis_status via PUT, puis rafraîchit la liste.
      // NB : passer un devis en "Perdu" ne touche PLUS automatiquement à l'affaire.
      // La bascule éventuelle de l'affaire se fait à la validation du motif (handleSaveMotifPerte).
      const handleQuickDevisStatus = async (devisId, newStatus) => {
        try {
          const res = await fetch(`${API_URL}/devis/${devisId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ devis_status: newStatus })
          });
          if (res.ok) {
            window.showToast({title: 'Statut mis à jour : ' + newStatus, type:'success'});

            // Si on SORT un devis du statut Perdu (vers un statut actif) et que son
            // affaire est en Perdu, on PROPOSE de rétablir l'affaire en "En cours".
            if (newStatus !== 'Perdu') {
              const devis = devisList.find(d => d.id === devisId);
              const affaireId = devis?.affaire_id;
              if (affaireId && devis?.devis_status === 'Perdu') {
                const aff = affairesList.find(a => a.id === affaireId);
                if (aff && aff.statut_global === 'Perdu') {
                  if (window.confirm('L\'affaire de ce devis est en "Perdu".\n\nVoulez-vous la rétablir en "En cours" ?')) {
                    await fetch(`${API_URL}/affaires/${affaireId}`, {
                      method: 'PUT',
                      headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ statut_global: 'En cours' })
                    });
                    window.showToast({title:'Affaire rétablie en "En cours"', type:'success'});
                  }
                }
              }
            }

            // Si on passe un devis en "Gagné", on PROPOSE de passer l'affaire parente
            // en "Gagné" (symétrique du flux "Perdu" géré dans handleSaveMotifPerte).
            if (newStatus === 'Gagné') {
              const devis = devisList.find(d => d.id === devisId);
              const affaireId = devis?.affaire_id;
              if (affaireId) {
                const aff = affairesList.find(a => a.id === affaireId);
                // Ne proposer que si l'affaire n'est pas déjà Gagnée
                if (aff && aff.statut_global !== 'Gagné') {
                  const autresActifs = devisList.filter(d =>
                    d.affaire_id === affaireId && d.id !== devisId &&
                    !['Perdu','Annulé','Gagné'].includes(d.devis_status)
                  );
                  let msg = 'Voulez-vous passer l\'affaire entière en "Gagné" ?';
                  if (autresActifs.length > 0) {
                    msg = `Cette affaire a encore ${autresActifs.length} devis actif(s).\n\n` + msg;
                  }
                  if (window.confirm(msg)) {
                    await fetch(`${API_URL}/affaires/${affaireId}`, {
                      method: 'PUT',
                      headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ statut_global: 'Gagné' })
                    });
                    window.showToast({title:'Affaire passée en "Gagné"', type:'success'});
                  }
                }
              }
            }

            if (selectedProspect?.id) {
              await fetchDevis(selectedProspect.id);
              await fetchAffaires(selectedProspect.id);
            }
          } else {
            window.showToast({title:'Erreur mise à jour du statut', type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleQuickDevisStatus:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      // Enregistre le motif de perte d'un devis (bouton "Valider le motif").
      // Le motif est obligatoire (non vide). Après enregistrement, propose de
      // basculer l'affaire en Perdu (avec confirmation si d'autres devis actifs).
      const handleSaveMotifPerte = async (devisId, motif, affaireId) => {
        if (!motif || !motif.trim()) {
          window.showToast({title:'Le motif de perte ne peut pas être vide', type:'error'});
          return;
        }
        try {
          // 1. Enregistrer le motif sur le devis
          await fetch(`${API_URL}/devis/${devisId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ motif_perte: motif.trim() })
          });

          // 2. Proposer de basculer l'affaire en Perdu
          if (affaireId) {
            const aff = affairesList.find(a => a.id === affaireId);
            // Ne re-proposer que si l'affaire n'est pas déjà Perdue
            if (aff && aff.statut_global !== 'Perdu') {
              const autresActifs = devisList.filter(d =>
                d.affaire_id === affaireId && d.id !== devisId &&
                !['Perdu','Annulé','Gagné'].includes(d.devis_status)
              );
              let msg = 'Voulez-vous passer l\'affaire entière en "Perdu" ?';
              if (autresActifs.length > 0) {
                msg = `Cette affaire a encore ${autresActifs.length} devis actif(s).\n\n` + msg;
              }
              if (window.confirm(msg)) {
                await fetch(`${API_URL}/affaires/${affaireId}`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ statut_global: 'Perdu', motif_perte: motif.trim() })
                });
              }
            } else if (aff && aff.statut_global === 'Perdu') {
              // Affaire déjà perdue : on met juste à jour son motif pour cohérence
              await fetch(`${API_URL}/affaires/${affaireId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ motif_perte: motif.trim() })
              });
            }
          }

          window.showToast({title:'Motif enregistré', type:'success'});
          if (selectedProspect?.id) {
            await fetchDevis(selectedProspect.id);
            await fetchAffaires(selectedProspect.id);
          }
        } catch (err) {
          console.error('Erreur handleSaveMotifPerte:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      // Annule un devis et crée automatiquement un remplaçant (copie) lié.
      const handleAnnulerRemplacer = async (devisId) => {
        if (!window.confirm('Annuler ce devis et créer un devis de remplacement ?\n\nL\'ancien devis passera en statut "Annulé" et un nouveau devis sera créé en reprenant ses informations.')) return;
        try {
          const res = await fetch(`${API_URL}/devis/${devisId}/annuler-remplacer`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' }
          });
          if (res.ok) {
            window.showToast({title: 'Devis annulé et remplacé', type:'success'});
            if (selectedProspect?.id) {
              await fetchDevis(selectedProspect.id);
              await fetchAffaires(selectedProspect.id);
            }
          } else {
            const data = await res.json().catch(() => ({}));
            window.showToast({title:'Erreur : ' + (data.error || 'annulation impossible'), type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleAnnulerRemplacer:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleDeleteDevis = async (devisId) => {
        if (!window.confirm('Supprimer ce devis ?')) return;

        try {
          const res = await fetch(`${API_URL}/devis/${devisId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
          });

          if (res.ok) {
            window.showToast({title:'Devis supprimé', type:'success'});
            await fetchDevis(selectedProspect.id);
          } else {
            window.showToast({title:'Erreur lors de la suppression', type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleDeleteDevis:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleUploadDevisPdf = async (devisId) => {
        if (!devisPdfFile) return;

        try {
          setIsUploadingDevisPdf(true);
          const formData = new FormData();
          formData.append('pdf', devisPdfFile);

          const res = await fetch(`${API_URL}/devis/${devisId}/upload-pdf`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${user.token}` },
            body: formData
          });

          if (res.ok) {
            window.showToast({title:'PDF uploadé', type:'success'});
            await fetchDevis(selectedProspect.id);
          } else {
            window.showToast({title:'Erreur lors de l\'upload du PDF', type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleUploadDevisPdf:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        } finally {
          setIsUploadingDevisPdf(false);
        }
      };

      // ── Upload direct depuis la liste des devis (sans passer par le state devisPdfFile) ──
      const handleUploadDevisPdfDirect = async (devisId, file) => {
        if (!file) return;
        try {
          const formData = new FormData();
          formData.append('pdf', file);
          const res = await fetch(`${API_URL}/devis/${devisId}/upload-pdf`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${user.token}` },
            body: formData
          });
          if (res.ok) {
            if (selectedProspect) await fetchDevis(selectedProspect.id);
          } else {
            const err = await res.json().catch(() => ({}));
            window.showToast({title:'Erreur lors de l\'upload du PDF : ' + (err.error || res.status), type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleUploadDevisPdfDirect:', err);
          window.showToast({title:'Erreur : ' + err.message, type:'error'});
        }
      };

      const handleDeleteDevisPDF = async (devisId) => {
        if (!window.confirm('Supprimer le PDF de ce devis ?')) return;

        try {
          const res = await fetch(`${API_URL}/devis/${devisId}/pdf`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
          });

          if (res.ok) {
            await fetchDevis(selectedProspect.id);
            window.showToast({title:'PDF supprimé avec succès', type:'success'});
          } else {
            window.showToast({title:'Erreur lors de la suppression du PDF', type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleDeleteDevisPDF:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleRattacherDevisAffaire = async (devisId, affaireId) => {
        try {
          const res = await fetch(`${API_URL}/devis/${devisId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${user.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ affaire_id: affaireId })
          });

          if (res.ok) {
            window.showToast({title:'Devis rattaché à l\'affaire', type:'success'});
            await fetchDevis(selectedProspect.id);
            await fetchAffaires(selectedProspect.id);
          } else {
            window.showToast({title:'Erreur lors du rattachement', type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleRattacherDevisAffaire:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      // ============ AFFAIRES ============
      const fetchAffaires = async (prospectId) => {
        try {
          const res = await fetch(`${API_URL}/prospects/${prospectId}/affaires`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setAffairesList(data);
            
            // Charger les actions pour chaque affaire
            const actionsMap = {};
            for (const affaire of data) {
              try {
                const actionsRes = await fetch(`${API_URL}/affaires/${affaire.id}/next_actions`, {
                  headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (actionsRes.ok) {
                  actionsMap[affaire.id] = await actionsRes.json();
                }
              } catch (err) {
                console.error(`Erreur chargement actions affaire ${affaire.id}:`, err);
                actionsMap[affaire.id] = [];
              }
            }
            setAffairesActions(actionsMap);
          }
        } catch (err) {
          console.error('Erreur fetchAffaires:', err);
        }
      };

      const handleAddAffaire = () => {
        setAffaireFormData({ nom_affaire: '', description: '', statut_global: 'En cours' });
        setEditingAffaireId(null);
        setShowAffaireForm(true);
      };

      const handleEditAffaire = (affaire) => {
        setAffaireFormData({
          nom_affaire: affaire.nom_affaire,
          description: affaire.description || '',
          statut_global: affaire.statut_global
        });
        setEditingAffaireId(affaire.id);
        setShowAffaireForm(true);
      };

      const handleSaveAffaire = async () => {
        if (!selectedProspect || !affaireFormData.nom_affaire.trim()) {
          window.showToast({title:'Le nom de l\'affaire est obligatoire', type:'warning'});
          return;
        }

        try {
          const url = editingAffaireId
            ? `${API_URL}/affaires/${editingAffaireId}`
            : `${API_URL}/prospects/${selectedProspect.id}/affaires`;

          const res = await fetch(url, {
            method: editingAffaireId ? 'PUT' : 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify(affaireFormData)
          });

          if (res.ok) {
            window.showToast({title: editingAffaireId ? 'Affaire modifiée' : 'Affaire créée', type:'success'});
            await fetchAffaires(selectedProspect.id);
            setShowAffaireForm(false);
            setEditingAffaireId(null);
            setAffaireFormData({ nom_affaire: '', description: '', statut_global: 'En cours' });
          } else {
            window.showToast({title:'Erreur lors de l\'enregistrement', type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleSaveAffaire:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleDeleteAffaire = async (affaireId) => {
        if (!window.confirm('Supprimer cette affaire et tous ses devis ?')) return;

        try {
          const res = await fetch(`${API_URL}/affaires/${affaireId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
          });

          if (res.ok) {
            window.showToast({title:'Affaire supprimée', type:'success'});
            await fetchAffaires(selectedProspect.id);
            await fetchDevis(selectedProspect.id);
            if (selectedAffaireId === affaireId) {
              setSelectedAffaireId(null);
            }
          } else {
            window.showToast({title:'Erreur lors de la suppression', type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleDeleteAffaire:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      // ============ ACTIONS AFFAIRE ============
      const handleOpenActionAffaireForm = (affaireId) => {
        setSelectedAffaireForAction(affaireId);
        setActionAffaireFormData({
          action_type: 'Appel',
          action_date: new Date().toISOString().split('T')[0],
          action_actor: user.name || '',
          action_contact: '',
          action_comment: ''
        });
        setShowActionAffaireForm(true);
      };

      const handleSaveActionAffaire = async () => {
        if (!selectedAffaireForAction) return;

        try {
          const res = await fetch(`${API_URL}/affaires/${selectedAffaireForAction}/next_actions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${user.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action_type: actionAffaireFormData.action_type,
              planned_date: actionAffaireFormData.action_date,
              actor: actionAffaireFormData.action_actor,
              contact: actionAffaireFormData.action_contact,
              completed_note: actionAffaireFormData.action_comment,
              affaire_id: selectedAffaireForAction
            })
          });

          if (res.ok) {
            window.showToast({title:'Action ajoutée', type:'success'});
            await fetchAffaires(selectedProspect.id);
            fetchAllActions(selectedProspect.id);
            setShowActionAffaireForm(false);
            setSelectedAffaireForAction(null);
            setActionAffaireFormData({
              action_type: 'Appel',
              action_date: new Date().toISOString().split('T')[0],
              action_actor: '',
              action_contact: '',
              action_comment: ''
            });
          } else {
            window.showToast({title:'Erreur lors de la création de l\'action', type:'error'});
          }
        } catch (err) {
          console.error('Erreur handleSaveActionAffaire:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleToggleActionAffaire = async (actionId, completed, affaireId) => {
        try {
          const res = await fetch(`${API_URL}/next_actions/${actionId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${user.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ completed })
          });

          if (res.ok) {
            await fetchAffaires(selectedProspect.id);
            fetchAllActions(selectedProspect.id);
          }
        } catch (err) {
          console.error('Erreur handleToggleActionAffaire:', err);
        }
      };

      const handleDeleteActionAffaire = async (actionId, affaireId) => {
        if (!window.confirm('Supprimer cette action ?')) return;

        try {
          const res = await fetch(`${API_URL}/next_actions/${actionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
          });

          if (res.ok) {
            window.showToast({title:'Action supprimée', type:'success'});
            await fetchAffaires(selectedProspect.id);
            fetchAllActions(selectedProspect.id);
          }
        } catch (err) {
          console.error('Erreur handleDeleteActionAffaire:', err);
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      // ============ MODULES ============
      const fetchModules = async (prospectId) => {
        try {
          const res = await fetch(`${API_URL}/prospects/${prospectId}/modules`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          if (res.ok) {
            const modules = await res.json();
            const modulesData = {};
            modules.forEach(m => {
              if (m.module_name === 'BizAvecFab') modulesData.module_biz_avec_fab = m.nb_users;
              else if (m.module_name === 'FluxTiers') modulesData.module_flux_tiers = m.nb_users;
              else if (m.module_name === 'ComptaSage') modulesData.module_compta_sage = m.nb_users > 0;
              else if (m.module_name === 'FacturationElectronique') modulesData.module_facturation_electronique = m.nb_users > 0;
              else modulesData[`module_${m.module_name.toLowerCase()}`] = m.nb_users;
            });
            return modulesData;
          }
        } catch (err) {
          console.error('Erreur fetch modules:', err);
        }
        return {};
      };

      const saveModules = async (prospectId, formData) => {
        const modules = [
          {module_name: 'Biz', nb_users: formData.module_biz || 0},
          {module_name: 'BizAvecFab', nb_users: formData.module_biz_avec_fab || 0},
          {module_name: 'Fab', nb_users: formData.module_fab || 0},
          {module_name: 'Net', nb_users: formData.module_net || 0},
          {module_name: 'Kub', nb_users: formData.module_kub || 0},
          {module_name: 'Mag', nb_users: formData.module_mag || 0},
          {module_name: 'VRP', nb_users: formData.module_vrp || 0},
          {module_name: 'Col', nb_users: formData.module_col || 0},
          {module_name: 'Log', nb_users: formData.module_log || 0},
          {module_name: 'Jet', nb_users: formData.module_jet || 0},
          {module_name: 'FluxTiers', nb_users: formData.module_flux_tiers || 0},
          {module_name: 'ComptaSage', nb_users: formData.module_compta_sage ? 1 : 0},
          {module_name: 'FacturationElectronique', nb_users: formData.module_facturation_electronique ? 1 : 0}
        ];

        try {
          await fetch(`${API_URL}/prospects/${prospectId}/modules`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ modules })
          });
        } catch (err) {
          console.error('Erreur sauvegarde modules:', err);
        }
      };

      const handleLogin = async (email, password, name, isRegister) => {
        try {
          const endpoint = isRegister ? 'register' : 'login';
          const payload = isRegister 
            ? { email, password, name }
            : { email, password };
          
          const res = await fetch(`${API_URL}/auth/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          const data = await res.json();
          if (data.token) {
            const userData = { ...data.user, token: data.token };
            setUser(userData);
            // 🔥 AJOUT : Sauvegarder dans localStorage
            localStorage.setItem('user', JSON.stringify(userData));
          } else {
            window.showToast({title:'Erreur: ' + data.error, type:'error'});
          }
        } catch (err) {
          window.showToast({title:'Erreur connexion: ' + err.message, type:'error'});
        }
      };

      const handleSaveProspect = async () => {
        if (!formData.name) {
          window.showToast({title:'Le nom de la société est requis', type:'warning'});
          return;
        }

        if (!formData.statut_societe) {
          window.showToast({title:'Le type de société est requis (Suspect, Prospect ou Client)', type:'warning'});
          return;
        }

        if (!formData.assigned_to) {
          window.showToast({title:'Le commercial est requis', type:'warning'});
          return;
        }

        // Vérifier le format de la date de devis si elle existe
        if (formData.quote_date) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(formData.quote_date)) {
            window.showToast({title:'Format de date invalide pour la date du devis. Utilisez le format YYYY-MM-DD', type:'error'});
            return;
          }
        }

        // Si le statut est Devis/Démo/Négociation/Signé et qu'il n'y a pas de date de devis,
        // prendre automatiquement la date du dernier devis (s'il existe)
        if (['Devis', 'Démo', 'Négociation', 'Signé'].includes(formData.status) && !formData.quote_date) {
          if (devisList && devisList.length > 0) {
            // Prendre la date du dernier devis (le plus récent)
            const lastDevis = devisList[0];
            if (lastDevis.quote_date) {
              formData.quote_date = lastDevis.quote_date;
            } else {
              window.showToast({title:'Une date de devis est requise pour le statut ' + formData.status, type:'warning'});
              return;
            }
          } else {
            window.showToast({title:'Veuillez créer un devis avant de passer au statut ' + formData.status, type:'warning'});
            return;
          }
        }

        try {
          const method = formData.id ? 'PUT' : 'POST';
          const url = formData.id 
            ? `${API_URL}/prospects/${formData.id}`
            : `${API_URL}/prospects`;

          const res = await fetch(url, {
            method,
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify(formData)
          });

          if (res.ok) {
            const data = await res.json();
            window.showToast({title: formData.id ? 'Société modifiée' : 'Société créée', type:'success'});
            
            // Sauvegarder les modules si le statut est Devis/Démo/Négociation/Signé
            const prospectId = data.id || formData.id;
            if (['Devis', 'Démo', 'Négociation', 'Signé'].includes(formData.status)) {
              await saveModules(prospectId, formData);
            }
            
            await fetchProspects();
            
            // Si c'est une création (pas d'ID avant), demander si on veut ajouter des interlocuteurs
            if (!formData.id && data.id) {
              const addInterlocuteurs = window.confirm('Entreprise créée avec succès ! Voulez-vous ajouter des interlocuteurs ?');
              if (addInterlocuteurs) {
                // Charger le prospect créé et ouvrir la page Information Société
                const createdProspect = { ...formData, id: data.id };
                setSelectedProspect(createdProspect);
                setFormData(createdProspect);
                await fetchInterlocuteurs(data.id);
                setShowForm(true);
                return;
              }
            }
            
            // Mettre à jour selectedProspect et recharger les données
            if (formData.id) {
              setSelectedProspect(formData);
              await fetchStatusHistory(formData.id);
              await fetchNextActions(formData.id);
            }
            setShowForm(false);
            setFormData(getEmptyProspect());
          }
        } catch (err) {
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleDeleteProspect = async (id) => {
        if (window.confirm('Supprimer ce prospect ?')) {
          try {
            const res = await fetch(`${API_URL}/prospects/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${user.token}` }
            });
            if (res.ok) {
              window.showToast({title:'Société supprimée', type:'success'});
              fetchProspects();
              setSelectedProspect(null);
            }
          } catch (err) {
            window.showToast({title:'Erreur: ' + err.message, type:'error'});
          }
        }
      };

      const handleAddActivity = async (prospectId, activityType, description) => {
        try {
          const res = await fetch(`${API_URL}/prospects/${prospectId}/activities`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ activity_type: activityType, description })
          });
          if (res.ok) {
            fetchActivities(prospectId);
          }
        } catch (err) {
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleAddNextAction = async () => {
        if (!selectedProspect) return;
        try {
          const res = await fetch(`${API_URL}/prospects/${selectedProspect.id}/next_actions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ 
              action_type: newActionType, 
              planned_date: newActionDate, 
              actor: newActionActor,
              contact: newActionContact,
              completed_note: newActionComment 
            })
          });
          if (res.ok) {
            window.showToast({title:'Action ajoutée', type:'success'});
            fetchNextActions(selectedProspect.id);
            fetchAllActions(selectedProspect.id);
            setNewActionType('Appel');
            setNewActionDate(new Date().toISOString().split('T')[0]);
            setNewActionActor('');
            setNewActionContact('');
            setNewActionComment('');
          }
        } catch (err) {
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleToggleNextAction = async (actionId, completed, notes = '') => {
        try {
          const res = await fetch(`${API_URL}/next_actions/${actionId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ completed: !completed, completed_notes: notes })
          });
          if (res.ok) {
            fetchNextActions(selectedProspect.id);
            fetchAllActions(selectedProspect.id);
            setActionNotes({...actionNotes, [actionId]: ''});
          }
        } catch (err) {
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleDeleteNextAction = async (actionId) => {
        if (window.confirm('Supprimer cette action ?')) {
          try {
            const res = await fetch(`${API_URL}/next_actions/${actionId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${user.token}` }
            });
            if (res.ok) {
              window.showToast({title:'Action supprimée', type:'success'});
              fetchNextActions(selectedProspect.id);
              fetchAllActions(selectedProspect.id);
            }
          } catch (err) {
            window.showToast({title:'Erreur: ' + err.message, type:'error'});
          }
        }
      };

      const formatDateForInput = (dateStr) => {
        if (!dateStr) return '';
        // Si format ISO (avec T), convertir en yyyy-MM-dd
        if (dateStr.includes('T')) {
          return dateStr.split('T')[0];
        }
        return dateStr;
      };

      const handleEditProspect = async (prospect) => {
        const formattedProspect = {
          ...prospect,
          quote_date: formatDateForInput(prospect.quote_date)
        };
        
        // Charger les modules si le prospect a un devis
        if (['Devis', 'Démo', 'Négociation', 'Signé'].includes(prospect.status)) {
          const modulesData = await fetchModules(prospect.id);
          Object.assign(formattedProspect, modulesData);
        }
        
        setFormData(formattedProspect);
        setShowForm(true);
      };

      const handleNewProspect = () => {
        setNewCompanyData({
          name: '', statut_societe: '', assigned_to: user?.name || '',
          siren: '', tel_standard: '', website: '',
          adresse: '', code_naf: '', marques: [], notes: ''
        });
        setNewCompanyErrors({});
        setShowNewCompanyModal(true);
      };

      // ── Recherche SocieteInfo : ouvre le modal et lance une recherche ──
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

      const handleSelectProspect = (prospect) => {
        console.log('Clicking on prospect:', prospect.id, prospect.name);
        setSelectedProspect(prospect);
        setListeView(null);  // quitter une éventuelle vue "liste" pour afficher la fiche
        setShowForm(false);  // Fermer le formulaire pour afficher les activités
        if (!activities[prospect.id]) {
          fetchActivities(prospect.id);
        }
        fetchNextActions(prospect.id);
        fetchAllActions(prospect.id);
        fetchStatusHistory(prospect.id);
        fetchInterlocuteurs(prospect.id);
        fetchDevis(prospect.id);
        fetchAffaires(prospect.id);
        // Réinitialiser le formulaire devis
        setShowDevisForm(false);
        setEditingDevisId(null);
        setDevisPdfFile(null);
        setSelectedAffaireId(null);
        setNewActionDate(new Date().toISOString().split('T')[0]);
      };

      // ── Pont de navigation rapide (palette Ctrl+K / peek) ──────────────────
      // La couche de navigation est montée dans un SECOND root React (overlay) qui
      // ne connaît pas l'état de cette app. Elle demande l'ouverture d'une fiche via
      // un CustomEvent 'tw:navigate'. On l'écoute ici pour piloter l'app existante
      // SANS rien remplacer. On réutilise handleSelectProspect (= comportement exact
      // d'un clic sur une ligne : ferme le formulaire + charge les relations), sinon
      // un simple setSelectedProspect laisse parfois le formulaire ouvert (showForm).
      React.useEffect(() => {
        const onNavigate = async (e) => {
          const d = (e && e.detail) || {};
          // Écrans : listes transverses, suivi, ou récap commercial
          if (d.screen && d.screen.indexOf('liste-') === 0) { setShowRecap(false); setShowCampagnes(false); setShowAttribution(false); setSelectedProspect(null); setListeView(d.screen.slice(6)); return; }
          if (d.screen === 'prospects') { setListeView(null); setShowRecap(false); setShowCampagnes(false); setShowAttribution(false); setSelectedProspect(null); setIsDashboard(false); return; }
          if (d.screen === 'recap') { setListeView(null); setShowRecap(true); return; }
          // Enregistrement : on ouvre la fiche du prospect parent (affaire/devis/
          // interlocuteur vivent sous un prospect → prospectId fourni par l'API).
          if (d.prospectId != null) {
            const id = Number(d.prospectId);
            let target = prospects.find(p => String(p.id) === String(id));
            if (!target) {
              // Filet de sécurité si le prospect n'est pas dans la liste déjà chargée.
              try {
                const r = await fetch(`${API_URL}/prospects`, { headers: { 'Authorization': `Bearer ${user.token}` } });
                const all = await r.json();
                target = Array.isArray(all) ? all.find(p => String(p.id) === String(id)) : null;
              } catch (err) { /* on ignore : pas de navigation plutôt qu'un crash */ }
            }
            if (target) {
              setShowRecap(false);
              // sortir du Dashboard : la fiche ne s'affiche que dans la vue Suivi
              // (le Dashboard la masque). C'est ce que fait déjà RecapModal.onNavigate.
              setIsDashboard(false);
              setShowCampagnes(false);
              setShowAttribution(false);
              handleSelectProspect(target);
              // Focus sur l'entité ciblée : on déroule l'affaire concernée (affaire
              // directe, ou affaire parente d'un devis). handleSelectProspect remet
              // selectedAffaireId à null, donc on le repositionne juste après (dernier
              // setState gagnant) ; l'affaire s'ouvrira dès que la liste est chargée.
              if (d.affaireId != null) setSelectedAffaireId(Number(d.affaireId));
            }
            else { console.warn('[tw:navigate] prospect introuvable id=', id); }
          }
        };
        window.addEventListener('tw:navigate', onNavigate);
        return () => window.removeEventListener('tw:navigate', onNavigate);
      }, [prospects, user]);

      // Si non-admin, restreindre aux prospects du user connecté
      let visibleProspects = isUserAdmin(user) ? prospects : prospects.filter(p => p.assigned_to === user.name);
      // Filtre attribution (admin uniquement)
      if (isUserAdmin(user)) {
        if (filterAttribution === 'Mes') visibleProspects = visibleProspects.filter(p => p.assigned_to === user.name);
        else if (filterAttribution === 'NonAttribuees') visibleProspects = visibleProspects.filter(p => !p.assigned_to || p.assigned_to === '');
        // 'Toutes' = pas de filtre supplémentaire
      }

      const filteredProspects = visibleProspects.filter(p => {
        // Filtre par type de société (Suspect/Prospect/Client)
        let matchSocietyType;
        if (filterSocietyType === 'Tous') {
          matchSocietyType = true;
        } else {
          matchSocietyType = p.statut_societe === filterSocietyType;
        }
        
        // Filtre par statut : filterStatus est un tableau de statuts à inclure.
        // [] = pas de filtre. Sinon, on garde les prospects dont real_status matche un des statuts cochés.
        // Cas particulier "Prospection" = pas de devis actif (real_status est null/vide), supporté en cochant
        // 'Prospection' qui est traduit en "real_status falsy".
        let matchStatus;
        if (!Array.isArray(filterStatus) || filterStatus.length === 0) {
          matchStatus = true;
        } else {
          // 'Prospection' = pas de real_status (en attente). Les autres = égalité directe.
          matchStatus = filterStatus.some(s => {
            if (s === 'Prospection') return !p.real_status;
            return p.real_status === s;
          });
        }
        
        const matchCommercial = (filterAttribution === 'Mes' || filterAttribution === 'NonAttribuees')
          ? true
          : (filterCommercial === 'Tous' || p.assigned_to === filterCommercial || (!p.assigned_to && filterCommercial === 'Tous'));
        const q = searchTerm.toLowerCase();
        const matchSearch = p.name.toLowerCase().includes(q) ||
                           (p.contact_name && p.contact_name.toLowerCase().includes(q)) ||
                           (p.email && p.email.toLowerCase().includes(q)) ||
                           (Array.isArray(p.marques) && p.marques.some(m => m.toLowerCase().includes(q)));
        return matchSocietyType && matchStatus && matchCommercial && matchSearch;
      }).sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        } else if (sortBy === 'ancienneté') {
          // Utiliser real_quote_date (calculé depuis affaires/devis)
          const getRelevantDate = (prospect) => {
            return prospect.real_quote_date || prospect.created_at;
          };
          
          const dateStrA = getRelevantDate(a);
          const dateStrB = getRelevantDate(b);
          
          // Si pas de date, mettre à la fin
          if (!dateStrA && !dateStrB) return 0;
          if (!dateStrA) return 1;
          if (!dateStrB) return -1;
          
          // Parser les dates correctement
          const dateA = new Date(dateStrA.includes('-') ? dateStrA : dateStrA.split('/').reverse().join('-')).getTime();
          const dateB = new Date(dateStrB.includes('-') ? dateStrB : dateStrB.split('/').reverse().join('-')).getTime();
          return dateA - dateB;  // Plus ancien d'abord
        } else if (sortBy === 'probabilité') {
          // Trier par real_probability (calculé depuis affaires/devis)
          return (b.real_probability || 0) - (a.real_probability || 0);
        }
        return 0;
      });

      if (!user) {
        return <LoginForm onLogin={handleLogin} />;
      }

      // ── Vue courante (descripteur) pour la NavTabBar : dérivée de l'état de l'app ──
      // NB : simple const (pas useMemo) car ce bloc est APRÈS le early-return `if (!user)`
      // ci-dessus ; un hook ici violerait l'ordre des hooks (React #310). Le calcul est
      // trivial et la NavTabBar ne dépend que des champs primitifs du descripteur.
      // Ordre = celui du rendu réel (cf. `isDashboard ? <Dashboard/> : <master-détail>`) :
      // le Dashboard masque la fiche, donc isDashboard est prioritaire sur selectedProspect.
      const currentView = (
        listeView       ? { view: 'liste-' + listeView, label: ({ devis: 'Devis en cours', societes: 'Sociétés', actions: 'Actions' })[listeView] || 'Listes' }
        : showCampagnes   ? { view: 'campagnes',   label: 'Campagnes' }
        : showAttribution ? { view: 'attribution', label: 'Attribution' }
        : selectedProspect ? { view: 'prospect', prospectId: selectedProspect.id, label: selectedProspect.name }
        :                 { view: 'dashboard',   label: 'Dashboard' }
      );

      // ── Restaure une vue depuis un onglet (action inverse de currentView) ──
      const restoreView = (d) => {
        setShowSettings(false);
        if (d.view && d.view.indexOf('liste-') === 0) { setShowCampagnes(false); setShowAttribution(false); setSelectedProspect(null); setListeView(d.view.slice(6)); return; }
        setListeView(null);
        if (d.view === 'campagnes')   { setShowAttribution(false); setSelectedProspect(null); setShowCampagnes(true); return; }
        if (d.view === 'attribution') { setShowCampagnes(false); setSelectedProspect(null); setShowAttribution(true); return; }
        setShowCampagnes(false); setShowAttribution(false);
        if (d.view === 'prospect') {
          const p = prospects.find(x => String(x.id) === String(d.prospectId));
          // setIsDashboard(false) : la fiche ne s'affiche que dans la vue Suivi (le
          // Dashboard la masque). Sans ça, ouvrir un client depuis le Dashboard ne montre rien.
          if (p) { setIsDashboard(false); handleSelectProspect(p); } else { setSelectedProspect(null); setIsDashboard(true); }
          return;
        }
        setSelectedProspect(null);
        setIsDashboard(true); // fallback = Dashboard (la vue Suivi a été retirée)
      };

      return (
        <div style={styles.container}>
          <NavTabBar
            currentView={currentView}
            onRestore={restoreView}
            onOpenPalette={() => window.dispatchEvent(new CustomEvent('tw:palette'))}
          />
          <Header
            user={user} 
            onLogout={() => { localStorage.removeItem('user'); setUser(null); }} 
            onDashboard={() => { setListeView(null); setShowAttribution(false); setShowCampagnes(false); setSelectedProspect(null); setIsDashboard(true); }}
            isDashboard={isDashboard}
            onSettings={() => setShowSettings(true)}
            onAttribution={() => { setListeView(null); setShowAttribution(true); setShowCampagnes(false); }}
            showAttribution={showAttribution}
            onCampagnes={() => { setListeView(null); setShowCampagnes(true); setShowAttribution(false); }}
            showCampagnes={showCampagnes}
            onListe={(t) => { setShowCampagnes(false); setShowAttribution(false); setSelectedProspect(null); setListeView(t); }}
            activeListe={listeView}
            prospects={isUserAdmin(user) ? prospects : prospects.filter(p => p.assigned_to === user.name)}
            onSelectProspect={handleSelectProspect}
            onNewProspect={handleNewProspect}
          />

          {/* Emplacement du fil d'Ariane (rempli par NavTabBar via portail) : sous le menu, au-dessus du contenu. */}
          <div id="tw-breadcrumb-slot"></div>

          {showSettings && <Settings onClose={() => setShowSettings(false)} user={user} />}

          {showAttribution && (
            <AttributionView
              prospects={prospects}
              users={appUsers}
              user={user}
              API_URL={API_URL}
              onClose={() => setShowAttribution(false)}
              onUpdateProspect={(updated) => {
                setProspects(prev => prev.map(p => p.id === updated.id ? {...p, ...updated} : p));
              }}
            />
          )}

          {showCampagnes && (
            <CampagnesPage
              user={user}
              API_URL={API_URL}
              onClose={() => setShowCampagnes(false)}
            />
          )}
          
          {showRecap && recapCommercial && (
            <RecapModal 
              commercial={recapCommercial}
              period={recapPeriod}
              prospects={prospects}
              onClose={() => {
                setShowRecap(false);
                setRecapCommercial(null);
              }}
              onNavigate={(prospectId) => {
                const prospect = prospects.find(p => p.id === prospectId);
                if (prospect) {
                  handleSelectProspect(prospect);
                  setIsDashboard(false);
                }
                setShowRecap(false);
                setRecapCommercial(null);
              }}
              user={user}
              API_URL={API_URL}
            />
          )}

          {/* Listes transverses (devis en cours / sociétés / actions) — plein écran quand actives */}
          {listeView && !showCampagnes && !showAttribution && (
            <ListesView type={listeView} prospects={prospects} user={user} API_URL={API_URL} />
          )}

          {/* Sans société sélectionnée → Dashboard ; sinon → fiche plein écran (le panneau-liste
              "Suivi activités" a été retiré ; on choisit une société via le menu/listes/palette). */}
          {!showCampagnes && !listeView && (!selectedProspect ? (
            isUserAdmin(user) ? <Dashboard 
              prospects={prospects} 
              selectedCommercial={selectedCommercial} 
              onSelectCommercial={setSelectedCommercial} 
              onSelectProspect={handleSelectProspect}
              onOpenDashboard={() => { setSelectedProspect(null); setListeView('societes'); }}
              onOpenListe={(t) => { setSelectedProspect(null); setShowCampagnes(false); setShowAttribution(false); setListeView(t); }}
              user={user}
              API_URL={API_URL}
              prospectActionsInfo={prospectActionsInfo}
              setShowCompteurModal={setShowCompteurModal}
              setCompteurModalData={setCompteurModalData}
              codesNaf={codesNaf}
              onRefreshProspects={fetchProspects}
              setFilterCommercial={setFilterCommercial}
              setFilterStatus={setFilterStatus}
              setFilterAttribution={setFilterAttribution}
              onShowRecap={(commercial, period) => {
                setRecapCommercial(commercial);
                setRecapPeriod(period);
                setShowRecap(true);
              }}
            /> : <DashboardConsultant
              prospects={prospects}
              user={user}
              prospectActionsInfo={prospectActionsInfo}
              onSelectProspect={handleSelectProspect}
              onOpenDashboard={() => { setSelectedProspect(null); setListeView('societes'); }}
              API_URL={API_URL}
            />
          ) : (
          <div style={styles.content}>
            <RightPanel
              key={selectedProspect?.id}
              selectedProspect={selectedProspect}
              activities={activities}
              nextActions={nextActions}
              allActions={allActions}
              statusHistory={statusHistory}
              onEdit={handleEditProspect}
              onUpdateProspect={(updated) => {
                setSelectedProspect(updated);
                setProspects(prev => prev.map(p => p.id === updated.id ? {...p, ...updated} : p));
                // Recharger les prospects enrichis pour sync complète
                fetch(`${API_URL}/prospects/enriched`, {headers:{'Authorization':`Bearer ${user?.token}`}})
                  .then(r=>r.json()).then(data => { if(Array.isArray(data)) setProspects(data); });
              }}
              onDelete={handleDeleteProspect}
              onAddActivity={handleAddActivity}
              onAddNextAction={handleAddNextAction}
              onToggleNextAction={handleToggleNextAction}
              onDeleteNextAction={handleDeleteNextAction}
              fetchAllActions={fetchAllActions}
              fetchNextActions={fetchNextActions}
              fetchAffaires={fetchAffaires}
              showForm={showForm}
              formData={formData}
              onFormChange={setFormData}
              onSave={handleSaveProspect}
              onCancel={() => {
                setShowForm(false);
                setFormData(getEmptyProspect());
                // Réinitialiser les devis
                setDevisList([]);
                setShowDevisForm(false);
                setEditingDevisId(null);
                setEditingDevis(null);
                setDevisPdfFile(null);
              }}
              newActionType={newActionType}
              onActionTypeChange={setNewActionType}
              newActionDate={newActionDate}
              onActionDateChange={setNewActionDate}
              newActionActor={newActionActor}
              onActionActorChange={setNewActionActor}
              newActionContact={newActionContact}
              onActionContactChange={setNewActionContact}
              newActionComment={newActionComment}
              onActionCommentChange={setNewActionComment}
              user={user}
              API_URL={API_URL}
              interlocuteurs={interlocuteurs}
              showInterlocuteurForm={showInterlocuteurForm}
              setShowInterlocuteurForm={setShowInterlocuteurForm}
              interlocuteurForm={interlocuteurForm}
              setInterlocuteurForm={setInterlocuteurForm}
              handleSaveInterlocuteur={handleSaveInterlocuteur}
              handleDeleteInterlocuteur={handleDeleteInterlocuteur}
              fetchInterlocuteurs={fetchInterlocuteurs}
              historyExpanded={historyExpanded}
              setHistoryExpanded={setHistoryExpanded}
              historyLoading={historyLoading}
              setHistoryLoading={setHistoryLoading}
              historyData={historyData}
              setHistoryData={setHistoryData}
              historyError={historyError}
              setHistoryError={setHistoryError}
              draggedContactId={draggedContactId}
              setDraggedContactId={setDraggedContactId}
              dragOverContactId={dragOverContactId}
              setDragOverContactId={setDragOverContactId}
              devisList={devisList}
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
              handleRattacherDevisAffaire={handleRattacherDevisAffaire}
              handleUploadDevisPdf={handleUploadDevisPdf}
              handleUploadDevisPdfDirect={handleUploadDevisPdfDirect}
              handleDeleteDevisPDF={handleDeleteDevisPDF}
              affairesList={affairesList}
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
              interlocuteurs={interlocuteurs}
              users={appUsers}
              codesNaf={codesNaf}
            />
          </div>
          ))}
          
          {/* Modal Compteurs Dashboard (au niveau App pour rendu correct) */}
          {showCompteurModal && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999
            }}>
              <div style={{
                backgroundColor: 'white',
                padding: '25px',
                borderRadius: '12px',
                maxWidth: '600px',
                width: '90%',
                maxHeight: '80vh',
                overflow: 'auto',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                  <h3 style={{margin: 0, color: 'var(--primary)'}}>{compteurModalData.title}</h3>
                  <button 
                    onClick={() => setShowCompteurModal(false)}
                    style={{
                      backgroundColor: '#999',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Fermer
                  </button>
                </div>
                
                {compteurModalData.prospects.length === 0 ? (
                  <div style={{padding: '20px', textAlign: 'center', color: '#999', fontStyle: 'italic'}}>
                    Aucun prospect trouvé pour cette période
                  </div>
                ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    {compteurModalData.prospects.map(prospect => (
                      <div 
                        key={prospect.id}
                        onClick={() => {
                          handleSelectProspect(prospect);
                          setIsDashboard(false);
                          setShowCompteurModal(false);
                        }}
                        style={{
                          padding: '12px',
                          backgroundColor: '#f9f9f9',
                          borderRadius: '6px',
                          border: '1px solid #e0e0e0',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#e0f2f7';
                          e.currentTarget.style.borderColor = 'var(--primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#f9f9f9';
                          e.currentTarget.style.borderColor = '#e0e0e0';
                        }}
                      >
                        <div style={{fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px'}}>{prospect.name}</div>
                        <div style={{fontSize: '12px', color: '#666'}}>
                          {prospect.contact_name && <span>{prospect.contact_name} • </span>}
                          <span style={{color: 'var(--primary)', fontWeight: '600'}}>{prospect.statut_societe}</span>
                          {prospect.real_status && (
                            <span style={{marginLeft: '8px', color: '#1a9fdb'}}>
                              {prospect.real_status} ({prospect.real_probability}%)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════ MODALE : NOUVELLE SOCIÉTÉ ═══════ */}
          {showNewCompanyModal && (
            <div
              onClick={(e) => { if (e.target === e.currentTarget) setShowNewCompanyModal(false); }}
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 51, 102, 0.35)', backdropFilter: 'blur(2px)',
                zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                padding: '40px 20px', overflowY: 'auto'
              }}>
              <div style={{
                background: 'white', borderRadius: '12px', width: '100%', maxWidth: '900px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)'
              }}>
                {/* Header */}
                <div style={{
                  padding: '20px 28px', borderBottom: '1px solid #cde8e8',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <h2 style={{ margin: 0, fontFamily: 'Poppins,sans-serif', color: '#003366', fontSize: '1.3rem' }}>
                    🏢 Nouvelle société
                  </h2>
                  <button onClick={() => setShowNewCompanyModal(false)} style={{
                    background: '#f0f8f8', border: 'none', width: '34px', height: '34px',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-2)'
                  }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px 28px' }}>

                  {/* Bouton + SocieteInfo : recherche et autofill */}
                  <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#f0f8f8', border: '0.5px dashed #a8d0d3', borderRadius: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-2)', flex: 1 }}>
                      Vous connaissez le nom ou la marque ? Lancez une recherche dans la base SocieteInfo pour préremplir.
                    </span>
                    <button
                      type="button"
                      onClick={() => openSInfoSearch(newCompanyData.name)}
                      style={{
                        background: 'var(--text)', color: 'white', border: 'none',
                        padding: '7px 14px', borderRadius: '7px',
                        fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontFamily: "'Inter', system-ui, sans-serif"
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                      SocieteInfo
                    </button>
                  </div>

                  {/* Champs obligatoires */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 18px', marginBottom: '14px' }}>
                    <div style={{ gridColumn: 'span 3' }}>
                      <label style={styles.modalLabel}>Raison sociale <span style={{color:'#dc2626'}}>*</span></label>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Ex: Barbara Bui"
                        value={newCompanyData.name}
                        onChange={(e) => handleNewCompanyChange('name', e.target.value)}
                        style={{ ...styles.modalInput, borderColor: newCompanyErrors.name ? '#dc2626' : '#a8d0d3', background: newCompanyErrors.name ? '#fff5f5' : 'white' }}
                      />
                      {newCompanyErrors.name && <span style={styles.errMsg}>{newCompanyErrors.name}</span>}
                    </div>

                    <div>
                      <label style={styles.modalLabel}>Type société <span style={{color:'#dc2626'}}>*</span></label>
                      <select
                        value={newCompanyData.statut_societe}
                        onChange={(e) => handleNewCompanyChange('statut_societe', e.target.value)}
                        style={{ ...styles.modalInput, borderColor: newCompanyErrors.statut_societe ? '#dc2626' : '#a8d0d3', background: newCompanyErrors.statut_societe ? '#fff5f5' : 'white' }}
                      >
                        <option value="">— Sélectionner —</option>
                        <option value="Suspect">Suspect</option>
                        <option value="Prospect">Prospect</option>
                        <option value="Client">Client</option>
                      </select>
                      {newCompanyErrors.statut_societe && <span style={styles.errMsg}>{newCompanyErrors.statut_societe}</span>}
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={styles.modalLabel}>Commercial assigné <span style={{color:'#dc2626'}}>*</span></label>
                      <select
                        value={newCompanyData.assigned_to}
                        onChange={(e) => handleNewCompanyChange('assigned_to', e.target.value)}
                        style={{ ...styles.modalInput, borderColor: newCompanyErrors.assigned_to ? '#dc2626' : '#a8d0d3', background: newCompanyErrors.assigned_to ? '#fff5f5' : 'white' }}
                      >
                        <option value="">— Sélectionner —</option>
                        <option value="Christian">Christian</option>
                        <option value="Roger">Roger</option>
                        <option value="Frédéric">Frédéric</option>
                      </select>
                      {newCompanyErrors.assigned_to && <span style={styles.errMsg}>{newCompanyErrors.assigned_to}</span>}
                    </div>
                  </div>

                  {/* Séparateur */}
                  <div style={{
                    borderTop: '1px dashed #cde8e8', margin: '18px 0 14px', paddingTop: '14px',
                    fontSize: '0.72rem', color: 'var(--text-2)', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.08em'
                  }}>Coordonnées société</div>

                  {/* Champs optionnels */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 18px' }}>
                    <div>
                      <label style={styles.modalLabel}>N° SIREN</label>
                      <input
                        type="text" placeholder="9 chiffres" maxLength="9"
                        value={newCompanyData.siren}
                        onChange={(e) => handleNewCompanyChange('siren', e.target.value.replace(/\D/g, ''))}
                        style={{ ...styles.modalInput, borderColor: newCompanyErrors.siren ? '#dc2626' : '#a8d0d3', background: newCompanyErrors.siren ? '#fff5f5' : 'white' }}
                      />
                      {newCompanyErrors.siren && <span style={styles.errMsg}>{newCompanyErrors.siren}</span>}
                    </div>

                    <div>
                      <label style={styles.modalLabel}>Téléphone standard</label>
                      <input
                        type="tel" placeholder="01 23 45 67 89"
                        value={newCompanyData.tel_standard}
                        onChange={(e) => handleNewCompanyChange('tel_standard', e.target.value)}
                        style={styles.modalInput}
                      />
                    </div>

                    <div>
                      <label style={styles.modalLabel}>Site web</label>
                      <input
                        type="url" placeholder="https://..."
                        value={newCompanyData.website}
                        onChange={(e) => handleNewCompanyChange('website', e.target.value)}
                        style={styles.modalInput}
                      />
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={styles.modalLabel}>Adresse siège</label>
                      <input
                        type="text" placeholder="Adresse complète"
                        value={newCompanyData.adresse}
                        onChange={(e) => handleNewCompanyChange('adresse', e.target.value)}
                        style={styles.modalInput}
                      />
                    </div>

                    <div>
                      <label style={styles.modalLabel}>Code NAF</label>
                      <select
                        value={newCompanyData.code_naf}
                        onChange={(e) => handleNewCompanyChange('code_naf', e.target.value)}
                        style={styles.modalInput}
                      >
                        <option value="">— Sélectionner —</option>
                        {codesNaf.map(c => (
                          <option key={c.code} value={c.code}>{c.code} — {c.libelle}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ gridColumn: 'span 3' }}>
                      <label style={styles.modalLabel}>Marques <span style={{fontWeight:400,color:'#9eb5b5',textTransform:'none',letterSpacing:0}}>(Entrée ou virgule pour ajouter)</span></label>
                      <div style={{
                        border: '1.5px solid #a8d0d3', borderRadius: '6px', padding: '6px',
                        display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '40px', background: 'white'
                      }}>
                        {(newCompanyData.marques || []).map((m, i) => (
                          <span key={i} style={{
                            background: '#e0f2fe', color: '#0369a1', padding: '3px 10px',
                            borderRadius: '4px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px'
                          }}>
                            {m}
                            <button
                              onClick={() => handleNewCompanyChange('marques', newCompanyData.marques.filter((_, j) => j !== i))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1', fontSize: '1rem', padding: 0, lineHeight: 1 }}
                            >×</button>
                          </span>
                        ))}
                        <input
                          type="text"
                          placeholder="ex: PABLO, GERARD DAREL"
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
                              e.preventDefault();
                              const val = e.target.value.trim().replace(/,$/, '');
                              if (val && !(newCompanyData.marques || []).includes(val)) {
                                handleNewCompanyChange('marques', [...(newCompanyData.marques || []), val]);
                              }
                              e.target.value = '';
                            }
                          }}
                          style={{ border: 'none', outline: 'none', flex: 1, minWidth: '150px', padding: '4px', fontSize: '0.9rem' }}
                        />
                      </div>
                    </div>

                    <div style={{ gridColumn: 'span 3' }}>
                      <label style={styles.modalLabel}>Notes</label>
                      <textarea
                        placeholder="Informations complémentaires..."
                        value={newCompanyData.notes}
                        onChange={(e) => handleNewCompanyChange('notes', e.target.value)}
                        style={{ ...styles.modalInput, minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{
                  padding: '16px 28px 20px', borderTop: '1px solid #cde8e8',
                  background: '#f0f8f8', display: 'flex', gap: '10px', justifyContent: 'flex-end',
                  borderRadius: '0 0 12px 12px'
                }}>
                  <button onClick={() => setShowNewCompanyModal(false)} style={{
                    padding: '10px 20px', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem',
                    cursor: 'pointer', background: 'white', color: 'var(--text-2)', border: '1.5px solid #cde8e8'
                  }}>Annuler</button>
                  <button onClick={handleCreateFromModal} style={{
                    padding: '10px 20px', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem',
                    cursor: 'pointer', background: 'var(--primary)', color: 'white', border: 'none'
                  }}>💾 Enregistrer et ouvrir la fiche</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ MODALE : CHOIX D'ENRICHISSEMENT (Infos / Contacts) ═══════ */}
          {showEnrichChoiceModal && enrichChoiceTarget && (
            <div
              onClick={(e) => { if (e.target === e.currentTarget) { setShowEnrichChoiceModal(false); setEnrichChoiceTarget(null); } }}
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(26, 53, 53, 0.5)', backdropFilter: 'blur(2px)',
                zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px'
              }}>
              <div style={{
                background: 'white', borderRadius: '12px',
                width: '100%', maxWidth: '520px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                padding: '24px'
              }} onClick={(e) => e.stopPropagation()}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                  <div style={{fontSize:'16px',fontWeight:'700',color:'var(--tw-ink)'}}>🎯 Que souhaitez-vous enrichir ?</div>
                  <button onClick={() => { setShowEnrichChoiceModal(false); setEnrichChoiceTarget(null); }}
                    style={{background:'transparent',border:'none',cursor:'pointer',fontSize:'20px',color:'var(--tw-muted)',padding:'4px 8px'}}>×</button>
                </div>
                <div style={{fontSize:'12px',color:'var(--tw-muted)',marginBottom:'18px'}}>
                  {enrichChoiceTarget.name} · SIREN {enrichChoiceTarget.siren}
                </div>

                {/* Choix 1 : Mettre à jour les infos société */}
                <button
                  onClick={() => {
                    setShowEnrichChoiceModal(false);
                    const target = enrichChoiceTarget;
                    setEnrichChoiceTarget(null);
                    openSInfoEnrich(target, 'infos');
                  }}
                  style={{
                    width:'100%',
                    display:'flex',alignItems:'flex-start',gap:'12px',
                    padding:'14px 16px',marginBottom:'10px',
                    background:'white',border:'1px solid var(--tw-border)',borderRadius:'8px',
                    cursor:'pointer',textAlign:'left',
                    transition:'background .15s, border-color .15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--tw-teal)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'var(--tw-border)'; }}
                >
                  <div style={{flexShrink:0,width:'32px',height:'32px',borderRadius:'8px',background:'var(--tw-teal-light)',color:'var(--tw-teal)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                    {I(ICONS.doc, 16)}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'14px',fontWeight:'600',color:'var(--tw-ink)',marginBottom:'2px'}}>
                      Mettre à jour les infos société
                    </div>
                    <div style={{fontSize:'12px',color:'var(--tw-muted)',lineHeight:1.4}}>
                      Récupère SIREN, raison sociale, NAF, adresse, téléphone, site web, effectifs, marques…
                    </div>
                    <div style={{fontSize:'11px',color:'#92400e',marginTop:'4px',fontWeight:'600'}}>
                      💳 1 crédit
                    </div>
                  </div>
                </button>

                {/* Choix 2 : Ajouter des contacts */}
                <button
                  onClick={() => {
                    setShowEnrichChoiceModal(false);
                    const target = enrichChoiceTarget;
                    setEnrichChoiceTarget(null);
                    openSInfoEnrich(target, 'contacts');
                  }}
                  style={{
                    width:'100%',
                    display:'flex',alignItems:'flex-start',gap:'12px',
                    padding:'14px 16px',marginBottom:'10px',
                    background:'white',border:'1px solid var(--tw-border)',borderRadius:'8px',
                    cursor:'pointer',textAlign:'left',
                    transition:'background .15s, border-color .15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--tw-teal)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'var(--tw-border)'; }}
                >
                  <div style={{flexShrink:0,width:'32px',height:'32px',borderRadius:'8px',background:'#dcfce7',color:'#166534',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                    {I(ICONS.mail, 16)}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'14px',fontWeight:'600',color:'var(--tw-ink)',marginBottom:'2px'}}>
                      Ajouter des contacts depuis SocieteInfo
                    </div>
                    <div style={{fontSize:'12px',color:'var(--tw-muted)',lineHeight:1.4}}>
                      Liste les dirigeants/employés détectés par SocieteInfo. Sélection en preview floutée, paiement uniquement sur les contacts retenus.
                    </div>
                    <div style={{fontSize:'11px',color:'#166534',marginTop:'4px',fontWeight:'600'}}>
                      ✅ Preview gratuite · 1 crédit/contact retenu
                    </div>
                  </div>
                </button>

                <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'12px',textAlign:'center',fontStyle:'italic'}}>
                  Pour faire les deux, lancez l'enrichissement deux fois.
                </div>
              </div>
            </div>
          )}

          {/* ═══════ MODALE : RECHERCHE SOCIETEINFO ═══════ */}
          {showSInfoModal && (
            <div
              onClick={(e) => { if (e.target === e.currentTarget) setShowSInfoModal(false); }}
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(26, 53, 53, 0.5)', backdropFilter: 'blur(2px)',
                zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                padding: '60px 20px', overflowY: 'auto'
              }}>
              <div style={{
                background: 'white', borderRadius: '12px', width: '100%', maxWidth: '640px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.18)', border: '0.5px solid var(--border)'
              }}>
                {/* Header */}
                <div style={{
                  padding: '18px 24px', borderBottom: '0.5px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <h2 style={{ margin: 0, fontFamily: 'Inter, sans-serif', color: 'var(--text)', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {sInfoStep === 1 && (sInfoMode === 'enrich' ? 'Enrichir depuis SocieteInfo' : 'Rechercher dans SocieteInfo')}
                    {sInfoStep === 2 && sInfoMode === 'create' && 'Confirmer l\'import'}
                    {sInfoStep === 2 && sInfoMode === 'enrich' && sInfoSelectedCompany && sInfoSelectedCompany._contactsOnly && 'Sélectionner les contacts'}
                    {sInfoStep === 2 && sInfoMode === 'enrich' && (!sInfoSelectedCompany || !sInfoSelectedCompany._contactsOnly) && 'Mettre à jour la fiche'}
                    {sInfoStep === 3 && 'Résoudre les conflits'}
                    <span style={{ fontSize: '11px', color: 'var(--meta)', fontWeight: 400 }}>· Étape {sInfoStep}/{sInfoMode === 'enrich' ? 3 : 2}</span>
                  </h2>
                  <button onClick={() => setShowSInfoModal(false)} style={{
                    background: 'var(--bg)', border: 'none', width: '30px', height: '30px',
                    borderRadius: '7px', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-2)'
                  }}>✕</button>
                </div>

                {/* ═══ ÉTAPE 1 : RECHERCHE ═══ */}
                {sInfoStep === 1 && (
                <div style={{ padding: '20px 24px' }}>
                  {/* Input recherche */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Nom de société ou de marque (ex: Gérard Darel)"
                      value={sInfoQuery}
                      onChange={(e) => setSInfoQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSInfoSearch(); }}
                      style={{
                        flex: 1, padding: '10px 14px', fontSize: '14px',
                        border: '0.5px solid #cde0e0', borderRadius: '8px',
                        outline: 'none', fontFamily: "'Inter', system-ui, sans-serif"
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSInfoSearch()}
                      disabled={sInfoLoading || sInfoQuery.trim().length < 2}
                      style={{
                        padding: '10px 18px', fontSize: '13px', fontWeight: 500,
                        background: 'var(--text)', color: 'white', border: 'none',
                        borderRadius: '8px', cursor: 'pointer',
                        opacity: (sInfoLoading || sInfoQuery.trim().length < 2) ? 0.5 : 1
                      }}
                    >
                      {sInfoLoading ? '…' : 'Rechercher'}
                    </button>
                  </div>

                  {/* 🎯 Match précis (optionnel) : remplir Ville et/ou CP active l'endpoint Enrich Company */}
                  {/*    → 1 seul résultat ciblé avec score (vs liste complète) — beaucoup plus pertinent */}
                  <div style={{
                    marginBottom: '12px', padding: '10px 12px',
                    background: '#f0f7f7', border: '0.5px dashed #a8c8c8', borderRadius: '7px'
                  }}>
                    <div style={{ fontSize: '11px', color: '#4a6868', marginBottom: '6px', fontWeight: 500 }}>
                      🎯 Match précis (optionnel) — remplissez Ville ou CP pour cibler une société unique avec un score de confiance
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Ville (ex: Saint-Jean-de-Luz)"
                        value={sInfoCity}
                        onChange={(e) => setSInfoCity(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSInfoSearch(); }}
                        style={{
                          flex: 2, padding: '8px 12px', fontSize: '13px',
                          border: '0.5px solid #cde0e0', borderRadius: '6px',
                          outline: 'none', fontFamily: "'Inter', system-ui, sans-serif"
                        }}
                      />
                      <input
                        type="text"
                        placeholder="CP (ex: 64500)"
                        value={sInfoPostalCode}
                        onChange={(e) => setSInfoPostalCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSInfoSearch(); }}
                        style={{
                          flex: 1, padding: '8px 12px', fontSize: '13px',
                          border: '0.5px solid #cde0e0', borderRadius: '6px',
                          outline: 'none', fontFamily: "'Inter', system-ui, sans-serif"
                        }}
                      />
                    </div>
                  </div>

                  {/* Recherche élargie : désactivée si match précis car non pertinent */}
                  <div style={{
                    marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px',
                    opacity: (sInfoCity.trim() || sInfoPostalCode.trim()) ? 0.4 : 1
                  }}>
                    <input
                      type="checkbox"
                      id="sinfo-broad-search"
                      checked={sInfoBroadSearch}
                      onChange={(e) => setSInfoBroadSearch(e.target.checked)}
                      disabled={!!(sInfoCity.trim() || sInfoPostalCode.trim())}
                      style={{ cursor: 'pointer', margin: 0 }}
                    />
                    <label htmlFor="sinfo-broad-search" style={{
                      fontSize: '12px', color: 'var(--text-2)',
                      cursor: (sInfoCity.trim() || sInfoPostalCode.trim()) ? 'not-allowed' : 'pointer',
                      fontFamily: "'Inter', system-ui, sans-serif", userSelect: 'none'
                    }}>
                      🔍 Recherche élargie (sites web, code APE — utile pour enseignes/marques non déposées)
                    </label>
                  </div>

                  {/* Erreur */}
                  {sInfoError && (
                    <div style={{
                      padding: '10px 14px', marginBottom: '12px',
                      background: '#fef3f2', border: '0.5px solid #fecaca', borderRadius: '7px',
                      color: '#a52d2d', fontSize: '12px'
                    }}>
                      {sInfoError}
                    </div>
                  )}

                  {/* Liste de résultats */}
                  {sInfoResults.length > 0 && (
                    <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--meta)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px', fontWeight: 500 }}>
                        {sInfoResults.length} résultat{sInfoResults.length > 1 ? 's' : ''}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
                        {sInfoResults.map((item, idx) => {
                          const name = item.name || item.brandName || item.commercialName || item.companyName || '(sans nom)';
                          const siren = item.registration_number || item.siren || item.companyId || '';
                          const ville = item.formatted_address || (item.address && item.address.city) || item.city || '';
                          const naf = item.activity || item.naf || item.nafLabel || '';
                          return (
                            <button
                              key={siren || idx}
                              type="button"
                              onClick={() => handleSInfoSelect(item)}
                              disabled={sInfoLoading}
                              style={{
                                textAlign: 'left', padding: '10px 14px',
                                background: 'white', border: '0.5px solid var(--border)',
                                borderRadius: '8px', cursor: 'pointer',
                                fontFamily: "'Inter', system-ui, sans-serif",
                                transition: 'background .15s, border-color .15s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                            >
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{name}</span>
                                {typeof item._match_score === 'number' && (
                                  <span style={{
                                    fontSize: '10px', padding: '2px 7px', borderRadius: '10px',
                                    background: item._match_score >= 0.7 ? '#dcfce7' : item._match_score >= 0.4 ? '#fef3c7' : '#fecaca',
                                    color: item._match_score >= 0.7 ? '#166534' : item._match_score >= 0.4 ? '#92400e' : '#991b1b',
                                    fontWeight: 600
                                  }}>
                                    Score {(item._match_score * 100).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--meta)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {siren && <span>SIREN {siren}</span>}
                                {ville && <span>· {ville}</span>}
                                {naf && <span>· {naf}</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* État vide initial */}
                  {!sInfoLoading && !sInfoError && sInfoResults.length === 0 && (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--meta)', fontSize: '12px' }}>
                      Tapez un nom de société ou une marque puis appuyez sur Entrée.
                    </div>
                  )}
                </div>
                )}

                {/* ═══ ÉTAPE 2 : SOCIÉTÉ + DIRIGEANTS À IMPORTER ═══ */}
                {sInfoStep === 2 && sInfoSelectedCompany && (
                <div style={{ padding: '20px 24px' }}>
                  {/* Résumé de la société sélectionnée. En mode 'contacts uniquement',
                      _mapped est null donc on fallback sur les infos minimales fournies
                      par l'objet société (registration_number + organization.name) ou
                      sur le prospect cible (sInfoEnrichTarget). */}
                  <div style={{
                    padding: '12px 14px', marginBottom: '16px',
                    background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: '8px'
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      {(sInfoSelectedCompany._mapped && sInfoSelectedCompany._mapped.name)
                        || (sInfoSelectedCompany.organization && sInfoSelectedCompany.organization.name)
                        || (sInfoEnrichTarget && sInfoEnrichTarget.name)
                        || '(société)'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-2)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {((sInfoSelectedCompany._mapped && sInfoSelectedCompany._mapped.siren) || sInfoSelectedCompany.registration_number)
                        && <span>SIREN {(sInfoSelectedCompany._mapped && sInfoSelectedCompany._mapped.siren) || sInfoSelectedCompany.registration_number}</span>}
                      {(sInfoSelectedCompany._mapped && sInfoSelectedCompany._mapped.adresse) && <span>· {sInfoSelectedCompany._mapped.adresse}</span>}
                    </div>
                  </div>

                  {/* Section "Dirigeants" : affichée seulement en mode 'create' (import société)
                      ou en mode 'enrich' avec _contactsOnly (utilisateur a explicitement demandé
                      les contacts). En mode 'enrich infos uniquement', on cache cette section
                      car elle est inutile et le message "Aucun dirigeant trouvé" prête à confusion. */}
                  {(sInfoMode === 'create' || (sInfoSelectedCompany && sInfoSelectedCompany._contactsOnly)) && (
                  <React.Fragment>
                  <div style={{ fontSize: '11px', color: 'var(--meta)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px', fontWeight: 500 }}>
                    Dirigeants — sélectionnez ceux à importer
                  </div>

                  {sInfoLoading && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--meta)', fontSize: '12px' }}>
                      Chargement…
                    </div>
                  )}

                  {!sInfoLoading && sInfoContacts.length === 0 && (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--meta)', fontSize: '12px', background: '#fafafa', borderRadius: '7px' }}>
                      Aucun dirigeant trouvé pour cette société.
                    </div>
                  )}

                  {!sInfoLoading && sInfoContacts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
                      {sInfoContacts.map((c) => {
                        const cid = String(c.id || c.contact_id || '');
                        const checked = !!sInfoSelectedContacts[cid];
                        const civ = c.gender === 'M' ? 'M.' : c.gender === 'F' ? 'Mme' : '';
                        const fullName = [civ, c.firstName || c.firstname, c.lastName || c.lastname || c.name].filter(Boolean).join(' ');
                        const fonction = c.position || c.title || c.function || c.role || '';
                        // Détection email présent : SocieteInfo retourne 'email' (souvent flouté en mode anonymized)
                        // ou un score email_score > 0. Un contact sans email du tout ne sera utile que pour LinkedIn.
                        const hasEmail = !!(c.email && String(c.email).trim());
                        const linkedinUrl = c.linkedin_url || c.linkedinUrl || '';
                        return (
                          <label
                            key={cid}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '8px 12px', borderRadius: '7px',
                              border: '0.5px solid ' + (checked ? 'var(--primary)' : 'var(--border)'),
                              background: checked ? 'var(--primary-soft)' : 'white',
                              cursor: 'pointer', transition: 'all .15s',
                              // Légère opacité pour les contacts sans email (sans bloquer la sélection)
                              opacity: hasEmail ? 1 : 0.78
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setSInfoSelectedContacts(prev => ({ ...prev, [cid]: e.target.checked }))}
                              style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1, fontFamily: "'Inter', system-ui, sans-serif", minWidth: 0 }}>
                              <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{fullName || '(sans nom)'}</div>
                              {fonction && <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>{fonction}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              {hasEmail
                                ? <span title="Email disponible (récupérable au paiement)" style={{display:'inline-flex',alignItems:'center',gap:'3px',fontSize:'10px',padding:'2px 7px',borderRadius:'10px',background:'#dcfce7',color:'#166534',fontWeight:600}}>
                                    {I(ICONS.mail, 11)} email
                                  </span>
                                : <span title="Pas d'email disponible chez SocieteInfo" style={{display:'inline-flex',alignItems:'center',gap:'3px',fontSize:'10px',padding:'2px 7px',borderRadius:'10px',background:'#f4f4f4',color:'#94a3a3',fontWeight:600}}>
                                    pas d'email
                                  </span>}
                              {linkedinUrl && <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Profil LinkedIn (s'ouvre dans un nouvel onglet)" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'22px',height:'22px',borderRadius:'4px',background:'#0a66c2',color:'white',fontSize:'10px',fontWeight:700,textDecoration:'none'}}>in</a>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Compteur de coût : affiché dès qu'on a au moins 1 contact dispo.
                      Récupération des vraies données (noms/emails) toujours active à l'import.
                      Le compteur est purement informatif - le débit a lieu au clic Importer. */}
                  {!sInfoLoading && sInfoContacts.length > 0 && (() => {
                    const nbSelected = Object.values(sInfoSelectedContacts).filter(Boolean).length;
                    return (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', marginBottom: '16px',
                        background: nbSelected > 20 ? '#fff8e1' : '#f0f7f7',
                        border: '0.5px solid ' + (nbSelected > 20 ? '#efc274' : '#cde0e0'),
                        borderRadius: '7px',
                        fontFamily: "'Inter', system-ui, sans-serif"
                      }}>
                        <span style={{fontSize:'14px'}}>{nbSelected > 20 ? '⚠️' : '💳'}</span>
                        <div style={{flex:1}}>
                          <div style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500 }}>
                            {nbSelected === 0
                              ? 'Aucun contact sélectionné'
                              : `${nbSelected} contact${nbSelected > 1 ? 's' : ''} sélectionné${nbSelected > 1 ? 's' : ''} · coût ~${nbSelected} crédit${nbSelected > 1 ? 's' : ''} SocieteInfo`}
                          </div>
                          <div style={{ fontSize: '11px', color: nbSelected > 20 ? '#7a5520' : 'var(--text-2)' }}>
                            {nbSelected > 20
                              ? 'Sélection importante — confirmation demandée à l\'import.'
                              : 'Les noms, emails et téléphones réels seront récupérés à l\'import.'}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  </React.Fragment>
                  )}

                  {/* Footer : Retour + Valider */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid var(--border)', paddingTop: '14px' }}>
                    <button
                      type="button"
                      onClick={() => setSInfoStep(1)}
                      disabled={sInfoLoading}
                      style={{
                        padding: '8px 14px', fontSize: '12px',
                        background: 'white', color: 'var(--text-2)',
                        border: '0.5px solid #cde0e0', borderRadius: '7px', cursor: 'pointer'
                      }}
                    >
                      ← Retour
                    </button>
                    <button
                      type="button"
                      onClick={handleSInfoConfirmContacts}
                      disabled={sInfoLoading}
                      style={{
                        padding: '9px 18px', fontSize: '13px', fontWeight: 500,
                        background: 'var(--text)', color: 'white', border: 'none',
                        borderRadius: '8px', cursor: 'pointer',
                        opacity: sInfoLoading ? 0.5 : 1
                      }}
                    >
                      {Object.values(sInfoSelectedContacts).filter(Boolean).length > 0
                        ? `Importer (${Object.values(sInfoSelectedContacts).filter(Boolean).length})`
                        : 'Importer la société'}
                    </button>
                  </div>
                </div>
                )}

                {/* ═══ ÉTAPE 3 : CONFLITS DE CHAMPS (mode enrich uniquement) ═══ */}
                {sInfoStep === 3 && sInfoMode === 'enrich' && sInfoConflicts.length > 0 && (
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '14px' }}>
                    Certains champs diffèrent. Cochez à droite pour utiliser la valeur SocieteInfo, sinon la valeur actuelle est conservée.
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
                    {sInfoConflicts.map((c, idx) => (
                      <div key={c.field} style={{
                        padding: '10px 14px',
                        border: '0.5px solid ' + (c.useNew ? 'var(--primary)' : 'var(--border)'),
                        background: c.useNew ? 'var(--primary-soft)' : 'white',
                        borderRadius: '8px',
                        transition: 'all .15s'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--meta)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 500 }}>
                            {c.label}
                          </span>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: c.useNew ? 'var(--primary)' : 'var(--text-2)', fontWeight: 500 }}>
                            <input
                              type="checkbox"
                              checked={c.useNew}
                              onChange={(e) => {
                                const nv = e.target.checked;
                                setSInfoConflicts(prev => prev.map((x, i) => i === idx ? { ...x, useNew: nv } : x));
                              }}
                              style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                            />
                            Utiliser SocieteInfo
                          </label>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--meta)', marginBottom: '2px' }}>Actuel</div>
                            <div style={{
                              fontSize: '12px', color: c.useNew ? 'var(--meta)' : 'var(--text)',
                              padding: '6px 10px', background: '#fafafa', borderRadius: '6px',
                              textDecoration: c.useNew ? 'line-through' : 'none',
                              fontFamily: "'Inter', system-ui, sans-serif",
                              wordBreak: 'break-word'
                            }}>
                              {c.current || '(vide)'}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--primary)', marginBottom: '2px' }}>SocieteInfo</div>
                            <div style={{
                              fontSize: '12px', color: c.useNew ? 'var(--text)' : 'var(--meta)',
                              padding: '6px 10px', background: c.useNew ? 'white' : '#fafafa', borderRadius: '6px',
                              border: c.useNew ? '0.5px solid #cde0e0' : 'none',
                              fontFamily: "'Inter', system-ui, sans-serif",
                              fontWeight: c.useNew ? 500 : 400,
                              wordBreak: 'break-word'
                            }}>
                              {c.sinfo}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer : Retour + Valider */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid var(--border)', paddingTop: '14px', marginTop: '16px' }}>
                    <button
                      type="button"
                      onClick={() => setSInfoStep(2)}
                      disabled={sInfoLoading}
                      style={{
                        padding: '8px 14px', fontSize: '12px',
                        background: 'white', color: 'var(--text-2)',
                        border: '0.5px solid #cde0e0', borderRadius: '7px', cursor: 'pointer'
                      }}
                    >
                      ← Retour
                    </button>
                    <button
                      type="button"
                      onClick={handleSInfoConfirmConflicts}
                      disabled={sInfoLoading}
                      style={{
                        padding: '9px 18px', fontSize: '13px', fontWeight: 500,
                        background: 'var(--text)', color: 'white', border: 'none',
                        borderRadius: '8px', cursor: 'pointer',
                        opacity: sInfoLoading ? 0.5 : 1
                      }}
                    >
                      Appliquer ({sInfoConflicts.filter(c => c.useNew).length} changement{sInfoConflicts.filter(c => c.useNew).length > 1 ? 's' : ''})
                    </button>
                  </div>
                </div>
                )}
              </div>
            </div>
          )}

        </div>
      );
    }

    function Dashboard({ prospects, selectedCommercial, onSelectCommercial, onSelectProspect, onOpenDashboard, onOpenListe, user, API_URL, prospectActionsInfo, onShowRecap, setShowCompteurModal, setCompteurModalData, codesNaf = [], onRefreshProspects, setFilterCommercial, setFilterStatus, setFilterAttribution }) {
      const [activeTab, setActiveTab] = React.useState(null);
      const [showSocietes, setShowSocietes] = React.useState(false);
      const [societesSortCol, setSocietesSortCol] = React.useState('name');
      const [societesSortAsc, setSocietesSortAsc] = React.useState(true);
      // Filtre par type de société pour la 2e liste (drill-down par commercial dans le dashboard)
      const [societesTypeFilter, setSocietesTypeFilter] = React.useState('all');
      const [recapSending, setRecapSending] = React.useState(false);

      const [recapResult, setRecapResult] = React.useState(null);
      const [recapTarget, setRecapTarget] = React.useState('Moi (Christian)');
      const [recapType, setRecapType] = React.useState('actions');
      const [recapOpen, setRecapOpen] = React.useState(false);
      const [recapConfirm, setRecapConfirm] = React.useState(false);

      // ═══ États pour la modal de Prospection multi-critères SocieteInfo (Phase 5) ═══
      const [showProspectionModal, setShowProspectionModal] = React.useState(false);
      const [prospStep, setProspStep] = React.useState(1); // 1=NAF, 2=Zone, 3=Filtres, 4=Résultats
      const [prospNafCode, setProspNafCode] = React.useState('');           // ex: '14.13Z'
      const [prospNafLibelle, setProspNafLibelle] = React.useState('');     // libellé associé
      const [prospNafSearch, setProspNafSearch] = React.useState('');       // recherche fuzzy
      const [prospPlace, setProspPlace] = React.useState(null);             // {id, name, type}
      const [prospPlaceSearch, setProspPlaceSearch] = React.useState('');
      const [prospPlaceSuggestions, setProspPlaceSuggestions] = React.useState([]);
      const [prospWithPhone, setProspWithPhone] = React.useState(false);
      const [prospWithEmail, setProspWithEmail] = React.useState(false);
      const [prospWithSite, setProspWithSite] = React.useState(false);
      const [prospMinStaff, setProspMinStaff] = React.useState('');
      const [prospMaxStaff, setProspMaxStaff] = React.useState('');
      const [prospResults, setProspResults] = React.useState([]);
      const [prospResultsTotal, setProspResultsTotal] = React.useState(0);
      const [prospResultsPage, setProspResultsPage] = React.useState(1);
      const [prospResultsTotalPages, setProspResultsTotalPages] = React.useState(1);
      const [prospLoading, setProspLoading] = React.useState(false);
      const [prospError, setProspError] = React.useState('');
      const [prospSelected, setProspSelected] = React.useState(new Set()); // Set de SIREN cochés
      const [prospExistingSirens, setProspExistingSirens] = React.useState(new Set()); // SIREN déjà en BDD
      // Set des SIREN qui ont au moins un contact pro nominatif (email pro type personal),
      // détectés via 2e appel parallèle email_type=personal. Coût : +1 crédit/page.
      const [prospWithContactsSirens, setProspWithContactsSirens] = React.useState(new Set());
      const [prospImporting, setProspImporting] = React.useState(false);
      // Progression de l'enrichissement (récupération du téléphone/site via getCompany) pendant l'import
      const [prospEnrichProgress, setProspEnrichProgress] = React.useState(null);
      const [prospImportResult, setProspImportResult] = React.useState(null);

      const commerciaux = [...new Set(prospects.map(p => p.assigned_to).filter(Boolean))].sort();

      const sendTestRecap = async () => {
        setRecapConfirm(true);
      };

      const doSendTestRecap = async () => {
        setRecapConfirm(false);
        setRecapSending(true);
        setRecapResult(null);
        try {
          const res = await fetch(`${API_URL}/recap/send-test`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ targetName: recapTarget === 'Moi (Christian)' ? 'Christian' : recapTarget, recapType })
          });
          const data = await res.json();
          if (data.ok) {
            setRecapResult({ ok: true, msg: `✅ Envoyé à ${data.email}` });
          } else {
            setRecapResult({ ok: false, msg: `❌ Erreur : ${data.error}` });
          }
        } catch (err) {
          setRecapResult({ ok: false, msg: `❌ ${err.message}` });
        }
        setRecapSending(false);
      };

      // ═══ Handlers Prospection multi-critères SocieteInfo ═══

      const openProspectionModal = () => {
        setShowProspectionModal(true);
        setProspStep(1);
        setProspNafCode(''); setProspNafLibelle(''); setProspNafSearch('');
        setProspPlace(null); setProspPlaceSearch(''); setProspPlaceSuggestions([]);
        setProspWithPhone(false); setProspWithEmail(false); setProspWithSite(false);
        setProspMinStaff(''); setProspMaxStaff('');
        setProspResults([]); setProspResultsTotal(0); setProspResultsPage(1); setProspResultsTotalPages(1);
        setProspError(''); setProspLoading(false);
        setProspSelected(new Set()); setProspExistingSirens(new Set()); setProspWithContactsSirens(new Set());
        setProspImportResult(null);
      };

      // Autocomplete zone géo - debounce léger
      React.useEffect(() => {
        if (!showProspectionModal) return;
        const q = prospPlaceSearch.trim();
        if (q.length < 2) { setProspPlaceSuggestions([]); return; }
        let cancelled = false;
        const t = setTimeout(async () => {
          try {
            const res = await window.SInfo.placeAutocomplete(q);
            if (!cancelled) setProspPlaceSuggestions(res.result || []);
          } catch (err) {
            if (!cancelled) setProspPlaceSuggestions([]);
          }
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
      }, [prospPlaceSearch, showProspectionModal]);

      // Lance la recherche multi-critères + détection des sociétés ayant
      // des contacts disponibles via des appels à /v2/contacts.json (concurrence
      // bornée à 4 + retry, cf. mapWithConcurrency/siCallWithRetry) en mode
      // show_all_anonymized=true (gratuit). Le badge ✉️ ne s'affiche
      // que si la société a vraiment au moins 1 contact dans la base SocieteInfo,
      // ce qui correspond effectivement à ce que l'enrichissement pourra ramener.
      // Coût : 1 crédit pour la recherche principale + 0 pour le marquage des contacts.
      const runProspectionSearch = async (page) => {
        setProspError('');
        setProspLoading(true);
        try {
          const criteria = {
            page: page || 1,
            limit: 25
          };
          if (prospNafCode) criteria.nafLevel = prospNafCode;
          if (prospPlace && prospPlace.id) criteria.placeId = prospPlace.id;
          if (prospWithPhone) criteria.withphone = true;
          if (prospWithEmail) criteria.withemail = true;
          if (prospWithSite)  criteria.withsite  = true;
          if (prospMinStaff)  criteria.minstaff  = prospMinStaff;
          if (prospMaxStaff)  criteria.maxstaff  = prospMaxStaff;

          // Appel principal : 1 crédit
          const data = await window.SInfo.multiSearch(criteria);
          const items = data.result || [];
          setProspResults(items);
          setProspResultsTotal(data.total || items.length);
          setProspResultsPage(data.currentPage || page || 1);
          setProspResultsTotalPages(data.totalPages || 1);

          // Marquage contacts : N appels parallèles à getContacts en mode anonymized.
          // GRATUIT côté SocieteInfo. On stocke dans un Set les SIREN qui ont au
          // moins 1 contact disponible. Si l'API échoue ponctuellement pour une
          // société, on dégrade gracieusement (pas de badge mais résultat affiché).
          const sirens = items.map(c => c.registration_number).filter(Boolean);
          if (sirens.length > 0) {
            // Concurrence bornée (4) + retry/back-off sur 429 : on ne sature plus
            // l'API SocieteInfo comme le faisait l'ancien map parallèle de 25 appels.
            const contactsChecks = await mapWithConcurrency(
              sirens,
              (s) => siCallWithRetry(() => window.SInfo.getContacts(s)),
              4
            );
            const contactsSirens = new Set();
            contactsChecks.forEach((res, idx) => {
              if (res.value) {
                const r = res.value || {};
                const list = r.contacts || r.result || r.results || [];
                const count = (typeof r.contacts_count === 'number') ? r.contacts_count : (Array.isArray(list) ? list.length : 0);
                if (count > 0) contactsSirens.add(sirens[idx]);
              }
              // res.error → on ne marque pas, dégradation gracieuse
            });
            setProspWithContactsSirens(contactsSirens);
          } else {
            setProspWithContactsSirens(new Set());
          }

          // Récupérer les SIREN déjà en BDD (Interprétation A : exclusion des déjà importées)
          if (sirens.length > 0) {
            try {
              const dupRes = await fetch(`${API_URL}/prospects`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
              });
              const allProspects = await dupRes.json();
              const existing = new Set();
              for (const p of allProspects) {
                if (p.siren && sirens.includes(p.siren)) existing.add(p.siren);
                if (p.import_ref && sirens.includes(p.import_ref)) existing.add(p.import_ref);
              }
              setProspExistingSirens(existing);
            } catch (e) {
              // Si l'appel échoue, on n'affiche pas le grisé mais ce n'est pas bloquant
              setProspExistingSirens(new Set());
            }
          }

          if (items.length === 0) setProspError('Aucun résultat — essayez d\'élargir vos critères');
        } catch (err) {
          setProspError(err.message || 'Erreur recherche');
          setProspResults([]);
          setProspWithContactsSirens(new Set());
        } finally {
          setProspLoading(false);
        }
      };

      const toggleProspSelected = (siren) => {
        const next = new Set(prospSelected);
        if (next.has(siren)) next.delete(siren); else next.add(siren);
        setProspSelected(next);
      };

      const selectAllVisible = () => {
        const next = new Set(prospSelected);
        for (const c of prospResults) {
          const s = c.registration_number;
          if (s && !prospExistingSirens.has(s)) next.add(s);
        }
        setProspSelected(next);
      };

      const clearProspSelection = () => setProspSelected(new Set());

      // Import en lot - appelle la route protégée /api/prospects/bulk-import-sinfo
      const runProspectionImport = async () => {
        if (prospSelected.size === 0) {
          setProspError('Aucune société sélectionnée');
          return;
        }
        setProspImporting(true);
        setProspError('');
        try {
          const selected = prospResults.filter(c => prospSelected.has(c.registration_number));

          // ── Enrichissement téléphone + site web ──────────────────────────
          // L'endpoint liste /v2/companies.json ne renvoie NI téléphone NI site web
          // (uniquement identité + adresse). Le filtre "avec téléphone" garantit qu'un
          // numéro EXISTE chez SocieteInfo, mais pour l'obtenir il faut l'appel détail
          // /v2/company.json/{siren} (getCompany), payant 1 crédit/société.
          // On enrichit donc UNIQUEMENT les sociétés que l'on importe vraiment.
          // Séquentiel + throttle 350ms car les appels parallèles déclenchent des 429
          // (Too Many Requests) côté SocieteInfo.
          setProspEnrichProgress({ done: 0, total: selected.length });
          const companies = [];
          for (let i = 0; i < selected.length; i++) {
            const c = selected[i];
            const siren = c.registration_number;
            // Base depuis la liste : nom + adresse sont déjà fiables sans appel détail
            const entry = {
              siren,
              name:        c.name,
              city:        c.formatted_address ? (c.formatted_address.match(/\b\d{5}\s+(.+)$/) || [])[1] : null,
              postal_code: c.formatted_address ? (c.formatted_address.match(/\b(\d{5})\b/) || [])[1] : null,
              address:     c.formatted_address,
              phone:       null,
              website:     null,
              naf_code:    c.naf_code || prospNafCode || null
            };
            try {
              const det = await siCallWithRetry(() => window.SInfo.getCompany(siren));
              const mapped = window.SInfo.companyToProspect((det && det.result) || det);
              if (mapped.tel_standard) entry.phone = mapped.tel_standard;
              if (mapped.website)      entry.website = mapped.website;
              // Adresse plus précise depuis le détail si disponible
              if (mapped.adresse)      entry.address = mapped.adresse;
              if (mapped.cp)           entry.postal_code = mapped.cp;
              if (mapped.ville)        entry.city = mapped.ville;
              if (mapped.code_naf)     entry.naf_code = mapped.code_naf;
            } catch (e) {
              // Dégradation gracieuse : on importe quand même la société, juste sans téléphone
              console.warn('[Import SInfo] enrichissement échoué pour SIREN ' + siren + ' :', e.message);
            }
            companies.push(entry);
            setProspEnrichProgress({ done: i + 1, total: selected.length });
            // Throttle anti-429 entre deux appels (pas après le dernier)
            if (i < selected.length - 1) await new Promise(r => setTimeout(r, 350));
          }
          setProspEnrichProgress(null);

          const res = await fetch(`${API_URL}/prospects/bulk-import-sinfo`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ companies })
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Erreur import');
          setProspImportResult(result);
          if (window.showToast) {
            window.showToast({
              title: `${result.inserted_count} société(s) importée(s)` +
                     (result.skipped_count > 0 ? ` · ${result.skipped_count} déjà connue(s)` : ''),
              type: 'success'
            });
          }
          // Rafraîchir la liste des prospects en mémoire pour que les nouveaux Suspects
          // apparaissent immédiatement dans Attribution sans nécessiter un F5
          if (result.inserted_count > 0 && typeof onRefreshProspects === 'function') {
            onRefreshProspects();
          }
        } catch (err) {
          setProspError(err.message || 'Erreur import');
        } finally {
          setProspImporting(false);
          setProspEnrichProgress(null);
        }
      };
      const thisYear = new Date().getFullYear();
      const today = new Date(); today.setHours(0,0,0,0);

      // ── Stats globales ──
      const nbSuspects  = prospects.filter(p => p.statut_societe === 'Suspect').length;
      const nbProspects = prospects.filter(p => p.statut_societe === 'Prospect').length;
      const nbClients   = prospects.filter(p => p.statut_societe === 'Client').length;
      const devisEnCours = prospects.filter(p => p.real_status && ['En cours','Envoyé','Discussion','Négociation'].includes(p.real_status)).length;
      const devisGagnes  = prospects.filter(p => p.real_status === 'Gagné').length;
      const devisPerdus  = prospects.filter(p => p.real_status === 'Perdu').length;

      const pipeline = prospects.filter(p => p.real_status && ['En cours','Envoyé','Discussion','Négociation'].includes(p.real_status));
      const pipelineAll = prospects.filter(p => p.real_status && ['En cours','Envoyé','Discussion','Négociation','Gagné'].includes(p.real_status));
      const gagnes = prospects.filter(p => p.real_status === 'Gagné');

      const aboMensuelBrut = pipeline.reduce((s,p) => s + (parseFloat(p.real_monthly_amount||p.monthly_amount)||0), 0);
      const aboMensuelPondere = pipeline.reduce((s,p) => s + (parseFloat(p.real_monthly_amount||p.monthly_amount)||0) * ((p.real_probability||0)/100), 0);
      const setupBrut = pipeline.reduce((s,p) => s + (parseFloat(p.real_setup_amount||p.setup_amount)||0), 0);
      const setupPondere = pipeline.reduce((s,p) => s + (parseFloat(p.real_setup_amount||p.setup_amount)||0) * ((p.real_probability||0)/100), 0);
      const aboGagnesMensuel = gagnes.reduce((s,p) => s + (parseFloat(p.real_monthly_amount||p.monthly_amount)||0), 0);
      const aboGagnesAnnuel  = gagnes.reduce((s,p) => s + (parseFloat(p.real_annual_amount||p.annual_amount)||0), 0);
      const setupGagnes      = gagnes.reduce((s,p) => s + (parseFloat(p.real_setup_amount||p.setup_amount)||0), 0);

      const fmt = (n) => n.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2});

      // ── Commerciaux ──
      if (activeTab === null && commerciaux.length > 0) setActiveTab(commerciaux[0]);

      const getCommercialData = (name) => {
        const mine = prospects.filter(p => p.assigned_to === name);
        const myPipeline = mine.filter(p => p.real_status && ['En cours','Envoyé','Discussion','Négociation'].includes(p.real_status));
        const myActions = Object.entries(prospectActionsInfo)
          .filter(([id]) => mine.some(p => String(p.id) === String(id)));
        const actives = myActions.filter(([,a]) => a.hasAction).length;
        const retard  = myActions.filter(([,a]) => a.isLate).length;
        const encours    = mine.filter(p => p.real_status === 'En cours').length;
        const envoye     = mine.filter(p => p.real_status === 'Envoyé').length;
        const discussion = mine.filter(p => p.real_status === 'Discussion').length;
        const negocie    = mine.filter(p => p.real_status === 'Négociation').length;
        const gagne      = mine.filter(p => p.real_status === 'Gagné').length;
        const perdu      = mine.filter(p => p.real_status === 'Perdu').length;
        return {
          societes: mine.length,
          devisCount: myPipeline.length,
          signes: gagne,
          aboMensuel: myPipeline.reduce((s,p) => s+(parseFloat(p.real_monthly_amount||p.monthly_amount)||0),0),
          aboAnnuel:  myPipeline.reduce((s,p) => s+(parseFloat(p.real_annual_amount||p.annual_amount)||0),0),
          actives, retard,
          prosp: mine.filter(p => !p.real_status).length,
          encours, envoye, discussion, negocie, gagne, perdu,
          devisTotal: encours+envoye+discussion+negocie,
        };
      };

      // ── Par probabilité ──
      const probRanges = [
        {label:'80–100%', min:80, max:100, color:'var(--success)'},
        {label:'60–80%',  min:60, max:79,  color:'var(--primary)'},
        {label:'40–60%',  min:40, max:59,  color:'var(--warning)'},
        {label:'20–40%',  min:20, max:39,  color:'var(--danger)'},
        {label:'0–20%',   min:0,  max:19,  color:'#bbb'},
      ];

      // ── Ancienneté devis ──
      const ageRanges = [
        {label:'< 1 mois',  max:30,  color:'var(--success)', status:'Frais'},
        {label:'1–2 mois',  min:30,  max:60,  color:'var(--primary)', status:'OK'},
        {label:'2–3 mois',  min:60,  max:90,  color:'var(--warning)', status:'⚠ Vieux'},
        {label:'> 3 mois',  min:90,  color:'var(--danger)', status:'🚨 Urgent'},
      ];
      const ageCount = (range) => pipeline.filter(p => {
        if (!p.real_quote_date) return false;
        const days = (today - new Date(p.real_quote_date)) / 86400000;
        const ok_min = range.min === undefined || days >= range.min;
        const ok_max = range.max === undefined || days < range.max;
        return ok_min && ok_max;
      }).length;

      const chip = (label, val, color) => (
        <span key={label} className="tw-chip" style={{color: val>0 ? color : 'var(--tw-muted)', opacity: val>0?1:.4}}>
          {label} {val}
        </span>
      );

      const recapLabels = { actions: '⚠️ Actions & Devis', pipeline: '📊 Vue Pipeline' };

      return (
        <div className="tw-content">

          {/* ── MODALE CONFIRMATION RECAP ── */}
          {recapConfirm && (
            <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
              <div style={{background:'white',borderRadius:'12px',padding:'28px 32px',maxWidth:'420px',width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
                <div style={{fontSize:'16px',fontWeight:'700',color:'var(--tw-ink)',marginBottom:'20px'}}>📧 Confirmer l'envoi</div>
                <div style={{background:'var(--tw-bg)',borderRadius:'8px',padding:'14px 16px',marginBottom:'20px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px'}}>
                    <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px'}}>Rapport</span>
                    <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-ink)'}}>{recapLabels[recapType]}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px'}}>
                    <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px'}}>Pour</span>
                    <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-ink)'}}>{recapTarget}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',paddingTop:'8px',borderTop:'1px solid var(--tw-border)'}}>
                    <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px'}}>Destinataire (test)</span>
                    <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-teal)'}}>Votre adresse email</span>
                  </div>
                </div>
                <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
                  <button onClick={() => setRecapConfirm(false)}
                    style={{padding:'8px 18px',background:'white',color:'var(--tw-slate)',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontWeight:'500',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                    Annuler
                  </button>
                  <button onClick={doSendTestRecap}
                    style={{padding:'8px 18px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'13px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>
                    📤 Envoyer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── PANNEAU PROSPECTION SocieteInfo (Dashboard est déjà admin-only) ── */}
          <div style={{marginBottom:'18px',background:'white',border:'1px solid var(--tw-border)',borderRadius:'10px',boxShadow:'var(--sh-sm)',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}}
            onClick={openProspectionModal}
            onMouseEnter={e=>e.currentTarget.style.background='var(--tw-teal-light)'}
            onMouseLeave={e=>e.currentTarget.style.background='white'}>
            <div>
              <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-teal)'}}>🎯 Recherche SocieteInfo</span>
              <span style={{fontSize:'11px',color:'var(--tw-muted)',marginLeft:'10px'}}>Recherche multi-critères (NAF + zone) → Suspects à attribuer</span>
            </div>
            <span style={{fontSize:'12px',color:'var(--tw-teal)',fontWeight:'600'}}>Lancer →</span>
          </div>

          {/* ── PANNEAU RECAP TEST (Christian uniquement) ── */}
          {user.name === 'Christian' && (
            <div style={{marginBottom:'18px',background:'white',border:'1px solid var(--tw-border)',borderRadius:'10px',boxShadow:'var(--sh-sm)',overflow:'hidden'}}>
              <div onClick={() => setRecapOpen(o => !o)}
                style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',userSelect:'none'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--tw-teal-light)'}
                onMouseLeave={e=>e.currentTarget.style.background='white'}
              >
                <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-teal)'}}>📧 Test récap email</span>
                <span style={{fontSize:'12px',color:'var(--tw-muted)'}}>{recapOpen ? '▲ Fermer' : '▼ Ouvrir'}</span>
              </div>
              {recapOpen && <div style={{padding:'0 16px 16px',borderTop:'1px solid var(--tw-border)'}}>
              <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'flex-end',marginTop:'14px'}}>

                {/* Destinataire */}
                <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                  <label style={{fontSize:'11px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:'600'}}>Destinataire</label>
                  <select value={recapTarget} onChange={e=>setRecapTarget(e.target.value)}
                    style={{padding:'6px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",color:'var(--tw-ink)',background:'white',cursor:'pointer'}}>
                    {['Moi (Christian)', ...commerciaux.map(n => n)].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                {/* Type de récap */}
                <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'300px'}}>
                  <label style={{fontSize:'11px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:'600'}}>Type de récap</label>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    {[
                      {id:'actions', label:'⚠️ Actions & Devis', desc:'En retard + à venir + sans action'},
                      {id:'pipeline', label:'📊 Vue pipeline', desc:'Vue globale du pipeline'},
                    ].map(t => (
                      <div key={t.id} onClick={() => setRecapType(t.id)}
                        style={{padding:'6px 12px',borderRadius:'6px',border:`2px solid ${recapType===t.id?'var(--tw-teal)':'var(--tw-border)'}`,background:recapType===t.id?'var(--tw-teal-light)':'white',cursor:'pointer',transition:'all .15s'}}>
                        <div style={{fontSize:'12px',fontWeight:'600',color:recapType===t.id?'var(--tw-teal)':'var(--tw-ink)'}}>{t.label}</div>
                        <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'2px'}}>{t.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bouton + résultat */}
                <div style={{display:'flex',flexDirection:'column',gap:'6px',alignItems:'flex-end'}}>
                  <button onClick={sendTestRecap} disabled={recapSending}
                    style={{padding:'8px 18px',background:recapSending?'#ccc':'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'13px',fontWeight:'600',cursor:recapSending?'default':'pointer',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap'}}>
                    {recapSending ? '⏳ Envoi...' : '📤 Envoyer le test'}
                  </button>
                  {recapResult && (
                    <span style={{fontSize:'12px',fontWeight:'500',color:recapResult.ok?'var(--tw-green)':'var(--tw-red)'}}>{recapResult.msg}</span>
                  )}
                </div>

              </div>
              </div>}
            </div>
          )}

          {/* ── PANNEAU IMPORT EXCEL (Christian uniquement) ── */}
          {user.name === 'Christian' && (
            <ImportPanel API_URL={API_URL} token={localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).token : ''} />
          )}

          {/* ── KPI STRIP ── */}
          <div className="tw-section-title">Vue globale pipeline</div>
          <div className="tw-kpi-strip">

            {/* Carte 1 : Sociétés — clic = ouvre la liste Sociétés */}
            <div className="tw-kpi-card" onClick={() => onOpenListe && onOpenListe('societes')} style={{cursor: onOpenListe ? 'pointer' : 'default'}} title="Voir la liste des sociétés">
              <div className="tw-kpi-label">Sociétés en base</div>
              <div className="tw-kpi-value" style={{color:'var(--tw-teal)'}}>{prospects.length}</div>
              <div className="tw-kpi-sub"><b>{nbSuspects}</b> suspects · <b>{nbProspects}</b> prospects · <b>{nbClients}</b> clients</div>
            </div>

            {/* Carte 2 : Devis — clic = ouvre la liste Devis en cours */}
            <div className="tw-kpi-card" onClick={() => onOpenListe && onOpenListe('devis')} style={{cursor: onOpenListe ? 'pointer' : 'default'}} title="Voir la liste des devis en cours">
              <div className="tw-kpi-label">Devis en cours {thisYear}</div>
              <div className="tw-kpi-value">{devisEnCours}</div>
              <div className="tw-kpi-sub"><b>{devisGagnes}</b> gagné{devisGagnes>1?'s':''} · <b style={{color:'var(--tw-red)'}}>{devisPerdus}</b> perdu{devisPerdus>1?'s':''}</div>
            </div>

            {/* Potentiel devis en cours */}
            <div className="tw-kpi-card">
              <div className="tw-kpi-label">Potentiel devis en cours</div>
              <div className="tw-kpi-duo">
                <div>
                  <div className="tw-duo-lbl">Abo</div>
                  <div className="tw-duo-val" style={{color:'var(--tw-teal)'}}>{fmt(aboMensuelBrut)} €<span style={{fontSize:'11px',color:'var(--tw-slate)',fontWeight:'400'}}>/mois</span></div>
                  <div className="tw-duo-sub">Pondéré <b style={{color:'var(--tw-teal)'}}>{fmt(aboMensuelPondere)} €</b></div>
                </div>
                <div className="tw-kpi-duo-sep"></div>
                <div>
                  <div className="tw-duo-lbl">Setup</div>
                  <div className="tw-duo-val">{fmt(setupBrut)} €</div>
                  <div className="tw-duo-sub">Pondéré <b>{fmt(setupPondere)} €</b></div>
                </div>
              </div>
            </div>

            {/* Signé depuis janvier */}
            <div className="tw-kpi-card">
              <div className="tw-kpi-label">Signé depuis janvier {thisYear}</div>
              <div className="tw-kpi-duo">
                <div>
                  <div className="tw-duo-lbl">Abo</div>
                  <div className="tw-duo-val" style={{color:'var(--tw-green)'}}>{fmt(aboGagnesMensuel)} €<span style={{fontSize:'11px',color:'var(--tw-slate)',fontWeight:'400'}}>/mois</span></div>
                  <div className="tw-duo-sub">+ <b style={{color:'var(--tw-green)'}}>{fmt(aboGagnesAnnuel)} €</b>/an</div>
                </div>
                <div className="tw-kpi-duo-sep"></div>
                <div>
                  <div className="tw-duo-lbl">Setup</div>
                  <div className="tw-duo-val" style={{color:'var(--tw-green)'}}>{fmt(setupGagnes)} €</div>
                  <div className="tw-duo-sub">{gagnes.length} affaire{gagnes.length>1?'s':''} signée{gagnes.length>1?'s':''}</div>
                </div>
              </div>
            </div>

            {/* Nouvelles sociétés */}
            <div className="tw-kpi-card">
              <div className="tw-kpi-label">Nouvelles sociétés</div>
              {(() => {
                const now = new Date();
                const sw = new Date(now); sw.setDate(now.getDate()-now.getDay()); sw.setHours(0,0,0,0);
                const sm = new Date(now.getFullYear(), now.getMonth(), 1);
                const newSem  = prospects.filter(p => p.created_at && new Date(p.created_at) >= sw);
                const newMois = prospects.filter(p => p.created_at && new Date(p.created_at) >= sm);
                const rows = [
                  {label:'Suspects',  color:'#999',            sem: newSem.filter(p=>p.statut_societe==='Suspect').length,  mois: newMois.filter(p=>p.statut_societe==='Suspect').length},
                  {label:'Prospects', color:'var(--tw-teal)',  sem: newSem.filter(p=>p.statut_societe==='Prospect').length, mois: newMois.filter(p=>p.statut_societe==='Prospect').length},
                  {label:'Clients',   color:'var(--tw-green)', sem: newSem.filter(p=>p.statut_societe==='Client').length,   mois: newMois.filter(p=>p.statut_societe==='Client').length},
                ];
                return (
                  <div style={{marginTop:'10px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'8px',paddingBottom:'6px',borderBottom:'1px solid var(--tw-border)'}}>
                      <span>Type</span>
                      <div style={{display:'flex',gap:'16px'}}><span>Sem.</span><span>Mois</span></div>
                    </div>
                    {rows.map(r => (
                      <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'7px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                          <div style={{width:'7px',height:'7px',borderRadius:'50%',background:r.color,flexShrink:0}}></div>
                          <span style={{fontSize:'13px',color:'var(--tw-slate)'}}>{r.label}</span>
                        </div>
                        <div style={{display:'flex',gap:'16px'}}>
                          <span style={{fontSize:'14px',fontWeight:'700',color:'var(--tw-ink)',fontVariantNumeric:'tabular-nums',minWidth:'20px',textAlign:'center'}}>{r.sem}</span>
                          <span style={{fontSize:'14px',fontWeight:'700',color:r.color,fontVariantNumeric:'tabular-nums',minWidth:'20px',textAlign:'center'}}>{r.mois}</span>
                        </div>
                      </div>
                    ))}
                    <div style={{borderTop:'1px solid var(--tw-border)',marginTop:'8px',paddingTop:'8px',display:'flex',justifyContent:'space-between'}}>
                      <span style={{fontSize:'12px',color:'var(--tw-muted)',fontWeight:'600'}}>Total</span>
                      <div style={{display:'flex',gap:'16px'}}>
                        <span style={{fontSize:'14px',fontWeight:'700',color:'var(--tw-ink)',minWidth:'20px',textAlign:'center'}}>{newSem.length}</span>
                        <span style={{fontSize:'14px',fontWeight:'700',color:'var(--tw-teal)',minWidth:'20px',textAlign:'center'}}>{newMois.length}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>

          {/* ── ONGLETS COMMERCIAUX ── */}
          <div className="tw-section-title">Par commercial</div>
          <div className="tw-tab-wrap">
            <div className="tw-tabs">
              {commerciaux.map(name => {
                const d = getCommercialData(name);
                return (
                  <button
                    key={name}
                    className={`tw-tab ${activeTab===name?'tw-tab-active':''}`}
                    onClick={() => { setActiveTab(name); setShowSocietes(false); }}
                  >
                    {name.split(' ')[0]}
                    {d.retard > 0 && <span className="tw-tab-badge">{d.retard}</span>}
                  </button>
                );
              })}
            </div>
            <div className="tw-tab-body">
              {activeTab && (() => {
                const d = getCommercialData(activeTab);
                const initials = activeTab.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
                return (
                  <div>
                    {/* Header commercial */}
                    <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
                      <div className="tw-avatar" style={{width:'40px',height:'40px',fontSize:'14px',background:'var(--tw-teal)'}}>{initials}</div>
                      <div>
                        <div style={{fontSize:'15px',fontWeight:'600',color:'var(--tw-ink)'}}>{activeTab}</div>
                        <div style={{fontSize:'12px',color:'var(--tw-muted)'}}>{d.societes} société{d.societes>1?'s':''} · {d.devisTotal} devis en cours</div>
                      </div>
                    </div>
                    {/* Stats 5 colonnes */}
                    <div className="tw-cs-grid">
                      {[
                        // Les 3 premières cases (Sociétés/Devis/Signés) sont cliquables : elles appliquent
                        // le filtre Commercial + Statut adéquat puis ouvrent la vue Suivi activités.
                        // filterStatusValue : [] = Tous, ou tableau de statuts pour multi-select.
                        {lbl:'Sociétés',  val:d.societes,   color:'var(--tw-teal)',  filterStatusValue: []},
                        {lbl:'Devis',     val:d.devisCount, color:'var(--tw-blue)',  filterStatusValue: ['En cours', 'Envoyé', 'Discussion', 'Négociation']},
                        {lbl:'Signés',    val:d.signes,     color:d.signes>0?'var(--tw-green)':'var(--tw-muted)', filterStatusValue: ['Gagné']},
                        {lbl:'Abo/mois',  val:fmt(d.aboMensuel)+' €', color:'var(--tw-ink)', noClick:true},
                        {lbl:'Abo/an',    val:fmt(d.aboAnnuel)+' €',  color:'var(--tw-ink)', noClick:true},
                      ].map(item => (
                        <div
                          key={item.lbl}
                          className="tw-cs-item"
                          style={{cursor: item.noClick?'default':'pointer'}}
                          onClick={() => {
                            if (item.noClick) return;
                            // Appliquer les filtres avant de naviguer
                            if (setFilterCommercial) setFilterCommercial(activeTab);
                            if (setFilterStatus) setFilterStatus(item.filterStatusValue);
                            // Reset filtre attribution (sinon ça peut court-circuiter le filtre commercial)
                            if (setFilterAttribution) setFilterAttribution('Toutes');
                            onOpenDashboard();
                          }}
                        >
                          <div className="tw-cs-val" style={{color:item.color, fontSize: item.lbl.includes('Abo') ? '14px' : '22px'}}>{item.val}</div>
                          <div className="tw-cs-lbl">{item.lbl}</div>
                        </div>
                      ))}
                    </div>
                    {/* Ligne actions + répartition côte à côte */}
                    <div className="tw-row-line">
                      <div className="tw-row-box">
                        <span className="tw-row-lbl">Actions planifiées</span>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span className="tw-pill-green">{d.actives} actives</span>
                          {d.retard > 0 && <>
                            <span style={{fontSize:'11px',color:'var(--tw-muted)'}}>dont</span>
                            <span style={{color:'var(--tw-red)',fontWeight:'600',fontSize:'12px'}}>{d.retard} en retard</span>
                          </>}
                        </div>
                      </div>
                      <div className="tw-row-box" style={{flex:2}}>
                        <span className="tw-row-lbl">Répartition</span>
                        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                          <span style={{fontSize:'12px',color:'var(--tw-muted)',whiteSpace:'nowrap'}}>{d.prosp} prosp · 🪙 {d.devisTotal} devis</span>
                          <div className="tw-chips">
                            {chip('En cours',   d.encours,    'var(--tw-teal)')}
                            {chip('Envoyé',     d.envoye,     'var(--warning)')}
                            {chip('Discussion', d.discussion, 'var(--tw-blue)')}
                            {chip('Gagné',      d.gagne,      'var(--tw-green)')}
                            {chip('Perdu',      d.perdu,      'var(--tw-red)')}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Lien voir sociétés */}
                    <div style={{textAlign:'right',marginTop:'6px'}}>
                      <a href="#" style={{fontSize:'12px',color:'var(--tw-teal)',fontWeight:'500',textDecoration:'none'}}
                        onClick={(e) => { e.preventDefault(); setShowSocietes(s => !s); }}
                      >{showSocietes ? 'Masquer ▲' : `Voir toutes les sociétés de ${activeTab} ▼`}</a>
                    </div>

                    {/* Liste des sociétés dépliable */}
                    {showSocietes && (() => {
                      const mine = prospects.filter(p => p.assigned_to === activeTab);
                      const today2 = new Date(); today2.setHours(0,0,0,0);
                      return (
                        <div style={{marginTop:'14px',borderTop:'1px solid var(--tw-border)',paddingTop:'14px'}}>
                          {/* Barre de filtre par type pour cette liste de sociétés */}
                          <div style={{display:'flex',gap:'6px',marginBottom:'10px',alignItems:'center',flexWrap:'wrap'}}>
                            <span style={{fontSize:'11px',color:'var(--tw-muted)',marginRight:'4px',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:'600'}}>Type :</span>
                            {[
                              {key:'all',      label:'Tous'},
                              {key:'Suspect',  label:'Suspect'},
                              {key:'Prospect', label:'Prospect'},
                              {key:'Client',   label:'Client'},
                            ].map(t => {
                              const active = societesTypeFilter === t.key;
                              const count = t.key === 'all' ? mine.length : mine.filter(p => p.statut_societe === t.key).length;
                              return (
                                <button key={t.key} onClick={() => setSocietesTypeFilter(t.key)}
                                  style={{
                                    padding:'4px 11px',
                                    background: active ? 'var(--tw-ink)' : 'white',
                                    color: active ? 'white' : 'var(--tw-slate)',
                                    border:'0.5px solid ' + (active ? 'var(--tw-ink)' : 'var(--tw-border)'),
                                    borderRadius:'14px',fontSize:'12px',cursor:'pointer',
                                    fontFamily:"'Inter',sans-serif",
                                    transition:'all .15s'
                                  }}>
                                  {t.label} <span style={{opacity:0.6,marginLeft:'3px'}}>({count})</span>
                                </button>
                              );
                            })}
                          </div>
                          {/* Header triable */}
                          <div style={{display:'grid',gridTemplateColumns:'1.8fr 0.9fr 1.1fr 0.7fr 1.5fr 0.8fr',padding:'7px 10px',background:'var(--tw-bg)',borderRadius:'6px 6px 0 0',fontSize:'11px',fontWeight:'600',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px'}}>
                            {[
                              {lbl:'Société', col:'name'},
                              {lbl:'Type',    col:'type'},
                              {lbl:'Statut',  col:'status'},
                              {lbl:'Proba',   col:'proba'},
                              {lbl:'Prochaine action', col:'action'},
                            ].map(h => (
                              <div key={h.col}
                                onClick={() => { if(societesSortCol===h.col) setSocietesSortAsc(a=>!a); else {setSocietesSortCol(h.col);setSocietesSortAsc(true);} }}
                                style={{cursor:'pointer',userSelect:'none',display:'flex',alignItems:'center',gap:'3px'}}
                                onMouseEnter={e=>e.currentTarget.style.color='var(--tw-teal)'}
                                onMouseLeave={e=>e.currentTarget.style.color='var(--tw-muted)'}
                              >
                                {h.lbl}
                                <span style={{fontSize:'10px',opacity:societesSortCol===h.col?1:0.35}}>{societesSortCol===h.col?(societesSortAsc?'↑':'↓'):'↕'}</span>
                              </div>
                            ))}
                            <div></div>
                          </div>
                          {[...mine]
                            .filter(p => societesTypeFilter === 'all' || p.statut_societe === societesTypeFilter)
                            .sort((a,b) => {
                            if(societesSortCol==='name')   { const r=a.name.localeCompare(b.name); return societesSortAsc?r:-r; }
                            if(societesSortCol==='type')   { const r=(a.statut_societe||'').localeCompare(b.statut_societe||''); return societesSortAsc?r:-r; }
                            if(societesSortCol==='status') { const r=(a.real_status||'').localeCompare(b.real_status||''); return societesSortAsc?r:-r; }
                            if(societesSortCol==='proba')  { const r=(a.real_probability||0)-(b.real_probability||0); return societesSortAsc?r:-r; }
                            if(societesSortCol==='action') {
                              const da = prospectActionsInfo[a.id]?.nextActionDate ? new Date(prospectActionsInfo[a.id].nextActionDate).getTime() : Infinity;
                              const db = prospectActionsInfo[b.id]?.nextActionDate ? new Date(prospectActionsInfo[b.id].nextActionDate).getTime() : Infinity;
                              return societesSortAsc?da-db:db-da;
                            }
                            return 0;
                          }).map(p => {
                            const ai = prospectActionsInfo[p.id];
                            const isLate = ai?.isLate;
                            const actionDate = ai?.nextActionDate ? new Date(ai.nextActionDate) : null;
                            const dateStr = actionDate ? actionDate.toLocaleDateString('fr-FR') : null;
                            const statusColors = {'Gagné':'var(--tw-green)','Perdu':'var(--tw-red)','Discussion':'var(--tw-blue)','Envoyé':'var(--warning)','Négociation':'#9b59b6'};
                            const statusBgs = {'Gagné':'#e8f8f0','Perdu':'#fdecea','Discussion':'#e8f4fd','Envoyé':'#fff8e1','Négociation':'#f5eef8'};
                            const sColor = statusColors[p.real_status] || 'var(--tw-muted)';
                            const sBg = statusBgs[p.real_status] || '#f5f5f5';
                            return (
                              <div key={p.id}
                                style={{display:'grid',gridTemplateColumns:'1.8fr 0.9fr 1.1fr 0.7fr 1.5fr 0.8fr',padding:'9px 10px',borderBottom:'1px solid #f5f5f5',alignItems:'center',fontSize:'13px',cursor:'pointer',transition:'background .12s',background:'white'}}
                                onMouseEnter={e=>e.currentTarget.style.background='var(--tw-teal-light)'}
                                onMouseLeave={e=>e.currentTarget.style.background='white'}
                                onClick={() => { onSelectProspect(p); }}
                              >
                                <div>
                                  <div style={{fontWeight:'600',fontSize:'13px',color:'var(--tw-ink)'}}>{prospectDisplayName(p)}</div>
                                  <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'1px'}}>{p.contact_name||'—'}</div>
                                </div>
                                <div>{typeChip(p.statut_societe)}</div>
                                <div><span style={{fontSize:'11px',fontWeight:'600',padding:'2px 8px',borderRadius:'10px',color:sColor,background:sBg}}>{p.real_status||'Prospection'}</span></div>
                                <div style={{fontSize:'13px',fontWeight:'700',color:sColor}}>{p.real_probability||0}%</div>
                                <div style={{fontSize:'12px'}}>
                                  {ai?.hasAction ? (
                                    <span style={{color:isLate?'var(--tw-red)':'var(--tw-slate)',fontWeight:isLate?'600':'400'}}>
                                      ⚡ {ai.nextActionType} · {dateStr}{isLate?' ⚠️':''}
                                    </span>
                                  ) : (
                                    <span style={{color:'var(--tw-muted)',fontStyle:'italic'}}>Aucune action</span>
                                  )}
                                </div>
                                <div>
                                  <button style={{padding:'3px 10px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'11px',fontWeight:'500',cursor:'pointer'}}
                                    onClick={e=>{e.stopPropagation();onSelectProspect(p);}}>
                                    Ouvrir →
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── PAR PROBABILITÉ ── */}
          <div className="tw-card" style={{marginBottom:'24px'}}>
            <div className="tw-card-title">📈 Par probabilité</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px'}}>
              {probRanges.map(r => {
                const inRange = pipelineAll.filter(p => (p.real_probability||0) >= r.min && (p.real_probability||0) <= r.max);
                const mVal = inRange.reduce((s,p) => s+(parseFloat(p.real_monthly_amount||p.monthly_amount)||0),0);
                const pct = pipelineAll.length > 0 ? (inRange.length/pipelineAll.length)*100 : 0;
                return (
                  <div key={r.label} style={{background:'var(--tw-bg)',borderRadius:'8px',padding:'12px'}}>
                    <div style={{fontWeight:'700',color:r.color,fontSize:'13px',marginBottom:'4px'}}>{r.label}</div>
                    <div style={{fontSize:'20px',fontWeight:'700',color:r.color,fontVariantNumeric:'tabular-nums'}}>{inRange.length}</div>
                    <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'3px'}}>{fmt(mVal)} €/m</div>
                    <div style={{marginTop:'8px',height:'4px',background:'#e0e0e0',borderRadius:'2px',overflow:'hidden'}}>
                      <div style={{width:`${pct}%`,height:'100%',background:r.color,borderRadius:'2px'}}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ MODAL PROSPECTION MULTI-CRITÈRES SocieteInfo ═══ */}
          {showProspectionModal && (
            <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}
              onClick={(e) => { if (e.target === e.currentTarget) setShowProspectionModal(false); }}>
              <div style={{background:'white',borderRadius:'12px',width:'90%',maxWidth:'900px',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
                {/* Header */}
                <div style={{padding:'16px 24px',borderBottom:'1px solid var(--tw-border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <h2 style={{margin:0,fontFamily:'Inter, sans-serif',color:'var(--text)',fontSize:'1.05rem',fontWeight:600,display:'flex',alignItems:'center',gap:'8px'}}>
                    🎯 Recherche SocieteInfo
                    <span style={{fontSize:'11px',color:'var(--meta)',fontWeight:400}}>· Étape {prospStep}/4</span>
                  </h2>
                  <button onClick={() => setShowProspectionModal(false)}
                    style={{background:'var(--bg)',border:'none',width:'30px',height:'30px',borderRadius:'7px',cursor:'pointer',fontSize:'1rem',color:'var(--text-2)'}}>✕</button>
                </div>

                {/* Body scrollable */}
                <div style={{flex:1,overflow:'auto',padding:'20px 24px'}}>

                  {/* ── ÉTAPE 1 : Code NAF ── */}
                  {prospStep === 1 && (
                    <div>
                      <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px',color:'var(--text)'}}>Secteur d'activité (code NAF)</div>
                      <div style={{fontSize:'12px',color:'var(--text-2)',marginBottom:'12px'}}>
                        Choisissez un code NAF (optionnel — vous pouvez aussi rechercher uniquement par zone). Tapez un mot-clé pour filtrer.
                      </div>
                      <input type="text" placeholder="Ex: habillement, restauration, conseil..."
                        value={prospNafSearch}
                        onChange={(e) => setProspNafSearch(e.target.value)}
                        style={{width:'100%',padding:'10px 14px',fontSize:'14px',border:'0.5px solid #cde0e0',borderRadius:'8px',outline:'none',marginBottom:'12px',fontFamily:"'Inter',sans-serif"}} />
                      <div style={{maxHeight:'320px',overflow:'auto',border:'0.5px solid #e0e8e8',borderRadius:'8px'}}>
                        {(() => {
                          const Q = prospNafSearch.trim().toLowerCase();
                          const codesList = (typeof codesNaf !== 'undefined' && Array.isArray(codesNaf)) ? codesNaf : [];
                          let filtered = codesList;
                          if (Q.length >= 2) {
                            filtered = codesList.filter(n =>
                              (n.libelle || '').toLowerCase().includes(Q) ||
                              (n.code || '').toLowerCase().includes(Q)
                            ).slice(0, 100);
                          } else {
                            filtered = codesList.slice(0, 50);
                          }
                          if (filtered.length === 0) return <div style={{padding:'20px',textAlign:'center',color:'var(--meta)',fontSize:'13px'}}>Aucun code NAF trouvé</div>;
                          return filtered.map(n => (
                            <div key={n.code}
                              onClick={() => { setProspNafCode(n.code); setProspNafLibelle(n.libelle); }}
                              style={{padding:'8px 12px',borderBottom:'0.5px solid #f0f4f4',cursor:'pointer',display:'flex',gap:'10px',alignItems:'center',background:prospNafCode===n.code?'#e0f2f1':'white'}}
                              onMouseEnter={e=>{if(prospNafCode!==n.code) e.currentTarget.style.background='var(--bg)'}}
                              onMouseLeave={e=>{if(prospNafCode!==n.code) e.currentTarget.style.background='white'}}>
                              <span style={{fontSize:'12px',fontWeight:600,color:'var(--text)',minWidth:'50px'}}>{n.code}</span>
                              <span style={{fontSize:'12px',color:'#4a6868'}}>{n.libelle}</span>
                            </div>
                          ));
                        })()}
                      </div>
                      {prospNafCode && (
                        <div style={{marginTop:'12px',padding:'10px',background:'#dcfce7',borderRadius:'7px',fontSize:'13px',color:'#166534'}}>
                          ✓ Sélectionné : <strong>{prospNafCode}</strong> — {prospNafLibelle}
                          <button onClick={() => { setProspNafCode(''); setProspNafLibelle(''); }}
                            style={{marginLeft:'10px',padding:'2px 8px',background:'white',border:'0.5px solid #cde0e0',borderRadius:'5px',fontSize:'11px',cursor:'pointer'}}>Effacer</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── ÉTAPE 2 : Zone géographique ── */}
                  {prospStep === 2 && (
                    <div>
                      <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px',color:'var(--text)'}}>Zone géographique</div>
                      <div style={{fontSize:'12px',color:'var(--text-2)',marginBottom:'12px'}}>
                        Tapez le nom d'une ville, département ou région. <em>(Cette étape ne consomme aucun crédit.)</em>
                      </div>
                      <input type="text" placeholder="Ex: Bretagne, Paris, Bordeaux..."
                        value={prospPlaceSearch}
                        onChange={(e) => setProspPlaceSearch(e.target.value)}
                        autoFocus
                        style={{width:'100%',padding:'10px 14px',fontSize:'14px',border:'0.5px solid #cde0e0',borderRadius:'8px',outline:'none',marginBottom:'12px',fontFamily:"'Inter',sans-serif"}} />
                      {prospPlaceSuggestions.length > 0 && (
                        <div style={{maxHeight:'280px',overflow:'auto',border:'0.5px solid #e0e8e8',borderRadius:'8px'}}>
                          {prospPlaceSuggestions.map(p => {
                            // Traduit le type technique SocieteInfo en libellé français lisible
                            const typeLabel = (() => {
                              switch (p.type) {
                                case 'administrative_area_level_1': return 'région';
                                case 'administrative_area_level_2': return 'département';
                                case 'locality': return 'ville';
                                case 'postal_code': return 'code postal';
                                case 'route': return 'rue';
                                default: return p.type || '';
                              }
                            })();
                            // Affiche "Paris" en gros + "Île-de-France" en petit pour distinguer les homonymes
                            return (
                              <div key={p.id}
                                onClick={() => { setProspPlace(p); setProspPlaceSearch(p.name); setProspPlaceSuggestions([]); }}
                                style={{padding:'10px 14px',borderBottom:'0.5px solid #f0f4f4',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                                onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                                onMouseLeave={e=>e.currentTarget.style.background='white'}>
                                <div>
                                  <div style={{fontSize:'13px',color:'var(--text)',fontWeight:500}}>{p.name}</div>
                                  {p.formatted_name && p.formatted_name !== p.name && (
                                    <div style={{fontSize:'11px',color:'var(--meta)',marginTop:'2px'}}>{p.formatted_name}</div>
                                  )}
                                </div>
                                <span style={{fontSize:'11px',color:'var(--meta)',fontStyle:'italic',marginLeft:'10px'}}>{typeLabel}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {prospPlace && (
                        <div style={{marginTop:'12px',padding:'10px',background:'#dcfce7',borderRadius:'7px',fontSize:'13px',color:'#166534'}}>
                          ✓ Sélectionné : <strong>{prospPlace.formatted_name || prospPlace.name}</strong>
                          <button onClick={() => { setProspPlace(null); setProspPlaceSearch(''); }}
                            style={{marginLeft:'10px',padding:'2px 8px',background:'white',border:'0.5px solid #cde0e0',borderRadius:'5px',fontSize:'11px',cursor:'pointer'}}>Effacer</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── ÉTAPE 3 : Filtres + estimation crédits ── */}
                  {prospStep === 3 && (
                    <div>
                      <div style={{fontSize:'14px',fontWeight:600,marginBottom:'8px',color:'var(--text)'}}>Filtres complémentaires (optionnels)</div>
                      <div style={{fontSize:'12px',color:'var(--text-2)',marginBottom:'14px'}}>Affinez votre cible. Tous ces filtres sont gratuits — c'est la recherche elle-même qui coûte 1 crédit/page.</div>
                      <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'18px'}}>
                        <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                          <input type="checkbox" checked={prospWithPhone} onChange={e => setProspWithPhone(e.target.checked)} />
                          📞 Uniquement les sociétés avec <strong>téléphone connu</strong>
                        </label>
                        <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                          <input type="checkbox" checked={prospWithEmail} onChange={e => setProspWithEmail(e.target.checked)} />
                          ✉ Uniquement les sociétés avec <strong>email connu</strong>
                        </label>
                        <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                          <input type="checkbox" checked={prospWithSite} onChange={e => setProspWithSite(e.target.checked)} />
                          🌐 Uniquement les sociétés avec <strong>site web</strong>
                        </label>
                      </div>
                      <div style={{display:'flex',gap:'12px',marginBottom:'18px'}}>
                        <div style={{flex:1}}>
                          <label style={{fontSize:'11px',color:'var(--text-2)',textTransform:'uppercase',fontWeight:600,letterSpacing:'.4px'}}>Effectif min</label>
                          <input type="number" value={prospMinStaff} onChange={e=>setProspMinStaff(e.target.value)} placeholder="Ex: 5"
                            style={{width:'100%',padding:'8px 12px',fontSize:'13px',border:'0.5px solid #cde0e0',borderRadius:'6px',outline:'none',marginTop:'4px'}} />
                        </div>
                        <div style={{flex:1}}>
                          <label style={{fontSize:'11px',color:'var(--text-2)',textTransform:'uppercase',fontWeight:600,letterSpacing:'.4px'}}>Effectif max</label>
                          <input type="number" value={prospMaxStaff} onChange={e=>setProspMaxStaff(e.target.value)} placeholder="Ex: 50"
                            style={{width:'100%',padding:'8px 12px',fontSize:'13px',border:'0.5px solid #cde0e0',borderRadius:'6px',outline:'none',marginTop:'4px'}} />
                        </div>
                      </div>
                      {/* Récap critères */}
                      <div style={{padding:'12px 14px',background:'var(--bg)',borderRadius:'8px',fontSize:'12px',color:'#4a6868',marginBottom:'14px'}}>
                        <div style={{fontWeight:600,marginBottom:'6px',color:'var(--text)'}}>Récapitulatif :</div>
                        <div>NAF : {prospNafCode ? `${prospNafCode} — ${prospNafLibelle}` : <em>(aucun)</em>}</div>
                        <div>Zone : {prospPlace ? (prospPlace.formatted_name || prospPlace.name) : <em>(aucune)</em>}</div>
                        {(prospWithPhone || prospWithEmail || prospWithSite) && (
                          <div>Filtres : {[prospWithPhone&&'téléphone',prospWithEmail&&'email',prospWithSite&&'site web'].filter(Boolean).join(', ')}</div>
                        )}
                      </div>
                      <div style={{padding:'12px 14px',background:'#fef3c7',borderRadius:'8px',fontSize:'12px',color:'#92400e',border:'0.5px dashed #d4a017'}}>
                        ⚠ <strong>Coût estimé :</strong> 1 crédit pour les 25 premiers résultats. Les pages suivantes coûtent 1 crédit chacune (max 5 pages = 125 sociétés par recherche).
                      </div>
                    </div>
                  )}

                  {/* ── ÉTAPE 4 : Résultats ── */}
                  {prospStep === 4 && (
                    <div>
                      {prospLoading && <div style={{textAlign:'center',padding:'40px',color:'var(--text-2)'}}>Recherche en cours…</div>}
                      {prospError && <div style={{padding:'10px 14px',background:'#fecaca',color:'#991b1b',borderRadius:'7px',marginBottom:'12px',fontSize:'13px'}}>{prospError}</div>}
                      {prospImportResult && (() => {
                        const fullSuccess = prospImportResult.inserted_count > 0 && prospImportResult.error_count === 0;
                        const totalFailure = prospImportResult.inserted_count === 0 && prospImportResult.error_count > 0;
                        const partialSuccess = prospImportResult.inserted_count > 0 && prospImportResult.error_count > 0;
                        const bg     = totalFailure ? '#fecaca' : (partialSuccess ? '#fef3c7' : '#dcfce7');
                        const fg     = totalFailure ? '#991b1b' : (partialSuccess ? '#92400e' : '#166534');
                        const icon   = totalFailure ? '❌' : (partialSuccess ? '⚠️' : '✅');
                        const title  = totalFailure ? 'Import échoué' : (partialSuccess ? 'Import partiel' : 'Import terminé');
                        return (
                          <div style={{padding:'14px',background:bg,borderRadius:'8px',marginBottom:'14px',fontSize:'13px',color:fg}}>
                            {icon} <strong>{title} :</strong> {prospImportResult.inserted_count} société(s) ajoutée(s)
                            {prospImportResult.skipped_count > 0 && ` · ${prospImportResult.skipped_count} déjà connue(s) (ignorées)`}
                            {prospImportResult.error_count > 0 && ` · ${prospImportResult.error_count} erreur(s)`}
                            {fullSuccess && (
                              <div style={{marginTop:'8px',fontSize:'12px'}}>Les sociétés sont visibles dans <strong>Attribution</strong> en statut Suspect, prêtes à être assignées.</div>
                            )}
                            {prospImportResult.error_count > 0 && prospImportResult.errors && prospImportResult.errors[0] && (
                              <div style={{marginTop:'8px',fontSize:'11px',fontFamily:'monospace',background:'rgba(0,0,0,0.05)',padding:'6px 8px',borderRadius:'4px'}}>
                                Erreur (1ère sur {prospImportResult.error_count}) — SIREN {prospImportResult.errors[0].siren} : {prospImportResult.errors[0].error}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {!prospLoading && prospResults.length > 0 && (
                        <div>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                            <div style={{fontSize:'12px',color:'var(--text-2)'}}>
                              {prospResultsTotal} résultat(s) — Page {prospResultsPage}/{prospResultsTotalPages} —
                              <strong style={{color:'var(--text)'}}> {prospSelected.size} sélectionnée(s)</strong>
                            </div>
                            <div style={{display:'flex',gap:'8px'}}>
                              <button onClick={selectAllVisible} style={{padding:'4px 10px',fontSize:'11px',border:'0.5px solid #cde0e0',background:'white',borderRadius:'5px',cursor:'pointer'}}>Tout sélectionner</button>
                              <button onClick={clearProspSelection} style={{padding:'4px 10px',fontSize:'11px',border:'0.5px solid #cde0e0',background:'white',borderRadius:'5px',cursor:'pointer'}}>Désélectionner</button>
                            </div>
                          </div>
                          <div style={{maxHeight:'400px',overflow:'auto',border:'0.5px solid #e0e8e8',borderRadius:'8px'}}>
                            {/* Tri : sociétés avec contacts pro en haut, puis les autres.
                                On ne réordonne pas en réel l'array (préserve l'ordre original SocieteInfo
                                pour ceux qui ont les mêmes flags) — juste un .sort() stable basé sur le Set. */}
                            {[...prospResults]
                              .sort((a, b) => {
                                const ah = prospWithContactsSirens.has(a.registration_number) ? 1 : 0;
                                const bh = prospWithContactsSirens.has(b.registration_number) ? 1 : 0;
                                return bh - ah;
                              })
                              .map(c => {
                              const siren = c.registration_number;
                              const isExisting = prospExistingSirens.has(siren);
                              const isSelected = prospSelected.has(siren);
                              const hasContacts = prospWithContactsSirens.has(siren);
                              return (
                                <div key={siren} style={{padding:'10px 14px',borderBottom:'0.5px solid #f0f4f4',display:'flex',gap:'10px',alignItems:'flex-start',background:isExisting?'var(--bg)':(isSelected?'#e0f2f1':'white'),opacity:isExisting?0.6:1}}>
                                  <input type="checkbox"
                                    checked={isSelected}
                                    disabled={isExisting}
                                    onChange={() => toggleProspSelected(siren)}
                                    style={{marginTop:'4px',cursor:isExisting?'not-allowed':'pointer'}} />
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                                      {c.name}
                                      {hasContacts && (
                                        <span title="Cette société a des contacts professionnels nominatifs (email pro)" style={{display:'inline-flex',alignItems:'center',gap:'3px',fontSize:'10px',padding:'2px 7px',borderRadius:'10px',background:'#dcfce7',color:'#166534',fontWeight:600}}>
                                          {I(ICONS.mail, 11)}
                                          contacts
                                        </span>
                                      )}
                                      {isExisting && <span style={{fontSize:'10px',padding:'2px 7px',borderRadius:'10px',background:'#fef3c7',color:'#92400e',fontWeight:600}}>Déjà importée</span>}
                                    </div>
                                    <div style={{fontSize:'11px',color:'var(--text-2)',marginTop:'2px'}}>
                                      SIREN {siren} · {c.formatted_address || ''}
                                    </div>
                                    {c.activity && <div style={{fontSize:'11px',color:'var(--meta)',marginTop:'2px',fontStyle:'italic'}}>{c.activity}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Pagination */}
                          {prospResultsTotalPages > 1 && (
                            <div style={{marginTop:'10px',display:'flex',justifyContent:'center',gap:'6px'}}>
                              {Array.from({length: Math.min(5, prospResultsTotalPages)}, (_,i) => i + 1).map(pg => (
                                <button key={pg}
                                  onClick={() => runProspectionSearch(pg)}
                                  style={{padding:'5px 10px',fontSize:'11px',border:'0.5px solid #cde0e0',borderRadius:'5px',cursor:'pointer',background:pg===prospResultsPage?'var(--text)':'white',color:pg===prospResultsPage?'white':'var(--text)'}}>
                                  Page {pg}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* Footer navigation */}
                <div style={{padding:'14px 24px',borderTop:'1px solid var(--tw-border)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fafbfb'}}>
                  <button onClick={() => prospStep > 1 ? setProspStep(prospStep - 1) : setShowProspectionModal(false)}
                    style={{padding:'8px 14px',border:'0.5px solid #cde0e0',background:'white',borderRadius:'7px',cursor:'pointer',fontSize:'13px'}}>
                    {prospStep > 1 ? '← Précédent' : 'Annuler'}
                  </button>
                  <div style={{display:'flex',gap:'8px'}}>
                    {prospStep < 3 && (
                      <button onClick={() => setProspStep(prospStep + 1)}
                        disabled={prospStep === 1 && !prospNafCode && !prospPlace}
                        style={{padding:'8px 18px',background:'var(--text)',color:'white',border:'none',borderRadius:'7px',cursor:'pointer',fontSize:'13px',fontWeight:600,opacity:(prospStep===1&&!prospNafCode&&!prospPlace)?0.5:1}}>
                        Suivant →
                      </button>
                    )}
                    {prospStep === 3 && (
                      <button onClick={() => { setProspStep(4); runProspectionSearch(1); }}
                        disabled={!prospNafCode && !prospPlace}
                        style={{padding:'8px 18px',background:'var(--text)',color:'white',border:'none',borderRadius:'7px',cursor:'pointer',fontSize:'13px',fontWeight:600,opacity:(!prospNafCode&&!prospPlace)?0.5:1}}>
                        🚀 Lancer la recherche (1 crédit)
                      </button>
                    )}
                    {prospStep === 4 && (
                      <button onClick={runProspectionImport}
                        disabled={prospSelected.size === 0 || prospImporting}
                        style={{padding:'8px 18px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'7px',cursor:(prospSelected.size===0||prospImporting)?'not-allowed':'pointer',fontSize:'13px',fontWeight:600,opacity:(prospSelected.size===0||prospImporting)?0.5:1}}>
                        {prospImporting
                          ? (prospEnrichProgress
                              ? `Enrichissement ${prospEnrichProgress.done}/${prospEnrichProgress.total}…`
                              : 'Import en cours…')
                          : `📥 Importer ${prospSelected.size} suspect(s)`}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      );
    }


    // ═══════════════════════════════════════════════════════════════════
    // CommercialEditor : éditeur inline du commercial assigné à un prospect
    // Affichage compact (lecture) → clic → popover (select + bouton enregistrer)
    // Admin uniquement (le check est fait par le parent avant d'instancier ce composant)
    // ═══════════════════════════════════════════════════════════════════
    function RightPanel({ selectedProspect, activities, nextActions, allActions, statusHistory, onEdit, onUpdateProspect, onDelete, onAddActivity, onAddNextAction, onToggleNextAction, onDeleteNextAction, fetchAllActions, fetchNextActions, fetchAffaires, showForm, formData, onFormChange, onSave, onCancel, newActionType, onActionTypeChange, newActionDate, onActionDateChange, newActionActor, onActionActorChange, newActionContact, onActionContactChange, newActionComment, onActionCommentChange, user, API_URL, interlocuteurs, showInterlocuteurForm, setShowInterlocuteurForm, interlocuteurForm, setInterlocuteurForm, handleSaveInterlocuteur, handleDeleteInterlocuteur, fetchInterlocuteurs, historyExpanded, setHistoryExpanded, historyLoading, setHistoryLoading, historyData, setHistoryData, historyError, setHistoryError, draggedContactId, setDraggedContactId, dragOverContactId, setDragOverContactId, devisList, showDevisForm, setShowDevisForm, editingDevisId, setEditingDevisId, editingDevis, setEditingDevis, devisFormData, setDevisFormData, devisPdfFile, setDevisPdfFile, isUploadingDevisPdf, handleAddDevis, handleAddDevisLibre, handleAddDevisTexasWin, showDevisTypeModal, setShowDevisTypeModal, handleEditDevis, handleSaveDevis, handleQuickDevisStatus, handleAnnulerRemplacer, handleSaveMotifPerte, handleDeleteDevis, handleRattacherDevisAffaire, handleUploadDevisPdf, handleUploadDevisPdfDirect, handleDeleteDevisPDF, affairesList, selectedAffaireId, setSelectedAffaireId, expandedActionId, setExpandedActionId, handleAddAffaire, handleEditAffaire, handleSaveAffaire, handleDeleteAffaire, showAffaireForm, setShowAffaireForm, editingAffaireId, setEditingAffaireId, affaireFormData, setAffaireFormData, affairesActions, handleOpenActionAffaireForm, handleToggleActionAffaire, handleDeleteActionAffaire, showActionAffaireForm, setShowActionAffaireForm, actionAffaireFormData, setActionAffaireFormData, handleSaveActionAffaire, users, codesNaf }) {
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

      // Modale ajout/modif matériel
      const [showMaterielForm, setShowMaterielForm] = React.useState(false);
      const [editingMateriel, setEditingMateriel] = React.useState(null);
      const [materielForm, setMaterielForm] = React.useState({boutique_id:'',materiel_type_id:'',marque:'',modele:'',os:'',version_os:'',nb_unites:1,localisation:'',date_achat:'',notes:''});

      const loadClientData = async (pid) => {
        if (!pid) return;
        try {
          const headers = { 'Authorization': `Bearer ${user.token}` };
          const [lics, bouts, mats, refL, refM] = await Promise.all([
            fetch(`${API_URL}/prospects/${pid}/licences`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/prospects/${pid}/boutiques`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/prospects/${pid}/materiel`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/licences`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/materiel-types`, {headers}).then(r=>r.json()),
          ]);
          setClientLicences(Array.isArray(lics)?lics:[]);
          setClientBoutiques(Array.isArray(bouts)?bouts:[]);
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
      const statutColors = {Client:'var(--tw-teal)',Prospect:'var(--warning)',Suspect:'#999'};
      const statutBgs = {Client:'var(--tw-teal-light)',Prospect:'#fff8e1',Suspect:'#f5f5f5'};
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
                      <option value="Suspect">Suspect</option>
                      <option value="Prospect">Prospect</option>
                      <option value="Client">Client</option>
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
                        display:'inline-flex',alignItems:'center',justifyContent:'center',
                        width:'24px',height:'24px',padding:0,
                        background:'white',
                        border:'0.5px solid #f0c4c4',
                        borderRadius:'50%',
                        cursor:'pointer',
                        transition:'all .15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fef3f2'; e.currentTarget.style.borderColor = '#a52d2d'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#f0c4c4'; }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a52d2d" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <circle cx="12" cy="12" r="6"/>
                        <circle cx="12" cy="12" r="2" fill="#a52d2d"/>
                      </svg>
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
            const TabIcon = ({path, size=14}) => React.createElement('svg', {width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.8, strokeLinecap:'round', strokeLinejoin:'round'}, path);
            const ICON = {
              info:    React.createElement(React.Fragment, null, React.createElement('circle',{cx:12,cy:12,r:10}), React.createElement('path',{d:'M12 16v-4M12 8h.01'})),
              key:     React.createElement(React.Fragment, null, React.createElement('path',{d:'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'})),
              bag:     React.createElement(React.Fragment, null, React.createElement('path',{d:'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0'})),
              hardware:React.createElement(React.Fragment, null, React.createElement('rect',{x:2,y:3,width:20,height:14,rx:2}), React.createElement('line',{x1:8,y1:21,x2:16,y2:21}), React.createElement('line',{x1:12,y1:17,x2:12,y2:21})),
              folder:  React.createElement('path',{d:'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'}),
              actions: React.createElement(React.Fragment, null, React.createElement('path',{d:'M9 11l3 3L22 4'}), React.createElement('path',{d:'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'})),
            };
            return (
            <div style={{marginBottom:'16px',background:'white',border:'0.5px solid var(--tw-border)',borderRadius:'12px',overflow:'hidden'}}>
              {/* Nav onglets : style moderne, bordure inférieure simple */}
              <div style={{display:'flex',gap:'2px',borderBottom:'0.5px solid var(--tw-border)',overflowX:'auto',padding:'0 14px'}}>
                {(() => {
                  const nbAffaires = affairesList.filter(a => a.statut_global !== 'Perdu' && a.statut_global !== 'Gagné').length;
                  const tabs = [
                    {id:'infos',        label:'Informations',   icon: ICON.info},
                    ...(isClient ? [
                      {id:'licences',  label:'Licences',  icon: ICON.key,      count: clientLicences.length},
                      {id:'boutiques', label:'Boutiques', icon: ICON.bag,      count: clientBoutiques.length},
                      {id:'materiel',  label:'Matériel',  icon: ICON.hardware, count: clientMateriel.length},
                    ] : []),
                    {id:'affaires',     label:'Affaires',       icon: ICON.folder,  count: nbAffaires},
                    {id:'communication',label:'Actions / Tâches', icon: ICON.actions},
                  ];
                  return tabs;
                })().map(t => {
                  const active = clientTab === t.id;
                  return (
                    <button key={t.id}
                      onClick={() => setClientTab(t.id)}
                      style={{padding:'10px 14px',fontFamily:"'Inter',sans-serif",fontSize:'13px',
                        fontWeight: 500,
                        border:'none',background:'transparent',
                        color: active ? 'var(--tw-teal)' : 'var(--tw-ink)',
                        opacity: active ? 1 : 0.65,
                        borderBottom: active ? '2px solid var(--tw-teal)' : '2px solid transparent',
                        marginBottom:'-0.5px',
                        cursor:'pointer',whiteSpace:'nowrap',transition:'color .15s, opacity .15s, border-color .15s',
                        display:'flex',alignItems:'center',gap:'6px'}}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.opacity = '1'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.opacity = '0.65'; }}
                    >
                      <TabIcon path={t.icon}/>
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
                      <div style={{fontSize:'11px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--tw-muted)'}}>Coordonnées société</div>
                      {!infoEdit
                        ? <button onClick={() => setInfoEdit(true)} style={{padding:'4px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',fontSize:'12px',cursor:'pointer',color:'var(--tw-slate)',fontFamily:"'Inter',sans-serif"}}>✏️ Modifier</button>
                        : <div style={{display:'flex',gap:'8px'}}>
                            <button onClick={() => setInfoEdit(false)} style={{padding:'4px 12px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',fontSize:'12px',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>Annuler</button>
                            <button onClick={saveInfos} style={{padding:'4px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>✓ Enregistrer</button>
                          </div>
                      }
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px',marginBottom:'20px'}}>
                      {[
                        {lbl:'Raison sociale', field:'name'},
                        {lbl:'N° SIREN', field:'siren'},
                        {lbl:'Adresse siège', field:'adresse'},
                        {lbl:'Site web', field:'website'},
                        {lbl:'Téléphone standard', field:'tel_standard'},
                      ].map(f => (
                        <div key={f.field}>
                          <div style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'4px'}}>{f.lbl}</div>
                          {infoEdit
                            ? <input type="text" value={infoForm[f.field]||''} onChange={e=>setInfoForm({...infoForm,[f.field]:e.target.value})}
                                style={{width:'100%',padding:'6px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                            : f.field==='website' && infoForm[f.field]
                              ? <a href={infoForm[f.field].startsWith('http')?infoForm[f.field]:'https://'+infoForm[f.field]} target="_blank" style={{fontSize:'13px',fontWeight:'500',color:'var(--tw-teal)'}}>{infoForm[f.field]}</a>
                              : <div style={{fontSize:'13px',fontWeight:'500',color:infoForm[f.field]?'var(--tw-ink)':'var(--tw-muted)'}}>{infoForm[f.field]||'—'}</div>
                          }
                        </div>
                      ))}
                      {/* Code NAF */}
                      <div>
                        <div style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'4px'}}>Code NAF</div>
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
                              return infoForm.code_naf
                                ? <div>
                                    <div style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-ink)'}}>{infoForm.code_naf}</div>
                                    <div style={{fontSize:'12px',color:'var(--tw-slate)',marginTop:'2px'}}>{found?.libelle||''}</div>
                                    <div style={{fontSize:'11px',color:'var(--tw-teal)',marginTop:'1px'}}>{found?.categorie||''}</div>
                                  </div>
                                : <div style={{fontSize:'13px',color:'var(--tw-muted)'}}>—</div>;
                            })()
                        }
                      </div>
                      <div>
                        <div style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'4px'}}>Date entrée en relation</div>
                        {infoEdit
                          ? <input type="date" value={infoForm.created_at||''} onChange={e=>setInfoForm({...infoForm,created_at:e.target.value})}
                              style={{width:'100%',padding:'6px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
                          : <div style={{fontSize:'13px',fontWeight:'500',color:'var(--tw-ink)'}}>{infoForm.created_at?new Date(infoForm.created_at).toLocaleDateString('fr-FR'):'—'}</div>
                        }
                      </div>
                    </div>

                    {/* Marques */}
                    <div style={{marginBottom:'20px'}}>
                      <div>
                        <div style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'4px'}}>Marques</div>
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
                            : <div style={{fontSize:'13px',color:'var(--tw-muted)'}}>—</div>
                        }
                      </div>
                    </div>

                    {/* Notes */}
                    <div style={{marginBottom:'20px'}}>
                      <div style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'6px'}}>Notes</div>
                      {infoEdit
                        ? <textarea value={infoForm.notes||''} onChange={e=>setInfoForm({...infoForm,notes:e.target.value})}
                            style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif",minHeight:'80px',resize:'vertical'}} />
                        : <div style={{fontSize:'13px',color:infoForm.notes?'var(--tw-slate)':'var(--tw-muted)',background:'var(--tw-bg)',padding:'10px 12px',borderRadius:'6px',lineHeight:'1.6',fontStyle:infoForm.notes?'normal':'italic'}}>{infoForm.notes||'Aucune note'}</div>
                      }
                    </div>

                    {isClient && (<>
                    {/* Installation TexasWin */}
                    <div style={{fontSize:'11px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--tw-muted)',marginBottom:'12px'}}>Installation TexasWin</div>
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
                        <div style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'6px'}}>Solutions en place</div>
                        <div style={{fontSize:'13px',color:'var(--tw-slate)',background:'var(--tw-bg)',padding:'10px 12px',borderRadius:'6px',lineHeight:'1.6',whiteSpace:'pre-line'}}>{selectedProspect.solutions_en_place}</div>
                      </div>
                    )}

                    {/* Contacts */}
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
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                            {[
                              {ph:'Fonction', field:'fonction'},
                              {ph:'Email', field:'email', type:'email'},
                              {ph:'Téléphone', field:'telephone', type:'tel'},
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

                      return (
                        <React.Fragment>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                            <div style={{fontSize:'11px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--tw-muted)',display:'flex',alignItems:'center',gap:'10px'}}>
                              Contacts
                              {hasCustomOrder && (
                                <button onClick={handleResetOrder}
                                  title="Revenir au tri automatique (Principal/Décideur en haut)"
                                  style={{padding:'2px 8px',background:'transparent',border:'0.5px solid var(--tw-border)',borderRadius:'10px',fontSize:'10px',fontWeight:'500',color:'var(--tw-muted)',cursor:'pointer',fontFamily:"'Inter',sans-serif",textTransform:'none',letterSpacing:0}}>
                                  ↺ Réinitialiser l'ordre
                                </button>
                              )}
                            </div>
                            <button onClick={() => { setHistoryExpanded(false); setHistoryData([]); setInterlocuteurForm({prenom:'',nom:'',fonction:'',email:'',telephone:'',linkedin_url:'',principal:false,decideur:false,accept_emailing:false,accept_notes_info:false,demande_optin:false}); setShowInterlocuteurForm(true); }}
                              style={{padding:'5px 12px',background:'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>+ Contact</button>
                          </div>

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
                            return (
                              <React.Fragment key={c.id}>
                                <div
                                  draggable={!isEditingThis}
                                  onDragStart={(e) => handleDragStart(e, c.id)}
                                  onDragOver={(e) => handleDragOver(e, c.id)}
                                  onDragEnd={handleDragEnd}
                                  onDrop={(e) => handleDrop(e, c.id)}
                                  style={{
                                    display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'6px',background:'var(--tw-bg)',marginBottom:'6px',
                                    opacity: isDragging ? 0.4 : 1,
                                    border: isDragOver ? '2px dashed var(--tw-teal)' : '2px solid transparent',
                                    transition: 'opacity 0.15s, border-color 0.15s',
                                    cursor: isEditingThis ? 'default' : 'move'
                                  }}>
                                  {/* Handle drag : icône à grip à gauche, visible mais discrète.
                                      Toute la ligne est draggable, mais le handle indique visuellement la prise. */}
                                  <span title="Glisser pour réordonner" style={{flexShrink:0,color:'var(--tw-muted)',fontSize:'14px',cursor:'grab',userSelect:'none',lineHeight:1}}>⋮⋮</span>
                                  <div style={{width:'34px',height:'34px',borderRadius:'50%',background:col,color:'white',fontWeight:'600',fontSize:'12px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{ini}</div>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-ink)'}}>{displayName(c)}</div>
                                    <div style={{fontSize:'11px',color:'var(--tw-muted)',marginTop:'2px',display:'flex',gap:'10px',flexWrap:'wrap'}}>
                                      {c.fonction && <span>{c.fonction}</span>}
                                      {c.email && <a href={`mailto:${c.email}`} style={{color:'var(--tw-teal)',textDecoration:'none'}}>✉ {c.email}</a>}
                                      {c.telephone && <a href={`tel:${c.telephone}`} style={{color:'var(--tw-slate)',textDecoration:'none'}}>📞 {c.telephone}</a>}
                                      {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" title="Profil LinkedIn" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'18px',height:'18px',borderRadius:'3px',background:'#0a66c2',color:'white',fontSize:'9px',fontWeight:700,textDecoration:'none'}}>in</a>}
                                    </div>
                                  </div>
                                  <div style={{display:'flex',gap:'5px',alignItems:'center',flexShrink:0}}>
                                    {c.accept_emailing && <span title="Accepte les emailings commerciaux" style={{display:'inline-flex',alignItems:'center',padding:'3px 5px',borderRadius:'8px',background:'#dcfce7',color:'#166534'}}>{I(ICONS.mail, 12)}</span>}
                                    {c.accept_notes_info && <span title="Accepte les notes d'information" style={{display:'inline-flex',alignItems:'center',padding:'3px 5px',borderRadius:'8px',background:'#dbeafe',color:'#1e40af'}}>{I(ICONS.bell, 12)}</span>}
                                    {c.decideur && <span style={{fontSize:'10px',fontWeight:'600',padding:'2px 7px',borderRadius:'8px',background:'#fdecea',color:'var(--tw-red)'}}>Décideur</span>}
                                    {c.principal && <span style={{fontSize:'10px',fontWeight:'600',padding:'2px 7px',borderRadius:'8px',background:'var(--tw-teal-light)',color:'var(--tw-teal)'}}>Principal</span>}
                                    <IconBtn title="Modifier le contact"
                                      onClick={() => { setHistoryExpanded(false); setHistoryData([]); setInterlocuteurForm({id:c.id,prenom:c.prenom||'',nom:c.nom||'',fonction:c.fonction||'',email:c.email||'',telephone:c.telephone||'',linkedin_url:c.linkedin_url||'',principal:!!c.principal,decideur:!!c.decideur,accept_emailing:!!c.accept_emailing,accept_notes_info:!!c.accept_notes_info,demande_optin:!!c.demande_optin,emailing_unsubscribed_at:c.emailing_unsubscribed_at||null,emailing_unsubscribed_source:c.emailing_unsubscribed_source||null}); setShowInterlocuteurForm(true); }}
                                    >{I(ICONS.edit, 13)}</IconBtn>
                                    <IconBtn title="Supprimer le contact" danger
                                      onClick={() => handleDeleteInterlocuteur(c.id)}
                                    >{I(ICONS.trash, 13)}</IconBtn>
                                  </div>
                                </div>
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
                              <input type="text" value={boutiqueForm[field]} onChange={e=>setBoutiqueForm({...boutiqueForm,[field]:e.target.value})}
                                placeholder={placeholder}
                                style={{width:'100%',padding:'7px 10px',border:'1px solid var(--tw-border)',borderRadius:'6px',fontSize:'13px',fontFamily:"'Inter',sans-serif"}} />
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
                                <div style={{fontSize:'11px',color:'var(--tw-muted)',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'6px'}}>Matériel</div>
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
                    {completingAction && (
                      <ActionCompleteModal action={completingAction} prospectId={selectedProspect && selectedProspect.id} API_URL={API_URL} token={user.token} onClose={() => setCompletingAction(null)} onCompleted={() => { if (selectedProspect) { fetchNextActions(selectedProspect.id); fetchAllActions(selectedProspect.id); } }} />
                    )}
                  </div>
                )}

              </div>
            </div>
            );
          })()}

        </div>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<ToastProvider><App /></ToastProvider>);
  