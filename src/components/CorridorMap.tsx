/**
 * Static Corridor Map Visualization
 * Vector-rendered geographic projection of Ugandan freight corridors (Kampala-Jinja Highway).
 * Dynamically plots current vehicle coordinates, corridor route, landmarks, and GPS dropout zones.
 */

import React, { useMemo } from 'react';
import { Navigation, AlertTriangle, MapPin, Eye, Compass } from 'lucide-react';
import { Map, Marker, Polyline } from '@vis.gl/react-google-maps';

interface CurrentFix {
  latitude: number;
  longitude: number;
  speedKmH: number;
  headingDegrees?: number;
  ageSeconds: number;
  isDeadReckoned: boolean;
  excludeFromAlerts: boolean;
}

interface CorridorMapProps {
  currentFix: CurrentFix | null;
  corridorId: string;
  corridorName: string;
  destination: string;
  vehiclePlate: string;
  delayRisk: number;
  waypoints?: Array<{ lat: number; lng: number }>;
}

// Bounding box for Kampala to Jinja corridor visualization
const BOUNDS = {
  minLon: 32.55,
  maxLon: 33.28,
  minLat: 0.25,
  maxLat: 0.48,
};

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 300;
const PAD_X = 40;
const PAD_Y = 30;

function project(lat: number, lon: number): [number, number] {
  const normX = (lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon);
  const normY = (BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat); // Invert for SVG

  const x = Math.max(PAD_X, Math.min(VIEW_WIDTH - PAD_X, PAD_X + normX * (VIEW_WIDTH - 2 * PAD_X)));
  const y = Math.max(PAD_Y, Math.min(VIEW_HEIGHT - PAD_Y, PAD_Y + normY * (VIEW_HEIGHT - 2 * PAD_Y)));
  return [Number(x.toFixed(1)), Number(y.toFixed(1))];
}

// Main Highway Waypoints (Kampala -> Jinja via Mukono, Lugazi, Mabira, Njeru)
const HIGHWAY_WAYPOINTS: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'Kampala (Nakawa)', lat: 0.3340, lon: 32.6180 },
  { name: 'Namanve', lat: 0.3550, lon: 32.6950 },
  { name: 'Mukono', lat: 0.3530, lon: 32.7550 },
  { name: 'Mbalala', lat: 0.3700, lon: 32.8400 },
  { name: 'Lugazi', lat: 0.3800, lon: 32.9300 },
  { name: 'Mabira Forest', lat: 0.3950, lon: 32.9800 },
  { name: 'Najjembe', lat: 0.4050, lon: 33.0200 },
  { name: 'Mbiko', lat: 0.4150, lon: 33.1100 },
  { name: 'Njeru', lat: 0.4300, lon: 33.1700 },
  { name: 'Jinja Port Depot', lat: 0.4428, lon: 33.2032 },
];

// Katosi Bypass Waypoints
const KATOSI_BYPASS: Array<[number, number]> = [
  project(0.3530, 32.7550), // Mukono
  project(0.3000, 32.8000), // Kisoga
  project(0.2800, 32.9100), // Nkokonjeru
  project(0.3200, 33.0500), // Nyenga
  project(0.4300, 33.1700), // Njeru
];

