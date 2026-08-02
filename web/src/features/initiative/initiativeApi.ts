// Слой доступа к данным для трекера инициативы боя. Тонкая обёртка над
// supabase-js, см. src/lib/api.ts — тот же стиль: без бизнес-логики сверх
// необходимого, ошибки не глушатся. Отдельный файл (а не lib/api.ts), т.к.
// это зона модуля initiative — см. распределение работ между исполнителями.

import { supabase } from '../../lib/supabase'
import type { InitiativeEntry } from '../../lib/types'

// Записи боя кампании: initiative_read (см. schema.sql) отдаёт их всем
// участникам всегда, независимо от содержимого — это важно для realtime,
// см. subscribeToInitiative ниже. Сортировку по initiative desc, created_at
// asc дублирует и клиент (см. InitiativeTracker) — после инлайн-правки числа
// список должен пересортироваться без лишнего похода в базу.
export async function listEntries(campaignId: string): Promise<InitiativeEntry[]> {
  const { data, error } = await supabase
    .from('initiative_entry')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('initiative', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as InitiativeEntry[]
}

export async function addEntry(
  campaignId: string,
  name: string,
  initiative: number,
  characterId?: string,
): Promise<InitiativeEntry> {
  const { data, error } = await supabase
    .from('initiative_entry')
    .insert({ campaign_id: campaignId, name, initiative, character_id: characterId ?? null })
    .select()
    .single()
  if (error) throw error
  return data as InitiativeEntry
}

export async function updateEntry(id: string, patch: Partial<InitiativeEntry>): Promise<InitiativeEntry> {
  const { data, error } = await supabase.from('initiative_entry').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as InitiativeEntry
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('initiative_entry').delete().eq('id', id)
  if (error) throw error
}

// Сброс боя: удаляет все записи кампании разом (используется кнопкой
// «Сбросить бой» у ГМа).
export async function clearAll(campaignId: string): Promise<void> {
  const { error } = await supabase.from('initiative_entry').delete().eq('campaign_id', campaignId)
  if (error) throw error
}

// Передача хода: два раздельных update (снять is_current со всех, поставить
// на выбранную запись) — неатомарно, в отличие от reveal_map/hide_map в
// mapsApi.ts. Правит эту таблицу только ГМ и это единственный источник
// изменений, поэтому гонка между двумя ГМами практически невозможна;
// следующего/предыдущего по кругу считает клиент по уже отсортированному
// списку (см. InitiativeTracker.handleNextTurn).
export async function setCurrent(entryId: string, campaignId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from('initiative_entry')
    .update({ is_current: false })
    .eq('campaign_id', campaignId)
  if (clearError) throw clearError

  const { error } = await supabase.from('initiative_entry').update({ is_current: true }).eq('id', entryId)
  if (error) throw error
}

// Игрок бросает инициативу за себя. Прямой update ему запрещён (политика
// initiative_update — только ГМ), поэтому через SECURITY DEFINER функцию:
// она правит ровно поле initiative ровно у его записи, а если игрока в бою
// ещё нет — заводит её (см. set_my_initiative в schema.sql).
export async function setMyInitiative(campaignId: string, value: number): Promise<void> {
  const { error } = await supabase.rpc('set_my_initiative', { p_campaign: campaignId, p_value: value })
  if (error) throw error
}

// Номер раунда живёт в campaign_state — одна строка на кампанию, читаемая
// всем участникам всегда (тот же приём, что и с текущей картой).
export async function getCombatRound(campaignId: string): Promise<number> {
  const { data, error } = await supabase
    .from('campaign_state')
    .select('combat_round')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (error) throw error
  return (data?.combat_round as number | undefined) ?? 0
}

export async function setCombatRound(campaignId: string, round: number): Promise<void> {
  const { error } = await supabase.rpc('set_combat_round', { p_campaign: campaignId, p_round: round })
  if (error) throw error
}

// Отдельная подписка на campaign_state: раунд меняет ГМ, а видеть его должны
// все. Тема канала своя (:round) — на campaign_state уже подписан PlayerMap,
// а два канала с одинаковым топиком в одном клиенте конфликтуют.
export function subscribeToCombatRound(campaignId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`campaign_state:${campaignId}:round`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'campaign_state', filter: `campaign_id=eq.${campaignId}` },
      () => onChange(),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// Живая подписка на все изменения боя кампании. Не разбираем payload — по
// любому событию (INSERT/UPDATE/DELETE) просто просим вызывающий код
// перечитать список: select-политика initiative_read не зависит от
// содержимого строки (в отличие от game_map), поэтому события доходят всем
// участникам без отдельного сигнального ряда вроде campaign_state.
// onResync вызывается при повторном 'SUBSCRIBED' (после обрыва канала и
// переподключения) — за время простоя могли уйти события, вызывающий код
// должен перечитать список заново.
export function subscribeToInitiative(campaignId: string, onChange: () => void, onResync?: () => void): () => void {
  let connectedOnce = false
  const channel = supabase
    .channel(`initiative_entry:${campaignId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'initiative_entry', filter: `campaign_id=eq.${campaignId}` },
      () => onChange(),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (connectedOnce) onResync?.()
        connectedOnce = true
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}
