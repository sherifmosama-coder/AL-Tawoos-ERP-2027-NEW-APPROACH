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
