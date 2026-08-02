// Часы партии: четыре человека в четырёх часовых поясах, и «во сколько
// собираемся» каждый раз считали в уме. Здесь время у всех сразу, с
// разницей относительно того, кто смотрит.
import { useEffect, useState } from 'react'
import './clock.css'

interface City {
  zone: string
  city: string
  who: string
}

const CITIES: City[] = [
  { zone: 'America/Toronto', city: 'Торонто', who: '🇨🇦' },
  { zone: 'Europe/Berlin', city: 'Берлин', who: '🇩🇪' },
  { zone: 'Europe/Kyiv', city: 'Киев', who: '🇺🇦' },
  { zone: 'Asia/Tokyo', city: 'Токио', who: '🇯🇵' },
]

// Смещение зоны от UTC в минутах на конкретный момент. Считаем через
// Intl, а не по таблице: летнее время в Торонто, Берлине и Киеве
// переключается в разные даты, захардкоженные +2/-5 врали бы дважды в год.
function offsetMinutes(zone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return Math.round((asUtc - at.getTime()) / 60000)
}

function formatTime(zone: string, at: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(at)
}

function formatDate(zone: string, at: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: zone, day: '2-digit', month: 'short', weekday: 'short' }).format(at)
}

// «Сегодня/завтра/вчера» относительно смотрящего — самое частое, что нужно
// знать: у кого уже наступил следующий день.
function dayShift(zone: string, at: Date, localZone: string): string {
  const day = (z: string) => new Intl.DateTimeFormat('en-CA', { timeZone: z, dateStyle: 'short' }).format(at)
  const theirs = day(zone)
  const mine = day(localZone)
  if (theirs === mine) return ''
  return theirs > mine ? 'завтра' : 'вчера'
}

function formatDiff(minutes: number): string {
  if (minutes === 0) return 'то же время'
  const sign = minutes > 0 ? '+' : '−'
  const abs = Math.abs(minutes)
  const hours = Math.floor(abs / 60)
  const rest = abs % 60
  return `${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''} ч`
}

export default function WorldClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Раз в 15 секунд достаточно: показываем часы и минуты, секунды не нужны.
    const id = window.setInterval(() => setNow(new Date()), 15000)
    return () => window.clearInterval(id)
  }, [])

  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const localOffset = offsetMinutes(localZone, now)

  return (
    <div className="world-clock">
      {CITIES.map((c) => {
        const diff = offsetMinutes(c.zone, now) - localOffset
        const shift = dayShift(c.zone, now, localZone)
        const isMine = c.zone === localZone
        return (
          <div key={c.zone} className={`clock-card${isMine ? ' clock-card-mine' : ''}`}>
            <div className="clock-city">
              <span className="clock-flag">{c.who}</span>
              {c.city}
              {isMine && <span className="clock-you">ты</span>}
            </div>
            <div className="clock-time">{formatTime(c.zone, now)}</div>
            <div className="clock-meta">
              {formatDate(c.zone, now)}
              {shift && <span className="clock-shift"> · {shift}</span>}
            </div>
            <div className="clock-diff">{formatDiff(diff)}</div>
          </div>
        )
      })}
    </div>
  )
}
