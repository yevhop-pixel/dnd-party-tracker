import { useEffect, useState } from 'react'

// «Узкий экран» = телефон. Порог 720px: на нём ряд из семи чипсов списков
// плюс чат и бой переносится в три строки и съедает половину экрана.
const QUERY = '(max-width: 720px)'

export function useCompact(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(QUERY).matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches)
    setCompact(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return compact
}
