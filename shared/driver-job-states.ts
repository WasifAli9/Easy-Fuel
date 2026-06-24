/** Order states shown in the driver My Jobs workspace (includes awaiting payment for chat). */
export const DRIVER_MY_JOB_STATES = [
  "assigned",
  "en_route",
  "picked_up",
  "awaiting_payment",
] as const;

/** States where the driver still has a delivery action button. */
export const DRIVER_ACTION_REQUIRED_STATES = ["assigned", "en_route", "picked_up"] as const;

export type DriverMyJobState = (typeof DRIVER_MY_JOB_STATES)[number];

export function isDriverMyJobState(state: string | null | undefined): boolean {
  return Boolean(state && (DRIVER_MY_JOB_STATES as readonly string[]).includes(state));
}

export function isDriverActionRequiredState(state: string | null | undefined): boolean {
  return Boolean(state && (DRIVER_ACTION_REQUIRED_STATES as readonly string[]).includes(state));
}
