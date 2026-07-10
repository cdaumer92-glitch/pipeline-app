import * as React from 'react';

// Authentification : état `user` (session JWT), restauration depuis localStorage au
// démarrage, et handleLogin (login/register). Extrait de App à l'identique. Doit être
// le PREMIER hook appelé dans App car `user` alimente tous les autres hooks.
// Le logout reste inline côté JSX (localStorage.removeItem + setUser(null)).
export function useAuth(API_URL) {
  const [user, setUser] = React.useState(null);

  // Au démarrage : restaure la session depuis localStorage.
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
        window.showToast({ title: 'Erreur: ' + data.error, type: 'error' });
      }
    } catch (err) {
      window.showToast({ title: 'Erreur connexion: ' + err.message, type: 'error' });
    }
  };

  return { user, setUser, handleLogin };
}
