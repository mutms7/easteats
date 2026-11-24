'use client';

import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import './food-carousel.css';

// Food inspiration only. These photos don't represent restaurants in anyone's results.
const dishes = [
  { name: 'Sushi', src: '/images/cravings/sushi-roll.webp', alt: 'A sushi roll topped with avocado, spicy mayo, tobiko, and sesame on a long white plate' },
  { name: 'Bibimbap', src: '/images/cravings/bibimbap.webp', alt: 'Sizzling stone-pot bibimbap with an egg yolk, gochujang, beef, and vegetables over crisped rice' },
  { name: 'Korean fried chicken', src: '/images/cravings/korean-fried-chicken.webp', alt: 'Glossy red Korean fried chicken scattered with sesame seeds and sliced scallions' },
  { name: 'Soup dumplings', src: '/images/cravings/soup-dumplings.webp', alt: 'Chopsticks resting a soup dumpling in a white spoon of broth' },
  { name: 'Japanese ramen', src: '/images/cravings/shoyu-ramen.webp', alt: 'A red bowl of shoyu ramen with chashu, a marinated egg, narutomaki, scallions, and nori' },
  { name: 'Chow mein', src: '/images/cravings/chow-mein.webp', alt: 'Crispy pan-fried chow mein topped with shrimp, squid, mushrooms, and bok choy' },
];
const count = dishes.length;
// Three copies in a row: the middle copy is the real one, and the copies either side
// let the track keep going in both directions before it quietly jumps back to the middle.
const slides = [...dishes, ...dishes, ...dishes];

const ADVANCE_MS = 3600;
// After someone swipes, drags, or clicks, let them look for a bit before autoplay moves on.
const HOLD_AFTER_INPUT_MS = 7000;
const SETTLE_MS = 140;

function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{direction === 'left' ? <path d="M15 5 8 12l7 7" /> : <path d="m9 5 7 7-7 7" />}</svg>;
}

