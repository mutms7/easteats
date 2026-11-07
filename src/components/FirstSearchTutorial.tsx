'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  stage: string;
  locationReady: boolean;
  craving: string;
  hasResults: boolean;
  searching: boolean;
  restaurantOpen: boolean;
  onSkipCraving: () => void;
  onCloseRestaurant: () => void;
  onNewSearch: () => void;
  onClose: () => Promise<void>;
};
const steps = [
  { target: '.search-composer .location-search', title: 'Choose where to eat', text: 'Choose an address or use your location in the highlighted section. If your saved home is already selected, confirm it to continue.' },
  { target: '.new-search-query', title: 'What are you craving?', text: 'Type a dish, cuisine, or restaurant name in the highlighted field. Try noodles or dumplings, or choose “Show me everything” below.' },
  { target: '.search-composer .filters', title: 'Make the search yours', text: 'These controls set your distance, price, cuisine, and food type. We start at 1 km. Adjust anything you like, or keep the defaults.' },
  { target: '.new-search-start', title: 'Start your first search', text: 'Press the highlighted Start search button when you’re ready. Your first search may take up to a minute, flavor awaits!' },
  { target: '.search-toolbar', title: 'Flavor awaits!', text: 'Your first search may take up to a minute, flavor awaits! Places appear as we find them, and the spinner stays visible while we check the food details.' },
  { target: '.restaurant-list .restaurant-card:first-child .restaurant-title', title: 'Take a closer look', text: 'Select the highlighted restaurant name to open its food details, review evidence, hours, and directions.' },
  { target: '.detail-dialog .restaurant-actions', title: 'Keep a place or choose your meal', text: 'Save bookmarks a place, Like and Dislike shape your recommendations, and Eat here records your meal choice so we can ask how it was next time. You can try these controls now, or continue without choosing.' },
  { target: '.bottom-nav', title: 'Find your way around', text: 'Explore returns to your search, Saved keeps your bookmarked and liked places, and Taste lets you change your favorites. Account and Options are at the top whenever you need them.' },
];

