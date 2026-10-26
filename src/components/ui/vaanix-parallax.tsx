'use client';

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ChevronDown } from 'lucide-react';

const SRC = {
  people: '/vaanix/office-people.png',
  empty: '/vaanix/office-empty.png',
  core: '/vaanix/ai-core.png',
  foreground: '/vaanix/desks-foreground.png',
};

// ---- tuning knobs ----
const DIFF_THRESHOLD = 48;   // raise (60-90) if stray specks dissolve, lower (30-40) if people edges linger
const DISSOLVE_START = 0.12; // scroll progress where dissolve begins
const DISSOLVE_END = 0.6;    // scroll progress where dissolve ends
const T_MAX = 0.8;           // latest "start time" of any pixel inside the dissolve window
const LIFE = 1 - T_MAX;      // how long each particle lives
const BUCKETS = 1000;
const MAX_PARTICLES = 16000;

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

type Particle = {
  x: number; y: number; t: number;
  dx: number; dy: number; ph: number;
  size: number; color: string;
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function dilate(src: Uint8Array, w: number, h: number) {
  const out = new Uint8Array(src.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (
        src[i] || src[i - 1] || src[i + 1] || src[i - w] || src[i + w] ||
        src[i - w - 1] || src[i - w + 1] || src[i + w - 1] || src[i + w + 1]
      ) out[i] = 1;
    }
  }
  return out;
}

async function prepareDissolve(baseCanvas: HTMLCanvasElement, fxCanvas: HTMLCanvasElement) {
  const [people, empty] = await Promise.all([loadImage(SRC.people), loadImage(SRC.empty)]);
  const w = people.naturalWidth;
  const h = people.naturalHeight;
  baseCanvas.width = fxCanvas.width = w;
  baseCanvas.height = fxCanvas.height = h;

  const read = (img: HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const a = read(people);
  const b = read(empty);
  const n = w * h;

  // 1) find pixels that differ = people
  const diff = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    const d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
    if (d > DIFF_THRESHOLD) diff[i] = 1;
  }

  // 2) remove isolated specks (keep pixels with >= 4 masked neighbours)
  const core = new Uint8Array(n);
  let coreCount = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!diff[i]) continue;
      const s = diff[i - 1] + diff[i + 1] + diff[i - w] + diff[i + w] +
        diff[i - w - 1] + diff[i - w + 1] + diff[i + w - 1] + diff[i + w + 1];
      if (s >= 4) { core[i] = 1; coreCount++; }
    }
  }

  // 3) grow the mask 2px so anti-aliased edges / halos vanish too
  const mask = dilate(dilate(core, w, h), w, h);

  // 4) per-pixel dissolve time: mostly left -> right, with random grain
  const th = new Float32Array(n);
  const counts = new Uint32Array(BUCKETS + 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      th[i] = T_MAX * clamp(0.75 * (x / w) + 0.25 * Math.random());
      counts[Math.min(BUCKETS, Math.floor(th[i] * BUCKETS)) + 1]++;
    }
  }
  for (let k = 1; k < counts.length; k++) counts[k] += counts[k - 1];
  const bucketStart = counts;
  const cursor = bucketStart.slice();
  const order = new Uint32Array(bucketStart[BUCKETS + 1]);
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const bk = Math.min(BUCKETS, Math.floor(th[i] * BUCKETS));
    order[cursor[bk]++] = i;
  }

  // 5) dust particles (sampled from the un-grown core mask)
  const step = Math.max(1, Math.ceil(coreCount / MAX_PARTICLES));
  const size = clamp(Math.sqrt(step) * 1.1, 2, 5);
  const particles: Particle[] = [];
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (!core[i]) continue;
    if (c++ % step !== 0) continue;
    const k = i * 4;
    const r = Math.random();
    const color = r < 0.25 ? '#22D3EE' : r < 0.4 ? '#7C5CFF' : `rgb(${a[k]},${a[k + 1]},${a[k + 2]})`;
    particles.push({
      x: i % w, y: Math.floor(i / w), t: th[i],
      dx: 90 + Math.random() * 260,
      dy: -(30 + Math.random() * 220),
      ph: Math.random() * Math.PI * 2,
      size, color,
    });
  }

  // 6) renderer
  const baseCtx = baseCanvas.getContext('2d')!;
  const fxCtx = fxCanvas.getContext('2d')!;
  const frame = baseCtx.createImageData(w, h);
  frame.data.set(a);
  baseCtx.putImageData(frame, 0, 0);
  const out = frame.data;
  let applied = 0;

  function render(progress: number) {
    const d = clamp((progress - DISSOLVE_START) / (DISSOLVE_END - DISSOLVE_START));
    const target = bucketStart[Math.min(BUCKETS + 1, Math.floor(d * BUCKETS) + 1)];

    if (target !== applied) {
      if (target > applied) {
        for (let k = applied; k < target; k++) {
          const i = order[k] * 4;
          out[i] = b[i]; out[i + 1] = b[i + 1]; out[i + 2] = b[i + 2]; out[i + 3] = b[i + 3];
        }
      } else {
        for (let k = target; k < applied; k++) {
          const i = order[k] * 4;
          out[i] = a[i]; out[i + 1] = a[i + 1]; out[i + 2] = a[i + 2]; out[i + 3] = a[i + 3];
        }
      }
      applied = target;
      baseCtx.putImageData(frame, 0, 0);
    }

    fxCtx.clearRect(0, 0, w, h);
    if (d <= 0 || d >= 1) return;
    for (let k = 0; k < particles.length; k++) {
      const p = particles[k];
      const u = (d - p.t) / LIFE;
      if (u <= 0 || u >= 1) continue;
      const x = p.x + p.dx * u * u + Math.sin(u * 6 + p.ph) * 6;
      const y = p.y + p.dy * u + Math.cos(u * 5 + p.ph) * 4;
      fxCtx.globalAlpha = 1 - u;
      fxCtx.fillStyle = p.color;
      fxCtx.fillRect(x, y, p.size, p.size);
    }
    fxCtx.globalAlpha = 1;
  }

  return { render };
}

