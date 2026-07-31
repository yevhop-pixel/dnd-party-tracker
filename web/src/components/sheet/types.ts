// Общий интерфейс пропсов для всех вкладок редактора листа персонажа.
// Держим его в одном месте, чтобы вкладки, которые пишут разные исполнители,
// оставались взаимозаменяемыми со SheetEditor.

import type { CharacterSheet } from '../../lib/types'

export interface SheetTabProps {
  sheet: CharacterSheet
  onSheetChange: (patch: Partial<CharacterSheet>) => void
}
