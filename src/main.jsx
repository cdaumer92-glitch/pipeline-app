import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
// Overlay palette (Ctrl+K) : importé en side-effect pour monter son propre root #twnav-root.
import './overlay.jsx';
import { CampagnesPage } from './components/Campagnes.jsx';
import { styles } from './lib/styles.js';
import { ACTION_TYPES, API_URL } from './lib/constants.js';
import { useProspectsData } from './hooks/useProspectsData.js';
import { useInterlocuteurs } from './hooks/useInterlocuteurs.js';
import { useDevisAffaires } from './hooks/useDevisAffaires.js';
import { LoginForm } from './components/LoginForm.jsx';
import { I, displayName, displayInitials, buildInfoForm, ICONS, IconBtn, typeChip, getActionStatus, prospectDisplayName, getEmptyProspect, calculateTotal, formatCurrency, formatNumber, getStatusColor, getProspectCountByCommercial, getProspectRealStatus } from './lib/shared.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { RightPanel } from './components/RightPanel.jsx';
import { ProspectForm } from './components/ProspectForm.jsx';
import { ActivitiesSection } from './components/ActivitiesSection.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ListesView } from './components/ListesView.jsx';
import { Header } from './components/Header.jsx';
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

    // ==================== HELPER NOMS INTERLOCUTEURS ====================
    // Combinaison prenom + nom pour affichage. Gère les 3 cas :
    //  - prenom + nom    → "Maurice Leblanc"
    //  - juste nom       → "Leblanc" (anciens contacts non splittés ou contacts sans prénom)
    //  - juste prenom    → "Maurice" (rare, mais cohérent)
    //  - rien            → "" (jamais affiché en pratique)
    // Source unique pour toute l'app : si on change le format un jour, c'est ici.
    // Variante "initiales" pour les avatars (max 2 lettres)


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
      const [listeCtx, setListeCtx] = React.useState(null); // filtre initial d'une liste ouverte depuis le dashboard : { commercial, realStatus, devisStatut }
      const [showAttribution, setShowAttribution] = React.useState(false);
      const [showCampagnes, setShowCampagnes] = React.useState(false);
      const isUserAdmin = (u) => u && ['Christian', 'Frédéric', 'Frederic'].includes(u.name);
      const [selectedCommercial, setSelectedCommercial] = React.useState(null);
      const [showSettings, setShowSettings] = React.useState(false);
      const [showRecap, setShowRecap] = React.useState(false);
      const [recapCommercial, setRecapCommercial] = React.useState(null);
      const [recapPeriod, setRecapPeriod] = React.useState('jour'); // 'jour', 'semaine', 'mois'
      const [recapDate, setRecapDate] = React.useState(new Date().toISOString().split('T')[0]);
      // Données de base de l'app (bootstrap après connexion), extraites dans un hook.
      const {
        prospects, setProspects,
        codesNaf, setCodesNaf,
        appUsers, setAppUsers,
        prospectActionsInfo, setProspectActionsInfo,
        fetchProspects,
      } = useProspectsData(user, API_URL);
      const [activities, setActivities] = React.useState({});
      const [nextActions, setNextActions] = React.useState([]);
      const [allActions, setAllActions] = React.useState([]);
      const [statusHistory, setStatusHistory] = React.useState([]);
      const [actionNotes, setActionNotes] = React.useState({});
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
      // Interlocuteurs (contacts d'une société) : état + handlers extraits dans un hook.
      const {
        interlocuteurs, setInterlocuteurs,
        showInterlocuteurForm, setShowInterlocuteurForm,
        draggedContactId, setDraggedContactId,
        dragOverContactId, setDragOverContactId,
        interlocuteurForm, setInterlocuteurForm,
        fetchInterlocuteurs, handleSaveInterlocuteur, handleDeleteInterlocuteur,
      } = useInterlocuteurs(user, API_URL, selectedProspect);

      // RGPD - États pour le collapse "Historique consentements" du formulaire d'édition
      const [historyExpanded, setHistoryExpanded] = React.useState(false);
      const [historyLoading, setHistoryLoading] = React.useState(false);
      const [historyData, setHistoryData] = React.useState([]);
      const [historyError, setHistoryError] = React.useState(null);
      
      // STATE MODAL COMPTEURS (au niveau App pour éviter problèmes de rendu)
      const [showCompteurModal, setShowCompteurModal] = React.useState(false);
      const [compteurModalData, setCompteurModalData] = React.useState({ title: '', prospects: [] });
      
      // États pour les devis
      // Devis + Affaires (domaines couples) : etat + handlers extraits dans un hook.
      const {
        devisList, setDevisList, showDevisForm, setShowDevisForm, showDevisTypeModal, setShowDevisTypeModal, editingDevisId, setEditingDevisId, editingDevis, setEditingDevis, devisFormData, setDevisFormData, devisPdfFile, setDevisPdfFile, isUploadingDevisPdf, setIsUploadingDevisPdf, affairesList, setAffairesList, affairesActions, setAffairesActions, showAffaireForm, setShowAffaireForm, showActionAffaireForm, setShowActionAffaireForm, selectedAffaireForAction, setSelectedAffaireForAction, actionAffaireFormData, setActionAffaireFormData, editingAffaireId, setEditingAffaireId, affaireFormData, setAffaireFormData, selectedAffaireId, setSelectedAffaireId, expandedActionId, setExpandedActionId, fetchDevis, handleAddDevis, handleAddDevisLibre, handleAddDevisTexasWin, handleEditDevis, handleSaveDevis, handleQuickDevisStatus, handleSaveMotifPerte, handleAnnulerRemplacer, handleDeleteDevis, handleUploadDevisPdf, handleUploadDevisPdfDirect, handleDeleteDevisPDF, handleRattacherDevisAffaire, fetchAffaires, handleAddAffaire, handleEditAffaire, handleSaveAffaire, handleDeleteAffaire, handleOpenActionAffaireForm, handleSaveActionAffaire, handleToggleActionAffaire, handleDeleteActionAffaire,
        // fetchAllActions est défini plus bas dans App : wrapper différé (évalué à l'appel,
        // pas au rendu) pour éviter un TDZ tout en le fournissant au hook.
      } = useDevisAffaires({ user, API_URL, selectedProspect, fetchAllActions: (...a) => fetchAllActions(...a) });
      
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

      // Charger les actions de tous les prospects après le chargement
      React.useEffect(() => {
        if (prospects.length > 0 && user) {
          prospects.forEach(prospect => {
            fetchNextActions(prospect.id);
          });
        }
      }, [prospects.length, user]);

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
          if (d.screen && d.screen.indexOf('liste-') === 0) { setShowRecap(false); setShowCampagnes(false); setShowAttribution(false); setSelectedProspect(null); setListeCtx(null); setListeView(d.screen.slice(6)); return; }
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
        if (d.view && d.view.indexOf('liste-') === 0) { setShowCampagnes(false); setShowAttribution(false); setSelectedProspect(null); setListeCtx(null); setListeView(d.view.slice(6)); return; }
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

      // Compteur "à faire aujourd'hui / en retard" pour le rappel dans la topbar (mes sociétés).
      const dueTodayCount = (() => {
        const n = new Date();
        const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
        const admin = isUserAdmin(user);
        return (prospects || []).reduce((c, p) => {
          if (!admin && p.assigned_to !== user?.name) return c;
          const info = prospectActionsInfo[p.id];
          if (!info || !info.hasAction) return c;
          const d = info.nextActionDate ? String(info.nextActionDate).slice(0, 10) : null;
          return (info.isLate || (d && d <= today)) ? c + 1 : c;
        }, 0);
      })();

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
            onListe={(t) => { setShowCampagnes(false); setShowAttribution(false); setSelectedProspect(null); setListeCtx(null); setListeView(t); }}
            dueTodayCount={dueTodayCount}
            onOpenMyActions={() => { setShowCampagnes(false); setShowAttribution(false); setSelectedProspect(null); setListeCtx({ commercial: user.name }); setListeView('actions'); }}
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
            <ListesView type={listeView} prospects={prospects} user={user} API_URL={API_URL} listeCtx={listeCtx} />
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
              onOpenListe={(t, commercial, extra) => { setSelectedProspect(null); setShowCampagnes(false); setShowAttribution(false); setListeCtx((commercial || extra) ? { commercial: commercial || '__all__', ...(extra || {}) } : null); setListeView(t); }}
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

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<ToastProvider><App /></ToastProvider>);
  