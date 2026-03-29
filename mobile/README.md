# Easy Fuel Mobile (React Native)

Production-ready mobile workspace for Android and iOS, built to reuse existing Easy Fuel backend APIs.

## Stack

- Expo + React Native + TypeScript
- React Navigation
- React Query + Axios
- Zustand
- React Native Paper
- react-hook-form + zod
- expo-secure-store, expo-notifications, expo-location, expo-local-authentication

## App Structure

- `src/app/`: Provider tree and app bootstrapping
- `src/navigation/`: Root navigation and role routing
- `src/features/`: Domain features and role feature map
- `src/services/`: API client, auth, push, biometrics, location, secure storage
- `src/store/`: Client session and UI state stores
- `src/design/`: Theme tokens and visual system

## Environment

Create `.env` from `.env.example` and set:

`EXPO_PUBLIC_API_BASE_URL=https://your-api-domain.com`

## API Contract Boundary

- Mobile app consumes existing Express REST routes under `/api/*`.
- `apiClient` adds `Authorization: Bearer <token>` automatically.
- On `401`, interceptor calls `/api/auth/refresh`, retries once, then logs out if refresh fails.

## Screen Mapping (Web -> Mobile)

- Keep parity:
  - Auth, orders, chat, payments, subscriptions, profiles, role dashboards.
- Mobile redesign:
  - Dense analytics/dashboard views become card-first KPI screens with drill-down routes.
  - Table-heavy workflows become list + detail flows with sticky primary actions.
- Mobile-first additions:
  - Push notifications
  - Biometric unlock
  - Location-aware driver/supplier flows

## UX System

- 8pt spacing scale and rounded surfaces
- Single primary CTA per screen
- Reusable components:
  - `PrimaryButton`, `MetricCard`, `StatusBadge`, `FormField`, `TopAppBar`, `Skeleton`
- Premium interaction patterns:
  - Card entrance transitions
  - Press-scale feedback on CTA buttons
  - Haptic feedback on success/error actions

## Implementation Phases

1. Foundation: project setup, providers, navigation, secure storage, API client
2. Auth: sign-in, refresh flow, role resolution, biometric unlock
3. Core modules: dashboards, orders, chat, payments/subscriptions, profiles
4. Device services: push notifications and location flows
5. Quality: tests, performance tuning, security hardening
6. Release: Android/iOS builds, staging/prod, store rollout

## Performance Checklist

- Use React Query cache policies per feature
- Use `FlatList` with memoized rows and stable keys
- Keep render trees shallow with memoized selectors
- Lazy-load secondary screens
- Use paginated/infinite queries for long lists

## Security Checklist

- Store tokens only in `expo-secure-store`
- Disable sensitive logs in production
- Enforce inactivity lock + optional biometric unlock
- Use HTTPS-only API endpoints
- Handle refresh-token failures with forced logout

## Example Query Hook

```ts
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api/client";

export function useDriverAssignedOrders() {
  return useQuery({
    queryKey: ["driver", "orders", "assigned"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/driver/assigned-orders");
      return data;
    },
    staleTime: 20_000,
  });
}
```
