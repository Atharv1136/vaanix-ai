// src/demos/default.tsx
import { VaanixParallax } from '@/components/ui/vaanix-parallax';

export default function VaanixParallaxDemo() {
  return (
    <main className="bg-[#0B1020] text-white">
      <VaanixParallax />
      <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center">
        <h3 className="text-3xl font-semibold md:text-5xl">Meet Vaanix</h3>
        <p className="max-w-xl text-white/70">
          Voice AI agents that handle your calls end to end.
        </p>
        <a
          href="#"
          className="rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] px-8 py-3 font-medium text-[#0B1020]"
        >
          Book a demo
        </a>
      </section>
    </main>
  );
}
