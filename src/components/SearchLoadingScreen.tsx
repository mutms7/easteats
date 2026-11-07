'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const messages = [
  'What’s in store for you today?',
  'Flavour awaits!',
  'Good things come in bowls.',
  'Noodles, dumplings, or something new?',
  'Your next favourite could be around the corner.',
];

export default function SearchLoadingScreen({ active, searchKey, area, checkingReviews }: { active: boolean; searchKey: string; area: string; checkingReviews: boolean }) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<'hidden' | 'showing' | 'leaving'>('hidden');
  const [message, setMessage] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const visible = active && dismissedKey !== searchKey;

  useEffect(() => {
    if (visible) { setPhase('showing'); setMessage(0); return; }
    setPhase(current => current === 'hidden' ? 'hidden' : 'leaving');
    const timer = setTimeout(() => setPhase('hidden'), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setMessage(current => (current + 1) % messages.length), 4500);
    return () => clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible || phase !== 'showing') return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDismissedKey(searchKey);
      if (event.key !== 'Tab') return;
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? []);
      if (!nodes.length) return;
      if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === panel.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else document.querySelector<HTMLElement>('.current-search-title')?.focus({ preventScroll: true });
    };
  }, [visible, phase, searchKey]);

  if (phase === 'hidden') return null;
  return <div ref={panel} className={`search-loading-screen is-${phase}`} role="dialog" aria-modal={visible ? true : undefined} aria-hidden={!visible} inert={!visible} aria-labelledby="search-loading-title" aria-describedby="search-loading-description" tabIndex={-1}>
    <div className="search-loading-content">
      <p className="eyebrow">Your next meal starts here</p>
      <svg className="noodle-animation" viewBox="0 0 300 250" fill="none" aria-hidden="true">
        <ellipse cx="150" cy="219" rx="97" ry="10" fill="#F3E4DF" />
        <g className="noodle-steam" stroke="#D7A999" strokeWidth="3" strokeLinecap="round"><path d="M97 106c-17-17 17-24 0-43"/><path d="M146 96c-17-17 17-24 0-43"/><path d="M191 106c-17-17 17-24 0-43"/></g>
        <g className="noodle-chopsticks" stroke="#442B24" strokeWidth="7" strokeLinecap="round"><path d="m174 95 75-66"/><path d="m186 101 72-57"/></g>
        <path className="noodle-strand" d="M174 95c-36 7 12 16-14 28s15 17-11 25" stroke="#E8B650" strokeWidth="7" strokeLinecap="round"/>
        <g className="noodle-bowl"><path d="M52 139h196c-6 52-38 77-98 77s-92-25-98-77Z" fill="#E12D12"/><ellipse cx="150" cy="139" rx="98" ry="17" fill="#FFF2D9" stroke="#E12D12" strokeWidth="6"/><path d="M71 140c20-19 31 15 48-1s30 14 47-1 29 10 56-1" stroke="#E8B650" strokeWidth="5" strokeLinecap="round"/><path d="M130 216h40" stroke="#E12D12" strokeWidth="8" strokeLinecap="round"/><path d="M91 177c26 20 91 20 118 0" stroke="#FFF2D9" strokeWidth="4" strokeLinecap="round"/></g>
      </svg>
      <h1 id="search-loading-title" key={message} className="search-loading-message">{messages[message]}</h1>
      <p id="search-loading-description">{checkingReviews ? 'Checking the food details' : 'Finding places'} near {area}. You can start exploring as soon as the first matches arrive.</p>
      <p className="small">Fresh searches may take a minute or longer. We’ll bring the results in as they’re ready.</p>
      <div className="inline-actions"><button className="button" onClick={() => setDismissedKey(searchKey)}>Keep browsing</button><Link href="/questions" target="_blank" rel="noreferrer">Questions about the wait?</Link></div>
    </div>
  </div>;
}
