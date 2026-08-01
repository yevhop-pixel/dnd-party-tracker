// CRUD для сохранённых макросов броска («Атака мечом» → 1d20+7). Таблица
// character_macro не входит в ChildTable из lib/api.ts (тот union
// зарезервирован под содержимое листа персонажа), поэтому здесь — прямые
// запросы к supabase, по тому же образцу.

import { supabase } from '../../lib/supabase'
import type { CharacterMacro } from '../../lib/types'

export async function listMacros(characterId: string): Promise<CharacterMacro[]> {
  const { data, error } = await supabase
    .from('character_macro')
    .select('*')
    .eq('character_id', characterId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data as CharacterMacro[]
}

export async function insertMacro(
  characterId: string,
  label: string,
  notation: string,
  sortOrder: number,
): Promise<CharacterMacro> {
  const { data, error } = await supabase
    .from('character_macro')
    .insert({ character_id: characterId, label, notation, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data as CharacterMacro
}

export async function updateMacro(id: string, patch: Partial<CharacterMacro>): Promise<CharacterMacro> {
  const { data, error } = await supabase.from('character_macro').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as CharacterMacro
}

export async function deleteMacro(id: string): Promise<void> {
  const { error } = await supabase.from('character_macro').delete().eq('id', id)
  if (error) throw error
}
