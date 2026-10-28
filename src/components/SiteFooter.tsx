import Link from 'next/link';

export default function SiteFooter({ about = false }: { about?: boolean }) {
  return <footer className="site-footer">
    <span className="footer-signature">EastEats &copy; 2026</span>
    <nav className="footer-links" aria-label="Footer">
      <Link href="/about" aria-current={about ? 'page' : undefined}>About</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/delete-account">Delete account</Link>
      <span>Created by William Chenyin</span>
    </nav>
  </footer>;
}
