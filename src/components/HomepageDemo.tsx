'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import './homepage-demo.css';

export const HOMEPAGE_DEMO_DURATION = 28_000;
export function homepageDemoScene(time: number) {
  if (time < 4500) return 'wordmark';
  if (time < 11000) return 'reviews';
  if (time < 16600) return 'favorites';
  if (time < 20200) return 'tastes';
  if (time < 24600) return 'nearby';
  return 'final';
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="2"/><path d="m15 15 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function HeartIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}
function ArrowIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ReviewStars() {
  const id = useId();
  const star = 'M30 3 37.6 18.5 54.7 21 42.4 33 45.3 50 30 42 14.7 50 17.6 33 5.3 21 22.4 18.5Z';
  return <svg className="hd-stars" viewBox="0 0 300 56" aria-hidden="true">
    <defs><clipPath id={id}><rect className="hd-star-fill" width="300" height="56" /></clipPath></defs>
    <g fill="#E6E3DE">{[0,1,2,3,4].map(index => <path key={index} d={star} transform={`translate(${index * 60} 0)`} />)}</g>
    <g fill="#EDB026" stroke="#BE850D" strokeWidth=".8" clipPath={`url(#${id})`}>{[0,1,2,3,4].map(index => <path key={index} d={star} transform={`translate(${index * 60} 0)`} />)}</g>
  </svg>;
}

export default function HomepageDemo({ configured }: { configured: boolean }) {
  const section = useRef<HTMLElement>(null);
  const playhead = useRef(0);
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const ended = time >= HOMEPAGE_DEMO_DURATION;
  const scene = homepageDemoScene(time);
  const running = documentVisible && !paused && !reduced && !ended;

  function moveTo(value: number) {
    const next = Math.max(0, Math.min(HOMEPAGE_DEMO_DURATION, value));
    playhead.current = next;
    section.current?.style.setProperty('--demo-delay', `${-next}ms`);
    setTime(next);
  }

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => { setReduced(preference.matches); if (preference.matches) moveTo(HOMEPAGE_DEMO_DURATION); };
    const visibility = () => setDocumentVisible(document.visibilityState === 'visible');
    updatePreference(); visibility();
    preference.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', visibility);
    return () => { preference.removeEventListener('change', updatePreference); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  useEffect(() => {
    if (!running) return;
    let frame = 0, previous = performance.now(), lastRender = previous;
    const tick = (now: number) => {
      playhead.current = Math.min(HOMEPAGE_DEMO_DURATION, playhead.current + Math.max(0, now - previous));
      previous = now;
      section.current?.style.setProperty('--demo-delay', `${-playhead.current}ms`);
      if (now - lastRender >= 50 || playhead.current >= HOMEPAGE_DEMO_DURATION) { setTime(playhead.current); lastRender = now; }
      if (playhead.current < HOMEPAGE_DEMO_DURATION) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const style = { '--demo-delay': `${-time}ms` } as CSSProperties;
  return <section ref={section} className="homepage-demo" aria-label="East Eats product demo" aria-description="Animation plays automatically. Focus this region and press Escape to pause or Enter to resume." tabIndex={0} onFocus={event => { if (event.target === event.currentTarget) setPaused(true); }} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Escape') setPaused(true); if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPaused(value => !value); } }} data-scene={scene} data-running={running} data-reduced-motion={reduced} data-complete={ended} data-time={Math.round(time)} style={style}>
    <div className="hd-stage">
      <div className="hd-scene hd-opening" role="img" aria-label="Best eats? East Eats." aria-hidden={scene !== 'wordmark'}><div className="hd-word-mask" aria-hidden="true"><span className="hd-best">best eats?</span><span className="hd-east">east eats<span>.</span></span></div><p className="hd-opening-caption" aria-hidden="true">Your next favorite starts with you.</p></div>
      <div className="hd-scene hd-reviews" role="img" aria-label="The best East Asian restaurants don&rsquo;t have the best reviews. Five gold stars change to three and a half." aria-hidden={scene !== 'reviews'}><div className="hd-claim" aria-hidden="true"><ReviewStars /><span className="hd-the-best">the best</span><div className="hd-noun-mask"><span className="hd-restaurants">east asian restaurants</span><span className="hd-review-word">reviews.</span></div></div><span className="hd-dont" aria-hidden="true">DON&rsquo;T HAVE</span></div>
      <div className="hd-scene hd-favorites" aria-hidden={scene !== 'favorites'}><div className="hd-demo-title"><p className="hd-eyebrow">Start with a favorite</p><h3>Where do you love eating?</h3></div><div className="hd-search-card"><div className="hd-search-field"><SearchIcon /><span className="hd-typed-query">Pho99</span><span className="hd-search-caret" /></div><div className="hd-favorite-result"><span className="hd-check"><CheckIcon /></span><div><strong>Pho99</strong><span>One of your favorites</span></div><span className="hd-added">Added</span></div><div className="hd-reason-box"><span>What keeps you coming back?</span><div><span className="hd-choice hd-choice-one">Chewy noodles <CheckIcon /></span><span className="hd-choice hd-choice-two">Great value <CheckIcon /></span></div></div></div></div>
      <div className="hd-scene hd-tastes" aria-hidden={scene !== 'tastes'}><div className="hd-demo-title"><p className="hd-eyebrow">A taste profile that gets you</p><h3>More of what you love.</h3></div><div className="hd-taste-chips"><span className="hd-taste-one">Noodle texture</span><span className="hd-taste-two">Good value</span><span className="hd-taste-three">Food first</span></div><p className="hd-taste-note">Your favorites shape what comes next.</p></div>
      <div className="hd-scene hd-nearby" aria-hidden={scene !== 'nearby'}><div className="hd-demo-title"><p className="hd-eyebrow">Then look around</p><h3>Your kind of good. Nearby.</h3></div><div className="hd-product"><div className="hd-product-location"><PinIcon /><strong>Waterloo, ON</strong><span>Picked for you</span></div><div className="hd-product-content"><div className="hd-mini-list">{['Noodles nearby', 'Dumplings nearby', 'Fusion nearby'].map((name, index) => <div className={`hd-mini-place hd-place-${index + 1}`} key={name}><span className="hd-place-number">{index + 1}</span><div><strong>{name}</strong><span>{index === 0 ? 'Noodle texture / Value' : index === 1 ? 'Food first' : 'New flavors'}</span></div><span className="hd-mini-save"><HeartIcon /></span></div>)}</div><div className="hd-mini-map"><svg viewBox="0 0 300 230" preserveAspectRatio="none" aria-hidden="true"><rect width="300" height="230" fill="#F2F2F2"/><g fill="none" stroke="white" strokeWidth="18"><path d="M-20 50h340M-20 160h340M75-20v270M225-20v270"/><path d="m-20 260 340-310"/></g><g fill="none" stroke="#E1E1E1" strokeWidth="2"><path d="M-20 50h340M-20 160h340M75-20v270M225-20v270"/><path d="m-20 260 340-310"/></g></svg><span className="hd-demo-pin hd-pin-one">1</span><span className="hd-demo-pin hd-pin-two">2</span><span className="hd-demo-pin hd-pin-three">3</span></div></div></div></div>
      <div className="hd-scene hd-final" aria-hidden={scene !== 'final'}><p className="hd-final-brand">east eats.</p><h3>tell us what you like,<br />we&rsquo;ll tell you what<br className="hd-mobile-break" /> you&rsquo;ll <span>love.</span></h3><a className="hd-account-cta" href="/auth/login" tabIndex={scene === 'final' && configured ? 0 : -1} aria-disabled={!configured} onClick={event => { if (!configured || scene !== 'final') event.preventDefault(); }}>Create your account <ArrowIcon /></a>{!configured && <p className="hd-account-help">Sign-in will be available soon.</p>}</div>
    </div>
  </section>;
}
