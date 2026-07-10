import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNextActions } from '../src/hooks/useNextActions.js'

const user = { token: 'tok', name: 'Christian' }
const selectedProspect = { id: 1, name: 'Acme' }
const makeDeps = () => ({
  user, API_URL: '/api', selectedProspect,
  prospectActionsInfo: {}, setProspectActionsInfo: vi.fn(),
})

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('') }))
  window.confirm = () => true
})

async function noRefError(fn) { try { await fn() } catch (e) { if (e instanceof ReferenceError) throw e } }

describe('useNextActions', () => {
  it('expose l\'état et l\'API', () => {
    const { result } = renderHook(() => useNextActions(makeDeps()))
    expect(result.current.nextActions).toEqual([])
    expect(result.current.allActions).toEqual([])
    expect(result.current.newActionType).toBe('Appel')
    expect(typeof result.current.fetchNextActions).toBe('function')
    expect(typeof result.current.handleAddNextAction).toBe('function')
    expect(typeof result.current.handleToggleNextAction).toBe('function')
  })

  it('fetchNextActions charge la liste', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 1, action_type: 'Appel' }]) }))
    const { result } = renderHook(() => useNextActions(makeDeps()))
    await act(async () => { await result.current.fetchNextActions(1) })
    expect(result.current.nextActions.length).toBe(1)
  })

  it('chaque handler s\'exécute sans ReferenceError (aucune dépendance oubliée)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useNextActions(makeDeps()))
    const r = () => result.current
    await act(async () => {
      await noRefError(() => r().fetchNextActions(1))
      await noRefError(() => r().fetchAllActions(1))
      await noRefError(() => r().handleAddNextAction())
      await noRefError(() => r().handleToggleNextAction(1, false, ''))
      await noRefError(() => r().handleToggleNextAction(1, true, 'fait'))
      await noRefError(() => r().handleDeleteNextAction(1))
    })
    const refErrors = errSpy.mock.calls.flat().filter(a => a instanceof ReferenceError)
    errSpy.mockRestore()
    expect(refErrors.map(e => e.message)).toEqual([])
  })
})
