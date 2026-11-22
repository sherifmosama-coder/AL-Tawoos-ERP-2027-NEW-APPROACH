/**
 * Universal Location and Google Maps URL Normalizer
 * Handles all Google Maps URL variations, raw coordinate pairs, DMS coordinates, and addresses.
 */

/**
 * Extracts exact latitude and longitude numbers from diverse input formats:
 * - Google Maps URL data parameters: !3d<lat>!4d<lng>
 * - Query parameters: ?q=<lat>,<lng> or ?ll=<lat>,<lng> or &query=<lat>,<lng>
 * - Viewport coordinates: /@<lat>,<lng>
 * - Direct coordinate strings: "31.1989242, 30.0688344"
 */
export function extractCoordinates(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const str = rawInput.trim();
  if (!str) return null;

  // 1. Google Maps URL internal data params: !3d<lat>!4d<lng>
  // e.g. /data=!3m1!4b1!4m4!3m3!8m2!3d31.1989242!4d30.0688344
  const dataMatch = str.match(/!3d([0-9.-]+)!4d([0-9.-]+)/);
  if (dataMatch) {
    const lat = parseFloat(dataMatch[1]);
    const lng = parseFloat(dataMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng, latStr: dataMatch[1], lngStr: dataMatch[2] };
    }
  }

  // 2. Query coordinates: ?q=lat,lng or &query=lat,lng or ll=lat,lng
  const queryCoordMatch = str.match(/[?&](?:q|query|ll)=([0-9.-]+)[,+]([0-9.-]+)/);
  if (queryCoordMatch) {
    const lat = parseFloat(queryCoordMatch[1]);
    const lng = parseFloat(queryCoordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng, latStr: queryCoordMatch[1], lngStr: queryCoordMatch[2] };
    }
  }

  // 3. Viewport center if /place/ format: /@<lat>,<lng>
  if (str.includes('/place/')) {
    const atMatch = str.match(/@([0-9.-]+),([0-9.-]+)/);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lng = parseFloat(atMatch[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng, latStr: atMatch[1], lngStr: atMatch[2] };
      }
    }
  }

  // 4. Direct decimal coordinate pair: "31.1989242, 30.0688344" or "31.1989242 30.0688344"
  const directCoordMatch = str.match(/^([0-9.-]+)\s*[, ]\s*([0-9.-]+)$/);
  if (directCoordMatch) {
    const lat = parseFloat(directCoordMatch[1]);
    const lng = parseFloat(directCoordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng, latStr: directCoordMatch[1], lngStr: directCoordMatch[2] };
    }
  }

  return null;
}

/**
 * Normalizes any location string or URL into a reliable, clickable Google Maps link
 * that drops a precise red pin at the exact coordinates.
 */
export function normalizeLocationUrl(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const str = rawInput.trim();
  if (!str) return null;

  // 1. If exact coordinates can be extracted, construct a clean Google Maps pin URL:
  // https://www.google.com/maps?q=lat,lng
  const coords = extractCoordinates(str);
  if (coords) {
    return `https://www.google.com/maps?q=${coords.latStr},${coords.lngStr}`;
  }

  // 2. DMS coordinates: e.g. 31°11'56.1"N 30°04'07.8"E
  if (/([0-9]+[°\s]+[0-9]+['\s]+[0-9.]+"?\s*[NSEW])/i.test(str)) {
    return `https://www.google.com/maps?q=${encodeURIComponent(str)}`;
  }

  // 3. Direct HTTP(S) URL (e.g. https://maps.app.goo.gl/... or custom Google Maps link)
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return str;
  }

  // 4. URL lacking protocol (e.g. www.google.com/maps/... or maps.google.com/...)
  if (str.startsWith('www.') || str.startsWith('maps.google.')) {
    return `https://${str}`;
  }

  // 5. Fallback: treat as search query for name/address
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(str)}`;
}

/**
 * Resolves full location info (accurate GPS vs search fallback)
 * given a target branch, client object, and optional sales order.
 */
export function resolveLocationInfo(targetBranch, clientObj, order = null) {
  // Collect any accurate GPS coordinate / Maps link from order, branch, or client
  const rawGps = (
    order?.gpsCoordinates ||
    order?.googleMapsUrl ||
    order?.locationUrl ||
    targetBranch?.gpsCoordinates ||
    targetBranch?.googleMapsUrl ||
    targetBranch?.locationUrl ||
    clientObj?.gpsCoordinates ||
    clientObj?.googleMapsUrl ||
    clientObj?.locationUrl ||
    clientObj?.branches?.[0]?.gpsCoordinates ||
    clientObj?.branches?.[0]?.googleMapsUrl ||
    clientObj?.branches?.[0]?.locationUrl ||
    ''
  ).trim();

  if (rawGps) {
    const cleanUrl = normalizeLocationUrl(rawGps);
    if (cleanUrl) {
      const coords = extractCoordinates(rawGps);
      return {
        type: 'accurate',
        url: cleanUrl,
        raw: rawGps,
        coords: coords ? `${coords.latStr}, ${coords.lngStr}` : null
      };
    }
  }

  // Fallback to name/address search if no GPS coordinate is recorded
  const searchAddress = (
    order?.shippingAddress ||
    order?.deliveryAddress ||
    targetBranch?.address ||
    clientObj?.branches?.[0]?.address ||
    clientObj?.address ||
    targetBranch?.name ||
    clientObj?.tradeNameAr ||
    clientObj?.name ||
    ''
  ).trim();

  if (searchAddress) {
    return {
      type: 'search',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchAddress)}`,
      address: searchAddress
    };
  }

  return null;
}

