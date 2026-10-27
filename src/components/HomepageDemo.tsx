'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
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

export default function HomepageDemo({ configured }: { configured: boolean }) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const playhead = useRef(0);
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const ended = time >= HOMEPAGE_DEMO_DURATION;
  const scene = homepageDemoScene(time);
  const running = inView && documentVisible && !paused && !reduced && !ended;

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
    const observer = new IntersectionObserver(entries => { const entry = entries[0]; setInView(entry?.isIntersecting === true && entry.intersectionRatio >= .25); }, { threshold: .25 });
    if (canvas.current) observer.observe(canvas.current);
    return () => { observer.disconnect(); preference.removeEventListener('change', updatePreference); document.removeEventListener('visibilitychange', visibility); };
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
  return <section ref={section} className="homepage-demo" aria-label="East Eats product demo" data-scene={scene} data-running={running} data-reduced-motion={reduced} data-complete={ended} style={style}>
    <div className="hd-heading"><div><p className="hd-eyebrow">See what makes it yours</p><h2>A little taste of East Eats.</h2></div><span className="hd-duration">28 seconds / Silent</span></div>
    <div className="hd-stage" ref={canvas}>
      <span className="hd-illustrative">Illustrative demo</span>
      <div className="hd-scene hd-opening" role="img" aria-label="Best eats? East Eats." aria-hidden={scene !== 'wordmark'}><div className="hd-word-mask" aria-hidden="true"><span className="hd-best">best eats?</span><span className="hd-east">east eats<span>.</span></span></div><p className="hd-opening-caption" aria-hidden="true">Your next favorite starts with you.</p></div>
      <div className="hd-scene hd-reviews" role="img" aria-label="The best East Asian restaurants don&rsquo;t have the best reviews." aria-hidden={scene !== 'reviews'}><div className="hd-claim" aria-hidden="true"><span className="hd-the-best">the best</span><div className="hd-noun-mask"><span className="hd-restaurants">east asian restaurants</span><span className="hd-review-word">reviews.</span></div></div><span className="hd-dont" aria-hidden="true">DON&rsquo;T HAVE</span></div>
      <div className="hd-scene hd-favorites" aria-hidden={scene !== 'favorites'}><div className="hd-demo-title"><p className="hd-eyebrow">Start with a favorite</p><h3>Where do you love eating?</h3></div><div className="hd-search-card"><div className="hd-search-field"><SearchIcon /><span className="hd-typed-query">Pho99</span><span className="hd-search-caret" /></div><div className="hd-favorite-result"><span className="hd-check"><CheckIcon /></span><div><strong>Pho99</strong><span>One of your favorites</span></div><span className="hd-added">Added</span></div><div className="hd-reason-box"><span>What keeps you coming back?</span><div><span className="hd-choice hd-choice-one">Chewy noodles <CheckIcon /></span><span className="hd-choice hd-choice-two">Great value <CheckIcon /></span></div></div></div></div>
      <div className="hd-scene hd-tastes" aria-hidden={scene !== 'tastes'}><div className="hd-demo-title"><p className="hd-eyebrow">A taste profile that gets you</p><h3>More of what you love.</h3></div><div className="hd-taste-chips"><span className="hd-taste-one">Noodle texture</span><span className="hd-taste-two">Good value</span><span className="hd-taste-three">Food first</span></div><p className="hd-taste-note">Your favorites shape what comes next.</p></div>
      <div className="hd-scene hd-nearby" aria-hidden={scene !== 'nearby'}><div className="hd-demo-title"><p className="hd-eyebrow">Then look around</p><h3>Your kind of good. Nearby.</h3></div><div className="hd-product"><div className="hd-product-location"><PinIcon /><strong>Waterloo, ON</strong><span>Picked for you</span></div><div className="hd-product-content"><div className="hd-mini-list">{['Noodles nearby', 'Dumplings nearby', 'Fusion nearby'].map((name, index) => <div className={`hd-mini-place hd-place-${index + 1}`} key={name}><span className="hd-place-number">{index + 1}</span><div><strong>{name}</strong><span>{index === 0 ? 'Noodle texture / Value' : index === 1 ? 'Food first' : 'New flavors'}</span></div><span className="hd-mini-save"><HeartIcon /></span></div>)}</div><div className="hd-mini-map"><svg viewBox="0 0 300 230" preserveAspectRatio="none" aria-hidden="true"><rect width="300" height="230" fill="#F2F2F2"/><g fill="none" stroke="white" strokeWidth="18"><path d="M-20 50h340M-20 160h340M75-20v270M225-20v270"/><path d="m-20 260 340-310"/></g><g fill="none" stroke="#E1E1E1" strokeWidth="2"><path d="M-20 50h340M-20 160h340M75-20v270M225-20v270"/><path d="m-20 260 340-310"/></g></svg><span className="hd-demo-pin hd-pin-one">1</span><span className="hd-demo-pin hd-pin-two">2</span><span className="hd-demo-pin hd-pin-three">3</span></div></div></div></div>
      <div className="hd-scene hd-final" aria-hidden={scene !== 'final'}><p className="hd-final-brand">east eats.</p><h3>tell us what you like,<br />we&rsquo;ll tell you what<br className="hd-mobile-break" /> you&rsquo;ll <span>love.</span></h3><a className="hd-account-cta" href="/auth/login" tabIndex={scene === 'final' && configured ? 0 : -1} aria-disabled={!configured} onClick={event => { if (!configured || scene !== 'final') event.preventDefault(); }}>Create your account <ArrowIcon /></a>{!configured && <p className="hd-account-help">Sign-in will be available soon.</p>}</div>
    </div>
    <div className="hd-controls"><div className="hd-buttons"><button type="button" aria-label={paused ? 'Play demo' : 'Pause demo'} onClick={() => setPaused(value => !value)} disabled={reduced || ended}>{paused ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7Z" fill="currentColor"/></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h4v12H5zm7 0h4v12h-4z" fill="currentColor"/></svg>}<span>{paused ? 'Play' : 'Pause'}</span></button><button type="button" aria-label="Replay demo" disabled={reduced} onClick={() => { moveTo(0); setPaused(false); }}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 6a6 6 0 1 1-1 7M5 2v5H1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg><span>Replay</span></button></div><label className="hd-progress"><span className="hd-sr-only">Demo progress</span><input type="range" min="0" max={HOMEPAGE_DEMO_DURATION} step="100" value={time} disabled={reduced} onChange={event => { setPaused(true); moveTo(Number(event.target.value)); }} aria-valuetext={`${Math.round(time / 1000)} of 28 seconds`} /></label><span className="hd-clock" aria-hidden="true">{Math.floor(time / 1000).toString().padStart(2, '0')} / 28</span></div>
    <details className="hd-transcript"><summary>Read the demo</summary><p>Best eats? East Eats. The best East Asian restaurants don&rsquo;t have the best reviews. Tell us a favorite, such as Pho99, and why you like it: chewy noodles and great value. East Eats turns those preferences into recommendations near your chosen location. Tell us what you like, we&rsquo;ll tell you what you&rsquo;ll love.</p><p>The screens and map are illustrative. They show the experience without making claims about any restaurant&rsquo;s ratings.</p></details>
  </section>;
}
