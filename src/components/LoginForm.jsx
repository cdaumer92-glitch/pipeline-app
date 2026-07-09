import * as React from 'react';
import { styles } from '../lib/styles.js';

export function LoginForm({ onLogin }) {
      const [email, setEmail] = React.useState('');
      const [password, setPassword] = React.useState('');
      const [name, setName] = React.useState('');
      const [isRegister, setIsRegister] = React.useState(false);

      const handleSubmit = (e) => {
        e.preventDefault();
        onLogin(email, password, name, isRegister);
      };

      return (
        <div style={styles.loginContainer}>
          <div style={styles.loginBox}>
            <h2>Pipeline TexasWin</h2>
            <form onSubmit={handleSubmit} style={styles.form}>
              {isRegister && (
                <input
                  type="text"
                  placeholder="Nom complet"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={styles.input}
                  required
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                required
              />
              <input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                required
              />
              <button type="submit" style={styles.submitBtn}>
                {isRegister ? 'S\'inscrire' : 'Se connecter'}
              </button>
            </form>
            <p style={styles.toggleAuth}>
              {isRegister ? 'Déjà inscrit?' : 'Pas encore inscrit?'}{' '}
              <a href="#" onClick={(e) => {
                e.preventDefault();
                setIsRegister(!isRegister);
              }} style={styles.link}>
                {isRegister ? 'Se connecter' : 'S\'inscrire'}
              </a>
            </p>
          </div>
        </div>
      );
    }
