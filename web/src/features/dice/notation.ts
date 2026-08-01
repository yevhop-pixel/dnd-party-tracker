// Разбор и бросок кубовой нотации. Чистые функции без Supabase — порт
// evaluateDiceNotation() из android/.../DndViewModel.kt (~строка 870), расширенный
// поддержкой составных выражений (несколько кубиковых групп + константы),
// например «1d20+1d4» (благословение) или «2d6+1d4+3».

// Один кубиковый терм составного выражения: sign применяется к каждому кубу
// термa индивидуально (арифметически то же самое, что применить его один
// раз к сумме термa, зато не требует скобок в detail — см. rollNotation).
export interface DiceTerm {
  sign: 1 | -1
  count: number
  sides: number
}

export interface ParsedNotation {
  terms: DiceTerm[] // минимум один кубиковый терм
  modifier: number // сумма всех числовых констант со знаками
}

export interface RollResult {
  total: number
  detail: string
  rolls: number[]
}

const MIN_COUNT = 1
const MAX_TOTAL_COUNT = 100
const MIN_SIDES = 2
const MAX_SIDES = 1000
const MAX_MODIFIER = 1000
const MAX_TERMS = 10

const DICE_TOKEN_RE = /^(\d*)d(\d+)$/i
const CONST_TOKEN_RE = /^\d+$/

// Грамматика: [+-]? NdM ( [+-] (NdM | K) )*. Пробелы игнорируются полностью,
// dM = 1dM, регистр «d» не важен. Разбор в два шага: сперва строку режем на
// токены «знак + тело без знаков внутри», затем каждое тело классифицируем
// как кубик или константу — так не нужен один гигантский монолитный regex.
export function parseNotation(input: string): ParsedNotation | null {
  const s = input.replace(/\s+/g, '')
  if (!s) return null

  const tokenRe = /([+-]?)([^+-]+)/g
  const tokens: { sign: 1 | -1; body: string }[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = tokenRe.exec(s))) {
    // Разрыв между токенами (например, двойной знак «1d20++3») означает, что
    // часть строки не покрыта разбором — это мусор.
    if (match.index !== cursor) return null
    tokens.push({ sign: match[1] === '-' ? -1 : 1, body: match[2] })
    cursor = tokenRe.lastIndex
  }
  if (cursor !== s.length) return null
  if (tokens.length === 0 || tokens.length > MAX_TERMS) return null

  const terms: DiceTerm[] = []
  let modifier = 0
  let totalCount = 0

  for (const { sign, body } of tokens) {
    const diceMatch = DICE_TOKEN_RE.exec(body)
    if (diceMatch) {
      const count = diceMatch[1] ? parseInt(diceMatch[1], 10) : 1
      const sides = parseInt(diceMatch[2], 10)
      if (count < MIN_COUNT) return null
      if (sides < MIN_SIDES || sides > MAX_SIDES) return null
      totalCount += count
      if (totalCount > MAX_TOTAL_COUNT) return null
      terms.push({ sign, count, sides })
      continue
    }
    if (CONST_TOKEN_RE.test(body)) {
      modifier += sign * parseInt(body, 10)
      continue
    }
    return null // не кубик и не число — мусор
  }

  if (terms.length === 0) return null // нужен хотя бы один кубиковый терм
  if (Math.abs(modifier) > MAX_MODIFIER) return null

  return { terms, modifier }
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

// Каждый куб — отдельное случайное число 1..sides, знак его термa
// прикладывается к нему индивидуально. detail — строка вида "14+3-2": первое
// значение без «+», дальше каждое следующее (кубы всех термов подряд, затем
// модификатор) со своим знаком. rolls — «сырые» (без знака) значения всех
// кубов, term за термом, в порядке терминов — то, что нужно detectCrit.
export function rollNotation(parsed: ParsedNotation): RollResult {
  const rolls: number[] = []
  const signed: { value: number; sign: 1 | -1 }[] = []

  for (const term of parsed.terms) {
    for (let i = 0; i < term.count; i++) {
      const face = fairDie(term.sides)
      rolls.push(face)
      signed.push({ value: face, sign: term.sign })
    }
  }
  if (parsed.modifier !== 0) {
    signed.push({ value: Math.abs(parsed.modifier), sign: parsed.modifier > 0 ? 1 : -1 })
  }

  let total = 0
  let detail = ''
  signed.forEach(({ value, sign }, i) => {
    total += sign * value
    if (i === 0) detail += sign < 0 ? `-${value}` : `${value}`
    else detail += sign < 0 ? `-${value}` : `+${value}`
  })

  return { total, detail, rolls }
}

