// ============ Audio prosedural (WebAudio): mesin & efek suara ============

export class AudioManager {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private volumes = { master: 0.8, engine: 0.7, sfx: 0.8 };
  private engineOn = false;

  private ensure(): boolean {
    if (this.ctx) return true;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      // noise buffer untuk tabrakan
      const len = this.ctx.sampleRate * 0.6;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      this.noiseBuf = buf;
      return true;
    } catch {
      return false;
    }
  }

  setVolumes(master: number, engine: number, sfx: number): void {
    this.volumes = { master: master / 100, engine: engine / 100, sfx: sfx / 100 };
    if (this.engineGain) this.engineGain.gain.value = this.engineGainLevel();
  }

  private engineGainLevel(): number {
    return 0.05 * this.volumes.engine * this.volumes.master;
  }

  startEngine(): void {
    if (!this.ensure() || !this.ctx || this.engineOn) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 40;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = this.ctx.createGain();
    gain.gain.value = this.engineGainLevel();
    osc.connect(filter).connect(gain).connect(this.ctx.destination);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
    this.engineFilter = filter;
    this.engineOn = true;
  }

  stopEngine(): void {
    if (this.engineOsc && this.ctx) {
      try { this.engineOsc.stop(); } catch { /* sudah berhenti */ }
      this.engineOsc.disconnect();
    }
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.engineOn = false;
  }

  updateEngine(rpm: number, throttle: number, running: boolean): void {
    if (!this.engineOn || !this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter) return;
    const f = 32 + (rpm / 60) * 1.9;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    this.engineFilter.frequency.setTargetAtTime(350 + rpm * 0.55, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(
      running ? this.engineGainLevel() * (0.5 + throttle * 0.9) : this.engineGainLevel() * 0.35,
      this.ctx.currentTime, 0.08);
  }

  private blip(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2): void {
    if (!this.ensure() || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol * this.volumes.sfx * this.volumes.master, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }

  sfxClick(): void { this.blip(880, 0.06, 'square', 0.12); }
  sfxDeny(): void { this.blip(160, 0.18, 'sawtooth', 0.15); }
  sfxSuccess(): void { this.blip(660, 0.1, 'sine', 0.2); setTimeout(() => this.blip(990, 0.16, 'sine', 0.2), 90); }
  sfxDeposit(): void { this.blip(520, 0.12, 'sine', 0.22); setTimeout(() => this.blip(780, 0.12, 'sine', 0.22), 100); setTimeout(() => this.blip(1040, 0.25, 'sine', 0.22), 200); }
  sfxLevelUp(): void { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.18), i * 110)); }

  sfxCrash(strength: number): void {
    if (!this.ensure() || !this.ctx || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300 + strength * 120;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.6, 0.15 + strength * 0.05) * this.volumes.sfx * this.volumes.master, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start();
  }
}
