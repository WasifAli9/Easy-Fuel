import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { ArrowRight, Fuel, Shield, Clock } from "lucide-react";

export function LandingHero() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
      
      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <div className="mb-8 flex justify-center">
          <Logo size="xl" />
        </div>
        
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          Fuel Delivered to <span className="text-primary">Your Site</span>
        </h1>
        
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
          South Africa's trusted fuel delivery marketplace. Order diesel, petrol, or paraffin delivered directly by vetted drivers from approved suppliers.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Button size="lg" className="text-lg" data-testid="button-get-started">
            Get Started
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button size="lg" variant="outline" className="text-lg" data-testid="button-learn-more">
            Learn More
          </Button>
        </div>
        
        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="p-3 rounded-lg bg-primary/10">
                <Fuel className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h3 className="font-semibold text-lg">Any Fuel Type</h3>
            <p className="text-sm text-muted-foreground">
              Diesel, Petrol 95/93, Paraffin - all available on demand
            </p>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="p-3 rounded-lg bg-primary/10">
                <Shield className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h3 className="font-semibold text-lg">Vetted Drivers</h3>
            <p className="text-sm text-muted-foreground">
              All drivers undergo KYC verification for your safety
            </p>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="p-3 rounded-lg bg-primary/10">
                <Clock className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h3 className="font-semibold text-lg">Fast Delivery</h3>
            <p className="text-sm text-muted-foreground">
              Real-time tracking and rapid dispatch to your location
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
