import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDevisAffaires } from '../src/hooks/useDevisAffaires.js'

// Ce test est un FILET DE SÉCURITÉ pour l'extraction du hook : il exécute chaque handler
// pour attraper toute dépendance oubliée lors du déplacement (un symbole hors scope lève
// un ReferenceError). Le build ne détecte pas ce cas (globals non définis) — d'où ce test.
// Les autres erreurs (données mockées incomplètes) sont tolérées : seul ReferenceError échoue.

const user = { token: 'tok', name: 'Christian' }
const selectedProspect = { id: 1, name: 'Acme', siren: '123456789' }

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('') }))
  window.confirm = () => true
})

// Exécute fn ; ne laisse remonter QUE les ReferenceError (= dépendance manquante).
async function noRefError(fn) {
  try { await fn() }
  catch (e) { if (e instanceof ReferenceError) throw e }
}

describe('useDevisAffaires — filet anti-dépendance-manquante', () => {
  it('expose l\'état initial et l\'API attendue', () => {
    const { result } = renderHook(() => useDevisAffaires({ user, API_URL: '/api', selectedProspect }))
    expect(result.current.devisList).toEqual([])
    expect(result.current.affairesList).toEqual([])
    expect(result.current.showDevisForm).toBe(false)
    expect(typeof result.current.fetchDevis).toBe('function')
    expect(typeof result.current.handleSaveDevis).toBe('function')
    expect(typeof result.current.fetchAffaires).toBe('function')
    expect(typeof result.current.handleSaveAffaire).toBe('function')
  })

  it('chaque handler s\'exécute sans ReferenceError (aucune dépendance oubliée)', async () => {
    // Les handlers avalent leurs erreurs dans un try/catch + console.error : on espionne
    // console.error pour détecter AUSSI les ReferenceError avalées (pas seulement celles qui remontent).
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchAllActions = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useDevisAffaires({ user, API_URL: '/api', selectedProspect, fetchAllActions }))
    const r = () => result.current

    await act(async () => {
      // Devis — synchrones (ouverture form / édition)
      await noRefError(() => r().handleAddDevis())
      await noRefError(() => r().handleAddDevisLibre())
      await noRefError(() => r().handleAddDevisTexasWin())
      await noRefError(() => r().handleEditDevis({ id: 1, devis_status: 'Envoyé', chance_percent: 50, quote_date: '2024-01-01' }))
      // Devis — asynchrones
      await noRefError(() => r().fetchDevis(1))
      await noRefError(() => r().handleSaveDevis())
      await noRefError(() => r().handleQuickDevisStatus(1, 'Signé'))
      await noRefError(() => r().handleSaveMotifPerte(1, 'trop cher', 1))
      await noRefError(() => r().handleAnnulerRemplacer(1))
      await noRefError(() => r().handleDeleteDevis(1))
      await noRefError(() => r().handleUploadDevisPdf(1))
      await noRefError(() => r().handleUploadDevisPdfDirect(1, { name: 'x.pdf' }))
      await noRefError(() => r().handleDeleteDevisPDF(1))
      await noRefError(() => r().handleRattacherDevisAffaire(1, 1))
      // Affaires
      await noRefError(() => r().fetchAffaires(1))
      await noRefError(() => r().handleAddAffaire())
      await noRefError(() => r().handleEditAffaire({ id: 1, nom_affaire: 'Deal' }))
      await noRefError(() => r().handleSaveAffaire())
      await noRefError(() => r().handleDeleteAffaire(1))
      await noRefError(() => r().handleOpenActionAffaireForm(1))
      await noRefError(() => r().handleSaveActionAffaire())
      await noRefError(() => r().handleToggleActionAffaire(1, false, 1))
      await noRefError(() => r().handleDeleteActionAffaire(1, 1))
    })

    // ReferenceError avalées par les try/catch des handlers (loggées via console.error).
    const refErrors = errSpy.mock.calls.flat().filter(a => a instanceof ReferenceError)
    errSpy.mockRestore()
    expect(refErrors.map(e => e.message)).toEqual([])
  })
})
