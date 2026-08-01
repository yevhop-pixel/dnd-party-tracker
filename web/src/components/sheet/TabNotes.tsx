import type { SheetTabProps } from './types'
import AutoTextarea from '../AutoTextarea'

export default function TabNotes({ sheet, onSheetChange }: SheetTabProps) {
  return (
    <div className="sheet-tab-notes">
      <h2>Заметки кампании</h2>
      <AutoTextarea
        className="notes-textarea"
        rows={8}
        value={sheet.campaign_notes}
        placeholder="Записывай всё важное…"
        onChange={(e) => onSheetChange({ campaign_notes: e.target.value })}
      />
      <span className="notes-char-count">{sheet.campaign_notes.length} символов</span>
    </div>
  )
}
