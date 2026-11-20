export const CREW = [
  { id: 'shathwik', name: 'Shathwik', color: '#d8ff3e', tag: 'SH' },
  { id: 'koushik', name: 'Koushik', color: '#ff5c1f', tag: 'KO' },
  { id: 'deepika', name: 'Deepika', color: '#7ef0c1', tag: 'DE' },
  { id: 'srinivas', name: 'Srinivas', color: '#ffd23e', tag: 'SR' },
  { id: 'rushi', name: 'Rushi (CR)', color: '#ff7ab8', tag: 'RU' },
  { id: 'sonika', name: 'Sonika', color: '#8ec5ff', tag: 'SO' },
] as const

export type CrewId = (typeof CREW)[number]['id']

export const crewById = (id: string) =>
  CREW.find((c) => c.id === id) ?? CREW[0]

export const ME_KEY = 'untilmanali.me'

// Sticky-note palette. Server mirrors it in server.js for validation;
// drift is harmless there (unknown colors fall back to the first).
export const WALL_COLORS = ['#d8ff3e', '#ff5c1f', '#7ef0c1', '#ffd23e', '#ff7ab8', '#8ec5ff']
