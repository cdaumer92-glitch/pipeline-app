import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSocieteInfo } from '../src/hooks/useSocieteInfo.js'

// Filet de sécurité de l'extraction : exécute chaque handler pour attraper toute dépendance
// oubliée (ReferenceError), y compris celles avalées par un try/catch (espion console.error).

const user = { token: 'tok', name: 'Christian' }
const makeDeps = () => ({
  user, API_URL: '/api', prospects: [],
  setProspects: vi.fn(), fetchProspects: vi.fn(() => Promise.resolve()),
  setSelectedProspect: vi.fn(), setFormData: vi.fn(), setShowForm: vi.fn(), setIsDashboard: vi.fn(),
  fetchInterlocuteurs: vi.fn(() => Promise.resolve()),
  fetchDevis: vi.fn(() => Promise.resolve()), fetchAffaires: vi.fn(() => Promise.resolve()),
})

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 1 }), text: () => Promise.resolve('') }))
  window.confirm = () => true
  // Mock de l'API SocieteInfo (window.SInfo) : companyToProspect est synchrone, le reste async.
  const base = { companyToProspect: () => ({ name: 'Acme', siren: '123456789', _mapped: {} }) }
  window.SInfo = new Proxy(base, {
    get(t, k) { return k in t ? t[k] : () => Promise.resolve({ result: { organization: { name: 'Acme' }, registration_number: '123456789' }, results: [], contacts: [], company: {}, data: [] }) }
  })
})

async function noRefError(fn) { try { await fn() } catch (e) { if (e instanceof ReferenceError) throw e } }

describe('useSocieteInfo — filet anti-dépendance-manquante', () => {
  it('expose l\'état et l\'API attendus', () => {
    const { result } = renderHook(() => useSocieteInfo(makeDeps()))
    expect(result.current.showSInfoModal).toBe(false)
    expect(result.current.sInfoResults).toEqual([])
    expect(result.current.newCompanyData.name).toBe('')
    expect(typeof result.current.openSInfoSearch).toBe('function')
    expect(typeof result.current.handleCreateFromModal).toBe('function')
    expect(typeof result.current.handleSInfoConfirmContacts).toBe('function')
  })

  it('chaque handler s\'exécute sans ReferenceError', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useSocieteInfo(makeDeps()))
    const r = () => result.current
    const company = { registration_number: '123456789', organization: { name: 'Acme' } }

    await act(async () => {
      await noRefError(() => r().handleNewCompanyChange('name', 'Acme'))
      await noRefError(() => r().handleNewCompanyChange('statut_societe', 'Prospect'))
      await noRefError(() => r().handleNewCompanyChange('assigned_to', 'Christian'))
      await noRefError(() => r().openSInfoSearch(''))
      await noRefError(() => r().openSInfoSearch('acme'))
      await noRefError(() => r().openSInfoEnrich({ id: 1, name: 'Acme', siren: '123456789' }, 'both'))
      await noRefError(() => r().openEnrichChoice({ id: 1, name: 'Acme', siren: '123456789' }))
      await noRefError(() => r().handleSInfoSearch('acme'))
      await noRefError(() => r().handleSInfoSelect(company))
      await noRefError(() => r().handleSInfoConfirmContacts())
      await noRefError(() => r().applySInfoEnrichment({ id: 1 }, { name: 'Acme' }, [], []))
      await noRefError(() => r().handleSInfoConfirmConflicts())
      await noRefError(() => r().handleCreateFromModal())
    })

    const refErrors = errSpy.mock.calls.flat().filter(a => a instanceof ReferenceError)
    errSpy.mockRestore()
    expect(refErrors.map(e => e.message)).toEqual([])
  })
})