// Критический успех/провал — правило НЕ распространяется на составные
// выражения: нужен один терм d20 со знаком «+» (count=1, sides=20).
// «1d20+1d4» крит не детектит осознанно (см. STATUS.md). Для
// advantage/disadvantage вызывающий код (submitRoll) передаёт rolls того
// броска, что реально пошёл в итог.
//
// Провал и успех несимметричны, и это осознанно (правка по жалобе владельца:
// «крит-неудача сыграла, хотя был модификатор +6»). При положительном итоге
// «единица» уже не провал: 1+6 = 7, проверка вполне может пройти — крутить
// там анимацию провала значит врать. А «двадцатка» остаётся двадцаткой при
// любом модификаторе, так что успех детектится как раньше — иначе атаки
// (а они почти всегда с модификатором) лишились бы крит-анимации совсем.
export function detectCrit(parsed: ParsedNotation, rolls: number[]): 'success' | 'fail' | null {
  if (parsed.terms.length !== 1) return null
  const [term] = parsed.terms
  if (term.sign !== 1 || term.count !== 1 || term.sides !== 20) return null
  const die = rolls[0]
  if (die === 20) return 'success'
  if (die === 1 && parsed.modifier === 0) return 'fail'
  return null
}

// Обратная сборка канонической строки из ParsedNotation — «1d20+1d4-2».
// Количество кубиков термa печатается всегда явно (даже «1d20», не «d20») —
// так удобнее сравнивать/склеивать строки в addToNotation.
export function formatNotation(parsed: ParsedNotation): string {
  let out = ''
  parsed.terms.forEach((term, i) => {
    const body = `${term.count}d${term.sides}`
    if (i === 0) out += term.sign < 0 ? `-${body}` : body
    else out += term.sign < 0 ? `-${body}` : `+${body}`
  })
  if (parsed.modifier !== 0) {
    out += parsed.modifier > 0 ? `+${parsed.modifier}` : `${parsed.modifier}`
  }
  return out
}

function parseSignedConstant(s: string): number | null {
  const m = /^([+-])(\d+)$/.exec(s)
  if (!m) return null
  return (m[1] === '-' ? -1 : 1) * parseInt(m[2], 10)
}

// Складывает исходную нотацию с добавкой из поля «Модификатор»: числом
// («3», «-2») или кубиковой добавкой («+1d4», «-1d4», «1d6»). Добавка без
// явного знака трактуется как «+», как и голое число. null — если исходная
// нотация или добавка не парсятся (в т.ч. если результат вылезает за лимиты
// parseNotation — сумма кубиков/число термов/|модификатор|).
// Броски-проверки из листа пишутся с подписью: «ТЕЛ (1d20+2)». Целиком такая
// строка не нотация, но внутри скобок — настоящая. Возвращает чистую нотацию
// или null, если её там нет.
export function extractNotation(text: string): string | null {
  if (parseNotation(text)) return text
  const inParens = /\(([^()]+)\)/.exec(text)
  if (inParens && parseNotation(inParens[1])) return inParens[1]
  return null
}

export function addToNotation(notation: string, extra: string): string | null {
  const trimmed = extra.trim()
  if (!trimmed) return null
  // База может прийти с подписью проверки — берём из неё чистую нотацию.
  const cleaned = extractNotation(notation)
  const base = cleaned ? parseNotation(cleaned) : null
  if (!base) return null

  const signedExtra = /^[+-]/.test(trimmed) ? trimmed : `+${trimmed}`

  let combined: ParsedNotation
  const extraParsed = parseNotation(signedExtra)
  if (extraParsed) {
    // Добавка сама содержит кубик («+1d4») — дописываем её термы.
    combined = { terms: [...base.terms, ...extraParsed.terms], modifier: base.modifier + extraParsed.modifier }
  } else {
    // Голая константа («+3», «-2») — parseNotation её одну не примет (нет
    // кубикового термa), разбираем вручную.
    const value = parseSignedConstant(signedExtra)
    if (value === null) return null
    combined = { terms: base.terms, modifier: base.modifier + value }
  }

  const formatted = formatNotation(combined)
  // Перепроверка через parseNotation применяет все лимиты к результату один
  // раз, без дублирования их здесь.
  return parseNotation(formatted) ? formatted : null
}
