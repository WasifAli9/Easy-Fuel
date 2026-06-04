/** Active delivery states where customer can track the assigned driver on a map. */
export const ORDER_TRACKING_STATES = ["assigned", "en_route", "picked_up"] as const;

export function getOrderAssignedDriverId(order: Record<string, unknown> | null | undefined): string | null {
  if (!order) return null;
  const id = order.assigned_driver_id ?? order.assignedDriverId;
  return id != null && String(id).trim() !== "" ? String(id) : null;
}

export function getOrderDropCoordinates(order: Record<string, unknown> | null | undefined): {
  lat: number | null;
  lng: number | null;
} {
  if (!order) return { lat: null, lng: null };
  const latRaw = order.drop_lat ?? order.dropLat;
  const lngRaw = order.drop_lng ?? order.dropLng;
  const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : NaN;
  const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : NaN;
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

export function canShowOrderTrackingMap(order: Record<string, unknown> | null | undefined): boolean {
  if (!order) return false;
  const state = String(order.state ?? "");
  const assigned = getOrderAssignedDriverId(order);
  const { lat, lng } = getOrderDropCoordinates(order);
  return (
    Boolean(assigned) &&
    ORDER_TRACKING_STATES.includes(state as (typeof ORDER_TRACKING_STATES)[number]) &&
    lat != null &&
    lng != null
  );
}
