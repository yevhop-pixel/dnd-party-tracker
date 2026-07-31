import { useEffect, useRef } from 'react'

// Общий хук потабличного дебаунса правок в списках персонажа (черты,
// инвентарь, экипировка): копит патчи по id записи и раз в SAVE_DEBOUNCE_MS
// отправляет их на сервер одним запросом на id — как и раньше, чтобы не
// бомбить базу на каждое нажатие клавиши. В отличие от прежней самодельной
// реализации в каждой вкладке, этот хук гарантированно сбрасывает все
// незаписанные патчи при размонтировании компонента и при закрытии/уходе со
// страницы (событие 'pagehide'), чтобы последняя правка не терялась.
const SAVE_DEBOUNCE_MS = 500

export function useDebouncedPatches<T>(
  save: (id: string, patch: Partial<T>) => Promise<unknown>,
  onError: (message: string) => void,
) {
  const pending = useRef<Record<string, Partial<T>>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const mountedRef = useRef(true)

  // save/onError — как правило, инлайн-функции компонента и меняют identity
  // на каждый рендер. Держим свежую версию в ref, чтобы отложенный flush и
  // обработчик pagehide (зарегistрированный один раз при монтировании)
  // всегда вызывали актуальные версии, а не «протухшие» замыкания.
  const saveRef = useRef(save)
  saveRef.current = save
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  function flush(id: string) {
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
    const patch = pending.current[id]
    if (!patch) return
    delete pending.current[id]
    saveRef.current(id, patch).catch(() => {
      // После unmount компонент уже не должен получать setState — проверяем
      // guard-флаг перед вызовом колбэка ошибки.
      if (mountedRef.current) onErrorRef.current('Не удалось сохранить изменения')
    })
  }

  function flushAll() {
    for (const id of Object.keys(pending.current)) flush(id)
  }

  // Точечная правка поля: вызывающий код сам обновляет локальное состояние
  // сразу (без «прыжка» списка), а schedule лишь откладывает запрос к серверу.
  function schedule(id: string, patch: Partial<T>) {
    pending.current[id] = { ...pending.current[id], ...patch }
    if (timers.current[id]) clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => flush(id), SAVE_DEBOUNCE_MS)
  }

  // Снять pending-патч и таймер без сохранения — нужно перед удалением
  // записи, иначе отложенный flush после deleteChild даст ложную ошибку.
  function discard(id: string) {
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
    delete pending.current[id]
  }

  useEffect(() => {
    mountedRef.current = true
    window.addEventListener('pagehide', flushAll)
    return () => {
      mountedRef.current = false
      window.removeEventListener('pagehide', flushAll)
      flushAll()
    }
    // flush/flushAll читают состояние только через рефы (pending, timers,
    // saveRef, onErrorRef), поэтому регистрировать эффект заново при каждом
    // рендере не нужно — достаточно один раз на монтирование/размонтирование.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { schedule, discard }
}
