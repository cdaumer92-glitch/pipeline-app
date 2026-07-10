import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Mock fetch par défaut : les composants chargent des listes au montage (devis, actions, users…).
// On renvoie un tableau vide + un objet vide pour couvrir les deux formes attendues.
global.fetch = vi.fn(() => Promise.resolve({
  ok: true,
  status: 200,
  json: () => Promise.resolve([]),
  text: () => Promise.resolve(''),
}))

// showToast est fourni en prod par le ToastProvider (via window). En test on le neutralise.
window.showToast = () => {}

// matchMedia n'existe pas dans jsdom.
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks() // conserve l'implémentation par défaut de fetch, remet juste les compteurs à zéro
})
