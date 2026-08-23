// Геометрия настоящих многогранников для 3D-кубиков на CSS. Без библиотек:
// физический движок с моделями весит мегабайты, а партия играет с телефонов
// через мобильный интернет — за красивую физику платили бы загрузкой.
//
// Правило одно на все тела: грань кладётся списком поворотов и отъездом от
// центра на радиус вписанной сферы. Тогда поворот, которым надо развернуть
// ВСЁ тело, чтобы эта грань смотрела в камеру, — те же повороты в обратном
// порядке с обратным знаком (restTransform). Значит описывать надо только
// раскладку граней, а «как показать выпавшее число» считается из неё само и
// разъехаться с ней не может — это важно, потому что результат броска уже
// определён и записан в базу ДО анимации, и кубик обязан показать именно его.
//
// Углы не подобраны на глаз, а посчитаны по координатам вершин: для каждой
// грани взят центроид, из него — азимут и подъём нормали. Проверено покадрово
// на всех значениях каждого тела — покадрово, на статическом стенде.

export type FaceShape = 'square' | 'triangle' | 'pentagon'

interface Rotation {
  axis: 'x' | 'y' | 'z'
  deg: number
}

export interface SolidFace {
  value: number
  rotations: Rotation[]
}

export interface Solid {
  shape: FaceShape
  faces: SolidFace[]
  // Радиус вписанной сферы в долях от ШИРИНЫ грани (не от её стороны).
  inradius: number
}

// Пятиугольник вписан в круг радиусом size/2, поэтому его сторона равна
// 2·(size/2)·sin36° — радиус вписанной сферы считаем через неё, иначе
// додекаэдр разлетается на лепестки.
const PENTAGON_SIDE = 2 * Math.sin(Math.PI / 5) * 0.5

const INRADIUS = {
  tetra: Math.sqrt(6) / 12,
  cube: 0.5,
  octa: Math.sqrt(6) / 6,
  dodeca: (Math.sqrt(250 + 110 * Math.sqrt(5)) / 20) * PENTAGON_SIDE,
  icosa: (3 * Math.sqrt(3) + Math.sqrt(15)) / 12,
}

// Высота грани в долях от её ширины. У пятиугольника рамка КВАДРАТНАЯ, хотя
// сам он ниже, чем шире: clip-path задаётся в процентах от рамки, и в
// неквадратной рамке круг, по которому строятся вершины, превращается в
// эллипс — пятиугольник перестаёт быть правильным, и додекаэдр собирается
// со щелями. Пустые углы рамки ничему не мешают, они прозрачные.
const FACE_ASPECT: Record<FaceShape, number> = {
  square: 1,
  triangle: Math.sqrt(3) / 2,
  pentagon: 1,
}

// Грани рисуем чуть крупнее расчётных. Идеальные размеры дают по вершинам
// тела volоски-просветы: сглаживание краёв clip-path и округление координат
// до долей пикселя срезают по чуть-чуть с каждой стороны. Пара процентов
// нахлёста этого не видно, а дырки закрывает; пятиугольнику нужно больше —
// у додекаэдра в каждой вершине сходятся три тупых угла, и просветы там
// самые заметные.
const FACE_OVERSIZE: Record<FaceShape, number> = {
  square: 1,
  triangle: 1.02,
  pentagon: 1.1,
}

// Центр ТЯЖЕСТИ грани сажаем в начало координат: у равностороннего
// треугольника он на 2/3 высоты от вершины, то есть на h/6 ниже центра
// описанного прямоугольника. Без этой поправки тело собирается из смещённых
// кусков и выглядит рваным.
const CENTROID_SHIFT: Record<FaceShape, number> = {
  square: 0,
  triangle: -1 / 6,
  pentagon: 0,
}

// azimuth/elevation — сферические координаты нормали. Порядок rotateY →
// rotateX именно такой: второй поворот идёт уже в повёрнутой системе, и
// вместе они дают ровно «повернуть на азимут, поднять на угол».
// spin — доворот В ПЛОСКОСТИ грани: у треугольных тел соседние кольца
// смотрят вершиной в разные стороны, иначе грани не стыкуются.
function face(value: number, azimuth: number, elevation: number, spin: number): SolidFace {
  const rotations: Rotation[] = []
  if (azimuth) rotations.push({ axis: 'y', deg: azimuth })
  if (elevation) rotations.push({ axis: 'x', deg: elevation })
  if (spin) rotations.push({ axis: 'z', deg: spin })
  return { value, rotations }
}

function ring(values: number[], elevation: number, azimuthStart: number, spin: number): SolidFace[] {
  const step = 360 / values.length
  return values.map((v, i) => face(v, azimuthStart + i * step, elevation, spin))
}

// Куб: противоположные грани в сумме дают 7, как на настоящем кубике.
const CUBE: SolidFace[] = [
  { value: 1, rotations: [] },
  { value: 6, rotations: [{ axis: 'y', deg: 180 }] },
  { value: 3, rotations: [{ axis: 'y', deg: 90 }] },
  { value: 4, rotations: [{ axis: 'y', deg: -90 }] },
  { value: 5, rotations: [{ axis: 'x', deg: -90 }] },
  { value: 2, rotations: [{ axis: 'x', deg: 90 }] },
]

