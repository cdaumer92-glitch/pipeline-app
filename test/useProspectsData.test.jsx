import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProspectsData } from '../src/hooks/useProspectsData.js'

describe('useProspectsData', () => {
  it('sans user : états vides, aucun fetch, API exposée', () => {
    const { result } = renderHook(() => useProspectsData(null, '/api'))
    expect(result.current.prospects).toEqual([])
    expect(result.current.codesNaf).toEqual([])
    expect(result.current.appUsers).toEqual([])
    expect(result.current.prospectActionsInfo).toEqual({})
    expect(typeof result.current.fetchProspects).toBe('function')
    expect(typeof result.current.setProspects).toBe('function')
  })

  it('avec user : charge les prospects enrichis et dérive prospectActionsInfo', async () => {
    const enriched = [
      { id: 1, name: 'Acme', action_has_action: true, action_next_is_late: true, action_next_date: '2024-01-01', action_next_type: 'Appel' },
      { id: 2, name: 'Globex', action_has_action: false },
    ]
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/prospects/enriched')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(enriched) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    })
    const user = { token: 'tok', name: 'Christian' }
    const { result } = renderHook(() => useProspectsData(user, '/api'))

    await waitFor(() => expect(result.current.prospects.length).toBe(2))
    expect(result.current.prospectActionsInfo[1].hasAction).toBe(true)
    expect(result.current.prospectActionsInfo[1].isLate).toBe(true)
    expect(result.current.prospectActionsInfo[1].nextActionType).toBe('Appel')
    expect(result.current.prospectActionsInfo[2].hasAction).toBe(false)
  })
})
