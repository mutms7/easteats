import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import './about.css';

export const metadata: Metadata = {
  title: 'About EastEats | William Chenyin',
  description: 'Why I built EastEats, and why one review score tells me so little about a bowl of noodles.',
};

export default function About() {
  return <div className="about-page">
    <a href="#about-main" className="skip-link">Skip to content</a>
    <header className="site-header about-header">
      <Link className="wordmark" href="/" aria-label="East Eats home">east eats<span className="wordmark-dot">.</span></Link>
      <nav aria-label="Main navigation"><Link href="/about" aria-current="page">About</Link><Link href="/" className="button">Find food</Link></nav>
    </header>
    <main id="about-main" className="about-main">
      <p className="eyebrow about-byline">A note from William Chenyin</p>
      <h1>I just want a really<br />good bowl of <span>noodles.</span></h1>
      <div className="about-letter">
        <p className="about-opening">I think one overall rating asks too many questions at once.</p>
        <p>Say a noodle shop has 3.5 stars. Some people loved the broth. Others thought the service was rushed. If I care about the broth and I&apos;m fine with a quick meal, that average doesn&apos;t tell me much.</p>
        <p>That&apos;s why I&apos;m building EastEats. I want to find East Asian food I&apos;ll actually enjoy, with more to go on than a number next to a pin.</p>
        <section className="about-example" aria-labelledby="example-title">
          <p className="eyebrow">Here&apos;s what I mean</p>
          <h2 id="example-title">&ldquo;I go back for the chewy noodles. And it&apos;s good value.&rdquo;</h2>
          <p>That tells us something useful. Noodle texture matters. Price matters. A fancy dining room might barely enter into it.</p>
          <p>Someone else might want a quieter place to sit down with friends. Same area, different priorities. Their list should look different.</p>
        </section>
        <section aria-labelledby="favorites-title">
          <h2 id="favorites-title">Start with a place you already like.</h2>
          <p>Search for a favorite restaurant and tell us why you like it. Maybe it&apos;s the broth, the spice, the dumplings, or how much food you get for the price. One favorite is enough to start. You can add more.</p>
          <p>EastEats turns those answers into preferences, then uses them to sort places near the address or area you choose. You can look at the list, check the map, and save anything you want to try.</p>
        </section>
        <section aria-labelledby="evidence-title">
          <h2 id="evidence-title">A recommendation should give you a reason.</h2>
          <p>The restaurant details come from Google Maps listings. Review text helps us look for things like dishes, flavors, and value. Your preferences change how much those things matter in your list.</p>
          <p>A low rating on its own doesn&apos;t make a place a hidden gem. If there isn&apos;t much food evidence, EastEats says so. Reviews with cleanliness concerns stay visible in the place details too.</p>
          <p>I want the answer to &ldquo;where should we eat?&rdquo; to start with what you actually enjoy.</p>
        </section>
        <div className="about-closing">
          <p>Anyway, tell us what you like.<br />We&apos;ll tell you what you&apos;ll <span>love.</span></p>
          <Link href="/" className="button primary">Find my next meal <span aria-hidden="true">&rarr;</span></Link>
          <p className="about-author">William Chenyin<br /><span>Creator of EastEats</span></p>
        </div>
      </div>
    </main>
    <SiteFooter about />
  </div>;
}
