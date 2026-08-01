// Звук крит-броска — чистый WebAudio, без внешних аудиофайлов (по просьбе
// владельца — задорный 8-бит джингл на успех, "вау-вау-вааа" на провал).
// Один AudioContext-синглтон на вкладку; если браузер блокирует автоплей
// (нет пользовательского жеста до этого момента) — молча остаёмся без звука,
// анимация оверлея от этого не страдает.

const MASTER_GAIN = 0.12

let sharedCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  try {
    if (!sharedCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      sharedCtx = new Ctor()
    }
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume().catch(() => {
        /* автоплей заблокирован — играем без звука */
      })
    }
    return sharedCtx
  } catch {
    return null
  }
}

interface ToneOptions {
  type: OscillatorType
  freq: number
  start: number
  duration: number
  gain: number
  lowpassHz?: number
  vibrato?: { rateHz: number; depthHz: number }
}

// Один звук: осциллятор + огибающая громкости (короткие attack/release, чтобы
// не щёлкало), опционально lowpass-фильтр и вибрато через LFO на частоту.
// Останавливающие колбэки копим в stopNodes — их дёргает cleanup при unmount.
function scheduleTone(ctx: AudioContext, master: GainNode, opts: ToneOptions, stopNodes: Array<() => void>) {
  const osc = ctx.createOscillator()
  osc.type = opts.type
  osc.frequency.setValueAtTime(opts.freq, opts.start)

  const gainNode = ctx.createGain()
  const attack = Math.min(0.015, opts.duration * 0.2)
  const release = Math.min(0.05, opts.duration * 0.3)
  gainNode.gain.setValueAtTime(0, opts.start)
  gainNode.gain.linearRampToValueAtTime(opts.gain, opts.start + attack)
  gainNode.gain.setValueAtTime(opts.gain, opts.start + opts.duration - release)
  gainNode.gain.linearRampToValueAtTime(0, opts.start + opts.duration)
  gainNode.connect(master)

  if (opts.lowpassHz) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = opts.lowpassHz
    osc.connect(filter)
    filter.connect(gainNode)
  } else {
    osc.connect(gainNode)
  }

  let lfo: OscillatorNode | null = null
  if (opts.vibrato) {
    lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = opts.vibrato.rateHz
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = opts.vibrato.depthHz
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    lfo.start(opts.start)
    lfo.stop(opts.start + opts.duration + 0.05)
  }

  osc.start(opts.start)
  osc.stop(opts.start + opts.duration + 0.05)

  stopNodes.push(() => {
    try {
      osc.stop()
    } catch {
      /* уже остановлен */
    }
    try {
      lfo?.stop()
    } catch {
      /* уже остановлен */
    }
  })
}

// Задорный 8-бит джингл: быстрое мажорное арпеджио C5-E5-G5-C6 восьмыми
// (square) в темпе ~150bpm, с триангл-басом на каждую долю фразы.
function playSuccessJingle(ctx: AudioContext, master: GainNode, now: number, durationSec: number, stopNodes: Array<() => void>) {
  const EIGHTH = 60 / 150 / 2 // ~0.2s при 150bpm
  const PATTERN = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  const BASS_NOTE = 130.81 // C3

  let t = now
  let i = 0
  while (t < now + durationSec) {
    scheduleTone(ctx, master, { type: 'square', freq: PATTERN[i % PATTERN.length], start: t, duration: EIGHTH * 0.85, gain: 0.9 }, stopNodes)
    if (i % PATTERN.length === 0) {
      const bassDur = Math.min(EIGHTH * PATTERN.length * 0.9, now + durationSec - t)
      scheduleTone(ctx, master, { type: 'triangle', freq: BASS_NOTE, start: t, duration: bassDur, gain: 0.5 }, stopNodes)
    }
    t += EIGHTH
    i += 1
  }
}

// "Вау-вау-вааа": три нисходящие ноты sawtooth с lowpass, последняя —
// длинная, с вибрато (классический тромбонный "womp womp womp").
function playFailJingle(ctx: AudioContext, master: GainNode, now: number, durationSec: number, stopNodes: Array<() => void>) {
  const NOTES = [440.0, 392.0, 349.23] // A4 G4 F4
  const gap = 0.03
  const shortDur = durationSec * 0.22
  const longDur = Math.max(durationSec - shortDur * 2 - gap * 2, shortDur)

  let t = now
  scheduleTone(ctx, master, { type: 'sawtooth', freq: NOTES[0], start: t, duration: shortDur, gain: 0.7, lowpassHz: 1200 }, stopNodes)
  t += shortDur + gap
  scheduleTone(ctx, master, { type: 'sawtooth', freq: NOTES[1], start: t, duration: shortDur, gain: 0.7, lowpassHz: 1200 }, stopNodes)
  t += shortDur + gap
  scheduleTone(
    ctx,
    master,
    { type: 'sawtooth', freq: NOTES[2], start: t, duration: longDur, gain: 0.7, lowpassHz: 1000, vibrato: { rateHz: 6, depthHz: 10 } },
    stopNodes,
  )
}

// Проигрывает джингл на крит-бросок. Возвращает stop() — вызывать при
// unmount оверлея (fade + остановка осцилляторов), даже если джингл ещё не
// доиграл до конца durationMs.
export function playCritSound(kind: 'success' | 'fail', durationMs: number): () => void {
  const ctx = getContext()
  if (!ctx) return () => {}

  const master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  master.connect(ctx.destination)

  const stopNodes: Array<() => void> = []
  const now = ctx.currentTime
  const durationSec = durationMs / 1000

  if (kind === 'success') {
    playSuccessJingle(ctx, master, now, durationSec, stopNodes)
  } else {
    playFailJingle(ctx, master, now, durationSec, stopNodes)
  }

  // Плавный уход общей громкости к концу durationMs — щелчков не будет,
  // даже если последняя нота досчитана точно до края.
  master.gain.setValueAtTime(MASTER_GAIN, now + Math.max(0, durationSec - 0.15))
  master.gain.linearRampToValueAtTime(0, now + durationSec)

  let stopped = false
  return function stop() {
    if (stopped) return
    stopped = true
    try {
      const t = ctx.currentTime
      master.gain.cancelScheduledValues(t)
      master.gain.setValueAtTime(master.gain.value, t)
      master.gain.linearRampToValueAtTime(0, t + 0.08)
      stopNodes.forEach((fn) => fn())
      setTimeout(() => {
        try {
          master.disconnect()
        } catch {
          /* уже отключено */
        }
      }, 120)
    } catch {
      /* контекст закрыт/автоплей заблокирован — молча игнорируем */
    }
  }
}
