// Слой доступа к данным для бросков кубов. Тонкая обёртка над supabase-js,
// без бизнес-логики сверх той, что нужна для семантики режимов броска
// (см. rollDice/triggerRoll в android/.../DndViewModel.kt).

import { supabase } from '../../lib/supabase'
import type { DiceRoll, RollMode } from '../../lib/types'
import { parseNotation, type RollResult } from './notation'

// Очистка ленты кампании: доступна только ГМу (политика roll_clear в
// schema.sql). Броски удаляются насовсем — это «новая сцена», а не скрытие.
export async function clearRolls(campaignId: string): Promise<number> {
  const { data, error } = await supabase.from('dice_roll').delete().eq('campaign_id', campaignId).select('id')
  if (error) throw error
  return data?.length ?? 0
}

// Бросок кубиков. Число выбирает БАЗА (submit_roll в schema.sql): клиент
// присылает только нотацию и режим, а итог, детализацию, крит и премиум-удачу
// считает сервер криптостойким генератором. Прямой insert в dice_roll закрыт,
// так что подделать себе двадцатку из консоли браузера нельзя.
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
  // Можно ли этому броску премиум-удачу. Сервер всё равно проверит подписку
  // автора сам (app_user.is_premium) — флаг только разрешает, но не даёт.
  premium = false,
): Promise<DiceRoll> {
  // Проверяем нотацию и здесь: понятная ошибка без похода в сеть.
  if (!parseNotation(notation)) throw new Error(`Неверная нотация броска: «${notation}»`)
  const { data, error } = await supabase.rpc('submit_roll', {
    p_campaign: campaignId,
    p_character: characterId,
    p_notation: notation,
    p_mode: mode,
    p_secret: isSecret,
    p_pending: isPending,
    p_contest: contestRollId ?? null,
    p_premium: premium,
  })
  if (error) throw new Error(error.message || 'Не удалось бросить')
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
// 1d20+modifier с подписью в notation (например «СИЛ (1d20+2)»), чтобы в
// ленте кампании было видно, что именно бросили. Бросает тоже база
// (submit_check_roll).
export async function submitCheckRoll(
  campaignId: string,
  characterId: string | null,
  label: string,
  modifier: number,
): Promise<RollResult> {
  const { data, error } = await supabase.rpc('submit_check_roll', {
    p_campaign: campaignId,
    p_character: characterId,
    p_label: label,
    p_modifier: modifier,
  })
  if (error) throw new Error(error.message || 'Не удалось бросить')
  const row = data as DiceRoll
  // Вызывающим (лист, инициатива) нужны итог и детализация, как раньше.
  const die = parseInt(row.results_text, 10)
  return { total: row.final_result, detail: row.results_text, rolls: Number.isNaN(die) ? [] : [die] }
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
// обязан сам решить, показывать ли бросок.
//
// onResync вызывается на КАЖДОМ 'SUBSCRIBED', включая самый первый, и означает
// «канал сейчас живой, перечитай список». Первый вызов важен не меньше
// остальных: подписка подключается асинхронно, и бросок, случившийся между
// первым запросом ленты и завершением подключения, не попал бы ни в снимок,
// ни в события — навсегда, до перезагрузки страницы. Снимок, снятый после
// подключения, эту щель закрывает.
export function subscribeToRolls(
  campaignId: string,
  onChange: (roll: DiceRoll, eventType: RollChangeEvent) => void,
  onResync?: () => void,
): () => void {
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
      // CHANNEL_ERROR / TIMED_OUT / CLOSED отдельно не обрабатываем: supabase-js
      // перезайдёт сам по своему таймеру, а перечитать ленту надо в момент
      // возвращения — то есть на следующем 'SUBSCRIBED'.
      if (status === 'SUBSCRIBED') onResync?.()
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
