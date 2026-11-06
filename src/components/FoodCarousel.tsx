'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

const dishes = [
  { name: 'Ramen', src: '/images/cravings/ramen.webp', alt: 'Rich ramen broth with chashu pork, noodles, scallions, and a jammy egg' },
  { name: 'Korean fried chicken', src: '/images/cravings/chicken.webp', alt: 'Sticky glazed chicken wings scattered with sesame seeds and scallions' },
  { name: 'Salmon sushi', src: '/images/cravings/sushi.webp', alt: 'A bite of salmon nigiri lifted with chopsticks' },
  { name: 'Bibimbap', src: '/images/cravings/bibimbap.webp', alt: 'A bowl of Korean bibimbap piled with vegetables, meat, and a fried egg' },
  { name: 'Dumplings', src: '/images/dumplings.webp', alt: 'A plate of pleated dumplings ready to dip and share' },
  { name: 'Bao buns', src: '/images/cravings/bao.webp', alt: 'A fluffy steamed bao bun filled with meat, fresh greens, and shredded vegetables' },
];

export default function FoodCarousel() {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  return <div className="hero-photography food-carousel" role="region" aria-label="Food inspiration" onFocusCapture={event => { if (event.target.matches(':focus-visible')) setPaused(true); }}>
    <div className="food-carousel-window">
      <div className="food-carousel-track" style={{ animationPlayState: paused || reducedMotion ? 'paused' : 'running' }}>
        {[...dishes, dishes[0]].map((dish, index) => <div key={`${dish.name}-${index}`} className="food-slide" aria-hidden={index === dishes.length ? true : undefined}>
          <Image src={dish.src} alt={index === dishes.length ? '' : dish.alt} fill sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1200px) 48vw, 570px" fetchPriority={index === 0 ? 'high' : undefined} loading="eager" />
          <div className="food-carousel-shade" />
          <div className="food-carousel-caption"><span>What's calling your name?</span><p>{dish.name}</p></div>
        </div>)}
      </div>
      <div className="food-carousel-controls">
        {!reducedMotion && <button type="button" aria-label={paused ? 'Play slideshow' : 'Pause slideshow'} onClick={() => setPaused(value => !value)}>{paused ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7Z" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>}</button>}
      </div>
    </div>
  </div>;
}
