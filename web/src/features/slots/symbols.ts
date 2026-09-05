// Символы барабанов. ПОРЯДОК ЗАФИКСИРОВАН: база хранит индексы, а slot_pull
// в schema.sql знает, что 5 — корона (джекпот) и 7 — череп (проклятие).
// Переставить или вставить символ в середину — значит переименовать все
// старые рывки в ленте и сломать подсчёт исхода на сервере.
import type { SlotOutcome } from '../../lib/types'

export const SLOT_SYMBOLS = ['🐉', '⚔️', '🛡️', '💰', '🧪', '👑', '🎲', '💀'] as const

export const SLOT_REELS = 3

// Что говорит автомат, когда барабаны встали. Слово одно на всех — исход
// присылает сервер, здесь только его подпись и цвет.
export const SLOT_OUTCOMES: Record<SlotOutcome, { text: string; cls: string }> = {
  none: { text: 'Мимо', cls: 'slots-outcome-none' },
  pair: { text: 'Пара!', cls: 'slots-outcome-pair' },
  triple: { text: 'Три в ряд!', cls: 'slots-outcome-triple' },
  jackpot: { text: '👑 ДЖЕКПОТ! 👑', cls: 'slots-outcome-jackpot' },
  curse: { text: '💀 Проклятие… 💀', cls: 'slots-outcome-curse' },
}

export function symbolAt(index: number): string {
  return SLOT_SYMBOLS[((index % SLOT_SYMBOLS.length) + SLOT_SYMBOLS.length) % SLOT_SYMBOLS.length]
}
