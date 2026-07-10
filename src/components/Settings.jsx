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

      React.useEffect(() => {
        fetchUsers();
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
          </div>
        </div>
      );
    }


    // ══════════════════════════════════════════════════
    // COMPOSANT : SuspectsNonAttribuesPanel
    // ══════════════════════════════════════════════════
