import { describe, it, expect } from 'vitest'
import {
  calculateTotal,
  getStatusColor,
  prospectDisplayName,
  displayName,
  displayInitials,
  getActionStatus,
  getProspectCountByCommercial,
  getProspectRealStatus,
  buildInfoForm,
  formatCurrency,
} from '../src/lib/shared.jsx'

// Tests des helpers purs (aucun rendu React) : rapides et déterministes.

describe('calculateTotal', () => {
  it('somme setup + mensuel×12 + annuel + formation', () => {
    const p = { setup_amount: 1000, monthly_amount: 100, annual_amount: 500, training_amount: 200 }
    expect(calculateTotal(p)).toBe(1000 + 1200 + 500 + 200)
  })
  it('tolère les montants manquants', () => {
    expect(calculateTotal({ monthly_amount: 0 })).toBe(0)
  })
})

describe('getStatusColor', () => {
  it('renvoie la couleur connue du statut', () => {
    expect(getStatusColor('Signé')).toBe('#3cd6b9')
  })
  it('renvoie une couleur par défaut pour un statut inconnu', () => {
    expect(getStatusColor('Inexistant')).toBe('#666')
  })
})

describe('prospectDisplayName', () => {
  it('ajoute les marques entre parenthèses', () => {
    expect(prospectDisplayName({ name: 'Acme', marques: ['A', 'B'] })).toBe('Acme (A / B)')
  })
  it('renvoie le nom seul sans marque', () => {
    expect(prospectDisplayName({ name: 'Acme', marques: [] })).toBe('Acme')
  })
  it('renvoie chaîne vide si null', () => {
    expect(prospectDisplayName(null)).toBe('')
  })
})

describe('displayName / displayInitials', () => {
  it('concatène prénom et nom', () => {
    expect(displayName({ prenom: 'Jean', nom: 'Dupont' })).toBe('Jean Dupont')
  })
  it('initiales = 1re lettre prénom + 1re lettre nom', () => {
    expect(displayInitials({ prenom: 'Jean', nom: 'Dupont' })).toBe('JD')
  })
  it('initiales de secours si contact vide', () => {
    expect(displayInitials(null)).toBe('?')
  })
})

describe('getActionStatus', () => {
  it('aucune action', () => {
    expect(getActionStatus([])).toEqual({ hasAction: false, isLate: false, nextActionDate: null })
  })
  it('détecte une action en retard (date passée, non complétée)', () => {
    const r = getActionStatus([{ planned_date: '2000-01-01', completed: false }])
    expect(r.hasAction).toBe(true)
    expect(r.isLate).toBe(true)
  })
  it('action future non en retard', () => {
    const r = getActionStatus([{ planned_date: '2999-01-01', completed: false }])
    expect(r.hasAction).toBe(true)
    expect(r.isLate).toBe(false)
  })
  it('ignore les actions complétées', () => {
    const r = getActionStatus([{ planned_date: '2000-01-01', completed: true }])
    expect(r.hasAction).toBe(false)
  })
})

describe('getProspectCountByCommercial', () => {
  const prospects = [
    { assigned_to: 'Alice' }, { assigned_to: 'Bob' }, { assigned_to: 'Alice' },
  ]
  it('compte tous les prospects avec "Tous"', () => {
    expect(getProspectCountByCommercial(prospects, 'Tous')).toBe(3)
  })
  it('compte par commercial', () => {
    expect(getProspectCountByCommercial(prospects, 'Alice')).toBe(2)
  })
})

describe('getProspectRealStatus', () => {
  it('null si aucune affaire', () => {
    expect(getProspectRealStatus([], [])).toBeNull()
  })
  it('null si affaires toutes terminées', () => {
    const affaires = [{ id: 1, statut_global: 'Gagné' }]
    expect(getProspectRealStatus(affaires, [{ affaire_id: 1 }])).toBeNull()
  })
  it('renvoie le statut du dernier devis de l’affaire en cours', () => {
    const affaires = [{ id: 1, statut_global: 'En cours', nom_affaire: 'Deal' }]
    const devis = [
      { affaire_id: 1, devis_status: 'Envoyé', chance_percent: 40, quote_date: '2024-01-01' },
      { affaire_id: 1, devis_status: 'Signé', chance_percent: 90, quote_date: '2024-06-01' },
    ]
    const r = getProspectRealStatus(affaires, devis)
    expect(r.affaireName).toBe('Deal')
    expect(r.devisStatus).toBe('Signé') // le plus récent
  })
})

describe('buildInfoForm', () => {
  it('normalise un prospect en formulaire (valeurs par défaut)', () => {
    const f = buildInfoForm(null)
    expect(f.name).toBe('')
    expect(Array.isArray(f.marques)).toBe(true)
  })
})

describe('formatCurrency', () => {
  it('formate en euros (contient le symbole €)', () => {
    expect(formatCurrency(1000)).toMatch(/€/)
  })
})
