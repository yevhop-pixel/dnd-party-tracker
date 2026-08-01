// Одноразовый генератор apple-touch-icon.png без внешних зависимостей.
// iOS не умеет SVG-иконки, поэтому собираем минимальный валидный PNG вручную
// из raw-пикселей: zlib для сжатия сканлайнов, встроенный zlib.crc32 для CRC чанков.
// Запуск: node web/scripts/gen-icon.mjs
import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SIZE = 180
// #7c5cff — акцентный цвет темы (см. src/index.css --accent)
const R = 0x7c
const G = 0x5c
const B = 0xff

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput) >>> 0, 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// IHDR: width, height, bit depth 8, color type 2 (RGB), compression/filter/interlace 0
const ihdrData = Buffer.alloc(13)
ihdrData.writeUInt32BE(SIZE, 0)
ihdrData.writeUInt32BE(SIZE, 4)
ihdrData.writeUInt8(8, 8)
ihdrData.writeUInt8(2, 9)
ihdrData.writeUInt8(0, 10)
ihdrData.writeUInt8(0, 11)
ihdrData.writeUInt8(0, 12)

// Raw scanlines: filter byte 0 (None) + width * 3 (RGB) на строку, сплошной фон.
const rowBytes = 1 + SIZE * 3
const raw = Buffer.alloc(rowBytes * SIZE)
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * rowBytes
  raw[rowStart] = 0 // filter: None
  for (let x = 0; x < SIZE; x++) {
    const px = rowStart + 1 + x * 3
    raw[px] = R
    raw[px + 1] = G
    raw[px + 2] = B
  }
}

const idatData = deflateSync(raw)

const png = Buffer.concat([
  PNG_SIGNATURE,
  chunk('IHDR', ihdrData),
  chunk('IDAT', idatData),
  chunk('IEND', Buffer.alloc(0)),
])

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons', 'apple-touch-icon.png')
writeFileSync(outPath, png)
console.log(`Written ${outPath} (${png.length} bytes)`)
