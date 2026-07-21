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
  it('somme toutes les affaires au lieu d\'un seul devis', () => {
    renderKanban([cuirco]);
    // (5000 + 800*12 + 1200 + 500) + (3000 + 350*12) = 16 300 + 7 200 = 23 500
    expect(screen.getAllByText(/23\s?500,00\s?€/).length).toBeGreaterThan(0);
    // l'ancien montant tronqué ne doit plus apparaître comme total de la carte
    expect(screen.queryByText(/^7\s?200,00\s?€$/)).toBeNull();
  });

  it('exclut les affaires perdues du total', () => {
    renderKanban([homecore]);
    // 10000 + 1200*12 + 2000 + 1000 = 27 400 (l'affaire perdue à 18 800 est ignorée)
    expect(screen.getAllByText(/27\s?400,00\s?€/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/46\s?200,00\s?€/)).toBeNull();
  });

  it('retombe sur les champs real_* quand il n\'y a pas de detail d\'affaires', () => {
    renderKanban([legacy]);
    // 1000 + 100*12 + 200 = 2 400
    expect(screen.getAllByText(/2\s?400,00\s?€/).length).toBeGreaterThan(0);
  });

  it('deplie le detail par affaire (setup / abo mensuel / annuel)', () => {
    renderKanban([cuirco]);
    fireEvent.click(screen.getByText('2 affaires'));
    expect(screen.getByText('Cuirco - Socle Biz')).toBeTruthy();
    expect(screen.getByText('Cuirco - Extension Mag')).toBeTruthy();
    expect(screen.getAllByText('Setup').length).toBe(2);
    expect(screen.getAllByText('Abo mensuel').length).toBe(2);
    expect(screen.getAllByText('Abo annuel').length).toBe(2);
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
