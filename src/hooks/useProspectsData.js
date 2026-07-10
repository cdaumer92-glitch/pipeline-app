import * as React from 'react';

// Bootstrap des données de base de l'app, après connexion. Extrait de App pour isoler
// la logique de chargement (testable, réutilisable) — le comportement est identique :
//   - prospects « enrichis » (devis + prochaine action inclus, 1 seule requête backend)
//   - prospectActionsInfo dérivé des prospects enrichis (évite N requêtes)
//   - référentiels : liste des utilisateurs + codes NAF
// Renvoie les états sous les MÊMES noms que dans App (destructuration côté App → aucun
// changement de JSX).
export function useProspectsData(user, API_URL) {
  const [prospects, setProspects] = React.useState([]);
  const [codesNaf, setCodesNaf] = React.useState([]);
  const [appUsers, setAppUsers] = React.useState([]);
  const [prospectActionsInfo, setProspectActionsInfo] = React.useState({});

  const fetchProspects = async () => {
    try {
      // UNE SEULE requête optimisée côté backend (devis + actions inclus)
      const res = await fetch(`${API_URL}/prospects/enriched`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await res.json();
      // Robustesse : si le backend renvoie une erreur (objet) au lieu d'un tableau, ne pas
      // injecter un non-tableau dans l'état (sinon `.filter`/`.map` plantent tout l'App).
      const list = Array.isArray(data) ? data : [];

      setProspects(list);

      // Pré-alimenter prospectActionsInfo depuis les données enrichies (évite N requêtes)
      const actionsMap = {};
      list.forEach(p => {
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

  // Au login : charge prospects + référentiels (users, codes NAF).
  React.useEffect(() => {
    if (user) {
      fetchProspects();
      fetch(`${API_URL}/users`, { headers: { 'Authorization': `Bearer ${user.token}` } })
        .then(r => r.json()).then(data => { if (Array.isArray(data)) setAppUsers(data); });
      fetch(`${API_URL}/codes-naf`, { headers: { 'Authorization': `Bearer ${user.token}` } })
        .then(r => r.json()).then(data => { if (Array.isArray(data)) setCodesNaf(data); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return {
    prospects, setProspects,
    codesNaf, setCodesNaf,
    appUsers, setAppUsers,
    prospectActionsInfo, setProspectActionsInfo,
    fetchProspects,
  };
}
