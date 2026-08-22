import { useEffect, useRef } from 'react'

// Страховка для «живых» лент поверх Supabase Realtime.
//
// Realtime — доставка по возможности, а не гарантия. Websocket рвётся, когда
// телефон уходит в сон, когда меняется сеть, когда провайдер молча роняет
// долгоживущее соединение; события за время обрыва не переигрываются, они
// просто теряются. Отсюда жалоба владельца: «редко, но бывает — человек
// бросил кубик, а у остальных ничего, помогает только перезагрузка».
//
// Поэтому у каждой живой ленты есть второй, тупой канал доставки: перечитать
// данные заново — при возврате на вкладку, при появлении сети и просто раз в
// N секунд. Запрос дешёвый (полсотни строк по индексу), зато потолок
// задержки становится известным: не «до перезагрузки страницы», а
// PERIOD_MS.
const PERIOD_MS = 20_000

export function useLiveSync(resync: () => void, periodMs: number = PERIOD_MS): void {
  // Через ref, чтобы эффект не пересоздавался на каждый рендер родителя —
  // иначе таймер сбрасывался бы постоянно и не срабатывал никогда.
  const resyncRef = useRef(resync)
  resyncRef.current = resync

  useEffect(() => {
    function fire() {
      // Невидимая вкладка не тратит запросы: браузер и так душит таймеры в
      // фоне, а перечитать надо ровно в момент возвращения — это делает
      // обработчик visibilitychange ниже.
      if (document.visibilityState !== 'visible') return
      resyncRef.current()
    }

    const timer = window.setInterval(fire, periodMs)
    // Возврат на вкладку — самый частый момент, когда соединение было
    // порвано, а событие пропущено.
    document.addEventListener('visibilitychange', fire)
    window.addEventListener('focus', fire)
    window.addEventListener('online', fire)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', fire)
      window.removeEventListener('focus', fire)
      window.removeEventListener('online', fire)
    }
  }, [periodMs])
}
