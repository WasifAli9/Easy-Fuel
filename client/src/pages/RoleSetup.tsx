import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { RoleSelector } from "@/components/RoleSelector";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export default function RoleSetup() {
  const [loading, setLoading] = useState(false);
  const { user, session, setUserRole } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [fullName, setFullName] = useState<string | null>(null);

  // Fetch user metadata on mount to ensure we have the latest data
  useEffect(() => {
    async function fetchUserMetadata() {
      if (!user) return;
      
      try {
        // First check session user
        if (session?.user) {
          const sessionName = session.user.user_metadata?.full_name || 
                              session.user.app_metadata?.full_name;
          if (sessionName) {
            setFullName(sessionName);
            console.log("[RoleSetup] Found full name from session:", sessionName);
            return;
          }
        }
        
        // Refresh user to get latest metadata
        const { data: { user: refreshedUser }, error } = await supabase.auth.getUser();
        if (!error && refreshedUser) {
          const metadataName = refreshedUser.user_metadata?.full_name || 
                               refreshedUser.app_metadata?.full_name;
          if (metadataName) {
            setFullName(metadataName);
            console.log("[RoleSetup] Found full name from refreshed user:", metadataName);
          } else {
            console.warn("[RoleSetup] No full_name found in user metadata:", {
              user_metadata: refreshedUser.user_metadata,
              app_metadata: refreshedUser.app_metadata,
            });
          }
        }
      } catch (err) {
        console.warn("[RoleSetup] Could not fetch user metadata:", err);
      }
    }
    
    fetchUserMetadata();
  }, [user, session]);

  async function handleRoleSelection(role: "customer" | "driver" | "supplier" | "admin") {
    if (!user || loading) return;

    setLoading(true);
    try {
      // Try to get full name from state (fetched from metadata) or from user object
      const fullNameFromState = fullName;
      const fullNameFromMetadata = fullNameFromState || 
                                    user.user_metadata?.full_name || 
                                    user.app_metadata?.full_name ||
                                    (user as any).user_metadata?.full_name;
      
      // Debug logging
      console.log("[RoleSetup] User object:", {
        email: user.email,
        user_metadata: user.user_metadata,
        app_metadata: user.app_metadata,
        fullNameFromState,
        fullNameFromMetadata,
      });
      
      // Fallback to email username if metadata not available
      const emailUsername = user.email?.split("@")[0] || "User";
      const defaultName = fullNameFromMetadata || emailUsername;
      
      // Capitalize first letter if not already capitalized
      const capitalizedName = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);
      
      console.log("[RoleSetup] Using full name:", capitalizedName);
      
      // Create profile and role-specific record
      await setUserRole(role, capitalizedName);
      
      // Redirect immediately - don't wait for profile fetch
      setLocation(`/${role}`);
      
      // Show success toast (non-blocking)
      toast({
        title: "Profile created",
        description: "Your account is all set up!",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Setting up your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <RoleSelector onSelectRole={handleRoleSelection} />
    </div>
  );
}
