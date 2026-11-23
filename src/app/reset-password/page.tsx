import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import ResetPassword from '@/components/ResetPassword';
import '../about/about.css';
export const metadata: Metadata = { title: 'Choose a new password | EastEats', description: 'Set a new password for your EastEats email account.', robots: { index: false } };
export default function ResetPasswordPage() {
  return <div className="about-page"><header className="site-header about-header"><Link className="wordmark" href="/" aria-label="East Eats home">east eats.</Link><Link href="/" className="button">Back to EastEats</Link></header><main className="about-main"><p className="eyebrow">Your account</p><h1>Choose a new<br /><span>password.</span></h1><div className="about-letter reset-letter"><ResetPassword /></div></main><SiteFooter /></div>;
}
