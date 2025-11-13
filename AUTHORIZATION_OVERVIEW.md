# Authorization System Overview - Easy Fuel ZA

## Architecture

The project uses a **two-layer authorization system**:
1. **Authentication Layer** - Verifies user identity (Supabase Auth)
2. **Authorization Layer** - Controls access based on user roles (RBAC)

---

## 1. Authentication Flow

### Frontend (Client)
- **Location**: `client/src/contexts/AuthContext.tsx`
- **Method**: Supabase Email OTP/Magic Link
- **Session Management**: 
  - Gets session from Supabase: `supabase.auth.getSession()`
  - Listens for auth state changes: `supabase.auth.onAuthStateChange()`
  - Stores user, profile, and session in React context

### Backend (Server)
- **Location**: `server/routes.ts` - `getSupabaseUser()` function
- **Token Validation**:
  ```typescript
  // Extracts Bearer token from Authorization header
  const token = authHeader.substring(7);
  // Validates token with Supabase
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  ```

### API Request Flow
1. **Client** gets session token from Supabase
2. **Client** sends request with `Authorization: Bearer <token>` header
3. **Server** validates token using `getSupabaseUser()`
4. **Server** attaches user to request: `(req as any).user = user`

---

## 2. Role-Based Access Control (RBAC)

### User Roles
The system supports **4 roles**:
- `customer` - End users ordering fuel
- `driver` - Delivery drivers
- `supplier` - Fuel suppliers/depots
- `admin` - System administrators

### Role Storage
- **Table**: `profiles` in Supabase
- **Schema**: `{ id, role, full_name, phone }`
- **Relationship**: `profiles.id` = `auth.users.id` (foreign key)

---

## 3. Backend Authorization

### Middleware Functions

#### `requireAuth` - Basic Authentication
```typescript
// Location: server/routes.ts:46
// Purpose: Ensures user is authenticated
// Returns: 401 if no valid token
```

#### `requireAdmin` - Admin-Only Access
```typescript
// Location: server/routes.ts:56
// Purpose: Ensures user has admin role
// Process:
//   1. Checks if user exists (from requireAuth)
//   2. Queries profiles table for user's role
//   3. Returns 403 if role !== "admin"
```

### Route Protection

Routes are protected at the **route group level**:

```typescript
// All customer routes require authentication
app.use("/api", requireAuth, customerRoutes);

// All driver routes require authentication
app.use("/api/driver", requireAuth, driverRoutes);

// All supplier routes require authentication
app.use("/api/supplier", requireAuth, supplierRoutes);

// Admin routes require BOTH auth AND admin role
app.use("/api/admin", requireAuth, requireAdmin, adminRoutes);
```

### Route-Level Authorization

Individual routes check role-specific data:

**Example - Driver Routes** (`server/driver-routes.ts`):
```typescript
router.get("/profile", async (req, res) => {
  const user = (req as any).user; // From requireAuth middleware
  
  // Verify driver record exists for this user
  const { data: driver } = await supabaseAdmin
    .from("drivers")
    .select("*")
    .eq("user_id", user.id)
    .single();
    
  if (!driver) {
    return res.status(404).json({ error: "Driver profile not found" });
  }
  // ... return driver data
});
```

**Note**: Routes don't explicitly check `role === "driver"` because:
- Route is already under `/api/driver` (protected by `requireAuth`)
- Access is controlled by existence of role-specific record (drivers, customers, suppliers tables)
- If user doesn't have driver record, they can't access driver data

---

## 4. Frontend Authorization

### Protected Routes Component
**Location**: `client/src/App.tsx:22`

```typescript
function ProtectedRoute({ component, role, allowWithoutProfile }) {
  const { user, profile, loading } = useAuth();
  
  // 1. Check if user is authenticated
  if (!user) return <Redirect to="/auth" />;
  
  // 2. Check if profile exists (role assigned)
  if (!profile && !allowWithoutProfile) return <Redirect to="/setup" />;
  
  // 3. Check if role matches
  if (role && profile && profile.role !== role) {
    return <Redirect to={`/${profile.role}`} />;
  }
  
  return <Component />;
}
```

