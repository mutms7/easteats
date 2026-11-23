import type { ReactNode } from 'react';
import FoodCarousel from './FoodCarousel';

export default function FieldGuideHero({ children, promo, demo }: { children: ReactNode; promo: ReactNode; demo: ReactNode }) {
  return <>
    <section className="login-panel login-hero">
      <div className="hero-copy"><h1 className="sr-only">East Eats. Find East Asian food you will love.</h1>{promo}<p className="lede">East Asian favorites, picked for your taste.</p><div className="hero-login-actions" id="get-started" tabIndex={-1}>{children}</div><p className="hero-smallprint">Tell us your favorites. Find your next one.</p></div>
      <FoodCarousel />
    </section>
    <section className="how-it-works" aria-labelledby="how-it-works-title">
      <div className="how-it-works-intro"><p className="how-it-works-eyebrow">How it works</p><h2 id="how-it-works-title">From your favorites to your next one.</h2><p>Tell us a few places you already love, and East Eats finds more like them nearby.</p></div>
      {demo}
    </section>
  </>;
}
