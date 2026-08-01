// leaflet-rotate не публикует собственные типы (UMD-скрипт, который просто патчит
// глобальный L.Map/L.Control при импорте) — модуль без типов регистрируется рядом,
// в leaflet-rotate-module.d.ts (shorthand-объявление обязано жить в файле без
// import/export, иначе TS не подхватывает его для резолва специфаеров).
//
// Здесь — аугментация типов leaflet тем, что плагин добавляет в рантайме.
// `export {}` делает файл настоящим ES-модулем: без этого `declare module 'leaflet'`
// ниже трактуется как ПОЛНОЕ переобъявление модуля (перекрывает реальные типы из
// @types/leaflet), а не как аугментация поверх них.
export {}

declare module 'leaflet' {
  interface RotateControlOptions extends ControlOptions {
    closeOnZeroBearing?: boolean
  }

  interface MapOptions {
    rotate?: boolean
    bearing?: number
    touchRotate?: boolean
    rotateControl?: boolean | RotateControlOptions
    shiftKeyRotate?: boolean
  }

  interface Map {
    setBearing(bearing: number): this
    getBearing(): number
  }
}
