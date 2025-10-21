/**
 * Geocoding utility to convert addresses to latitude/longitude coordinates
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 */

interface GeocodingResult {
  lat: number;
  lng: number;
  displayName?: string;
}

interface AddressComponents {
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Geocode an address to lat/lng coordinates
 * @param address - Address components to geocode
 * @returns Promise with lat/lng coordinates or null if not found
 */
export async function geocodeAddress(
  address: AddressComponents
): Promise<GeocodingResult | null> {
  try {
    // Build the address query string
    const addressParts = [
      address.street,
      address.city,
      address.province,
      address.postalCode,
      address.country || 'South Africa'
    ].filter(Boolean);

    if (addressParts.length === 0) {
      return null;
    }

    const query = addressParts.join(', ');
    
    // Use Nominatim API (OpenStreetMap)
    // countrycodes=za limits results to South Africa for better accuracy
    const url = `https://nominatim.openstreetmap.org/search?` + 
      `q=${encodeURIComponent(query)}&` +
      `format=json&` +
      `limit=1&` +
      `countrycodes=za`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EasyFuelZA/1.0' // Nominatim requires a user agent
      }
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Reverse geocode coordinates to an address
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Promise with address string or null if not found
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?` +
      `lat=${lat}&` +
      `lon=${lng}&` +
      `format=json`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EasyFuelZA/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data && data.display_name) {
      return data.display_name;
    }

    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}
