// Запоминание состояния интерфейса (активные вкладки, свёрнутые карточки,
// размеры панелей) — чисто локальное, per-устройство, чтобы окна не
// сбрасывались между заходами/переключениями.

const PREFIX = 'dnd-ui-'

export function getUiState<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function setUiState(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // localStorage недоступен (приватный режим/квота) — просто не сохраняем.
  }
}
