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
  // Саспенс-бросок: результат уходит в базу как обычно, но в ленте у всех
  // (кроме автора) он показывается крутящимся кубом, пока не вскроется
  // (см. stopRoll и is_pending в схеме).
  isPending = false,
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
      is_pending: isPending,
    })
    .select()
    .single()
  if (error) throw error
  return data as DiceRoll
}

// Автор раскрывает свой саспенс-бросок вручную (кнопка «Стоп» на крутящемся
// кубике в ленте). RLS (roll_reveal + column-grant в schema.sql) разрешает
// UPDATE только колонки is_pending и только своей строки — апдейт чужого
// rollId молча затронет 0 строк, без ошибки.
export async function stopRoll(rollId: string): Promise<void> {
  const { error } = await supabase.from('dice_roll').update({ is_pending: false }).eq('id', rollId)
  if (error) throw error
}

// Встречный бросок-«противовес»: игрок отвечает на бросок ГМа (или другого
// игрока) — по умолчанию той же нотацией, либо своим выбором (notationOverride),
// и с выбранным режимом (обычный/преимущество/помеха). Бросок никогда не
// тайный — цель сравнения обе стороны должны видеть. Битая нотация → 1d20.
// Вся механика (включая adv/dis и крит по выбранному кубу) — в submitRoll.
export async function submitCounterRoll(
  target: DiceRoll,
  characterId: string | null,
  notationOverride?: string,
  mode: RollMode = 'normal',
): Promise<DiceRoll> {
  const notation = notationOverride ?? target.notation
  const usedNotation = parseNotation(notation) ? notation : '1d20'
  return submitRoll(target.campaign_id, characterId, usedNotation, mode, false, false, target.id)
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

export type RollChangeEvent = 'INSERT' | 'UPDATE'

// Простой генератор суффикса топика — не крипто, только чтобы отличить
// несколько одновременных подписок на одну кампанию (см. ниже).
function genSubscriptionId(): string {
  return Math.random().toString(36).slice(2)
}

// Живая подписка на новые и вскрытые (UPDATE is_pending: true → false)
// броски кампании. Возвращает функцию отписки. ВАЖНО: realtime-payload не
// проходит RLS-фильтрацию is_secret — компонент, который передаёт onChange,
// обязан сам решить, показывать ли бросок. onResync вызывается при повторном
// 'SUBSCRIBED' (после обрыва канала и переподключения) — за время простоя
// могли уйти события, поэтому вызывающий код должен просто перечитать список
// заново.
export function subscribeToRolls(
  campaignId: string,
  onChange: (roll: DiceRoll, eventType: RollChangeEvent) => void,
  onResync?: () => void,
): () => void {
  let connectedOnce = false
  // Суффикс в имени топика обязателен: supabase-js кеширует channel-объект
  // по topic (см. RealtimeClient.channel) и вернёт ОДИН И ТОТ ЖЕ канал двум
  // независимым подписчикам на одну кампанию (лента + CritWatcher уровня
  // страницы, оба живут одновременно) — тогда unsubscribe() одного вызвал бы
  // removeChannel и оборвал бы подписку другого.
  const channel = supabase
    .channel(`dice_roll:${campaignId}:${genSubscriptionId()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dice_roll', filter: `campaign_id=eq.${campaignId}` },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          onChange(payload.new as DiceRoll, payload.eventType)
        }
      },
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

// Точечный дозапрос одного броска по id — нужен CritWatcher'у, когда ответ
// (contest) вскрывает крит-цель, а сама цель была pending ещё до монтирования
// компонента (в его локальном кэше её нет). RLS та же, что у обычного select.
export async function getRoll(id: string): Promise<DiceRoll | null> {
  const { data, error } = await supabase.from('dice_roll').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as DiceRoll | null
}
