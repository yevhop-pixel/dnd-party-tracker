// Слой доступа к данным для бросков кубов. Тонкая обёртка над supabase-js,
// без бизнес-логики сверх той, что нужна для семантики режимов броска
// (см. rollDice/triggerRoll в android/.../DndViewModel.kt).

import { supabase } from '../../lib/supabase'
import type { DiceRoll, RollMode } from '../../lib/types'
import { detectCrit, parseNotation, rollNotation, type RollResult } from './notation'

// Сессия уже лежит в памяти supabase-js, поэтому getSession() не ходит в сеть.
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) throw new Error('Не авторизован')
  return data.session.user.id
}

export async function submitRoll(
  campaignId: string,
  characterId: string | null,
  notation: string,
  mode: RollMode,
  isSecret: boolean,
  contestRollId?: string | null,
): Promise<DiceRoll> {
  const parsed = parseNotation(notation)
  if (!parsed) throw new Error(`Неверная нотация броска: «${notation}»`)

  let resultsText: string
  let finalResult: number
  let crit: 'success' | 'fail' | null

  if (mode === 'normal') {
    const roll = rollNotation(parsed)
    resultsText = roll.detail
    finalResult = roll.total
    crit = detectCrit(parsed, roll.rolls)
  } else {
    // Преимущество/помеха: нотация бросается дважды, берётся max/min итога.
    const roll1 = rollNotation(parsed)
    const roll2 = rollNotation(parsed)
    finalResult = mode === 'advantage' ? Math.max(roll1.total, roll2.total) : Math.min(roll1.total, roll2.total)
    resultsText = `${roll1.total} (${roll1.detail}) | ${roll2.total} (${roll2.detail}) → ${finalResult}`
    // Крит смотрим по кубу, который реально пошёл в итог (при равенстве —
    // неважно какой, у d20 без разброса модификатора totals совпадают
    // только при совпадении самих кубов).
    const chosen = roll1.total === finalResult ? roll1 : roll2
    crit = detectCrit(parsed, chosen.rolls)
  }

  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('dice_roll')
    .insert({
      campaign_id: campaignId,
      user_id: userId,
      character_id: characterId,
      notation,
      roll_mode: mode,
      results_text: resultsText,
      final_result: finalResult,
      is_secret: isSecret,
      crit,
      contest_roll_id: contestRollId ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as DiceRoll
}

// Встречный бросок-«противовес»: игрок отвечает на бросок ГМа (или другого
// игрока) — по умолчанию той же нотацией, либо своим выбором (notationOverride,
// например нотация одного из макросов персонажа — см. выбор в RollFeed).
// Режим всегда normal, бросок никогда не тайный — цель сравнения обе стороны
// должны видеть. Если выбранная нотация не парсится (например, target.notation —
// это был submitCheckRoll с текстовым лейблом типа «СИЛ (1d20+2)», или
// notationOverride пришёл битым), откатываемся на голый 1d20. В отличие от
// target.notation, фактически применённая нотация сохраняется в самой строке
// broska — так versus-ячейка может показать разбор по каждой стороне отдельно.
export async function submitCounterRoll(
  target: DiceRoll,
  characterId: string | null,
  notationOverride?: string,
): Promise<DiceRoll> {
  const notation = notationOverride ?? target.notation
  const parsed = parseNotation(notation) ?? { count: 1, sides: 20, modifier: 0 }
  const usedNotation = parseNotation(notation) ? notation : '1d20'
  const roll = rollNotation(parsed)
  const crit = detectCrit(parsed, roll.rolls)

  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('dice_roll')
    .insert({
      campaign_id: target.campaign_id,
      user_id: userId,
      character_id: characterId,
      notation: usedNotation,
      roll_mode: 'normal',
      results_text: roll.detail,
      final_result: roll.total,
      is_secret: false,
      crit,
      contest_roll_id: target.id,
    })
    .select()
    .single()
  if (error) throw error
  return data as DiceRoll
}

// Быстрая проверка характеристики/инициативы прямо с листа персонажа:
// 1d20+modifier с готовым human-readable label в notation (например
// «СИЛ (1d20+2)»), чтобы в ленте кампании было видно, что именно бросили.
// В отличие от submitRoll — нотация здесь не парсится (в ней буквы), кубы
// считаем напрямую через rollNotation.
export async function submitCheckRoll(
  campaignId: string,
  characterId: string | null,
  label: string,
  modifier: number,
): Promise<RollResult> {
  const sign = modifier >= 0 ? `+${modifier}` : `${modifier}`
  const notation = `${label} (1d20${sign})`
  const parsed = { count: 1, sides: 20, modifier }
  const roll = rollNotation(parsed)
  const crit = detectCrit(parsed, roll.rolls)

  const userId = await requireUserId()
  const { error } = await supabase.from('dice_roll').insert({
    campaign_id: campaignId,
    user_id: userId,
    character_id: characterId,
    notation,
    roll_mode: 'normal',
    results_text: roll.detail,
    final_result: roll.total,
    is_secret: false,
    crit,
  })
  if (error) throw error
  return roll
}

export async function listRecentRolls(campaignId: string, limit = 50): Promise<DiceRoll[]> {
  const { data, error } = await supabase
    .from('dice_roll')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as DiceRoll[]
}

// Живая подписка на новые броски кампании. Возвращает функцию отписки.
// ВАЖНО: realtime-payload не проходит RLS-фильтрацию is_secret — компонент,
// который передаёт onInsert, обязан сам решить, показывать ли бросок.
// onResync вызывается при повторном 'SUBSCRIBED' (после обрыва канала и
// переподключения) — за время простоя могли уйти события, поэтому вызывающий
// код должен просто перечитать список заново.
export function subscribeToRolls(
  campaignId: string,
  onInsert: (roll: DiceRoll) => void,
  onResync?: () => void,
): () => void {
  let connectedOnce = false
  const channel = supabase
    .channel(`dice_roll:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'dice_roll', filter: `campaign_id=eq.${campaignId}` },
      (payload) => onInsert(payload.new as DiceRoll),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (connectedOnce) onResync?.()
        connectedOnce = true
      }
    })

  return () => {
    void supabase.removeChannel(channel)
  }
}
