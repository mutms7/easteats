import type { ReactNode } from 'react';
import Image from 'next/image';

export default function FieldGuideHero({ children }: { children: ReactNode }) {
  return <section className="login-panel login-hero">
    <div className="hero-copy"><p className="eyebrow hero-eyebrow">Good food. Your kind of good.</p><h1>Find your<br />kind of <span className="highlight">good.</span></h1><p className="lede">Discover East Asian favorites and fusion spots picked for what you love eating.</p><div className="hero-login-actions">{children}</div><p className="hero-smallprint">Tell us your favorites. Find your next one.</p></div>
    <div className="hero-photography"><Image className="hero-photo-main" src="/images/ramen-home.png" alt="Ramen with sliced pork, a soft-boiled egg, scallions, and chili on a wooden table" fetchPriority="high" loading="eager" width={886} height={886} sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1200px) 48vw, 570px" /><Image className="hero-photo-secondary" src="/images/dumplings.webp" alt="Dumplings ready to share" width={1000} height={667} sizes="(max-width: 700px) 1px, 260px" /><span className="hero-photo-label">Big flavors. New favorites.</span></div>
  </section>;
}
