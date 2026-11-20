// Tiny formatting + routing words shared by every verse and sheet.
import { crewById } from '../crew'

export const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

export const first = (id: string) => crewById(id).name.split(' ')[0]

export type Verse = 'home' | 'bills' | 'wall'

export const pathFor = (v: Verse) => (v === 'home' ? '/' : v === 'bills' ? '/fridge' : '/go-tos')

export const verseFor = (p: string): Verse => (p === 'fridge' ? 'bills' : p === 'go-tos' ? 'wall' : 'home')

export const verseFromLocation = (): Verse => verseFor(window.location.pathname.replace(/^\//, ''))

// UPI deep link: opens GPay/PhonePe with the person + exact amount filled in.
export const payLink = (upi: Record<string, string>, to: string, amount: number) =>
  `upi://pay?pa=${encodeURIComponent(upi[to])}&pn=${encodeURIComponent(first(to))}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('UntilManali')}`
