import * as React from 'react';

// Devis + Affaires : etat et handlers extraits de App. Les deux domaines sont mutuellement
// couples (un devis peut creer/attacher une affaire ; une affaire recharge les devis) -> ils
// sont regroupes dans UN seul hook pour que ce couplage reste interne (evite tout probleme
// d'ordre de declaration / TDZ). Deplace a l'identique. Deps externes : user (token),
// API_URL, et le selectedProspect courant. Renvoie tout sous les MEMES noms que dans App.
export function useDevisAffaires({ user, API_URL, selectedProspect, fetchAllActions }) {
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


  return {
    devisList, setDevisList, showDevisForm, setShowDevisForm, showDevisTypeModal, setShowDevisTypeModal, editingDevisId, setEditingDevisId, editingDevis, setEditingDevis, devisFormData, setDevisFormData, devisPdfFile, setDevisPdfFile, isUploadingDevisPdf, setIsUploadingDevisPdf, affairesList, setAffairesList, affairesActions, setAffairesActions, showAffaireForm, setShowAffaireForm, showActionAffaireForm, setShowActionAffaireForm, selectedAffaireForAction, setSelectedAffaireForAction, actionAffaireFormData, setActionAffaireFormData, editingAffaireId, setEditingAffaireId, affaireFormData, setAffaireFormData, selectedAffaireId, setSelectedAffaireId, expandedActionId, setExpandedActionId, fetchDevis, handleAddDevis, handleAddDevisLibre, handleAddDevisTexasWin, handleEditDevis, handleSaveDevis, handleQuickDevisStatus, handleSaveMotifPerte, handleAnnulerRemplacer, handleDeleteDevis, handleUploadDevisPdf, handleUploadDevisPdfDirect, handleDeleteDevisPDF, handleRattacherDevisAffaire, fetchAffaires, handleAddAffaire, handleEditAffaire, handleSaveAffaire, handleDeleteAffaire, handleOpenActionAffaireForm, handleSaveActionAffaire, handleToggleActionAffaire, handleDeleteActionAffaire,
  };
}
