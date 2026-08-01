// Слой доступа к приватным заметкам ГМа о каждом игроке. Тонкая обёртка над
// supabase-js: без бизнес-логики, только запросы, которые соответствуют
// RLS-политике из supabase/schema.sql (секция «Приватные заметки ГМа») —
// видит и правит только ГМ кампании, поэтому клиент здесь ничего не проверяет.

import { supabase } from '../../lib/supabase'

// Тип объявлен здесь же (а не в lib/types.ts), чтобы не задевать общий файл типов.
export interface GmNote {
  campaign_id: string
  subject_user_id: string
  body: string
  updated_at: string
}

// Заметки может ещё не быть — maybeSingle возвращает null вместо ошибки.
export async function getNote(campaignId: string, subjectUserId: string): Promise<GmNote | null> {
  const { data, error } = await supabase
    .from('gm_note')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('subject_user_id', subjectUserId)
    .maybeSingle()
  if (error) throw error
  return data as GmNote | null
}

// Upsert по первичному ключу (campaign_id, subject_user_id) — первая правка
// создаёт строку, дальнейшие обновляют её.
export async function upsertNote(campaignId: string, subjectUserId: string, body: string): Promise<GmNote> {
  const { data, error } = await supabase
    .from('gm_note')
    .upsert(
      { campaign_id: campaignId, subject_user_id: subjectUserId, body, updated_at: new Date().toISOString() },
      { onConflict: 'campaign_id,subject_user_id' },
    )
    .select()
    .single()
  if (error) throw error
  return data as GmNote
}
