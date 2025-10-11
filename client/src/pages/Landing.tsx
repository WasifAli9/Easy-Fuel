import { useState } from "react";
import { LandingHero } from "@/components/LandingHero";
import { RoleSelector } from "@/components/RoleSelector";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Landing() {
  const [showRoleSelector, setShowRoleSelector] = useState(false);

  const handleGetStarted = () => {
    setShowRoleSelector(true);
  };

  const handleSelectRole = (role: "customer" | "driver" | "supplier" | "admin") => {
    console.log("Selected role:", role);
    // TODO: Navigate to role-specific dashboard
  };

  return (
    <div className="min-h-screen">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      
      {!showRoleSelector ? (
        <div onClick={handleGetStarted}>
          <LandingHero />
        </div>
      ) : (
        <RoleSelector onSelectRole={handleSelectRole} />
      )}
    </div>
  );
}
