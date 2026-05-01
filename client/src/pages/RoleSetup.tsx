import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { RoleSelector } from "@/components/RoleSelector";
import { useToast } from "@/hooks/use-toast";

export default function RoleSetup() {
  const [loading, setLoading] = useState(false);
  const { user, profile, setUserRole } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setFullName((user as any)?.full_name || user?.email?.split("@")[0] || null);
  }, [user]);

  async function handleRoleSelection(role: "customer" | "driver" | "supplier" | "admin" | "company") {
    if (!user || loading) return;

    setLoading(true);
    try {
      const fullNameFromState = fullName;
      const fullNameFromMetadata =
        fullNameFromState ||
        user.user_metadata?.full_name ||
        user.app_metadata?.full_name ||
        (user as any).user_metadata?.full_name;

      const emailUsername = user.email?.split("@")[0] || "User";
      const defaultName = fullNameFromMetadata || emailUsername;
      const capitalizedName = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);

      await setUserRole(role, capitalizedName);

      toast({
        title: "Profile created",
        description: "Your account is all set up!",
      });

      window.location.href = `/${role}`;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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