export default function FirstSearchTutorial({ stage, locationReady, craving, hasResults, searching, restaurantOpen, onSkipCraving, onCloseRestaurant, onNewSearch, onClose }: Props) {
  const [step, setStep] = useState(stage === 'explore' ? hasResults ? 5 : 4 : 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef<HTMLElement>(null);
  const [cursorStyle, setCursorStyle] = useState<CSSProperties>({ display: 'none' });
  const [dialogHost, setDialogHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setDialogHost(restaurantOpen ? document.querySelector<HTMLElement>('.detail-dialog') : null); }, [restaurantOpen]);
  const [placement, setPlacement] = useState<{ style: CSSProperties; side: string }>({ style: { visibility: 'hidden' }, side: 'below' });
  const active = stage === 'location' || stage === 'explore';
  const empty = step === 4 && !searching && !hasResults;
  const lesson = steps[step];

  useEffect(() => {
    if (!active) return;
    if (stage === 'location' && step >= 4) setStep(0);
    else if (stage === 'explore' && step < 4) setStep(hasResults ? 5 : 4);
    else if (step === 4 && hasResults) setStep(5);
    else if (step === 5 && restaurantOpen) setStep(6);
    else if (step === 6 && !restaurantOpen) setStep(7);
  }, [active, stage, step, hasResults, restaurantOpen]);

  useLayoutEffect(() => {
    if (!active) return;
    const target = document.querySelector<HTMLElement>(lesson.target);
    const card = panel.current;
    if (!target || !card) return;
    target.classList.add('tutorial-target');
    const describedBy = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [describedBy, 'tutorial-description'].filter(Boolean).join(' '));
    // The page stays interactive; only the current control is outlined.
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    // Leave room below tall filter sections on narrow screens.
    const initial = target.getBoundingClientRect();
    const guideHeight = card.getBoundingClientRect().height;
    const bottomInset = () => window.innerWidth <= 950 && stage === 'explore' ? 144 : 76;
    if (window.innerWidth < 760 && initial.bottom + guideHeight + 32 > window.innerHeight - bottomInset() && initial.top - guideHeight < 32) {
      window.scrollBy({ top: initial.top - 16, behavior: 'instant' });
    }
    function position() {
      if (!target || !card) return;
      const rect = target.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 32);
      const height = card.getBoundingClientRect().height;
      const bottomLimit = window.innerHeight - bottomInset();
      const clickSelectors = [
        '.search-composer .location-search input', '#new-food-query', '.search-composer .filters select',
        '.new-search-start .primary', null, '.restaurant-list .restaurant-card:first-child .restaurant-title',
        '.detail-dialog .save-button', '.bottom-nav button',
      ];
      const clickTarget = clickSelectors[step] ? document.querySelector<HTMLElement>(clickSelectors[step]!) : null;
      const clickRect = clickTarget?.getBoundingClientRect();
      setCursorStyle(clickRect && clickRect.bottom > 0 && clickRect.top < window.innerHeight ? { left: clickRect.left + clickRect.width / 2 - 4, top: clickRect.top + clickRect.height / 2 - 2 } : { display: 'none' });
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
      const below = rect.bottom + 16;
      const above = rect.top - height - 16;
      let top: number;
      let side: string;
      // On wider screens, keep the guide beside the live form or dialog.
      if (rect.right + width + 32 <= window.innerWidth) {
        top = Math.max(16, Math.min(rect.top, bottomLimit - height));
        side = 'right';
        setPlacement({ style: { top, left: rect.right + 16, width }, side });
        return;
      }
      if (below + height <= bottomLimit) { top = below; side = 'below'; }
      else if (above >= 16) { top = Math.min(above, bottomLimit - height); side = 'above'; }
      else { top = Math.max(16, bottomLimit - height); side = 'below'; }
      setPlacement({ style: { top, left, width }, side });
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(card); observer.observe(target);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      target?.classList.remove('tutorial-target');
      if (describedBy) target?.setAttribute('aria-describedby', describedBy); else target?.removeAttribute('aria-describedby');
      observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
    };
  }, [active, lesson.target, empty, dialogHost, step, stage]);

  async function finish() {
    setSaving(true); setError('');
    try { await onClose(); } catch { setError('We couldn’t save that yet. Please try again.'); } finally { setSaving(false); }
  }
  if (!active) return null;
  const coach = <><aside ref={panel} className="tutorial-coach" role="region" aria-labelledby="tutorial-title" style={placement.style} data-step={step} data-side={placement.side}>
    <span className="tutorial-pointer" aria-hidden="true" /><div className="tutorial-coach-content">
    <p className="eyebrow">Your first search · {step + 1} of {steps.length}</p>
    <div aria-live="polite" aria-atomic="true"><h2 id="tutorial-title">{empty ? 'Try another search' : lesson.title}</h2><p id="tutorial-description">{empty ? 'No places are available for this search yet. Try a different area or a wider distance, then start again. You can also skip the tour and explore on your own.' : lesson.text}</p></div>
    {error && <p role="alert">{error}</p>}
    <div className="tutorial-coach-actions">
      {step === 0 && <button className="button primary" disabled={!locationReady} onClick={() => setStep(1)}>Use this area</button>}
      {step === 1 && <><button className="button primary" disabled={!craving.trim()} onClick={() => setStep(2)}>Use this craving</button><button className="text-button" onClick={() => { onSkipCraving(); setStep(2); }}>Show me everything</button></>}
      {step === 2 && <button className="button primary" onClick={() => setStep(3)}>Keep these filters</button>}
      {empty && <button className="button primary" onClick={() => { setStep(0); onNewSearch(); }}>Try a new search</button>}
      {step === 6 && <button className="button primary" onClick={() => { onCloseRestaurant(); setStep(7); }}>Back to results</button>}
      {step === 7 && <button className="button primary" disabled={saving} onClick={() => void finish()}>{saving ? 'Saving…' : 'Finish tutorial'}</button>}
    </div></div>
  </aside>
  <button className={`button tutorial-skip${stage === 'explore' ? ' with-navigation' : ''}`} disabled={saving} onClick={() => void finish()}>Skip tutorial</button>
  <span className="tutorial-click-cue" style={cursorStyle} aria-hidden="true"><span className="tutorial-click-ring" /><img src="/images/tutorial/click-pointer.svg" alt="" width="48" height="48" /></span>
  </>;
  return restaurantOpen && dialogHost ? createPortal(coach, dialogHost) : coach;
}
