// Общий хелпер для кнопок «вверх/вниз» в списках с sort_order (черты,
// инвентарь, зелья/расходники). Раньше вкладки просто меняли местами
// sort_order двух соседей — это ломалось при равных значениях (все 0 по
// умолчанию, обмен становился no-op) и при частичном сбое сети оставляло
// дубликаты sort_order. Вместо этого делаем полную перенумерацию: переставляем
// элементы местами в массиве и приводим sort_order каждого элемента к его
// индексу. Заодно это самопочинка — если прошлый сбой уже развёл порядок,
// следующее перемещение выравнивает весь список.

export interface SortableRow {
  id: string
  sort_order: number
}

export interface ReorderResult {
  orderedIds: string[]
  sortOrders: Map<string, number>
}

// Вычисляет новый порядок и сохраняет sort_order на сервере (через переданный
// saveSortOrder — типизацию updateChild под конкретную таблицу делает вызывающий
// код). Возвращает null, если перемещение невозможно (край списка, id не найден).
export async function reorderItems<T extends SortableRow>(
  items: T[],
  id: string,
  dir: -1 | 1,
  saveSortOrder: (id: string, sortOrder: number) => Promise<unknown>,
): Promise<ReorderResult | null> {
  const index = items.findIndex((it) => it.id === id)
  const targetIndex = index + dir
  if (index === -1 || targetIndex < 0 || targetIndex >= items.length) return null

  const next = [...items]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]

  const sortOrders = new Map<string, number>()
  const updates: Promise<unknown>[] = []
  next.forEach((it, i) => {
    // Отправляем на сервер только реально изменившиеся sort_order — но
    // перестановка позиций сама по себе тоже считается изменением, поэтому
    // сравниваем именно итоговое значение sort_order с текущим индексом.
    if (it.sort_order !== i) {
      sortOrders.set(it.id, i)
      updates.push(saveSortOrder(it.id, i))
    }
  })
  await Promise.all(updates)

  return { orderedIds: next.map((it) => it.id), sortOrders }
}

// Применяет результат reorderItems к актуальному (а не «снятому» до await)
// состоянию списка: берём порядок и новые sort_order из result, но сами
// объекты — из свежего prev, чтобы не затереть правки текста, случившиеся
// за время запроса. Элементы, которых не было в исходном снимке (добавлены/
// удалены за время запроса), не теряем — дописываем в конец без изменений.
export function applyReorderResult<T extends SortableRow>(prev: T[], result: ReorderResult): T[] {
  const byId = new Map(prev.map((it) => [it.id, it]))
  const ordered: T[] = []
  for (const itemId of result.orderedIds) {
    const it = byId.get(itemId)
    if (!it) continue
    byId.delete(itemId)
    const sortOrder = result.sortOrders.get(itemId)
    ordered.push(sortOrder !== undefined ? { ...it, sort_order: sortOrder } : it)
  }
  for (const it of byId.values()) ordered.push(it)
  return ordered
}