### Route Examples
```typescript
// Customer routes - only accessible to customers
<Route path="/customer">
  {() => <ProtectedRoute component={CustomerDashboard} role="customer" />}
</Route>

// Driver routes - only accessible to drivers
<Route path="/driver">
  {() => <ProtectedRoute component={DriverDashboard} role="driver" />}
</Route>

// Admin routes - only accessible to admins
<Route path="/admin">
  {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
</Route>
```

---

## 5. Authorization Headers

### Client-Side
**Location**: `client/src/lib/auth-headers.ts`

```typescript
export async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  return {
    "Authorization": `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}
```

### Usage in API Calls
**Location**: `client/src/lib/queryClient.ts`

```typescript
export async function apiRequest(method, url, data) {
  let headers = { "Content-Type": "application/json" };
  
  try {
    const authHeaders = await getAuthHeaders();
    headers = { ...headers, ...authHeaders };
  } catch (error) {
    // Not authenticated - continue without auth headers
    // (will result in 401 from server)
  }
  
  // ... make request with headers
}
```

---

## 6. Public vs Protected Routes

### Public Routes (No Auth Required)
- `/api/fuel-types` - List of fuel types (public data)
- `/public-objects/*` - Public assets
- `/auth` - Authentication page
- `/` - Landing page

### Protected Routes (Auth Required)
- `/api/*` - All customer routes
- `/api/driver/*` - All driver routes
- `/api/supplier/*` - All supplier routes
- `/api/push/*` - Push notification routes
- `/api/location/*` - Location tracking routes

### Admin-Only Routes (Auth + Admin Role)
- `/api/admin/*` - Admin management routes

---

## 7. Database-Level Authorization (RLS)

### Row Level Security (RLS)
Supabase uses RLS policies for database-level access control:

**Location**: `server/admin-rls-policies.sql`

```sql
-- Example: Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (is_admin());
```

**Note**: The backend uses `supabaseAdmin` client which **bypasses RLS** for server-side operations. RLS is primarily for direct database access from the client.

---

## 8. Error Responses

### 401 Unauthorized
- **Cause**: Missing or invalid authentication token
- **Response**: `{ error: "Unauthorized" }`
- **Action**: User must log in

### 403 Forbidden
- **Cause**: User authenticated but lacks required permissions (e.g., not admin)
- **Response**: `{ error: "Forbidden - Admin access required" }`
- **Action**: User needs appropriate role

### 404 Not Found
- **Cause**: User authenticated but role-specific record doesn't exist
- **Example**: User has `role: "driver"` but no record in `drivers` table
- **Response**: `{ error: "Driver profile not found" }`

---

## 9. Authorization Flow Diagram

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │
       │ 1. User logs in via Supabase
       │    Gets access_token
       ▼
┌─────────────────┐
│  AuthContext    │
│  - Stores user  │
│  - Stores role  │
└──────┬──────────┘
       │
       │ 2. Makes API request
       │    Authorization: Bearer <token>
       ▼
┌─────────────────┐
│  Express Server │
│  requireAuth()  │
│  - Validates    │
│    token        │
│  - Gets user    │
└──────┬──────────┘
       │
       │ 3. Route-specific check
       │    (if admin route)
       ▼
┌─────────────────┐
│  requireAdmin() │
│  - Checks role  │
│    in profiles  │
└──────┬──────────┘
       │
       │ 4. Route handler
       │    - Checks role-specific
       │      table (drivers, etc)
       │    - Returns data
       ▼
┌─────────────────┐
│  Response       │
│  (200/401/403)  │
└─────────────────┘
```

---

## 10. Key Files

### Backend
- `server/routes.ts` - Auth middleware, route registration
- `server/supabase.ts` - Supabase client configuration
- `server/driver-routes.ts` - Example of role-specific routes
- `server/customer-routes.ts` - Customer routes
- `server/admin-routes.ts` - Admin routes

### Frontend
- `client/src/contexts/AuthContext.tsx` - Auth state management
- `client/src/lib/auth-headers.ts` - Auth header generation
- `client/src/lib/queryClient.ts` - API request wrapper
- `client/src/App.tsx` - Route protection component

---

## Summary

1. **Authentication**: Supabase JWT tokens validated on every request
2. **Authorization**: Role-based access control via `profiles.role`
3. **Route Protection**: Middleware-based (`requireAuth`, `requireAdmin`)
4. **Frontend Protection**: React component-based route guards
5. **Data Access**: Role-specific tables (drivers, customers, suppliers) control data access

