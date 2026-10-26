'use client';
import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

declare global {
  interface Window {
    __lenis?: {
      scrollTo: (target: string | HTMLElement, options?: { offset?: number }) => void;
    } | null;
  }
}

export function useSmoothScroll() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    // Provide clean programmatic scrolling via window.__lenis for anchor clicks
    window.__lenis = {
      scrollTo: (target: string | HTMLElement, options?: { offset?: number }) => {
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;
        const offset = options?.offset ?? -80;
        const top = el.getBoundingClientRect().top + window.scrollY + offset;
        window.scrollTo({ top, behavior: 'smooth' });
      },
    };

    const handleLoad = () => {
      ScrollTrigger.refresh();
    };

    if (document.readyState === 'complete') {
      ScrollTrigger.refresh();
    } else {
      window.addEventListener('load', handleLoad);
    }

    const timer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 400);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('load', handleLoad);
      window.__lenis = null;
    };
  }, []);
}

export function scrollToTarget(target: string, offset = -80) {
  if (typeof window === 'undefined') return;
  const el = document.querySelector(target);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top, behavior: 'smooth' });
}
