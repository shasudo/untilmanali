export type Expense = {
  id: number
  title: string
  amount: number
  paidBy: string
  split: 'equal' | 'custom' | 'percent'
  shares: Record<string, number>
  involved: string[]
  breakdown: Record<string, number>
  createdAt: string
}

export type LogEntry = {
  id: number
  text: string
  createdAt: string
}

export type Memory = {
  id: number
  author: string
  text: string
  color: string
  done: number
  createdAt: string
}

export type Balances = {
  totals: Record<string, number>
  net: Record<string, number>
  debts: { from: string; to: string; amount: number }[]
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(base64.replace(/-/g, '+').replace(/_/g, '/') + padding)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function req(path: string, opts?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts?.headers || {}) },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  list: () => req('/api/v1/expenses') as Promise<{ expenses: Expense[] }>,
  balances: () => req('/api/v1/balances') as Promise<Balances>,
  add: (b: { title: string; amount: number; paidBy: string; split: string; involved: string[]; shares?: Record<string, number> }) =>
    req('/api/v1/expenses', { method: 'POST', body: JSON.stringify(b) }),
  remove: (id: number) => req(`/api/v1/expenses/${id}`, { method: 'DELETE' }),
  settle: (b: { from: string; to: string; amount: number }) =>
    req('/api/v1/settle', { method: 'POST', body: JSON.stringify(b) }),
  wall: () => req('/api/v1/memories') as Promise<{ memories: Memory[] }>,
  pin: (b: { author: string; text: string; color: string }) =>
    req('/api/v1/memories', { method: 'POST', body: JSON.stringify(b) }),
  cross: (id: number, done: boolean) =>
    req(`/api/v1/memories/${id}`, { method: 'PATCH', body: JSON.stringify({ done }) }),
  unpin: (id: number) => req(`/api/v1/memories/${id}`, { method: 'DELETE' }),
  pushKey: () => req('/api/v1/push/key') as Promise<{ key: string }>,
  sub: (b: { subscription: unknown; crew: string }) =>
    req('/api/v1/push/subscribe', { method: 'POST', body: JSON.stringify(b) }),
  unsub: (endpoint: string) =>
    req('/api/v1/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  log: () => req('/api/v1/changelog') as Promise<{ entries: LogEntry[] }>,
  addLog: (text: string, key?: string) =>
    req('/api/v1/changelog', { method: 'POST', body: JSON.stringify({ text }), headers: key ? { 'x-dev-key': key } : {} }),
  upi: () => req('/api/v1/upi') as Promise<{ handles: Record<string, string> }>,
  setUpi: (crew: string, vpa: string) =>
    req('/api/v1/upi', { method: 'POST', body: JSON.stringify({ crew, vpa }) }),
}
