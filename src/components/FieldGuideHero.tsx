import type { ReactNode } from 'react';
import FoodCarousel from './FoodCarousel';

export default function FieldGuideHero({ children, demo }: { children: ReactNode; demo: ReactNode }) {
  return <section className="login-panel login-hero">
    <div className="hero-copy"><h1 className="sr-only">East Eats. Find East Asian food you will love.</h1>{demo}<p className="lede">East Asian favorites, picked for your taste.</p><div className="hero-login-actions">{children}</div><p className="hero-smallprint">Tell us your favorites. Find your next one.</p></div>
    <FoodCarousel />
  </section>;
}
