'use client';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function useSectionReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      // 1) groups: children with [data-reveal] rise and fade in, staggered
      root.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
        const items = group.querySelectorAll<HTMLElement>('[data-reveal]');
        if (!items.length) return;

        // Use fromTo with clearProps to ensure elements NEVER stay stuck invisible
        gsap.fromTo(
          items,
          { y: 25, opacity: 0.1 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            ease: 'power2.out',
            stagger: Number(group.dataset.stagger ?? 0.08),
            clearProps: 'opacity,transform',
            scrollTrigger: { 
              trigger: group, 
              start: 'top 95%', 
              once: true,
            },
          }
        );
      });

      // 2) connecting line draws left to right
      root.querySelectorAll<HTMLElement>('[data-line]').forEach((line) => {
        gsap.fromTo(
          line,
          { scaleX: 0 },
          {
            scaleX: 1,
            transformOrigin: 'left center',
            duration: 1.0,
            ease: 'power2.inOut',
            scrollTrigger: { trigger: line, start: 'top 90%', once: true },
          }
        );
      });

      // 3) number count-up, e.g. <span data-count="2499" data-prefix="₹">
      root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
        const end = Number(el.dataset.count);
        const prefix = el.dataset.prefix ?? '';
        const obj = { v: 0 };
        gsap.to(obj, {
          v: end,
          duration: 1.2,
          ease: 'power2.out',
          onUpdate: () => { el.textContent = prefix + Math.round(obj.v).toLocaleString('en-IN'); },
          scrollTrigger: { trigger: el, start: 'top 95%', once: true },
        });
      });

      // 4) soft parallax on decorative glows
      root.querySelectorAll<HTMLElement>('[data-glow]').forEach((glow) => {
        gsap.fromTo(glow, { yPercent: -15 }, {
          yPercent: 15, ease: 'none',
          scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });
    }, root);

    // Refresh after slight delay so positions are calculated correctly
    const timer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 150);

    return () => {
      clearTimeout(timer);
      ctx.revert();
    };
  }, []);

  return ref;
}
