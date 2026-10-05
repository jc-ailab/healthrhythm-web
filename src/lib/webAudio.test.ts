import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BreathCuePlayer, WebMetronome } from './webAudio'

// Minimal stand-ins for the browser audio APIs. They prove what the code asks the browser to do;
// whether iOS Safari then actually produces sound can only be checked on a real device.
class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state: 'suspended' | 'running' = 'suspended'
  sampleRate = 44100
  currentTime = 0
  destination = {}
  oscillators = 0
  silentBuffers = 0
  resumeCalls = 0
  private pendingResumes: (() => void)[] = []

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  resume() {
    this.resumeCalls += 1
    return new Promise<void>((resolve) => {
      this.pendingResumes.push(resolve)
    })
  }

  finishResume() {
    this.state = 'running'
    this.pendingResumes.splice(0).forEach((resolve) => resolve())
  }

  createBuffer() {
    return {}
  }

  createBufferSource() {
    return {
      buffer: null,
      connect: () => {},
      start: () => {
        this.silentBuffers += 1
      },
    }
  }

  createOscillator() {
    this.oscillators += 1
    return {
      type: '',
      frequency: { setValueAtTime: () => {} },
      connect: () => {},
      start: () => {},
      stop: () => {},
    }
  }

  createGain() {
    return {
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    }
  }
}

let audioSession: { type: string }

beforeEach(() => {
  vi.useFakeTimers()
  FakeAudioContext.instances = []
  audioSession = { type: 'auto' }
  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  })
  vi.stubGlobal('navigator', { audioSession })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

function clicksIn(context: FakeAudioContext, ms: number) {
  const before = context.oscillators
  vi.advanceTimersByTime(ms)
  return context.oscillators - before
}

describe('WebMetronome', () => {
  it('unlocks the audio path synchronously, inside the tap that starts Rhythm', () => {
    const metronome = new WebMetronome()

    // Not awaited: a tap handler only gets the work done before the first await.
    void metronome.unlock()

    const [context] = FakeAudioContext.instances
    expect(audioSession.type).toBe('playback')
    expect(context.resumeCalls).toBe(1)
    expect(context.silentBuffers).toBe(1)
  })

  it('does not depend on Breath audio having played first', async () => {
    const metronome = new WebMetronome()
    void metronome.unlock()
    const [context] = FakeAudioContext.instances
    context.finishResume()

    await metronome.start(180)

    expect(context.state).toBe('running')
    expect(clicksIn(context, 1000)).toBe(3) // 180 BPM -> one click every 333 ms
  })

  it('leaves a non-Safari browser without navigator.audioSession working', async () => {
    vi.stubGlobal('navigator', {})
    const metronome = new WebMetronome()
    void metronome.unlock()
    FakeAudioContext.instances[0].finishResume()

    await metronome.start(180)

    expect(clicksIn(FakeAudioContext.instances[0], 1000)).toBe(3)
  })

  it('still starts the metronome if the browser rejects the audio session change', async () => {
    vi.stubGlobal('navigator', {
      audioSession: {
        get type() {
          return 'auto'
        },
        set type(_value: string) {
          throw new Error('InvalidStateError')
        },
      },
    })
    const metronome = new WebMetronome()
    void metronome.unlock()
    FakeAudioContext.instances[0].finishResume()

    await metronome.start(180)

    expect(clicksIn(FakeAudioContext.instances[0], 1000)).toBe(3)
  })

  it('does not start clicking when paused before the audio context finished resuming', async () => {
    const metronome = new WebMetronome()
    const starting = metronome.start(180)
    metronome.stop()
    const [context] = FakeAudioContext.instances
    context.finishResume()
    await starting

    expect(context.oscillators).toBe(0)
    expect(clicksIn(context, 2000)).toBe(0)
  })

  it('runs a single interval across start, pause and start again', async () => {
    const metronome = new WebMetronome()
    void metronome.unlock()
    const [context] = FakeAudioContext.instances
    context.finishResume()

    await metronome.start(180)
    metronome.stop()
    expect(clicksIn(context, 1000)).toBe(0)

    await metronome.start(180)
    await metronome.start(180) // e.g. an effect re-running while already running
    expect(clicksIn(context, 1000)).toBe(3)
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('handles two overlapping starts without doubling the clicks', async () => {
    const metronome = new WebMetronome()
    const first = metronome.start(180)
    const second = metronome.start(180)
    FakeAudioContext.instances[0].finishResume()
    await Promise.all([first, second])
    await flush()

    expect(clicksIn(FakeAudioContext.instances[0], 1000)).toBe(3)
  })
})

describe('BreathCuePlayer', () => {
  it('still plays cues through <audio> elements without touching the audio session', async () => {
    const played: string[] = []
    vi.stubGlobal(
      'Audio',
      class {
        currentTime = 0
        preload = ''
        src: string
        constructor(src: string) {
          this.src = src
        }
        pause() {}
        play() {
          played.push(this.src)
          return Promise.resolve()
        }
      },
    )
    const player = new BreathCuePlayer()

    await player.playCue('inhale')
    await player.playCue('exhale')

    expect(played).toEqual(['/audio/breath_inhale_qing.m4a', '/audio/breath_exhale_drum.m4a'])
    expect(audioSession.type).toBe('auto')
    expect(FakeAudioContext.instances).toHaveLength(0)
  })
})
