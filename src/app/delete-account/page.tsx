import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import DeleteAccount from '@/components/DeleteAccount';
import '../about/about.css';
export const metadata:Metadata={title:'Delete your account | EastEats',description:'Delete your EastEats account, preferences, favorite notes, and saved places.'};
export default function DeleteAccountPage() {
  return <div className="about-page"><header className="site-header about-header"><Link className="wordmark" href="/" aria-label="East Eats home">east eats.</Link><Link href="/" className="button">Back to EastEats</Link></header><main className="about-main"><p className="eyebrow">Your account</p><h1>Delete your<br /><span>EastEats account.</span></h1><div className="about-letter"><p>This removes your sign-in account, questionnaire answers, taste profile, and saved places. Public restaurant listings remain available to other people.</p><p>This action can&apos;t be undone. You can always create a new account later.</p><DeleteAccount /></div></main><SiteFooter /></div>;
}
