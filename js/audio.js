// Klänge: alles wird per Web Audio im Browser erzeugt – keine Sounddateien, daher offline, winzig
// und auch im Einzeldatei-Build enthalten. Umgebung (Meer, Bach, Wind, Wald, Stadt) passt sich
// dem sichtbaren Kartenausschnitt an, Effekte begleiten Bewegung, Kampf und Ereignisse.

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.ambLevel = 0.6;
    this.mix = { ocean: 0, brook: 0, wind: 0.2, forest: 0, city: 0 };
    this.next = {};
  }

  // Muss nach einer Nutzeraktion aufgerufen werden (Browser-Regel für Audio)
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  setOptions({ sfx, ambience }) {
    if (sfx != null) this.sfxOn = sfx;
    if (ambience != null) this.ambLevel = ambience;
    if (this.ctx) this.amb.gain.setTargetAtTime(this.ambLevel * 0.55, this.ctx.currentTime, 0.4);
  }

  // ------------------------------------------------------------ Aufbau
  build() {
    const c = this.ctx;
    this.master = c.createDynamicsCompressor();
    this.master.threshold.value = -14;
    this.master.ratio.value = 4;
    this.master.connect(c.destination);
    this.fx = c.createGain();
    this.fx.gain.value = 1.5;
    this.fx.connect(this.master);
    this.amb = c.createGain();
    this.amb.gain.value = this.ambLevel * 0.55;
    this.amb.connect(this.master);
    // Leichter Hall für Weite
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(1.8);
    const wet = c.createGain();
    wet.gain.value = 0.22;
    this.verb.connect(wet);
    wet.connect(this.master);

    this.white = this.noiseBuffer('white');
    this.pink = this.noiseBuffer('pink');
    this.brown = this.noiseBuffer('brown');

    // Meer: tiefes Rauschen, Wellen per Hüllkurve, dazu Gischt
    this.ocean = this.layer();
    this.oceanFilter = c.createBiquadFilter();
    this.oceanFilter.type = 'lowpass';
    this.oceanFilter.frequency.value = 400;
    this.waveGain = c.createGain();
    this.waveGain.gain.value = 0.2;
    this.loop(this.brown).connect(this.oceanFilter).connect(this.waveGain).connect(this.ocean);
    const foamF = c.createBiquadFilter();
    foamF.type = 'highpass';
    foamF.frequency.value = 2500;
    this.foamGain = c.createGain();
    this.foamGain.gain.value = 0.02;
    this.loop(this.white).connect(foamF).connect(this.foamGain).connect(this.ocean);

    // Wind: Rosa Rauschen durch wandernden Bandpass
    this.wind = this.layer();
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.9;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0.5;
    this.loop(this.pink).connect(this.windFilter).connect(this.windGain).connect(this.wind);

    // Bach: helles, flatterndes Rauschen + einzelne Tropfen (siehe tick)
    this.brook = this.layer();
    const bf = c.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 1900;
    bf.Q.value = 0.8;
    const flutter = c.createGain();
    flutter.gain.value = 0.12;
    const lfo = c.createOscillator();
    lfo.frequency.value = 6.3;
    const lfoAmt = c.createGain();
    lfoAmt.gain.value = 0.06;
    lfo.connect(lfoAmt).connect(flutter.gain);
    lfo.start();
    this.loop(this.white).connect(bf).connect(flutter).connect(this.brook);

    // Stadt: entferntes Stimmengemurmel
    this.city = this.layer();
    const cf = c.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.value = 450;
    cf.Q.value = 1.6;
    const murmur = c.createGain();
    murmur.gain.value = 0.18;
    const mlfo = c.createOscillator();
    mlfo.frequency.value = 0.7;
    const mAmt = c.createGain();
    mAmt.gain.value = 0.08;
    mlfo.connect(mAmt).connect(murmur.gain);
    mlfo.start();
    this.loop(this.pink).connect(cf).connect(murmur).connect(this.city);

    this.forest = this.layer(); // nur Ereignisse (Vögel)
    this.timer = setInterval(() => this.tick(), 200);
  }

  layer() {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.amb);
    return g;
  }

  noiseBuffer(kind) {
    const c = this.ctx;
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
    }
    // Übergang am Schleifenende glätten
    for (let i = 0; i < 2000; i++) d[len - 1 - i] = d[len - 1 - i] * (i / 2000) + d[i] * (1 - i / 2000);
    return buf;
  }

  impulse(sec) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  loop(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  // ------------------------------------------------------------ Umgebung
  // Anteile 0..1 aus dem sichtbaren Kartenausschnitt
  setAmbience(m) {
    if (!this.ctx) return;
    Object.assign(this.mix, m);
    const t = this.ctx.currentTime;
    const set = (node, v) => node.gain.setTargetAtTime(v, t, 1.2);
    set(this.ocean, this.mix.ocean * 0.9);
    set(this.wind, 0.18 + this.mix.wind * 0.6);
    set(this.brook, this.mix.brook * 0.55);
    set(this.city, this.mix.city * 0.5);
    set(this.forest, this.mix.forest);
  }

  tick() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.ambLevel <= 0) return;
    const t = c.currentTime, m = this.mix;
    const due = (k, min, max) => {
      if (this.next[k] == null) this.next[k] = t + min + Math.random() * (max - min);
      if (t < this.next[k]) return false;
      this.next[k] = t + min + Math.random() * (max - min);
      return true;
    };
    // Wellen
    if (m.ocean > 0.02 && due('wave', 4, 8)) {
      const d = 4.5 + Math.random() * 3, peak = 0.55 + Math.random() * 0.45;
      const g = this.waveGain.gain, f = this.oceanFilter.frequency, fg = this.foamGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(peak, t + d * 0.45);
      g.linearRampToValueAtTime(0.15, t + d);
      f.cancelScheduledValues(t);
      f.setValueAtTime(f.value, t);
      f.linearRampToValueAtTime(900, t + d * 0.45);
      f.linearRampToValueAtTime(320, t + d);
      fg.cancelScheduledValues(t);
      fg.setValueAtTime(0.01, t);
      fg.linearRampToValueAtTime(0.09 * peak, t + d * 0.5);
      fg.linearRampToValueAtTime(0.01, t + d);
    }
    // Windböen
    if (due('gust', 2, 6)) {
      this.windFilter.frequency.setTargetAtTime(280 + Math.random() * 900, t, 1.5);
      this.windGain.gain.setTargetAtTime(0.25 + Math.random() * 0.75, t, 2);
    }
    // Plätschern: kleine Tropfen
    if (m.brook > 0.02) {
      const n = Math.random() < m.brook * 1.6 ? 1 + Math.floor(Math.random() * 3) : 0;
      for (let i = 0; i < n; i++) this.droplet(this.brook, t + Math.random() * 0.2);
    }
    // Vögel im Wald (und etwas auf Wiesen)
    if (m.forest > 0.05 && due('bird', 2.5, 9) && Math.random() < 0.4 + m.forest) this.bird(this.forest, t);
    // Stadt: ab und zu ein entfernter Schmiedeschlag, unregelmäßig
    if (m.city > 0.05 && due('smith', 5, 14) && Math.random() < m.city * 1.2) {
      let tt = t;
      const k = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < k; i++) {
        this.clank(this.city, tt, 0.05, Math.random() * 0.8 - 0.4);
        tt += 0.35 + Math.random() * 0.5;
      }
    }
  }

  // ------------------------------------------------------------ Bausteine
  out(dest, pan) {
    const c = this.ctx;
    let node = dest;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(dest);
      node = p;
    }
    return node;
  }

  env(dest, t, vol, attack, decay, pan, verb = 0.3) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    const o = this.out(dest, pan);
    g.connect(o);
    if (verb && dest === this.fx) {
      const s = this.ctx.createGain();
      s.gain.value = verb;
      g.connect(s).connect(this.verb);
    }
    return g;
  }

  tone(dest, t, { type = 'sine', f, f2, dur = 0.2, vol = 0.2, attack = 0.005, pan = 0, verb }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    o.connect(this.env(dest, t, vol, attack, dur, pan, verb));
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  noise(dest, t, { buf = this.white, type = 'bandpass', f = 1000, f2, q = 1, dur = 0.2, vol = 0.2, attack = 0.005, pan = 0, verb }) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    fl.Q.value = q;
    s.connect(fl).connect(this.env(dest, t, vol, attack, dur, pan, verb));
    s.start(t, Math.random() * (buf.duration - 1));
    s.stop(t + attack + dur + 0.05);
  }

  metal(dest, t, base, vol, decay, pan = 0) {
    for (const [r, a] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]]) {
      this.tone(dest, t, { f: base * r, dur: decay / Math.sqrt(r), vol: vol * a, attack: 0.002, pan });
    }
    this.noise(dest, t, { type: 'highpass', f: 3000, dur: 0.03, vol: vol * 0.8, pan });
  }

  // Gezupfte Saite (Karplus-Strong) – klingt natürlich statt nach Synthesizer
  pluckBuffer(f, dur, damp) {
    const key = f + ':' + dur + ':' + damp;
    this.cache ||= new Map();
    let buf = this.cache.get(key);
    if (buf) return buf;
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * dur);
    buf = c.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const P = Math.max(2, Math.round(sr / f));
    const line = new Float32Array(P);
    for (let i = 0; i < P; i++) line[i] = Math.random() * 2 - 1;
    let idx = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const v = line[idx];
      const nv = damp * 0.5 * (v + prev);
      prev = v;
      line[idx] = nv;
      d[i] = v * 0.6;
      idx = (idx + 1) % P;
    }
    this.cache.set(key, buf);
    return buf;
  }

  pluck(dest, t, { f, dur = 0.5, damp = 0.996, vol = 0.3, pan = 0, lp = 4000, verb }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.pluckBuffer(f, dur, damp);
    const fl = this.ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    src.connect(fl).connect(this.env(dest, t, vol, 0.002, dur, pan, verb));
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // Viele kleine Rauschkörner: Geröll, Splitter, Knistern
  grains(dest, t, { n = 12, spread = 0.5, fmin = 500, fmax = 3000, vol = 0.08, pan = 0, decay = true }) {
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const dt = (decay ? r * r : r) * spread;
      this.noise(dest, t + dt, { type: 'bandpass', f: fmin + Math.random() * (fmax - fmin), q: 2 + Math.random() * 4, dur: 0.02 + Math.random() * 0.05, vol: vol * (decay ? 1 - dt / (spread * 1.3) : 1) * (0.5 + Math.random() * 0.5), pan: pan + Math.random() * 0.3 - 0.15, verb: 0.2 });
    }
  }

  // Dumpfer Schlag mit Körper (ohne Tonhöhengleiten)
  thump(dest, t, { f = 60, vol = 0.4, dur = 0.4, pan = 0, verb = 0.3 }) {
    for (const [r, a] of [[1, 1], [1.47, 0.5], [2.09, 0.25]]) this.tone(dest, t, { f: f * r, dur: dur / r, vol: vol * a, attack: 0.006, pan, verb });
  }

  // Metallisches Klirren mit Rauschanteil (Schmied, Rüstung)
  clank(dest, t, vol, pan = 0) {
    this.noise(dest, t, { type: 'bandpass', f: 2600 + Math.random() * 1200, q: 6, dur: 0.12, vol: vol * 1.6, pan, verb: 0.3 });
    this.noise(dest, t, { type: 'highpass', f: 4000, dur: 0.03, vol: vol, pan });
    this.tone(dest, t, { f: 1700 + Math.random() * 400, dur: 0.18, vol: vol * 0.35, pan });
  }

  bell(dest, t, base, vol) {
    for (const [r, a, d] of [[1, 1, 3], [2, 0.5, 2.2], [2.4, 0.4, 2], [3, 0.3, 1.6], [4.2, 0.2, 1]]) {
      this.tone(dest, t, { f: base * r, dur: d, vol: vol * a, attack: 0.004 });
    }
  }

  droplet(dest, t) {
    const f = 500 + Math.random() * 1100;
    this.tone(dest, t, { f, f2: f * (1.4 + Math.random() * 0.6), dur: 0.035 + Math.random() * 0.04, vol: 0.1 + Math.random() * 0.1, attack: 0.003, pan: Math.random() * 1.2 - 0.6 });
  }

  bird(dest, t) {
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1800;
    const pan = Math.random() * 1.6 - 0.8;
    const up = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const f = base * (1 + (up ? i : -i) * 0.06);
      this.tone(dest, t + i * 0.11, { f, f2: f * (Math.random() < 0.5 ? 1.25 : 0.8), dur: 0.07, vol: 0.12, attack: 0.008, pan });
    }
  }

  // ------------------------------------------------------------ Effekte
  // name: Effekt, opts: { pan: -1..1, vol: Faktor, delay: Sekunden, steps, stepMs }
  play(name, opts = {}) {
    const c = this.ctx;
    if (!c || !this.sfxOn || c.state !== 'running') return;
    const t = c.currentTime + (opts.delay || 0) + 0.01;
    const pan = opts.pan || 0;
    const v = opts.vol ?? 1;
    const d = this.fx;
    switch (name) {
      case 'select':
        this.tone(d, t, { f: 1250, f2: 1500, dur: 0.04, vol: 0.08 * v, pan, verb: 0 });
        break;
      case 'error':
        this.tone(d, t, { type: 'triangle', f: 220, f2: 160, dur: 0.16, vol: 0.12 * v, pan, verb: 0 });
        break;
      case 'steps':
      case 'hooves':
      case 'wheels':
      case 'stomp':
      case 'wings':
      case 'glide': {
        const steps = Math.min(8, opts.steps || 2), dt = (opts.stepMs || 120) / 1000;
        for (let i = 0; i < steps; i++) {
          const ti = t + i * dt;
          if (name === 'steps') this.noise(d, ti, { buf: this.brown, type: 'lowpass', f: 700, dur: 0.06, vol: 0.3 * v, pan, verb: 0.1 });
          else if (name === 'hooves') {
            this.noise(d, ti, { type: 'bandpass', f: 1400, q: 4, dur: 0.04, vol: 0.45 * v, pan, verb: 0.15 });
            this.noise(d, ti + dt * 0.35, { type: 'bandpass', f: 1100, q: 4, dur: 0.04, vol: 0.35 * v, pan, verb: 0.15 });
          } else if (name === 'wheels') {
            this.tone(d, ti, { type: 'sawtooth', f: 70 + Math.random() * 20, f2: 55, dur: dt * 0.9, vol: 0.035 * v, pan, verb: 0.1 });
            this.noise(d, ti, { buf: this.brown, type: 'lowpass', f: 300, dur: dt, vol: 0.12 * v, pan, verb: 0 });
          } else if (name === 'stomp') {
            this.thump(d, ti, { f: 42, vol: 0.3 * v, dur: 0.3, pan, verb: 0.3 });
            this.noise(d, ti, { buf: this.brown, type: 'lowpass', f: 180, dur: 0.2, vol: 0.3 * v, pan, verb: 0.2 });
          } else if (name === 'wings') {
            if (i % 2 === 0) {
              this.noise(d, ti, { buf: this.pink, type: 'lowpass', f: 500, dur: dt * 1.4, vol: 0.55 * v, attack: dt * 0.5, pan, verb: 0.3 });
              this.thump(d, ti + dt * 0.5, { f: 40, vol: 0.12 * v, dur: 0.25, pan, verb: 0.2 });
            }
          } else {
            this.noise(d, ti, { type: 'bandpass', f: 900, f2: 1600, q: 0.7, dur: dt * 0.8, vol: 0.15 * v, pan, verb: 0.2 });
          }
        }
        break;
      }
      case 'clash':
        this.clank(d, t, 0.12 * v, pan);
        this.metal(d, t, 1100 + Math.random() * 400, 0.06 * v, 0.35, pan);
        this.noise(d, t + 0.03, { type: 'bandpass', f: 3500, f2: 2000, q: 1.5, dur: 0.18, vol: 0.14 * v, pan });
        this.noise(d, t, { buf: this.brown, type: 'lowpass', f: 600, dur: 0.1, vol: 0.3 * v, pan });
        break;
      case 'hit':
        this.noise(d, t, { buf: this.brown, type: 'lowpass', f: 700, dur: 0.14, vol: 0.7 * v, pan, verb: 0.2 });
        this.thump(d, t, { f: 95, vol: 0.18 * v, dur: 0.15, pan, verb: 0.1 });
        this.grains(d, t, { n: 3, spread: 0.06, fmin: 1500, fmax: 3500, vol: 0.06 * v, pan });
        break;
      case 'bow':
        // Sehne: gezupfte, schnell gedämpfte Saite + Luftzug des Pfeils
        this.pluck(d, t, { f: 98, dur: 0.35, damp: 0.985, vol: 0.5 * v, pan, lp: 2500, verb: 0.15 });
        this.noise(d, t + 0.01, { type: 'highpass', f: 2500, dur: 0.03, vol: 0.12 * v, pan });
        this.noise(d, t + 0.04, { buf: this.pink, type: 'bandpass', f: 1600, f2: 900, q: 1.2, dur: 0.28, vol: 0.18 * v, attack: 0.04, pan });
        break;
      case 'thunk':
        this.noise(d, t, { buf: this.brown, type: 'lowpass', f: 1400, dur: 0.06, vol: 0.6 * v, pan, verb: 0.15 });
        this.pluck(d, t, { f: 210, dur: 0.12, damp: 0.96, vol: 0.25 * v, pan, lp: 1800 });
        break;
      case 'catapult':
        // Knarzendes Holz (Ratsche), Schlag des Wurfarms, dann der Luftzug des Steins
        for (let i = 0; i < 7; i++) this.noise(d, t + i * 0.035, { type: 'bandpass', f: 380 + Math.random() * 160, q: 9, dur: 0.03, vol: 0.22 * v, pan, verb: 0.1 });
        this.noise(d, t + 0.27, { buf: this.brown, type: 'lowpass', f: 1500, dur: 0.1, vol: 0.7 * v, pan, verb: 0.3 });
        this.pluck(d, t + 0.27, { f: 73, dur: 0.4, damp: 0.975, vol: 0.45 * v, pan, lp: 900, verb: 0.3 });
        this.noise(d, t + 0.32, { buf: this.pink, type: 'bandpass', f: 300, f2: 700, q: 1.1, dur: 0.6, vol: 0.32 * v, attack: 0.15, pan: pan + 0.1 });
        break;
      case 'boom':
        // Einschlag: tiefer Körper, Erdstoß, dann rieselndes Geröll
        this.noise(d, t, { buf: this.brown, type: 'lowpass', f: 1200, f2: 150, dur: 0.9, vol: 0.9 * v, attack: 0.004, pan, verb: 0.6 });
        this.thump(d, t, { f: 48, vol: 0.45 * v, dur: 0.7, pan, verb: 0.4 });
        this.noise(d, t, { type: 'bandpass', f: 1800, q: 0.8, dur: 0.08, vol: 0.3 * v, pan });
        this.grains(d, t + 0.05, { n: 26, spread: 0.9, fmin: 700, fmax: 4000, vol: 0.12 * v, pan });
        break;
      case 'fall':
        this.noise(d, t, { buf: this.brown, type: 'lowpass', f: 450, dur: 0.35, vol: 0.75 * v, pan, verb: 0.3 });
        this.thump(d, t, { f: 70, vol: 0.15 * v, dur: 0.3, pan });
        this.clank(d, t + 0.1, 0.035 * v, pan);
        this.grains(d, t + 0.05, { n: 5, spread: 0.25, fmin: 2000, fmax: 5000, vol: 0.04 * v, pan });
        break;
      case 'roar':
        // Brüllen: Rauschen durch Mund-Formanten, darunter ein kehliges Grollen
        for (const [f, a] of [[420, 1], [850, 0.7], [2300, 0.25]]) this.noise(d, t, { buf: this.pink, type: 'bandpass', f, f2: f * 0.8, q: 4, dur: 1.0, vol: 0.5 * a * v, attack: 0.12, pan, verb: 0.5 });
        this.noise(d, t, { buf: this.brown, type: 'lowpass', f: 220, dur: 1.0, vol: 0.5 * v, attack: 0.1, pan, verb: 0.3 });
        break;
      case 'smash':
        this.play('hit', { pan, vol: v * 1.3, delay: opts.delay });
        this.thump(d, t, { f: 45, vol: 0.4 * v, dur: 0.5, pan, verb: 0.4 });
        this.grains(d, t + 0.03, { n: 8, spread: 0.4, fmin: 600, fmax: 2500, vol: 0.07 * v, pan });
        break;
      case 'breath':
        // Feueratem: fauchendes, knisterndes Rauschen
        this.noise(d, t, { buf: this.pink, type: 'bandpass', f: 500, f2: 1800, q: 0.7, dur: 0.9, vol: 0.6 * v, attack: 0.15, pan, verb: 0.4 });
        this.noise(d, t, { buf: this.brown, type: 'lowpass', f: 300, dur: 0.9, vol: 0.4 * v, attack: 0.1, pan });
        this.grains(d, t + 0.1, { n: 22, spread: 0.9, fmin: 2500, fmax: 7000, vol: 0.06 * v, pan, decay: false });
        break;
      case 'heal':
        [880, 1109, 1319, 1760].forEach((f, i) => this.tone(d, t + i * 0.08, { f, dur: 0.6, vol: 0.07 * v, attack: 0.01, pan, verb: 0.6 }));
        this.noise(d, t, { type: 'highpass', f: 5000, dur: 0.6, vol: 0.04 * v, attack: 0.1, pan, verb: 0.6 });
        break;
      case 'drum':
        for (let i = 0; i < 2; i++) {
          this.thump(d, t + i * 0.16, { f: 78, vol: 0.25 * v, dur: 0.25, pan, verb: 0.3 });
          this.noise(d, t + i * 0.16, { buf: this.brown, type: 'lowpass', f: 600, dur: 0.08, vol: 0.2 * v, pan });
        }
        break;
      case 'hammer':
        for (let i = 0; i < 3; i++) {
          this.noise(d, t + i * 0.2, { type: 'bandpass', f: 900, q: 3, dur: 0.06, vol: 0.25 * v, pan, verb: 0.3 });
          this.tone(d, t + i * 0.2, { f: 420, f2: 200, dur: 0.06, vol: 0.12 * v, pan });
        }
        break;
      case 'fanfare': {
        const notes = opts.notes || [392, 523, 659, 784];
        notes.forEach((f, i) => {
          const last = i === notes.length - 1;
          for (const det of [1, 1.004]) this.brass(t + i * 0.14, f * det, last ? 0.55 : 0.13, 0.06 * v, pan);
        });
        break;
      }
      case 'horn':
        for (const [f, a] of [[196, 1], [294, 0.6]]) this.brass(t, f, 1.1, 0.09 * v * a, pan);
        break;
      case 'lowhorn':
        this.brass(t, 147, 0.5, 0.08 * v, pan);
        this.brass(t + 0.5, 110, 1, 0.08 * v, pan);
        break;
      case 'chime':
        [1047, 1568].forEach((f, i) => this.tone(d, t + i * 0.1, { f, dur: 0.8, vol: 0.07 * v, pan, verb: 0.6 }));
        break;
      case 'bell':
        this.bell(d, t, 392, 0.06 * v);
        break;
      case 'sparkle':
        for (let i = 0; i < 6; i++) this.tone(d, t + i * 0.05, { f: 1500 + i * 260, dur: 0.25, vol: 0.04 * v, pan, verb: 0.6 });
        break;
      case 'victory':
        this.play('fanfare', { notes: [392, 523, 659, 784, 659, 784, 1047], vol: v * 1.2 });
        break;
      case 'defeat':
        this.play('lowhorn', { vol: v * 1.3 });
        break;
    }
  }

  brass(t, f, dur, vol, pan) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.985, t);
    o.frequency.linearRampToValueAtTime(f, t + 0.05);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.linearRampToValueAtTime(2200, t + 0.06);
    lp.frequency.linearRampToValueAtTime(1200, t + dur);
    o.connect(lp).connect(this.env(this.fx, t, vol, 0.03, dur, pan, 0.5));
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

export const sound = new SoundEngine();
