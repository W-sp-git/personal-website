// Quiet, original wind and surf synthesized in the browser. Nothing autoplays.
export class Ambience {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = false;
  }
  async setEnabled(enabled) {
    if (!enabled) {
      this.enabled = false;
      if (this.context && this.master) {
        this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.3);
      }
      return false;
    }
    if (!this.context) this.create();
    await this.context.resume();
    this.master.gain.setTargetAtTime(0.17, this.context.currentTime, 0.6);
    this.enabled = true;
    return true;
  }
  create() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("Audio unavailable");
    const ctx = new Context();
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const buffer = ctx.createBuffer(2, ctx.sampleRate * 14, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const channel = buffer.getChannelData(c);
      let brown = 0;
      for (let i = 0; i < channel.length; i++) {
        brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        channel[i] = brown * 3.5;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const wind = ctx.createBiquadFilter();
    wind.type = "bandpass";
    wind.frequency.value = 380;
    wind.Q.value = 0.55;
    const wave = ctx.createBiquadFilter();
    wave.type = "lowpass";
    wave.frequency.value = 900;
    wave.Q.value = 0.4;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.42;
    const waveGain = ctx.createGain();
    waveGain.gain.value = 0.24;
    source.connect(wind);
    wind.connect(windGain);
    windGain.connect(this.master);
    source.connect(wave);
    wave.connect(waveGain);
    waveGain.connect(this.master);
    const tide = ctx.createOscillator();
    tide.frequency.value = 0.105;
    const tideGain = ctx.createGain();
    tideGain.gain.value = 0.15;
    tide.connect(tideGain);
    tideGain.connect(waveGain.gain);
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.063;
    const gustGain = ctx.createGain();
    gustGain.gain.value = 0.14;
    gust.connect(gustGain);
    gustGain.connect(windGain.gain);
    source.start();
    tide.start();
    gust.start();
  }
  async suspend() {
    if (this.context?.state === "running") await this.context.suspend();
  }
  async resume() {
    if (this.enabled && this.context) await this.context.resume();
  }
}
