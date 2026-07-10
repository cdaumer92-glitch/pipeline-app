import * as React from 'react';

// Interlocuteurs (contacts d'une société) : état du formulaire + états de drag&drop
// (réordonnancement, gérés dans RightPanel) + handlers CRUD. Extrait de App à
// l'identique. Dépendances passées en paramètres : `user` (token), `API_URL`, et le
// `selectedProspect` courant (les handlers écrivent sur SES interlocuteurs).
// Renvoie tout sous les MÊMES noms que dans App (destructuration → aucun changement de JSX).

const EMPTY_INTERLOCUTEUR = {
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
  demande_optin: false,
};

export function useInterlocuteurs(user, API_URL, selectedProspect) {
  const [interlocuteurs, setInterlocuteurs] = React.useState([]);
  const [showInterlocuteurForm, setShowInterlocuteurForm] = React.useState(false);
  const [draggedContactId, setDraggedContactId] = React.useState(null);
  const [dragOverContactId, setDragOverContactId] = React.useState(null);
  const [interlocuteurForm, setInterlocuteurForm] = React.useState({ ...EMPTY_INTERLOCUTEUR });

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
      window.showToast({ title: 'Le nom est obligatoire', type: 'warning' });
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
        window.showToast({ title: interlocuteurForm.id ? 'Interlocuteur modifié' : 'Interlocuteur ajouté', type: 'success' });
        await fetchInterlocuteurs(selectedProspect.id);
        setShowInterlocuteurForm(false);
        setInterlocuteurForm({ ...EMPTY_INTERLOCUTEUR });
      } else {
        window.showToast({ title: 'Erreur lors de la sauvegarde', type: 'error' });
      }
    } catch (err) {
      console.error('Erreur:', err);
      window.showToast({ title: 'Erreur: ' + err.message, type: 'error' });
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
        window.showToast({ title: 'Interlocuteur supprimé', type: 'success' });
        await fetchInterlocuteurs(selectedProspect.id);
      } else {
        window.showToast({ title: 'Erreur lors de la suppression', type: 'error' });
      }
    } catch (err) {
      console.error('Erreur:', err);
      window.showToast({ title: 'Erreur: ' + err.message, type: 'error' });
    }
  };

  return {
    interlocuteurs, setInterlocuteurs,
    showInterlocuteurForm, setShowInterlocuteurForm,
    draggedContactId, setDraggedContactId,
    dragOverContactId, setDragOverContactId,
    interlocuteurForm, setInterlocuteurForm,
    fetchInterlocuteurs, handleSaveInterlocuteur, handleDeleteInterlocuteur,
  };
}