export function VaanixParallax() {
  const sectionRef = useRef<HTMLElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLImageElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const outroRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    let cancelled = false;
    let lastProgress = 0;
    let dissolve: Awaited<ReturnType<typeof prepareDissolve>> | null = null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (baseRef.current && fxRef.current) {
      prepareDissolve(baseRef.current, fxRef.current)
        .then((d) => {
          if (cancelled) return;
          dissolve = d;
          if (reduceMotion) {
            d.render(1);
          } else {
            d.render(lastProgress);
          }
          setReady(true);
        })
        .catch(() => setReady(true));
    }

    const ctx = gsap.context(() => {
      if (reduceMotion) {
        // Reduced motion: directly display final state
        gsap.set(introRef.current, { opacity: 0, display: 'none' });
        gsap.set(hintRef.current, { opacity: 0, display: 'none' });
        gsap.set(glowRef.current, { opacity: 0.9, scale: 1 });
        gsap.set(coreRef.current, { opacity: 1, scale: 1, clipPath: 'circle(75% at 50% 50%)' });
        gsap.set(outroRef.current, { opacity: 1, y: 0 });
        return;
      }

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.3,
          onUpdate: (self) => {
            lastProgress = self.progress;
            dissolve?.render(self.progress);
          },
        },
      });

      tl.to({}, { duration: 1 }, 0); // timeline 0 -> 1

      // Subtle, cohesive camera push-in on the 3D office scene
      tl.fromTo(zoomRef.current, { scale: 1 }, { scale: 1.08, duration: 1 }, 0);

      // Intro headline + scroll hint fade out
      tl.to(hintRef.current, { opacity: 0, duration: 0.05 }, 0.03);
      tl.to(introRef.current, { opacity: 0, y: -40, duration: 0.12 }, 0.08);

      // AI core: glow flares, then sleek orb expands from center, threads reach outward
      tl.fromTo(glowRef.current, { opacity: 0, scale: 0.6 }, { opacity: 0.9, scale: 1, duration: 0.25 }, 0.48);
      tl.fromTo(
        coreRef.current,
        { opacity: 0, scale: 0.55, clipPath: 'circle(0% at 50% 50%)' },
        { opacity: 1, scale: 1, clipPath: 'circle(75% at 50% 50%)', duration: 0.3, ease: 'power2.out' },
        0.5
      );

      // Outro headline settles gracefully
      tl.fromTo(outroRef.current, { opacity: 0, y: 35 }, { opacity: 1, y: 0, duration: 0.14 }, 0.78);

      // Subtle ambient floating of the AI orb
      gsap.to(floatRef.current, { y: -10, duration: 3.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }, sectionRef);

    return () => {
      cancelled = true;
      ctx.revert();
    };
  }, []);

  const canvasClass =
    'absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ' +
    (ready ? 'opacity-100' : 'opacity-0');

  return (
    <section ref={sectionRef} className="relative h-[480vh] bg-[#0B1020]">
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#0B1020]">
        
        {/* Unified 3D office environment: base canvas + dust canvas + foreground desks */}
        <div ref={zoomRef} className="absolute inset-0 will-change-transform">
          <canvas ref={baseRef} className={canvasClass} />
          <canvas ref={fxRef} className={canvasClass + ' pointer-events-none'} />
          
          {/* Foreground desks layer: perfectly aligned 1024x640 frame at z-40 in front of the orb */}
          <img
            ref={fgRef}
            src={SRC.foreground}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 z-40 h-full w-full select-none object-cover will-change-transform"
          />
        </div>

        {/* Readability gradient */}
        <div className="pointer-events-none absolute inset-0 z-[22] bg-gradient-to-b from-[#0B1020]/70 via-transparent to-[#0B1020]/50" />

        {/* High-tech glow behind the orb - strictly hidden at start */}
        <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center pb-[6vh]">
          <div 
            ref={glowRef} 
            className="opacity-0 h-[45vmin] w-[45vmin] max-w-[420px] max-h-[420px] rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.45),rgba(34,211,238,0.2)_45%,transparent_70%)] blur-2xl will-change-[opacity,transform]" 
          />
        </div>

        {/* AI core (orb + logo + threads) - scaled to professional, refined hero dimensions */}
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center pb-[6vh]">
          <div ref={coreRef} className="opacity-0 will-change-[opacity,transform]">
            <div ref={floatRef}>
              <img
                src={SRC.core}
                alt="Vaanix AI connected to every call"
                draggable={false}
                className="h-auto w-[min(52vw,440px)] md:w-[min(44vw,460px)] select-none drop-shadow-[0_0_40px_rgba(34,211,238,0.35)]"
              />
            </div>
          </div>
        </div>

        {/* Intro headline */}
        <div ref={introRef} className="pointer-events-none absolute inset-x-0 top-[12vh] z-50 px-6 text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Hundreds of calls. <span className="bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] bg-clip-text text-transparent">Dozens of people.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/70 md:text-lg">
            Every missed call is a lost customer.
          </p>
        </div>

        {/* Scroll hint with smooth scroll click fallback */}
        <div 
          ref={hintRef} 
          onClick={() => {
            const el = document.getElementById('features');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="cursor-pointer pointer-events-auto absolute inset-x-0 bottom-8 z-50 flex flex-col items-center gap-1 text-xs uppercase tracking-[0.3em] text-white/60 hover:text-white transition-colors"
        >
          Scroll
          <ChevronDown className="h-5 w-5 animate-bounce" />
        </div>

        {/* Outro headline */}
        <div ref={outroRef} className="pointer-events-none absolute inset-x-0 top-[10vh] z-50 px-6 text-center opacity-0 will-change-[opacity,transform]">
          <h2 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
            One AI. <span className="bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] bg-clip-text text-transparent">Every call.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/70 md:text-lg">
            Vaanix answers, qualifies and resolves every call in any language, 24/7.
          </p>
        </div>
      </div>
    </section>
  );
}
