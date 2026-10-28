import type { ReactNode } from 'react';
import Image from 'next/image';

export default function FieldGuideHero({ children, demo }: { children: ReactNode; demo: ReactNode }) {
  return <section className="login-panel login-hero">
    <div className="hero-copy"><h1 className="sr-only">East Eats. Find East Asian food you will love.</h1>{demo}<p className="lede">East Asian favorites, picked for your taste.</p><div className="hero-login-actions">{children}</div><p className="hero-smallprint">Tell us your favorites. Find your next one.</p></div>
    <div className="hero-photography"><Image className="hero-photo-main" src="/images/ramen-home.png" alt="Ramen with sliced pork, a soft-boiled egg, scallions, and chili on a wooden table" fetchPriority="high" loading="eager" width={886} height={886} sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1200px) 48vw, 570px" /><Image className="hero-photo-secondary" src="/images/dumplings.webp" alt="Dumplings ready to share" width={1000} height={667} sizes="(max-width: 700px) 1px, 260px" /><span className="hero-photo-label">Big flavors. New favorites.</span></div>
  </section>;
}
