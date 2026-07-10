import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useInterlocuteurs } from '../src/hooks/useInterlocuteurs.js'

const user = { token: 'tok', name: 'Christian' }
const prospect = { id: 7, name: 'Acme' }

describe('useInterlocuteurs', () => {
  it('état initial : liste vide, formulaire vide, API exposée', () => {
    const { result } = renderHook(() => useInterlocuteurs(user, '/api', prospect))
    expect(result.current.interlocuteurs).toEqual([])
    expect(result.current.interlocuteurForm.nom).toBe('')
    expect(result.current.interlocuteurForm.id).toBeNull()
    expect(result.current.showInterlocuteurForm).toBe(false)
    expect(typeof result.current.fetchInterlocuteurs).toBe('function')
    expect(typeof result.current.handleSaveInterlocuteur).toBe('function')
    expect(typeof result.current.handleDeleteInterlocuteur).toBe('function')
  })

  it('fetchInterlocuteurs charge la liste du prospect ciblé', async () => {
    const contacts = [{ id: 1, nom: 'Durand' }, { id: 2, nom: 'Martin' }]
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(contacts) }))
    const { result } = renderHook(() => useInterlocuteurs(user, '/api', prospect))
    await act(async () => { await result.current.fetchInterlocuteurs(7) })
    expect(global.fetch).toHaveBeenCalledWith('/api/prospects/7/interlocuteurs', expect.any(Object))
    await waitFor(() => expect(result.current.interlocuteurs.length).toBe(2))
  })
})
