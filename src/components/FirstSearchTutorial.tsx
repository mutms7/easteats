'use client';

import { useEffect, useRef, useState } from 'react';

const lessons = [
  { title: 'Start with a restaurant you love', text: 'Answer one question at a time, choose a favorite restaurant, and tell us what keeps you coming back. One favorite is enough to get started.' },
  { title: 'Choose where to eat', text: 'Save an optional home address or use your current location. On your first search, check the area, add a craving if you have one, then press Start search. The starting radius is 1 km.' },
  { title: 'Find your next meal', text: 'Places appear while the search continues, so watch the searching indicator until it finishes. Open a restaurant for details, Save it for later, or choose Eat here to record your choice. We’ll ask how it was on your next visit.' },
];

export default function FirstSearchTutorial({ onClose }: { onClose: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  async function finish() {
    setSaving(true); setError('');
    try { await onClose(); } catch { setError('We couldn’t save that yet. Please try again.'); } finally { setSaving(false); }
  }
  return <div className="dialog-backdrop tutorial-backdrop" onKeyDown={event => {
    if (event.key === 'Escape' && !saving) void finish();
    if (event.key === 'Tab') {
      const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
      if (!buttons.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === buttons[0] || document.activeElement === panel.current)) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    }
  }}><div className="tutorial-panel" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
    <p className="eyebrow">A quick tour · {step + 1} of {lessons.length}</p><h2 id="tutorial-title">{lessons[step].title}</h2><p>{lessons[step].text}</p>
    {error && <p role="alert">{error}</p>}<div className="inline-actions">{step > 0 && <button className="button" disabled={saving} onClick={() => setStep(step - 1)}>Back</button>}<button className="button primary" disabled={saving} onClick={() => step < lessons.length - 1 ? setStep(step + 1) : void finish()}>{saving ? 'Saving…' : step < lessons.length - 1 ? 'Next' : 'Let’s get started'}</button><button className="text-button" disabled={saving} onClick={() => void finish()}>Skip tutorial</button></div>
  </div></div>;
}