export const CorridorMap: React.FC<CorridorMapProps> = ({
  currentFix,
  corridorId,
  corridorName,
  destination,
  vehiclePlate,
  delayRisk,
  waypoints,
}) => {
  // Generate SVG path string for main highway
  const highwayPathD = useMemo(() => {
    return HIGHWAY_WAYPOINTS.map((wp, i) => {
      const [x, y] = project(wp.lat, wp.lon);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }, []);

  // Generate SVG path for Katosi bypass
  const katosiPathD = useMemo(() => {
    return KATOSI_BYPASS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  }, []);

  // Calculate vehicle coordinates on SVG canvas
  const vehiclePos = useMemo(() => {
    if (!currentFix) return null;
    return project(currentFix.latitude, currentFix.longitude);
  }, [currentFix?.latitude, currentFix?.longitude]);

  // Mabira Forest reserve visual boundary
  const mabiraBox = useMemo(() => {
    const [x1, y1] = project(0.4200, 32.9400);
    const [x2, y2] = project(0.3700, 33.0400);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }, []);

  // Marker color according to delay risk: green for normal, amber for moderate, red for critical
  const markerColor = useMemo(() => {
    if (!currentFix) return '#d44a3a'; // Terracotta red for no fix
    if (delayRisk >= 0.65) return '#d44a3a'; // Critical delay
    if (delayRisk >= 0.35) return '#d9923b'; // Moderate delay
    return '#3ba36e'; // Ugandan canopy green for normal
  }, [currentFix, delayRisk]);

  return (
    <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-md)]">
      {/* Map Header */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Compass className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--accent)] shrink-0" />
          <span className="font-semibold text-[var(--text-primary)] truncate">Corridor Map</span>
          <span className="text-[var(--text-muted)]">·</span>
          <span className="text-[var(--text-secondary)] font-mono truncate">{corridorName}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 font-mono text-[10px] sm:text-[11px]">
          {currentFix ? (
            <span className="text-[var(--status-normal)] flex items-center gap-1.5 font-medium">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[var(--status-normal)] animate-ping inline-block" />
              {currentFix.latitude.toFixed(4)}° N, {currentFix.longitude.toFixed(4)}° E
            </span>
          ) : (
            <span className="text-[var(--status-moderate)] flex items-center gap-1 font-medium">
              <AlertTriangle className="h-3 w-3 inline text-[var(--status-moderate)]" />
              NO GPS FIX · LAST SEEN NEAR MABIRA
            </span>
          )}
        </div>
      </div>

      {/* Google Map Canvas Container */}
      <div className="relative h-[240px] w-full">
        <Map
          defaultCenter={{ lat: 0.38, lng: 32.9 }}
          defaultZoom={9}
        >
          {currentFix && <Marker position={{ lat: currentFix.latitude, lng: currentFix.longitude }} />}
          <Polyline
            path={waypoints || HIGHWAY_WAYPOINTS.map(wp => ({ lat: wp.lat, lng: wp.lon }))}
            strokeColor={delayRisk >= 0.65 ? '#ef4444' : delayRisk >= 0.35 ? '#f59e0b' : '#10b981'}
            strokeWeight={3.5}
          />
        </Map>

        {/* Small, Unobtrusive Status Legend Overlay in Top-Right */}
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-[var(--surface-overlay)] backdrop-blur border border-[var(--border-default)] rounded-[var(--radius-sm)] p-1.5 sm:p-2 text-[9px] sm:text-[10px] font-mono text-[var(--text-secondary)] shadow-[var(--shadow-md)] pointer-events-none z-10">
          <div className="text-[8px] sm:text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-0.5 sm:mb-1">
            Status Legend
          </div>
          <div className="flex flex-col gap-0.5 sm:gap-1">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[var(--status-normal)] inline-block shrink-0" />
              <span>Normal (&lt;35%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[var(--status-moderate)] inline-block shrink-0" />
              <span>Moderate (35-65%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[var(--status-critical)] inline-block shrink-0" />
              <span>Critical (≥65%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[var(--surface-elevated)] border border-[var(--status-critical)] inline-block shrink-0" />
              <span>No Fix</span>
            </div>
          </div>
        </div>

        {/* Floating Legend / Telemetry Strip */}
        <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-4 sm:right-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-[var(--surface-overlay)] backdrop-blur border border-[var(--border-default)] rounded-[var(--radius-sm)] text-[10px] sm:text-[11px] font-mono text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap">
            <span className="flex items-center gap-1 sm:gap-1.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[var(--accent)] inline-block shrink-0" />
              <span>Arterial (82km)</span>
            </span>
            <span className="flex items-center gap-1 sm:gap-1.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[var(--accent-nile)] inline-block shrink-0" />
              <span>Katosi Bypass</span>
            </span>
            <span className="flex items-center gap-1 sm:gap-1.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-sm bg-emerald-950 border border-emerald-600 inline-block shrink-0" />
              <span>Mabira Reserve</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-[var(--text-secondary)] flex-wrap tabular-numbers">
            <span>Speed:</span>
            <span className="font-bold text-[var(--accent)]">
              {currentFix ? `${currentFix.speedKmH} km/h` : '0 km/h'}
            </span>
            <span>·</span>
            <span>Heading:</span>
            <span>
              {currentFix?.headingDegrees ? `${currentFix.headingDegrees}°` : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
