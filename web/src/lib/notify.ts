// Общие «пинки» пользователю: короткий звук и системная всплывашка браузера.
// Вынесено из ChatNotifier, потому что тем же самым пользуется трекер боя
// («твой ход»). Файлов со звуком в проекте нет принципиально — синтезируем.

export function playBlip() {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    gain.connect(ctx.destination)
    for (const [freq, at] of [
      [660, 0],
      [880, 0.12],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + at)
      osc.connect(gain)
      osc.start(now + at)
      osc.stop(now + at + 0.14)
    }
    // Контекст закрываем сами — иначе на каждое событие остаётся висеть
    // новый, и браузер рано или поздно перестанет их выдавать.
    window.setTimeout(() => void ctx.close(), 600)
  } catch {
    // Звук — необязательная деталь: если браузер не дал контекст (не было
    // ещё ни одного жеста пользователя), молча живём дальше.
  }
}

// tag: одно окно уведомления на кампанию/тему, чтобы двадцать событий не
// выстроились двадцатью всплывашками.
export function notify(title: string, body: string, tag: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body: body.slice(0, 140), tag })
  } catch {
    // Notification может быть запрещён политикой страницы — не беда.
  }
}
