'use client';

import { useEffect, useRef, useState } from 'react';
import './promo-video.css';

// The end card's "Try East Eats free" pill is baked into the video at this moment;
// a real link is laid exactly over it from then on so it can be clicked.
export const PROMO_CTA_AT = 4.85;

function PlayIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7Z" /></svg>; }
function PauseIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>; }
function ReplayIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z" /></svg>; }
function SoundIcon({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9Z" fill="currentColor" />{muted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}</svg>;
}
function ArrowIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>; }

export default function PromoVideo({ onStart }: { onStart: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const userPaused = useRef(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  // Autoplay (muted) only while at least half the player is on screen, and never with reduced motion.
  useEffect(() => {
    const element = video.current, box = frame.current;
    if (!element || !box) return;
    if (reduced) { element.pause(); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !userPaused.current && !element.ended) void element.play().catch(() => undefined);
      else if (!entry.isIntersecting && !element.paused) element.pause();
    }, { threshold: 0.5 });
    observer.observe(box);
    return () => observer.disconnect();
  }, [reduced]);

  // Track the playhead every frame while playing so the link appears with the baked button, not up to 250ms late.
  useEffect(() => {
    if (!playing) return;
    let handle = 0;
    const tick = () => {
      const element = video.current;
      if (element) setCtaVisible(element.currentTime >= PROMO_CTA_AT);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing]);

  function togglePlay() {
    const element = video.current;
    if (!element) return;
    if (element.ended || ended) { replay(); return; }
    if (element.paused) { userPaused.current = false; void element.play().catch(() => undefined); }
    else { userPaused.current = true; element.pause(); }
  }

  function replay() {
    const element = video.current;
    if (!element) return;
    userPaused.current = false;
    element.currentTime = 0;
    setEnded(false); setCtaVisible(false);
    void element.play().catch(() => undefined);
  }

  function toggleSound() {
    const element = video.current;
    if (!element) return;
    element.muted = !element.muted;
    setMuted(element.muted);
  }

  // With reduced motion the player rests on the end card, so the link is there from the start.
  const showCta = ctaVisible || ended || (reduced && !playing);
  const state = ended ? 'ended' : playing ? 'playing' : 'paused';
  return <section className="promo-video" aria-label="East Eats promo video" aria-description="A 7-second video: chopsticks lift glazed Korean fried chicken, a spoon lifts saucy tteokbokki, then the East Eats logo and a Try East Eats free button." data-state={state} data-cta={showCta} data-reduced-motion={reduced}>
    <div className="promo-frame" ref={frame}>
      <video ref={video} className="promo-media" muted playsInline preload="metadata" poster={reduced ? '/videos/east-eats-promo-end.jpg' : '/videos/east-eats-promo-poster.jpg'} aria-hidden="true" tabIndex={-1}
        onPlay={() => { setPlaying(true); setEnded(false); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setEnded(true); setCtaVisible(true); }}
        onTimeUpdate={event => setCtaVisible(event.currentTarget.currentTime >= PROMO_CTA_AT)}>
        <source src="/videos/east-eats-promo.mp4" type="video/mp4" />
        <source src="/videos/east-eats-promo.webm" type="video/webm" />
      </video>
      {showCta && <a className="promo-cta" href="#get-started" onClick={event => { event.preventDefault(); onStart(); }}>Try East Eats free<ArrowIcon /></a>}
      <div className="promo-controls" role="group" aria-label="Promo video controls">
        <button type="button" className="promo-control" onClick={togglePlay} aria-label={ended ? 'Replay promo video' : playing ? 'Pause promo video' : 'Play promo video'}>{ended ? <ReplayIcon /> : playing ? <PauseIcon /> : <PlayIcon />}</button>
        <button type="button" className="promo-control" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? 'Turn promo sound on' : 'Turn promo sound off'}><SoundIcon muted={muted} /></button>
      </div>
    </div>
  </section>;
}