export default function FoodCarousel() {
  const region = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(count);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [inView, setInView] = useState(false);
  const lastInput = useRef(0);
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const positionRef = useRef(count);
  positionRef.current = position;
  const index = position % count;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const element = region.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const centerOf = (target: number) => {
    const element = track.current, slide = element?.children[target] as HTMLElement | undefined;
    return element && slide ? slide.offsetLeft + slide.offsetWidth / 2 - element.clientWidth / 2 : 0;
  };

  const nearest = useCallback(() => {
    const element = track.current;
    if (!element) return count;
    let best = count, distance = Infinity;
    for (let target = 0; target < slides.length; target++) {
      const gap = Math.abs(centerOf(target) - element.scrollLeft);
      if (gap < distance) { distance = gap; best = target; }
    }
    return best;
  }, []);

  // Swap to the same dish in the middle copy without any visible movement.
  const jump = useCallback((target: number) => {
    const element = track.current;
    if (!element) return;
    element.dataset.jumping = 'true';
    element.scrollTo({ left: centerOf(target), behavior: 'instant' });
    setPosition(target);
    window.setTimeout(() => { delete element.dataset.jumping; }, 50);
  }, []);

  const goTo = useCallback((target: number, smooth = true) => {
    const element = track.current;
    if (!element) return;
    element.scrollTo({ left: centerOf(target), behavior: smooth && !reduced ? 'smooth' : 'instant' });
    setPosition(target);
  }, [reduced]);

  // Start on the middle copy so there's room to go either way.
  useLayoutEffect(() => { jump(count); }, [jump]);

  const userMoved = (target: number) => { lastInput.current = Date.now(); goTo(target); };
  const showDish = (dish: number) => {
    // Take the shortest way round to the chosen dish.
    const current = positionRef.current, forward = (dish - (current % count) + count) % count;
    userMoved(forward <= count / 2 ? current + forward : current + forward - count);
  };

  const autoplay = !paused && !reduced && !hovering && inView;
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => {
      if (document.hidden || drag.current || Date.now() - lastInput.current < HOLD_AFTER_INPUT_MS) return;
      goTo(positionRef.current + 1);
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, goTo]);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    let settle = 0;
    const onScroll = () => {
      if (element.dataset.jumping) return;
      if (!drag.current) setPosition(nearest());
      // Once the track comes to rest on a copy, move back to the middle one.
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (drag.current) return;
        const resting = nearest();
        if (resting < count || resting >= count * 2) jump(count + (resting % count));
      }, SETTLE_MS);
    };
    const onUserScroll = () => { lastInput.current = Date.now(); };
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('touchstart', onUserScroll, { passive: true });
    element.addEventListener('wheel', onUserScroll, { passive: true });
    const onResize = () => jump(count + (positionRef.current % count));
    window.addEventListener('resize', onResize);
    return () => { window.clearTimeout(settle); element.removeEventListener('scroll', onScroll); element.removeEventListener('touchstart', onUserScroll); element.removeEventListener('wheel', onUserScroll); window.removeEventListener('resize', onResize); };
  }, [jump, nearest]);

  // Touch already swipes natively; this gives mouse users the same drag.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !track.current) return;
    drag.current = { id: event.pointerId, x: event.clientX, left: track.current.scrollLeft, moved: false };
    lastInput.current = Date.now();
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current, element = track.current;
    if (!state || !element || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    if (!state.moved && Math.abs(dx) > 6) { state.moved = true; element.setPointerCapture(event.pointerId); element.dataset.dragging = 'true'; }
    if (state.moved) element.scrollLeft = state.left - dx;
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current, element = track.current;
    if (!state || !element || state.id !== event.pointerId) return;
    if (state.moved) {
      delete element.dataset.dragging;
      const dx = event.clientX - state.x, start = positionRef.current, resting = nearest();
      // A short flick still counts as one step, so nobody has to drag a whole slide width.
      userMoved(Math.abs(dx) > 40 && resting === start ? start - Math.sign(dx) : resting);
      window.setTimeout(() => { drag.current = null; }, 0);
    } else drag.current = null;
  }
  function onSlideClick(target: number) {
    if (drag.current?.moved) return;
    if (target !== position) userMoved(target);
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowRight') { event.preventDefault(); userMoved(position + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); userMoved(position - 1); }
  }

  return <section ref={region} className="food-carousel" aria-roledescription="carousel" aria-labelledby="food-carousel-title" data-index={index} data-autoplay={autoplay}
    onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} onKeyDown={onKeyDown}>
    <div className="food-carousel-head">
      <div>
        <h2 id="food-carousel-title">What&apos;s calling your name?</h2>
        <p>Swipe, drag, or tap through a few East Asian favorites.</p>
      </div>
      <div className="food-carousel-buttons">
        {!reduced && <button type="button" className="food-carousel-button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}>
          {paused ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7Z" /></svg> : <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>}
        </button>}
        <button type="button" className="food-carousel-button" onClick={() => userMoved(position - 1)} aria-label="Previous dish"><Arrow direction="left" /></button>
        <button type="button" className="food-carousel-button" onClick={() => userMoved(position + 1)} aria-label="Next dish"><Arrow direction="right" /></button>
      </div>
    </div>
    <div ref={track} className="food-track" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDragStart={event => event.preventDefault()}>
      {slides.map((dish, target) => {
        const real = target >= count && target < count * 2, dishIndex = target % count;
        return <figure key={target} className="food-slide" data-current={target === position} onClick={() => onSlideClick(target)}
          {...(real ? { role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${dishIndex + 1} of ${count}: ${dish.name}` } : { 'aria-hidden': true })}>
          <Image src={dish.src} alt={real ? dish.alt : ''} fill sizes="(max-width: 700px) 84vw, 720px" draggable={false} />
          <figcaption>{dish.name}</figcaption>
        </figure>;
      })}
    </div>
    <div className="food-dots" role="group" aria-label="Choose a dish">
      {dishes.map((dish, dishIndex) => <button key={dish.name} type="button" className="food-dot" aria-label={`Show ${dish.name}`} aria-current={dishIndex === index ? 'true' : undefined} onClick={() => showDish(dishIndex)} />)}
    </div>
  </section>;
}
