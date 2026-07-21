import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { KanbanView } from '../src/components/KanbanView.jsx';

const user = { id: 1, name: 'Christian', token: 'tok', role: 'admin' };

// Cas signalé en prod : une société avec DEUX affaires signées n'affichait que le
// montant d'un seul devis (l'endpoint enrichi ne renvoie qu'un devis par société).
const cuirco = {
  id: 3, name: 'Cuirco Diffusion', status: 'Signé', assigned_to: 'Roger',
  real_status: 'Gagné',
  // Ancien calcul : ces champs seuls donnaient 3000 + 350*12 = 7 200 €
  real_setup_amount: 3000, real_monthly_amount: 350, real_annual_amount: 0, real_training_amount: 0,
  affaires_detail: [
    { id: 30, nom: 'Cuirco - Socle Biz', statut: 'Gagné', setup: 5000, monthly: 800, annual: 1200, training: 500 },
    { id: 31, nom: 'Cuirco - Extension Mag', statut: 'Gagné', setup: 3000, monthly: 350, annual: 0, training: 0 },
  ],
};

// Une affaire perdue est listée au dépliage mais ne compte pas dans le total.
const homecore = {
  id: 2, name: 'Homecore', status: 'Négociation', assigned_to: 'Roger',
  affaires_detail: [
    { id: 20, nom: 'Homecore - ERP', statut: 'En cours', setup: 10000, monthly: 1200, annual: 2000, training: 1000 },
    { id: 21, nom: 'Homecore - Ancien', statut: 'Perdu', setup: 8000, monthly: 900, annual: 0, training: 0 },
  ],
};

// Société sans détail d'affaires : on doit retomber sur l'ancien calcul.
const legacy = {
  id: 9, name: 'Legacy SA', status: 'Devis', assigned_to: 'Roger',
  real_setup_amount: 1000, real_monthly_amount: 100, real_annual_amount: 200, real_training_amount: 0,
};

const renderKanban = (prospects) => render(
  <KanbanView prospects={prospects} user={user} API_URL="/api" onSelectProspect={() => {}} onStatusChanged={() => {}} />
);

describe('KanbanView — montant par société', () => {
  it('affiche 3 chiffres distincts, chacun sommé sur les affaires', () => {
    renderKanban([cuirco]);
    // On ne combine PAS : Setup 5000+3000=8000 · Mensuel 800+350=1150 · Annuel 1200+0=1200
    expect(screen.getAllByText(/8\s?000,00\s?€/).length).toBeGreaterThan(0);      // setup
    expect(screen.getAllByText(/1\s?150,00\s?€\/mois/).length).toBeGreaterThan(0); // mensuel
    expect(screen.getAllByText(/1\s?200,00\s?€\/an/).length).toBeGreaterThan(0);   // annuel
    // l'ancien total combiné (23 500 / 7 200) ne doit plus apparaître
    expect(screen.queryByText(/23\s?500,00\s?€/)).toBeNull();
    expect(screen.queryByText(/^7\s?200,00\s?€$/)).toBeNull();
    // les 3 labels sont présents
    expect(screen.getAllByText('Setup').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mensuel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Annuel').length).toBeGreaterThan(0);
  });

  it('exclut les affaires perdues de chaque chiffre', () => {
    renderKanban([homecore]);
    // Seule l'affaire En cours compte : Setup 10000 · Mensuel 1200 · Annuel 2000
    // (l'affaire perdue à 8000/900 est ignorée)
    expect(screen.getAllByText(/10\s?000,00\s?€/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\s?200,00\s?€\/mois/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2\s?000,00\s?€\/an/).length).toBeGreaterThan(0);
    // le setup de l'affaire perdue ne doit pas gonfler le total (10000, pas 18000)
    expect(screen.queryByText(/18\s?000,00\s?€/)).toBeNull();
  });

  it('retombe sur les champs real_* quand il n\'y a pas de detail d\'affaires', () => {
    renderKanban([legacy]);
    // Setup 1000 · Mensuel 100 · Annuel 200
    expect(screen.getAllByText(/1\s?000,00\s?€/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/100,00\s?€\/mois/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/200,00\s?€\/an/).length).toBeGreaterThan(0);
  });

  it('deplie le detail par affaire (3 chiffres chacun)', () => {
    renderKanban([cuirco]);
    fireEvent.click(screen.getByText('2 affaires'));
    expect(screen.getByText('Cuirco - Socle Biz')).toBeTruthy();
    expect(screen.getByText('Cuirco - Extension Mag')).toBeTruthy();
    // En-tête de colonne (1) + carte (1) + 2 affaires dépliées = 4 blocs
    expect(screen.getAllByText('Setup').length).toBe(4);
    expect(screen.getAllByText('Mensuel').length).toBe(4);
    expect(screen.getAllByText('Annuel').length).toBe(4);
  });

  it('marque l\'affaire perdue comme hors total dans le detail', () => {
    renderKanban([homecore]);
    fireEvent.click(screen.getByText('2 affaires'));
    expect(screen.getByText(/Perdu · hors total/)).toBeTruthy();
  });

  it('n\'affiche pas de bouton de depliage sans affaire', () => {
    renderKanban([legacy]);
    expect(screen.queryByText(/affaires?$/)).toBeNull();
  });
});
