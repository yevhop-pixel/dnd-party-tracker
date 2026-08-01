// Отдельный файл специально: shorthand-объявление ambient-модуля должно жить
// в файле без собственных import/export (иначе TS не регистрирует его глобально
// для резолва специфаера 'leaflet-rotate') — см. leaflet-rotate.d.ts рядом,
// где вместо этого аугментируются типы leaflet.
declare module 'leaflet-rotate'
