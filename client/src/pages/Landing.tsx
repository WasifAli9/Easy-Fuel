import { useLocation } from "wouter";
import { LandingHero } from "@/components/LandingHero";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen">
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <Button
          onClick={() => setLocation("/signup")}
          data-testid="button-signup-nav"
        >
          Sign Up
        </Button>
        <Button
          variant="outline"
          onClick={() => setLocation("/auth")}
          data-testid="button-signin-nav"
        >
          Sign In
        </Button>
        <ThemeToggle />
      </div>
      <LandingHero 
        onGetStarted={() => setLocation("/auth")}
        onLearnMore={() => setLocation("/auth")}
      />
    </div>
  );
}
