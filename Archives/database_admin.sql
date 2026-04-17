-- Script SQL pour ajouter la fonctionnalité Admin
-- Exécutez ce script dans votre base de données PostgreSQL

-- 1. Ajouter le champ role à la table users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- 2. Définir votre compte comme admin
-- IMPORTANT: Remplacez 'votre-email@example.com' par votre vrai email
UPDATE users SET role = 'admin' WHERE email = 'votre-email@example.com';

-- 3. Créer la table pour tracker les sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(50),
    is_active BOOLEAN DEFAULT true
);

-- 4. Créer un index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active, login_time DESC);

-- Vérification
SELECT * FROM users WHERE role = 'admin';
