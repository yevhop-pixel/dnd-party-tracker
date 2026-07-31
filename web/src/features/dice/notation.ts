// Разбор и бросок кубовой нотации. Чистые функции без Supabase — порт
// evaluateDiceNotation() из android/.../DndViewModel.kt (~строка 870).

export interface ParsedNotation {
  count: number
  sides: number
  modifier: number
}

export interface RollResult {
  total: number
  detail: string
}

const MIN_COUNT = 1
const MAX_COUNT = 100
const MIN_SIDES = 2
const MAX_SIDES = 1000
const MAX_MODIFIER = 1000

// Формат: NdM+K / NdM-K / NdM / dM (= 1dM). Пробелы вокруг «d» и знака
// модификатора терпимы, регистр «d»/«D» не важен.
const NOTATION_RE = /^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i

export function parseNotation(input: string): ParsedNotation | null {
  const match = NOTATION_RE.exec(input)
  if (!match) return null

  const [, countStr, sidesStr, sign, modStr] = match
  const count = countStr ? parseInt(countStr, 10) : 1
  const sides = parseInt(sidesStr, 10)
  const modifier = modStr ? parseInt(modStr, 10) * (sign === '-' ? -1 : 1) : 0

  if (count < MIN_COUNT || count > MAX_COUNT) return null
  if (sides < MIN_SIDES || sides > MAX_SIDES) return null
  if (Math.abs(modifier) > MAX_MODIFIER) return null

  return { count, sides, modifier }
}

// Честный бросок кости через crypto.getRandomValues с rejection sampling:
// отбрасываем значения из «хвоста» диапазона Uint32, которые не делятся
// поровну на sides, чтобы не было смещения по модулю. getRandomValues
// доступен во всех браузерах без secure context (в отличие от randomUUID).
function fairDie(sides: number): number {
  const max = Math.floor(0xffffffff / sides) * sides
  const buf = new Uint32Array(1)
  do {
    crypto.getRandomValues(buf)
  } while (buf[0] >= max)
  return (buf[0] % sides) + 1
}

// Каждый куб — отдельное случайное число 1..sides. detail — строка вида
// "14+3+5": сначала кубы через "+", затем модификатор своим знаком
// (как rollsAndMod в Android-версии).
export function rollNotation(parsed: ParsedNotation): RollResult {
  const rolls: number[] = []
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(fairDie(parsed.sides))
  }

  let detail = rolls.join('+')
  if (parsed.modifier !== 0) {
    detail += parsed.modifier > 0 ? `+${parsed.modifier}` : `${parsed.modifier}`
  }

  const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier
  return { total, detail }
}
