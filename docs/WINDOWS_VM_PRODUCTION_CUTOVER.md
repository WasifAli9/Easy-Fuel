# Windows VM Production Cutover (Supabase Exit)

## 1) Infrastructure Baseline

- Host backend behind HTTPS reverse proxy (IIS/Nginx/Caddy).
- Keep app process supervised (`pm2` or Windows service).
- Restrict inbound ports:
  - `443` public
  - `80` optional redirect
  - `5432` private-only (or localhost)
  - `9000/9001` private-only if using MinIO

## 2) Required Environment Variables

- `AUTH_PROVIDER=local`
- `OBJECT_STORAGE_PROVIDER=minio` (or `s3`)
- `DATABASE_URL=postgresql://...`
- `JWT_ACCESS_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- `S3_ENDPOINT=http://127.0.0.1:9000` (MinIO example)
- `S3_REGION=us-east-1`
- `S3_BUCKET=easyfuel-private`
- `S3_ACCESS_KEY_ID=...`
- `S3_SECRET_ACCESS_KEY=...`
- `S3_FORCE_PATH_STYLE=true`

## 3) Data Migration (Production)

1. Freeze writes on old stack.
2. Export source DB.
3. Import into VM Postgres.
4. Run schema checks/migrations.
5. Verify row counts on critical tables (`profiles`, `orders`, `drivers`, `customers`, `suppliers`).

## 4) Pre-Cutover Validation

- Web:
  - Login/logout
  - Role routing
  - Protected API calls
- Mobile:
  - Login/logout
  - Session refresh
  - Role dashboards
  - Push permission prompt + device token registration (`/api/push/subscribe`)
  - Foreground notification receive
  - Background notification tap routing
  - Terminated-app push tap routing (requires dev build / store build, not Expo Go)
- Shared:
  - File upload + view
  - Chat + websocket
  - Notifications
  - Driver/supplier/customer key flows

## 4.1) Notification Validation Matrix

- Customer:
  - Driver status updates (`en_route`, `picked_up`, `delivered`) trigger instant notification.
  - New chat messages trigger notification + click opens relevant dashboard context.
- Driver:
  - Customer offer acceptance and supplier depot-order events notify immediately.
  - Customer chat messages notify immediately.
- Supplier:
  - Driver depot order placed/payment/signature/completion events notify immediately.
  - Chat-related events notify immediately where applicable.
- Delivery channels:
  - WebSocket in-app realtime when online.
  - Push fallback for offline/background users.

## 5) Cutover Steps

1. Deploy backend with local auth + MinIO/S3 settings.
2. Deploy web with `VITE_AUTH_PROVIDER=local`.
3. Release mobile app pointing to VM API base URL.
4. Run smoke tests.
5. Monitor 401/500 rates and websocket connection errors.

## 6) Rollback

1. Restore previous deployment artifact.
2. Revert env:
   - `AUTH_PROVIDER=supabase`
   - `OBJECT_STORAGE_PROVIDER=supabase`
3. Restart backend.
4. Re-enable old traffic route.

## 7) Backup/Restore Operations

- Use included scripts:
  - `scripts/windows/backup-db.ps1`
  - `scripts/windows/restore-db.ps1`
- Perform restore drill before final production cutover.

