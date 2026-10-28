import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import '../about/about.css';

export const metadata: Metadata = { title: 'Privacy | EastEats', description: 'What EastEats uses to find food for you, where it goes, and how to delete your account.' };
export default function Privacy() {
  return <div className="about-page">
    <header className="site-header about-header"><Link className="wordmark" href="/" aria-label="East Eats home">east eats.</Link><Link className="button" href="/">Find food</Link></header>
    <main className="about-main"><p className="eyebrow">Privacy / updated October 28, 2026</p><h1>Your taste.<br /><span>Your information.</span></h1>
      <div className="about-letter">
        <p>EastEats is created by William Chenyin. This page describes the website and the native iPhone and Android app.</p>
        <section><h2>What you give us</h2><p>Signing in gives EastEats an account identifier and the account details supplied by your sign-in provider, such as your email address. We save your favorite restaurants, the reasons and notes you write, your selected dining priority, your taste profile, and places you save.</p><p>When you ask for nearby food, you can enter an address or choose to share your current location. Location access is optional. The native app only requests it in the foreground when you press the location button. We don&apos;t request background location tracking.</p></section>
        <section><h2>Where that information goes</h2><p>Supabase handles sign-in and stores account data. Vercel hosts the website and API and processes ordinary request information needed to operate them.</p><p>MapTiler receives address queries and optional location coordinates to find suggestions and provide map resources. Apify receives restaurant queries and a city or approximate search boundary to retrieve public Google Maps listings and reviews.</p><p>Anthropic receives the favorite names, reasons, notes, corrections, and dining priority you submit to interpret your preferences. It also processes public restaurant review text. We don&apos;t include your email address or exact GPS coordinates in those interpretation requests.</p><p>These providers process information under their own terms and privacy policies. Google or Apple also processes your sign-in according to the provider you choose.</p></section>
        <section><h2>On your phone or browser</h2><p>The website keeps an account-specific questionnaire draft locally. The native app stores its sign-in session in the device&apos;s secure storage and may keep an encrypted snapshot of your saved places for offline access. You can sign out to clear the native app&apos;s local session and saved snapshot.</p><p>The website&apos;s offline cache contains public fallback pages and icons. It doesn&apos;t cache private API responses or your signed-in pages.</p></section>
        <section><h2>Deleting your information</h2><p>You can <Link href="/delete-account">delete your account here</Link>, or use Delete account in the native app&apos;s Account screen. Deletion removes the sign-in account, questionnaire, taste profile, saved-place links, and the account&apos;s search subscriptions. Public restaurant records and non-identifying operational or spending records may remain. Infrastructure backups may retain information until they expire under the hosting providers&apos; retention policies.</p><p>For general privacy questions, use the <a href="https://github.com/mutms7/easteats/issues/new" target="_blank" rel="noreferrer">EastEats support tracker</a>. It&apos;s public, so don&apos;t post passwords, tokens, location history, or other personal information there. Use the signed-in deletion flow to remove your account.</p></section>
      </div>
    </main><SiteFooter />
  </div>;
}
