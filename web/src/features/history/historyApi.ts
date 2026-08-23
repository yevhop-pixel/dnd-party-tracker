// Чтение журнала изменений. Писать в него клиент не может вовсе — политик
// insert/update/delete у таблицы нет, всё пишут триггеры в базе.
import { supabase } from '../../lib/supabase'
import type { ChangeLogRow } from '../../lib/types'

// Полсотни строк: журнал нужен, чтобы посмотреть «что было за сегодня», а не
// поднимать историю кампании с начала времён.
const LIMIT = 60

export async function listChanges(campaignId: string): Promise<ChangeLogRow[]> {
  const { data, error } = await supabase
    .from('change_log')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(LIMIT)
  if (error) throw error
  return data as ChangeLogRow[]
}