/**
 * Computes straight-line distance (in kilometers) between two { lat, lng } points
 * using the Haversine formula.
 */
export function computeHaversineKm(coordA, coordB) {
  if (!coordA || !coordB) return null;
  const lat1 = Number(coordA.lat);
  const lng1 = Number(coordA.lng);
  const lat2 = Number(coordB.lat);
  const lng2 = Number(coordB.lng);
  if ([lat1, lng1, lat2, lng2].some((v) => !Number.isFinite(v))) return null;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth mean radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Builds a proposed trip delivery route using nearest-neighbor ordering
 * starting from the factory/warehouse GPS origin (or the first GPS stop if origin is absent),
 * plus a single Multi-Stop Google Maps Directions URL.
 *
 * @param {object} params
 * @param {string} [params.originRaw] - Factory/warehouse Google Maps URL or "lat, lng"
 * @param {Array<{ key: string, label: string, rawLocation?: string, address?: string, url?: string }>} params.stops
 */
export function buildProposedTripRoute({ originRaw = '', stops = [] } = {}) {
  const originCoords = extractCoordinates(originRaw);
  const originToken = originCoords
    ? `${originCoords.latStr},${originCoords.lngStr}`
    : (originRaw && typeof originRaw === 'string' && originRaw.trim() && !/^https?:\/\//i.test(originRaw.trim())
        ? originRaw.trim()
        : null);

  const normalizedStops = (Array.isArray(stops) ? stops : []).map((s, idx) => {
    const coords = extractCoordinates(s.rawLocation || s.url || '');
    const mapsToken = coords
      ? `${coords.latStr},${coords.lngStr}`
      : (s.address && String(s.address).trim() ? String(s.address).trim() : (s.label || ''));
    const rawSeq = Number(s.manualSequence);
    const manualSequence = Number.isFinite(rawSeq) && rawSeq > 0 ? Math.floor(rawSeq) : null;
    return {
      ...s,
      originalIndex: idx,
      manualSequence,
      coords,
      hasGps: Boolean(coords),
      mapsToken,
    };
  });

  const isManualSequence = normalizedStops.some((s) => s.manualSequence !== null);

  let orderedStops = [];
  let totalKm = 0;
  let gpsStopCount = 0;
  let hasAnyLegKm = false;

  if (isManualSequence) {
    // Manual Priority Mode: strictly follow planner's 1 -> 2 -> 3 sequence
    const sorted = [...normalizedStops].sort((a, b) => {
      const aHas = a.manualSequence !== null;
      const bHas = b.manualSequence !== null;
      if (aHas && bHas && a.manualSequence !== b.manualSequence) {
        return a.manualSequence - b.manualSequence;
      }
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.originalIndex - b.originalIndex;
    });

    let prevCoords = originCoords || null;
    orderedStops = sorted.map((s, i) => {
      let legKm = null;
      if (s.hasGps) {
        gpsStopCount += 1;
        if (prevCoords) {
          legKm = computeHaversineKm(prevCoords, s.coords);
          if (legKm !== null) {
            totalKm = Math.round((totalKm + legKm) * 10) / 10;
            hasAnyLegKm = true;
          }
        }
        prevCoords = s.coords;
      }
      return {
        ...s,
        legKm,
        stopNumber: i + 1,
      };
    });
  } else {
    // Automatic Nearest-Neighbor Mode (default when optional sequence is unset)
    const gpsStops = normalizedStops.filter((s) => s.hasGps);
    const nonGpsStops = normalizedStops.filter((s) => !s.hasGps);

    const orderedGps = [];
    const remaining = [...gpsStops];
    let currentCoords = originCoords || null;

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = null;

      if (currentCoords) {
        bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const d = computeHaversineKm(currentCoords, remaining[i].coords);
          if (d !== null && d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        if (!Number.isFinite(bestDist)) bestDist = null;
      }

      const picked = remaining.splice(bestIdx, 1)[0];
      if (bestDist !== null) {
        totalKm = Math.round((totalKm + bestDist) * 10) / 10;
        hasAnyLegKm = true;
      }
      orderedGps.push({
        ...picked,
        legKm: bestDist,
      });
      currentCoords = picked.coords;
    }

    gpsStopCount = orderedGps.length;
    orderedStops = [
      ...orderedGps,
      ...nonGpsStops.map((s) => ({ ...s, legKm: null })),
    ].map((s, i) => ({
      ...s,
      stopNumber: i + 1,
    }));
  }

  // Build Google Maps Multi-Stop Directions URL
  const routeTokens = orderedStops.map((s) => s.mapsToken).filter(Boolean);
  let googleMapsRouteUrl = null;

  if (routeTokens.length >= 1) {
    const destination = routeTokens[routeTokens.length - 1];
    const waypoints = routeTokens.slice(0, -1);
    const qs = new URLSearchParams({ api: '1', travelmode: 'driving' });
    if (originToken) {
      qs.set('origin', originToken);
    }
    qs.set('destination', destination);
    if (waypoints.length > 0) {
      qs.set('waypoints', waypoints.join('|'));
    }
    googleMapsRouteUrl = `https://www.google.com/maps/dir/?${qs.toString()}`;
  }

  return {
    isManualSequence,
    hasOriginGps: Boolean(originCoords),
    originCoords,
    orderedStops,
    gpsStopCount,
    totalKm: hasAnyLegKm ? totalKm : null,
    googleMapsRouteUrl,
  };
}
