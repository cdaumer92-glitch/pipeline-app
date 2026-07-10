import * as React from 'react';
import { getActionStatus } from '../lib/shared.jsx';


// Next-actions (prochaines actions planifiees d'une societe) : etat (liste + formulaire de
// creation + notes) et handlers (chargement, ajout, cloture/reouverture, suppression).
// Extrait de App a l'identique. Deps externes : user, API_URL, selectedProspect, et
// prospectActionsInfo/setProspectActionsInfo (indicateur d'action par prospect, possede par
// useProspectsData) -> appeler ce hook APRES useProspectsData. Renvoie tout sous les MEMES noms.
export function useNextActions({ user, API_URL, selectedProspect, prospectActionsInfo, setProspectActionsInfo }) {
      const [nextActions, setNextActions] = React.useState([]);
      const [allActions, setAllActions] = React.useState([]);
      const [actionNotes, setActionNotes] = React.useState({});
      const [newActionType, setNewActionType] = React.useState('Appel');
      const [newActionDate, setNewActionDate] = React.useState(new Date().toISOString().split('T')[0]);
      const [newActionComment, setNewActionComment] = React.useState('');
      const [newActionActor, setNewActionActor] = React.useState('');
      const [newActionContact, setNewActionContact] = React.useState('');
      const [tempActionComments, setTempActionComments] = React.useState({});

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

  return {
    nextActions, setNextActions, allActions, setAllActions, actionNotes, setActionNotes, newActionType, setNewActionType, newActionDate, setNewActionDate, newActionComment, setNewActionComment, newActionActor, setNewActionActor, newActionContact, setNewActionContact, tempActionComments, setTempActionComments, fetchNextActions, fetchAllActions, handleAddNextAction, handleToggleNextAction, handleDeleteNextAction,
  };
}
