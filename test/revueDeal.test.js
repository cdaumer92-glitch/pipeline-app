import { describe, it, expect } from 'vitest'
import { REVUE_QUESTIONS, emptyReponses, normalizeReponses, computeScore, scoreTone, daysSince, ageLabel, santeDeal } from '../src/lib/revueDeal.js'

// Helpers purs de la revue de deal (score de santé, pastilles).

describe('revue de deal : réponses et score', () => {
  it('six questions, toutes inconnues au départ', () => {
    const r = emptyReponses()
    expect(Object.keys(r)).toEqual(REVUE_QUESTIONS.map(q => q.key))
    expect(computeScore(r)).toBe(0)
  })
  it('le score compte les réponses solides seulement', () => {
    const r = emptyReponses()
    r.douleur = { texte: 'double saisie', etat: 'solide' }
    r.echeance = { texte: 'fin de contrat', etat: 'solide' }
    r.decideur = { texte: 'DAF vue', etat: 'partiel' }
    expect(computeScore(r)).toBe(2)
  })
  it('ignore les clés inconnues et les états invalides', () => {
    const r = normalizeReponses({ douleur: { texte: 'x', etat: 'super' }, autre: { etat: 'solide' }, budget: 'oui' })
    expect(r.douleur).toEqual({ texte: 'x', etat: 'inconnu' })
    expect(r.autre).toBeUndefined()
    expect(r.budget).toEqual({ texte: '', etat: 'inconnu' })
    expect(computeScore({ autre: { etat: 'solide' } })).toBe(0)
  })
})

describe('revue de deal : tonalité et âge', () => {
  it('4 et plus sain, 2 à 3 fragile, moins critique', () => {
    expect(scoreTone(6).label).toBe('sain')
    expect(scoreTone(4).label).toBe('sain')
    expect(scoreTone(3).label).toBe('fragile')
    expect(scoreTone(2).label).toBe('fragile')
    expect(scoreTone(1).label).toBe('critique')
    expect(scoreTone(undefined).label).toBe('critique')
  })
  it('compte les jours entre deux dates civiles', () => {
    const now = new Date(2026, 9, 15, 18, 0)
    expect(daysSince('2026-10-15', now)).toBe(0)
    expect(daysSince(new Date(2026, 9, 14, 23, 30), now)).toBe(1)
    expect(daysSince('2026-09-12', now)).toBe(33)
    expect(daysSince('2026-09-12T00:00:00.000Z', now)).toBe(33) // DATE Postgres sérialisée en ISO
    expect(daysSince(null, now)).toBeNull()
    expect(daysSince('pas une date', now)).toBeNull()
  })
  it('libellés d\'âge', () => {
    expect(ageLabel(0)).toBe("aujourd'hui")
    expect(ageLabel(1)).toBe('hier')
    expect(ageLabel(33)).toBe('il y a 33 jours')
    expect(ageLabel(95)).toBe('il y a 3 mois')
  })
})

describe('revue de deal : pastille de santé', () => {
  const now = new Date(2026, 9, 15)
  it('rien à afficher sans devis ni revue', () => {
    expect(santeDeal({ score: null, date: null, nbDevis: 0 }, now)).toBeNull()
  })
  it('« Jamais revue » en rouge quand il y a un devis', () => {
    const s = santeDeal({ date: null, nbDevis: 2 }, now)
    expect(s.label).toBe('Jamais revue')
    expect(s.stale).toBe(true)
  })
  it('score et âge de la dernière revue', () => {
    const s = santeDeal({ score: 2, date: '2026-09-12', nbDevis: 1 }, now)
    expect(s.label).toBe('Santé 2/6')
    expect(s.tone).toBe('fragile')
    expect(s.days).toBe(33)
    expect(s.stale).toBe(true)
    expect(s.title).toContain('il y a 33 jours')
    const r = santeDeal({ score: 5, date: '2026-10-09', nbDevis: 0 }, now)
    expect(r.label).toBe('Santé 5/6')
    expect(r.stale).toBe(false)
    expect(r.color).toBe('#1d9e75')
  })
})