// Октаэдр: нормали смотрят в (±1,±1,±1) — подъём asin(1/√3) = 35.264°,
// азимут 45+90k ОДИН И ТОТ ЖЕ у обоих колец (грани стоят строго друг под
// другом), нижнее кольцо вершиной вниз.
const OCTA: SolidFace[] = [
  ...ring([1, 2, 3, 4], 35.264, 45, 0),
  ...ring([5, 6, 7, 8], -35.264, 45, 180),
]

// Икосаэдр: шапка, два пояса, шапка. Подъёмы центров граней 52.62° и 10.81°;
// азимуты у верхней шапки и верхнего пояса совпадают (36+72k), у нижнего
// пояса и нижней шапки — 0+72k.
const ICOSA: SolidFace[] = [
  ...ring([1, 2, 3, 4, 5], 52.62, 36, 0),
  ...ring([6, 7, 8, 9, 10], 10.81, 36, 180),
  ...ring([11, 12, 13, 14, 15], -10.81, 0, 0),
  ...ring([16, 17, 18, 19, 20], -52.62, 0, 180),
]

// Додекаэдр: верхняя грань, два кольца по пять, нижняя.
const DODECA: SolidFace[] = [
  { value: 1, rotations: [{ axis: 'x', deg: 90 }, { axis: 'z', deg: 36 }] },
  ...ring([2, 3, 4, 5, 6], 26.565, 0, 36),
  ...ring([7, 8, 9, 10, 11], -26.565, 36, 0),
  { value: 12, rotations: [{ axis: 'x', deg: -90 }, { axis: 'z', deg: 36 }] },
]

// Тетраэдр: одна грань вниз, три вверх.
const TETRA: SolidFace[] = [
  { value: 1, rotations: [{ axis: 'x', deg: -90 }, { axis: 'z', deg: 180 }] },
  ...ring([2, 3, 4], 19.47, 0, 0),
]

const SOLIDS: Record<number, Solid> = {
  4: { shape: 'triangle', faces: TETRA, inradius: INRADIUS.tetra },
  6: { shape: 'square', faces: CUBE, inradius: INRADIUS.cube },
  8: { shape: 'triangle', faces: OCTA, inradius: INRADIUS.octa },
  12: { shape: 'pentagon', faces: DODECA, inradius: INRADIUS.dodeca },
  20: { shape: 'triangle', faces: ICOSA, inradius: INRADIUS.icosa },
}

// Кубик, для которого настоящего правильного многогранника нет: d10 —
// трапецоэдр (не платоново тело, гранями-«змеями» на CSS выходит криво), d100
// и любая нестандартная нотация вроде 1d7. Показываем честный кубик-болванку:
// на передней грани выпавшее число, на остальных — соседние. Врать про форму
// хуже, чем показать простой кубик.
function fallbackSolid(sides: number, value: number): Solid {
  const around = (n: number) => ((((value + n - 1) % sides) + sides) % sides) + 1
  return {
    shape: 'square',
    faces: [
      { value, rotations: [] },
      { value: around(3), rotations: [{ axis: 'y', deg: 180 }] },
      { value: around(1), rotations: [{ axis: 'y', deg: 90 }] },
      { value: around(4), rotations: [{ axis: 'y', deg: -90 }] },
      { value: around(2), rotations: [{ axis: 'x', deg: -90 }] },
      { value: around(5), rotations: [{ axis: 'x', deg: 90 }] },
    ],
    inradius: INRADIUS.cube,
  }
}

// value нужен только болванке — у настоящих тел все числа уже на своих гранях.
export function solidFor(sides: number, value: number): Solid {
  return SOLIDS[sides] ?? fallbackSolid(sides, value)
}

export function faceWidth(shape: FaceShape, size: number): number {
  return size * FACE_OVERSIZE[shape]
}

export function faceHeight(shape: FaceShape, size: number): number {
  return faceWidth(shape, size) * FACE_ASPECT[shape]
}

// Повороты, отъезд на радиус, затем поправка центроида — она внутри
// плоскости грани, поэтому идёт последней.
export function faceTransform(f: SolidFace, shape: FaceShape, size: number, radiusPx: number): string {
  const parts = f.rotations.map((r) => `rotate${r.axis.toUpperCase()}(${r.deg}deg)`)
  parts.push(`translateZ(${radiusPx.toFixed(2)}px)`)
  const shift = CENTROID_SHIFT[shape] * faceHeight(shape, size)
  if (shift) parts.push(`translateY(${shift.toFixed(2)}px)`)
  return parts.join(' ')
}

// Обратный поворот: те же оси в обратном порядке с обратным знаком.
export function restTransform(f: SolidFace): string {
  const parts = f.rotations
    .slice()
    .reverse()
    .map((r) => `rotate${r.axis.toUpperCase()}(${-r.deg}deg)`)
  return parts.length ? parts.join(' ') : 'rotateX(0deg)'
}

export function clipPath(shape: FaceShape): string {
  if (shape === 'square') return 'none'
  if (shape === 'triangle') return 'polygon(50% 0%, 100% 100%, 0% 100%)'
  const pts: string[] = []
  for (let i = 0; i < 5; i++) {
    const a = (-90 + i * 72) * (Math.PI / 180)
    pts.push(`${(50 + 50 * Math.cos(a)).toFixed(2)}% ${(50 + 50 * Math.sin(a)).toFixed(2)}%`)
  }
  return `polygon(${pts.join(', ')})`
}
