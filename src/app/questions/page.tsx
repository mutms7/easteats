import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import './questions.css';

export const metadata: Metadata = {
  title: 'Questions & feedback | EastEats',
  description: 'How long searches take, why results arrive in stages, and how to send William feedback or a feature request.',
};

const questions = [
  { id: 'search-time', question: 'How long does a search take?', answer: 'Your first search may take about a minute, and some searches take longer. Places and map pins appear as we find them, so you can start looking while the search continues. A minute is a rough expectation, not a guaranteed finish time.' },
  { id: 'why-the-wait', question: 'Why is it taking so long?', answer: 'EastEats looks for restaurant listings around your chosen area, then checks available review text for food details and recommendations. Those are separate steps, and fresh information has to come back from other services. A new area or a larger search can take longer, and review checks may continue after the first places appear.' },
  { id: 'partial-results', question: 'Can I use the results while the spinner is running?', answer: 'Yes. You can open restaurants, check the map, save places, and read the details that are already available. The spinner means there’s still work going on, not that you have to wait before exploring.' },
  { id: 'refresh', question: 'Should I keep pressing Refresh search?', answer: 'You don’t need to. The page checks for results automatically while a search is running. Refresh search asks for another check of the source information, so use it when you want to update an older list rather than repeatedly pressing it while you wait.' },
  { id: 'stuck', question: 'What should I do if the search seems stuck?', answer: 'Check the status message for an error, a paused search, or an unfinished review check. If results are already visible, you can keep browsing them. If a search fails, check your connection and try again. If the problem keeps happening, email me the approximate area, what you searched for, and any error message. You don’t need to share your home address.' },
  { id: 'no-results', question: 'Why aren’t there any matching restaurants?', answer: 'There may not be a matching place in the selected area, or the available listings may be incomplete. Try a wider distance, remove a cuisine or price filter, or search for a simpler dish name. New searches start at 1 km, so a small change in the area can change what’s included.' },
  { id: 'scores', question: 'Why do some restaurants have fewer scores or details?', answer: 'I’d rather show a gap than make up an answer. Scores depend on the review evidence EastEats has available, so food, value, service, or atmosphere details may be missing while checks are unfinished or when there isn’t enough evidence. The restaurant details show the review excerpts we can use.' },
  { id: 'restaurant-actions', question: 'What’s the difference between Save, Like, and Eat here?', answer: 'Save bookmarks a restaurant for later. Like and Dislike help shape your recommendations. Eat here records the place you chose for a meal, so EastEats can ask how it was on your next visit. It doesn’t make a reservation or order food.' },
  { id: 'location', question: 'Do I have to save my home address or share my location?', answer: 'No. Saving a home address is optional, and you can enter an address, neighborhood, or city instead of using your current location. You can change or clear your saved home in Account, and choose a different area for any search.' },
  { id: 'tutorial', question: 'Can I see the tutorial again?', answer: 'Open Account and choose Show tutorial. It points out the real controls and waits for you to make your choices. You can leave it at any time using Skip tutorial in the bottom-left corner.' },
];
const email = 'chenyinwilliam@gmail.com';
const emailLink = (subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`;

export default function Questions() {
  return <div className="questions-page">
    <a className="skip-link" href="#questions-main">Skip to content</a>
    <header className="site-header"><Link className="wordmark" href="/" aria-label="East Eats home">east eats<span className="wordmark-dot">.</span></Link><nav aria-label="Page navigation"><Link className="button" href="/">Back to EastEats</Link></nav></header>
    <main className="questions-main" id="questions-main">
      <p className="eyebrow">A little help while flavor finds you</p>
      <h1>Questions? I’m listening.</h1>
      <p className="lede">Here’s what’s happening behind your search, and how to reach me if something needs a fix or you’ve got an idea.</p>
      <div className="questions-shortcuts"><a href="#search-time">How long does it take?</a><a href="#why-the-wait">Why the wait?</a><a href="#contact">Send feedback</a></div>
      <section className="questions-list" aria-label="Common questions">{questions.map((item, index) => <details key={item.id} id={item.id} open={index < 2}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>
      <section className="questions-contact" id="contact" aria-labelledby="contact-heading"><p className="eyebrow">Tell me what you think</p><h2 id="contact-heading">A question, a bug, or your next idea?</h2><p>I’m William, and I’m building EastEats. If something isn’t working, a recommendation misses the mark, or there’s a feature you’d like to use, send it my way.</p><a className="questions-email" href={emailLink('EastEats question')}>{email}</a><div className="inline-actions"><a className="button primary" href={emailLink('EastEats feedback')}>Send feedback</a><a className="button" href={emailLink('EastEats question')}>Ask a question</a><a className="button" href={emailLink('EastEats feature request')}>Request a feature</a></div><p className="small">These links open your email app so you can review your message before sending it.</p></section>
    </main>
    <SiteFooter />
  </div>;
}
