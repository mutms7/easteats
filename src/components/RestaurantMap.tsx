'use client';
import { useEffect, useRef, useState } from 'react';
import type { Location, RankedRestaurant } from '@/lib/contracts';
import 'maplibre-gl/dist/maplibre-gl.css';

type MapLibrary = typeof import('maplibre-gl');
type MarkerEntry = { marker: import('maplibre-gl').Marker; button: HTMLButtonElement; item: RankedRestaurant };
export type MapLocation = { id: string; name: string; lat: number; lng: number; item: RankedRestaurant };

export function mapLocations(items: RankedRestaurant[]): MapLocation[] {
  const seen = new Set<string>();
  return items.flatMap(item => {
    const { id, name, lat, lng } = item.restaurant;
    if (seen.has(id) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    seen.add(id); return [{ id, name, lat, lng, item }];
  });
}
export function locationBounds(points: MapLocation[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  return [[Math.min(...points.map(point => point.lng)), Math.min(...points.map(point => point.lat))], [Math.max(...points.map(point => point.lng)), Math.max(...points.map(point => point.lat))]];
}

export default function RestaurantMap({ items, center, selectedId, searching = false, onSelect, onSearchArea }: { items: RankedRestaurant[]; center: Location; selectedId?: string | null; searching?: boolean; onSelect: (item: RankedRestaurant) => void; onSearchArea: (location: Location) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import('maplibre-gl').Map | null>(null);
  const library = useRef<MapLibrary | null>(null);
  const markers = useRef(new Map<string, MarkerEntry>());
  const lastFit = useRef('');
  const callbacks = useRef({ onSelect, onSearchArea });
  const initialCenter = useRef(center);
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(false);
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const points = mapLocations(items);
  callbacks.current = { onSelect, onSearchArea };

  // The map instance survives result, ranking, selection, and center changes.
  useEffect(() => {
    if (!container.current || !key) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    import('maplibre-gl').then(maplibre => {
      if (cancelled || !container.current) return;
      library.current = maplibre;
      maplibre.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());
      const instance = new maplibre.Map({ container: container.current, style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`, center: [initialCenter.current.lng, initialCenter.current.lat], zoom: 12, attributionControl: { compact: true } });
      map.current = instance;
      instance.addControl(new maplibre.NavigationControl());
      instance.on('error', () => setFailed(true));
      observer = new ResizeObserver(() => { instance.resize(); setRevision(value => value + 1); });
      observer.observe(container.current);
      setRevision(value => value + 1);
    }).catch(() => setFailed(true));
    return () => {
      cancelled = true; observer?.disconnect();
      markers.current.forEach(entry => entry.marker.remove()); markers.current.clear();
      map.current?.remove(); map.current = null; library.current = null; lastFit.current = '';
    };
  }, [key]);

  useEffect(() => {
    const instance = map.current, maplibre = library.current;
    if (!instance || !maplibre) return;
    const valid = new Set(points.map(point => point.id));
    markers.current.forEach((entry, id) => { if (!valid.has(id)) { entry.marker.remove(); markers.current.delete(id); } });
    points.forEach((point, index) => {
      let entry = markers.current.get(point.id);
      if (!entry) {
        const button = document.createElement('button'); button.className = 'map-pin'; button.type = 'button';
        const marker = new maplibre.Marker({ element: button }).setLngLat([point.lng, point.lat]).addTo(instance);
        entry = { marker, button, item: point.item };
        const current = entry;
        button.addEventListener('click', () => callbacks.current.onSelect(current.item));
        markers.current.set(point.id, entry);
      }
      entry.item = point.item; entry.marker.setLngLat([point.lng, point.lat]);
      entry.button.textContent = String(index + 1);
      entry.button.setAttribute('aria-label', `View ${point.name} on map`);
      entry.button.setAttribute('aria-pressed', String(point.id === selectedId));
    });
    if (!container.current?.clientWidth) return;
    const fitKey = JSON.stringify({ center, width: container.current.clientWidth, height: container.current.clientHeight, points: points.map(point => [point.id, point.lng, point.lat]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) });
    if (fitKey === lastFit.current) return;
    lastFit.current = fitKey;
    const bounds = locationBounds(points);
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
    if (points.length === 1) instance.easeTo({ center: [points[0].lng, points[0].lat], zoom: 14, duration });
    else if (bounds) instance.fitBounds(bounds, { padding: 48, maxZoom: 14, duration });
    else instance.easeTo({ center: [center.lng, center.lat], zoom: 12, duration });
  }, [items, center.lat, center.lng, selectedId, revision]);

  const locations = <details className="map-locations" open={!key || failed}><summary>{points.length} matching {points.length === 1 ? 'place' : 'places'} on the map</summary>{points.length ? <ol>{points.map((point, index) => <li key={point.id}><button onClick={() => onSelect(point.item)} aria-pressed={point.id === selectedId}><span>{index + 1}. {point.name}</span><span>{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span></button></li>)}</ol> : <p>{searching ? 'Searching this area. Places will appear here as they arrive.' : 'No matching locations to show yet.'}</p>}</details>;
  if (!key) return <div className="map-panel"><div className="empty map-unavailable"><h2>Map background unavailable</h2><p>The map needs setup. Every matching place and its coordinates are listed below.</p></div>{locations}</div>;
  return <div className="map-panel"><div className="map-shell"><div ref={container} className="map-canvas" aria-label="Restaurant map" />{failed && <p className="map-notice" role="status">The map background could not load. Use the matching location list below.</p>}<span className="map-result-count" role="status">{points.length} {points.length === 1 ? 'place' : 'places'}</span><button className="button map-search" onClick={() => { const position = map.current?.getCenter(); if (position) callbacks.current.onSearchArea({ lat: position.lat, lng: position.lng }); }}>Search this area</button></div>{locations}</div>;
}
