import type { BreathPhase } from './domain'

type AudioContextLike = AudioContext

function createAudioContext(): AudioContextLike | null {
  const Context = window.AudioContext
  if (!Context) {
    return null
  }

  return new Context()
}

export class WebMetronome {
  private context: AudioContextLike | null = null
  private intervalId: number | null = null
  private bpm = 180

  async unlock() {
    this.context = this.context ?? createAudioContext()
    if (!this.context) {
      return
    }

    if (this.context.state !== 'running') {
      await this.context.resume()
    }
  }

  async start(bpm: number) {
    this.bpm = bpm
    await this.unlock()

    if (!this.context || this.intervalId !== null) {
      return
    }

    this.playClick()
    const intervalMs = Math.round((60 / this.bpm) * 1000)
    this.intervalId = window.setInterval(() => {
      this.playClick()
    }, intervalMs)
  }

  stop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private playClick() {
    if (!this.context) {
      return
    }

    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const currentTime = this.context.currentTime

    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(1320, currentTime)
    gain.gain.setValueAtTime(0.0001, currentTime)
    gain.gain.exponentialRampToValueAtTime(0.22, currentTime + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, currentTime + 0.045)

    oscillator.connect(gain)
    gain.connect(this.context.destination)
    oscillator.start(currentTime)
    oscillator.stop(currentTime + 0.05)
  }
}

export class BreathCuePlayer {
  private audioByPhase: Partial<Record<BreathPhase, HTMLAudioElement>> = {}
  private hasUnlocked = false

  async unlock() {
    if (this.hasUnlocked) {
      return
    }

    const phases: BreathPhase[] = ['inhale', 'hold', 'exhale', 'endHold']
    for (const phase of phases) {
      this.audioByPhase[phase] = this.audioByPhase[phase] ?? createCueAudio(phase)
    }

    this.hasUnlocked = true
  }

  async playCue(phase: BreathPhase) {
    await this.unlock()

    const audio = this.audioByPhase[phase]
    if (!audio) {
      return
    }

    audio.pause()
    audio.currentTime = 0
    try {
      await audio.play()
    } catch {
      // Browser autoplay policy can still block playback until the user interacts again.
    }
  }

  stop() {
    Object.values(this.audioByPhase).forEach((audio) => {
      if (!audio) {
        return
      }

      audio.pause()
      audio.currentTime = 0
    })
  }
}

function createCueAudio(phase: BreathPhase) {
  const audio = new Audio(audioPathForPhase(phase))
  audio.preload = 'auto'
  return audio
}

function audioPathForPhase(phase: BreathPhase) {
  switch (phase) {
    case 'inhale':
      return '/audio/breath_inhale_qing.m4a'
    case 'hold':
    case 'endHold':
      return '/audio/breath_hold_water.m4a'
    case 'exhale':
      return '/audio/breath_exhale_drum.m4a'
  }
}
