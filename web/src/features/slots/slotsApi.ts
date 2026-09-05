// Слой доступа к слот-машине. Крутит сервер (rpc slot_pull), клиент только
// читает результаты и слушает realtime. Тот же стиль, что у diceApi.
import { supabase } from '../../lib/supabase'
import type { SlotSpin } from '../../lib/types'

// reels — первый в проекте столбец-массив, который ходит через realtime.
// PostgREST отдаёт его JSON-массивом, а вот что пришлёт realtime-сервер для
// smallint[], на этой базе никто не проверял: по его коду тоже массив, но
// страховка от строки «{3,5,1}» стоит три строки, а без неё у всех, кроме
// дёрнувшего, барабаны встали бы с исключением в обработчике.
function normalizeSpin(row: SlotSpin): SlotSpin {
  const raw: unknown = row.reels
  const reels = Array.isArray(raw)
    ? raw.map(Number)
    : String(raw ?? '')
        .replace(/[{}[\]\s]/g, '')
        .split(',')
        .filter((s) => s.length > 0)
        .map(Number)
  return { ...row, reels }
}

// Дёрнуть ручку. Сервер сам выбирает барабаны и сам же отказывает, если
// автомат занят (ошибка «Автомат занят: кто-то уже крутит»). Возвращает
// вставленную строку — с неё дёрнувший начинает анимацию, не дожидаясь
// realtime-события о собственной вставке.
export async function pullLever(campaignId: string): Promise<SlotSpin> {
  const { data, error } = await supabase.rpc('slot_pull', { p_campaign: campaignId })
  if (error) throw new Error(error.message || 'Не удалось дёрнуть ручку')
  return normalizeSpin(data as SlotSpin)
}

export async function listRecentSpins(campaignId: string, limit = 10): Promise<SlotSpin[]> {
  const { data, error } = await supabase
    .from('slot_spin')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as SlotSpin[]).map(normalizeSpin)
}

function genSubscriptionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Подписка на новые рывки. Суффикс в топике — по той же причине, что у
// бросков: supabase-js кеширует канал по имени, и два подписчика на одну
// кампанию делили бы один объект.
export function subscribeToSpins(
  campaignId: string,
  onInsert: (spin: SlotSpin) => void,
  onResync?: () => void,
): () => void {
  const channel = supabase
    .channel(`slot_spin:${campaignId}:${genSubscriptionId()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'slot_spin', filter: `campaign_id=eq.${campaignId}` },
      (payload) => onInsert(normalizeSpin(payload.new as SlotSpin)),
    )
    .subscribe((status) => {
      // На каждом (пере)подключении перечитываем: события за время обрыва
      // не переигрываются.
      if (status === 'SUBSCRIBED') onResync?.()
    })

  return () => {
    void supabase.removeChannel(channel)
  }
}
