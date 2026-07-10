import { describe, it, expect } from 'vitest'
import { effectiveStatus } from '../src/components/KanbanView.jsx'

// Statut "effectif" du Kanban : statut manuel corrigé par la réalité du devis en cours.
describe('effectiveStatus', () => {
  it('sans devis : garde le statut manuel', () => {
    expect(effectiveStatus({ status: 'Prospection' })).toBe('Prospection')
    expect(effectiveStatus({ status: 'Négociation' })).toBe('Négociation')
    expect(effectiveStatus({})).toBe('Prospection')
  })

  it("devis actif + statut 'Prospection' → passe en 'Devis' (le cas ARSENE)", () => {
    expect(effectiveStatus({ status: 'Prospection', real_status: 'Envoyé' })).toBe('Devis')
    expect(effectiveStatus({ status: 'Prospection', real_status: 'En cours' })).toBe('Devis')
  })

  it('conserve un stade manuel plus avancé que Devis', () => {
    expect(effectiveStatus({ status: 'Démo', real_status: 'Envoyé' })).toBe('Démo')
    expect(effectiveStatus({ status: 'Négociation', real_status: 'En cours' })).toBe('Négociation')
    expect(effectiveStatus({ status: 'Signé', real_status: 'En cours' })).toBe('Signé')
  })

  it('devis Gagné → Signé ; devis terminal → colonne correspondante', () => {
    expect(effectiveStatus({ status: 'Prospection', real_status: 'Gagné' })).toBe('Signé')
    expect(effectiveStatus({ status: 'Devis', real_status: 'Perdu' })).toBe('Perdu')
    expect(effectiveStatus({ status: 'Prospection', real_status: 'Ajourné N+1' })).toBe('Ajourné N+1')
    expect(effectiveStatus({ status: 'Devis', real_status: 'Éliminé par nous' })).toBe('Éliminé par nous')
  })

  it('statut terminal saisi à la main : respecté malgré un devis', () => {
    expect(effectiveStatus({ status: 'Éliminé par nous', real_status: 'Envoyé' })).toBe('Éliminé par nous')
    expect(effectiveStatus({ status: 'Ajourné N+1', real_status: 'En cours' })).toBe('Ajourné N+1')
  })
})
