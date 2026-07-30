import * as React from 'react';
import { API_URL } from '../lib/constants.js';

export function Settings({ onClose, user }) {
      const [users, setUsers] = React.useState([]);
      const [newUserEmail, setNewUserEmail] = React.useState('');
      const [newUserPassword, setNewUserPassword] = React.useState('');
      const [newUserName, setNewUserName] = React.useState('');
      const [editingUserId, setEditingUserId] = React.useState(null);
      const [newPassword, setNewPassword] = React.useState('');
      const [showNewPassword, setShowNewPassword] = React.useState(false);
      const [showPassword, setShowPassword] = React.useState({});
      const [showTempPassword, setShowTempPassword] = React.useState({});

      // ── Doublons de contacts (fusion admin) ──
      const [doublons, setDoublons] = React.useState(null); // null = pas encore chargé
      const [keepChoice, setKeepChoice] = React.useState({}); // { cle: interlocuteur_id à garder }
      const [fusionEnCours, setFusionEnCours] = React.useState(null); // cle du groupe en cours de fusion

      const fetchDoublons = async () => {
        try {
          const res = await fetch(`${API_URL}/interlocuteurs/doublons`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          if (res.ok) setDoublons(await res.json());
          else setDoublons([]);
        } catch (err) { console.error('Erreur doublons:', err); setDoublons([]); }
      };

      const handleFusionner = async (groupe) => {
        const keepId = keepChoice[groupe.cle] || groupe.contacts[0].id;
        const mergeIds = groupe.contacts.map(c => c.id).filter(id => id !== keepId);
        const keep = groupe.contacts.find(c => c.id === keepId);
        if (!window.confirm(`Fusionner ${mergeIds.length} fiche(s) dans « ${[keep.prenom, keep.nom].filter(Boolean).join(' ')} » ? Les rattachements sociétés et l'historique RGPD seront conservés.`)) return;
        setFusionEnCours(groupe.cle);
        try {
          const res = await fetch(`${API_URL}/interlocuteurs/fusionner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
            body: JSON.stringify({ keep_id: keepId, merge_ids: mergeIds })
          });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + res.status)); }
          window.showToast({ title: 'Fiches fusionnées', type: 'success' });
          await fetchDoublons();
        } catch (err) {
          window.showToast({ title: 'Erreur fusion : ' + err.message, type: 'error' });
        } finally {
          setFusionEnCours(null);
        }
      };

      React.useEffect(() => {
        fetchUsers();
        fetchDoublons();
      }, []);

      const fetchUsers = async () => {
        try {
          const res = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setUsers(data);
          }
        } catch (err) {
          console.error('Erreur:', err);
        }
      };

      const handleCreateUser = async () => {
        if (!newUserEmail || !newUserPassword || !newUserName) {
          window.showToast({title:'Remplissez tous les champs', type:'warning'});
          return;
        }
        try {
          const res = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ email: newUserEmail, password: newUserPassword, name: newUserName })
          });
          if (res.ok) {
            setNewUserEmail('');
            setNewUserPassword('');
            setNewUserName('');
            fetchUsers();
          } else {
            window.showToast({title:'Erreur: ' + (await res.text()), type:'error'});
          }
        } catch (err) {
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleChangePassword = async (userId) => {
        if (!newPassword) {
          window.showToast({title:'Entrez un nouveau mot de passe', type:'info'});
          return;
        }
        try {
          const res = await fetch(`${API_URL}/users/${userId}/password`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ password: newPassword })
          });
          if (res.ok) {
            setEditingUserId(null);
            setNewPassword('');
            fetchUsers();
            window.showToast({title:'Mot de passe modifié', type:'success'});
          } else {
            window.showToast({title:'Erreur: ' + (await res.text()), type:'error'});
          }
        } catch (err) {
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const handleDeleteUser = async (userId, userName) => {
        if (window.confirm(`Êtes-vous sûr de vouloir supprimer ${userName} ?`)) {
          try {
            const res = await fetch(`${API_URL}/users/${userId}`, {
              method: 'DELETE',
              headers: { 
                'Authorization': `Bearer ${user.token}`
              }
            });
            if (res.ok) {
              fetchUsers();
              window.showToast({title:'Utilisateur supprimé', type:'success'});
            } else {
              window.showToast({title:'Erreur: ' + (await res.text()), type:'error'});
            }
          } catch (err) {
            window.showToast({title:'Erreur: ' + err.message, type:'error'});
          }
        }
      };

      return (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000}}>
          <div style={{backgroundColor: 'white', borderRadius: '8px', padding: '30px', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h2 style={{margin: 0}}>Gestion des comptes</h2>
              <button onClick={onClose} style={{backgroundColor: '#ccc', border: 'none', borderRadius: '4px', padding: '8px 12px', cursor: 'pointer', fontSize: '16px'}}>✕</button>
            </div>

            {/* Créer un nouvel utilisateur */}
            <div style={{backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '20px'}}>
              <h3>Créer un nouveau compte</h3>
              <input
                type="email"
                placeholder="Email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                style={{width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box'}}
              />
              <input
                type="text"
                placeholder="Nom complet"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                style={{width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box'}}
              />
              <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px'}}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Mot de passe"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  style={{flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box'}}
                />
                <input
                  type="checkbox"
                  checked={showNewPassword}
                  onChange={(e) => setShowNewPassword(e.target.checked)}
                  style={{cursor: 'pointer'}}
                  title="Afficher le mot de passe"
                />
              </div>
              <button onClick={handleCreateUser} style={{backgroundColor: '#10a0dc', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>Créer</button>
            </div>

            {/* Liste des utilisateurs */}
            <div>
              <h3>Utilisateurs existants</h3>
              {users.map(u => (
                <div key={u.id} style={{backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '10px'}}>
                  <div style={{marginBottom: '10px'}}>
                    <strong>{u.name}</strong> ({u.email})
                  </div>
                  {u.temp_password && (
                    <div style={{backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px', marginBottom: '10px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>
                        <strong>Mot de passe temporaire:</strong> {showTempPassword[u.id] ? u.temp_password : '••••••••••••'}
                      </span>
                      <button onClick={() => setShowTempPassword({...showTempPassword, [u.id]: !showTempPassword[u.id]})} style={{backgroundColor: '#ffc107', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}>
                        {showTempPassword[u.id] ? 'Masquer' : 'Voir'}
                      </button>
                    </div>
                  )}
                  {editingUserId === u.id ? (
                    <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                      <input
                        type={showPassword[u.id] ? "text" : "password"}
                        placeholder="Nouveau mot de passe"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        style={{flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: '4px'}}
                      />
                      <button
                        onClick={() => setShowPassword({...showPassword, [u.id]: !showPassword[u.id]})}
                        style={{backgroundColor: '#17a2b8', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'}}
                      >
                        {showPassword[u.id] ? 'Masquer' : 'Voir'}
                      </button>
                      <button onClick={() => handleChangePassword(u.id)} style={{backgroundColor: '#10a0dc', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '4px', cursor: 'pointer'}}>Valider</button>
                      <button onClick={() => {setEditingUserId(null); setNewPassword('');}} style={{backgroundColor: '#ccc', border: 'none', padding: '10px 15px', borderRadius: '4px', cursor: 'pointer'}}>Annuler</button>
                    </div>
                  ) : (
                    <div style={{display: 'flex', gap: '10px'}}>
                      <button onClick={() => setEditingUserId(u.id)} style={{backgroundColor: '#ffc107', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>Modifier mot de passe</button>
                      {u.temp_password && (
                        <button onClick={() => setShowTempPassword({...showTempPassword, [u.id]: !showTempPassword[u.id]})} style={{backgroundColor: '#17a2b8', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>
                          {showTempPassword[u.id] ? 'Masquer mot de passe' : 'Voir mot de passe'}
                        </button>
                      )}
                      {u.name !== 'Christian' && (
                        <button onClick={() => handleDeleteUser(u.id, u.name)} style={{backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>
                          Supprimer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Doublons de contacts : même personne présente plusieurs fois dans la base ── */}
            <div style={{marginTop: '25px'}}>
              <h3 style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                Doublons de contacts
                {Array.isArray(doublons) && doublons.length > 0 && (
                  <span style={{fontSize: '12px', fontWeight: 'bold', background: '#e8f6fc', color: '#0d7fb0', padding: '2px 10px', borderRadius: '12px'}}>{doublons.length} groupe(s)</span>
                )}
              </h3>
              <p style={{fontSize: '12px', color: '#888', marginTop: '-5px'}}>
                Fiches distinctes partageant le même email (ou le même nom sans email). La fusion garde une seule fiche : les rattachements sociétés, l'historique RGPD et l'opt-in confirmé sont conservés.
              </p>
              {doublons === null ? (
                <div style={{fontSize: '13px', color: '#888', fontStyle: 'italic'}}>Chargement…</div>
              ) : doublons.length === 0 ? (
                <div style={{fontSize: '13px', color: '#1a8f4c', backgroundColor: '#e7f7ed', padding: '10px', borderRadius: '6px'}}>Aucun doublon détecté.</div>
              ) : doublons.map(g => {
                const keepId = keepChoice[g.cle] || g.contacts[0].id;
                return (
                  <div key={g.cle} style={{backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '10px'}}>
                    <div style={{fontSize: '12px', color: '#888', marginBottom: '8px'}}>
                      {g.cle.startsWith('email:') ? 'Même email : ' + g.cle.slice(6) : 'Même nom : ' + g.cle.slice(4).replace('|', ' ')}
                    </div>
                    {g.contacts.map(c => (
                      <label key={c.id} style={{display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', background: keepId === c.id ? '#e8f6fc' : 'transparent', marginBottom: '4px'}}>
                        <input type="radio" name={'keep_' + g.cle} checked={keepId === c.id}
                          onChange={() => setKeepChoice({...keepChoice, [g.cle]: c.id})}
                          style={{marginTop: '3px'}} />
                        <span style={{fontSize: '13px'}}>
                          <strong>{[c.prenom, c.nom].filter(Boolean).join(' ')}</strong>
                          {c.email && <span style={{color: '#666'}}> · {c.email}</span>}
                          {c.fonction && <span style={{color: '#666'}}> · {c.fonction}</span>}
                          <br/>
                          <span style={{fontSize: '12px', color: '#0d7fb0'}}>
                            {[c.societe_principale, ...(c.autres_societes || [])].filter(Boolean).join(' · ') || 'Aucune société'}
                          </span>
                          {c.optin_confirme_at && <span style={{fontSize: '11px', color: '#1a8f4c', fontWeight: 'bold'}}> · opt-in confirmé</span>}
                          <span style={{fontSize: '11px', color: '#aaa'}}> · créé le {c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '?'}</span>
                        </span>
                      </label>
                    ))}
                    <button onClick={() => handleFusionner(g)} disabled={fusionEnCours === g.cle}
                      style={{backgroundColor: '#10a0dc', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '6px', opacity: fusionEnCours === g.cle ? 0.6 : 1}}>
                      {fusionEnCours === g.cle ? 'Fusion…' : 'Fusionner en gardant la fiche sélectionnée'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }


    // ══════════════════════════════════════════════════
    // COMPOSANT : SuspectsNonAttribuesPanel
    // ══════════════════════════════════════════════════
