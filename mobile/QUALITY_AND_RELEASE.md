# Quality, Security, and Release Execution

## Testing Strategy

### Unit (Phase 5)
- Validate utilities, query hooks, state stores, and service helpers.
- Cover token refresh, role gate routing, and error parser behavior.

### Integration (Phase 5)
- Sign-in -> token persistence -> app restart -> session restore.
- Driver order status transitions with optimistic UI and invalidation.
- Payment/subscription flows with API error handling.

### E2E (Phase 5)
- Customer: login -> place order -> track -> chat.
- Driver: login -> accept/start/complete order -> earnings update.
- Supplier: login -> order fulfillment -> subscription action.
- Company: login -> overview -> fleet action -> order management.

## Performance Hardening

- Keep `staleTime`/`gcTime` tuned per module.
- Paginate long order/chat lists.
- Memoize list item renderers and use `FlatList`.
- Add skeleton loading for first paint and transitions.
- Track API latency and screen render timings with production telemetry.

## Security Hardening

- Token storage only in `expo-secure-store`.
- Force logout when refresh token expires or refresh fails.
- Require biometric unlock for returning sessions when enabled.
- Prevent sensitive data in logs and analytics payloads.
- Enforce HTTPS for all environments beyond local dev.

## Deployment Pipeline

1. Development profile build (`eas build --profile development`).
2. Preview QA build (`eas build --profile preview`).
3. Production signed builds (`eas build --profile production --platform all`).
4. Submit to stores (`eas submit --profile production --platform ios|android`).
5. Rollout strategy:
   - Closed/internal test first
   - Staged rollout percentage
   - Full release after monitoring error budgets

## Operational Checklist

- Configure environment secrets in EAS.
- Verify push notification credentials for iOS and Android.
- Validate location permissions and onboarding copy.
- Configure crash + performance monitoring before production.
- Prepare app store assets and privacy policy declarations.
