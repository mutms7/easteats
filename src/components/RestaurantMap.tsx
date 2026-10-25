'use client';
import { useEffect, useRef, useState } from 'react';
import type { Location, RankedRestaurant } from '@/lib/contracts';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function RestaurantMap({ items, center, onSelect, onSearchArea }: { items: RankedRestaurant[]; center: Location; onSelect: (item: RankedRestaurant) => void; onSearchArea: (location: Location) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import('maplibre-gl').Map | null>(null);
  const callbacks = useRef({ onSelect, onSearchArea });
  const [failed, setFailed] = useState(false);
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  callbacks.current = { onSelect, onSearchArea };
  useEffect(() => {
    if (!container.current || !key) return;
    let cancelled = false;
    const markers: import('maplibre-gl').Marker[] = [];
    import('maplibre-gl').then(maplibre => {
      if (cancelled || !container.current) return;
      maplibre.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());
      const instance = new maplibre.Map({ container: container.current, style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`, center: [center.lng, center.lat], zoom: 12, attributionControl: { compact: true } });
      map.current = instance;
      instance.addControl(new maplibre.NavigationControl());
      instance.on('error', () => setFailed(true));
      items.forEach((item, index) => {
        const button = document.createElement('button');
        button.className = 'map-pin'; button.type = 'button';
        button.textContent = String(index + 1);
        button.setAttribute('aria-label', `View ${item.restaurant.name}`);
        button.addEventListener('click', () => callbacks.current.onSelect(item));
        markers.push(new maplibre.Marker({ element: button }).setLngLat([item.restaurant.lng, item.restaurant.lat]).addTo(instance));
      });
    }).catch(() => setFailed(true));
    return () => { cancelled = true; markers.forEach(marker => marker.remove()); map.current?.remove(); map.current = null; };
  }, [key, center.lat, center.lng, items]);
  if (!key) return <div className="empty map-unavailable"><h2>Map preview needs setup</h2><p>The restaurant list and directions work here. Add the map key to enable the interactive map.</p></div>;
  return <div className="map-shell"><div ref={container} className="map-canvas" aria-label="Restaurant map" />{failed && <p className="map-notice" role="status">The map is having trouble loading. You can still use the list.</p>}<button className="button map-search" onClick={() => { const position = map.current?.getCenter(); if (position) callbacks.current.onSearchArea({ lat: position.lat, lng: position.lng }); }}>Search this area</button></div>;
}
