import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { ActionCompleteModal } from '../src/components/ActionCompleteModal.jsx';

const action = {
  id: 42, action_type: 'Relance', planned_date: '2026-07-22',
  prospect_id: 7, affaire_id: 3, actor: 'Roger', contact: 'Marie Durand',
};
const affairesList = [{ id: 3, nom_affaire: 'Refonte ERP' }, { id: 4, nom_affaire: 'Extension Kub' }];
const interlocuteurs = [{ id: 1, nom: 'Marie Durand', fonction: 'DAF' }, { id: 2, nom: 'Paul Martin', fonction: '' }];

describe('ActionCompleteModal — prochaine action', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 99 }) }));
  });

  it('affiche les mêmes champs que le formulaire de création', () => {
    render(<ActionCompleteModal action={action} prospectId={7} API_URL="/api" token="t"
      affairesList={affairesList} interlocuteurs={interlocuteurs} onClose={() => {}} onCompleted={() => {}} />);
    for (const l of ['Type', 'Date prévue', 'Affaire / Marketing', 'De (Acteur)', 'Vers (Contact)', 'Priorité', 'Commentaire']) {
      expect(screen.getByText(l), `champ manquant : ${l}`).toBeTruthy();
    }
  });

  it('préremplit affaire, acteur et contact depuis l\'action terminée', () => {
    const { container } = render(<ActionCompleteModal action={action} prospectId={7} API_URL="/api" token="t"
      affairesList={affairesList} interlocuteurs={interlocuteurs} onClose={() => {}} onCompleted={() => {}} />);
    const selects = [...container.querySelectorAll('select')];
    const vals = selects.map(s => s.value);
    expect(vals).toContain('affaire_3');
    expect(vals).toContain('Roger');
    expect(vals).toContain('Marie Durand');
  });

  it('poste la prochaine action avec tous les champs', async () => {
    const { container } = render(<ActionCompleteModal action={action} prospectId={7} API_URL="/api" token="t"
      affairesList={affairesList} interlocuteurs={interlocuteurs} onClose={() => {}} onCompleted={() => {}} />);
    const ta = [...container.querySelectorAll('textarea')];
    fireEvent.change(ta[ta.length - 1], { target: { value: 'préparer la démo' } });
    fireEvent.click(screen.getByText('Valider'));
    await new Promise(r => setTimeout(r, 30));

    const post = global.fetch.mock.calls.find(c => c[1] && c[1].method === 'POST');
    expect(post, 'aucun POST émis').toBeTruthy();
    expect(post[0]).toBe('/api/prospects/7/next_actions');
    const body = JSON.parse(post[1].body);
    expect(body.affaire_id).toBe(3);
    expect(body.contexte).toBe(null);
    expect(body.actor).toBe('Roger');
    expect(body.contact).toBe('Marie Durand');
    expect(body.completed_note).toBe('préparer la démo');
    expect(body.action_type).toBe('Relance');
    expect(body.priority).toBe(1);
  });

  it('envoie contexte=Marketing quand on choisit Marketing', async () => {
    const mkt = { ...action, affaire_id: null, contexte: 'Marketing' };
    const { container } = render(<ActionCompleteModal action={mkt} prospectId={7} API_URL="/api" token="t"
      affairesList={affairesList} interlocuteurs={interlocuteurs} onClose={() => {}} onCompleted={() => {}} />);
    fireEvent.click(screen.getByText('Valider'));
    await new Promise(r => setTimeout(r, 30));
    const post = global.fetch.mock.calls.find(c => c[1] && c[1].method === 'POST');
    const body = JSON.parse(post[1].body);
    expect(body.contexte).toBe('Marketing');
    expect(body.affaire_id).toBe(null);
  });
});
