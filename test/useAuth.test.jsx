import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAuth } from '../src/hooks/useAuth.js'

beforeEach(() => { localStorage.clear() })

describe('useAuth', () => {
  it('user null au démarrage sans session', () => {
    const { result } = renderHook(() => useAuth('/api'))
    expect(result.current.user).toBeNull()
    expect(typeof result.current.handleLogin).toBe('function')
    expect(typeof result.current.setUser).toBe('function')
  })

  it('restaure la session depuis localStorage au montage', async () => {
    localStorage.setItem('user', JSON.stringify({ name: 'Christian', token: 'tok' }))
    const { result } = renderHook(() => useAuth('/api'))
    await waitFor(() => expect(result.current.user?.name).toBe('Christian'))
  })

  it('handleLogin pose le user et le persiste dans localStorage', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'jwt', user: { id: 1, name: 'Christian' } }) }))
    const { result } = renderHook(() => useAuth('/api'))
    await act(async () => { await result.current.handleLogin('c@x.fr', 'pw', '', false) })
    expect(result.current.user).toMatchObject({ name: 'Christian', token: 'jwt' })
    expect(JSON.parse(localStorage.getItem('user')).token).toBe('jwt')
  })
})
