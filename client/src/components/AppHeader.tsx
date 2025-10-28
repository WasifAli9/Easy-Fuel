import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { Bell, User, Menu, LogOut, MapPin, UserCircle, Home, CreditCard, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { useState } from "react";

interface AppHeaderProps {
  onMenuClick?: () => void;
  notificationCount?: number;
  showMenu?: boolean;
}

export function AppHeader({ onMenuClick, notificationCount = 0, showMenu = true }: AppHeaderProps) {
  const { profile, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    setLocation("/");
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          {showMenu && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                if (onMenuClick) {
                  onMenuClick();
                } else {
                  setMobileMenuOpen(true);
                }
              }}
              className="md:hidden"
              data-testid="button-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <Logo size="sm" />
          
          {/* Customer Navigation */}
          {profile?.role === "customer" && (
            <nav className="hidden md:flex items-center gap-2 ml-6">
              <Link href="/customer">
                <Button variant="ghost" size="sm" data-testid="nav-orders">
                  <Home className="h-4 w-4 mr-2" />
                  My Orders
                </Button>
              </Link>
              <Link href="/customer/addresses">
                <Button variant="ghost" size="sm" data-testid="nav-addresses">
                  <MapPin className="h-4 w-4 mr-2" />
                  Saved Addresses
                </Button>
              </Link>
              <Link href="/customer/payment-methods">
                <Button variant="ghost" size="sm" data-testid="nav-payment-methods">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Payment Methods
                </Button>
              </Link>
            </nav>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            className="relative"
            onClick={() => setNotificationsOpen(true)}
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              >
                {notificationCount}
              </Badge>
            )}
          </Button>
          
          <ThemeToggle />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                data-testid="button-profile"
              >
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div>
                  <p className="font-semibold">{profile?.fullName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {profile?.role === "customer" && (
                <>
                  <DropdownMenuItem onClick={() => setLocation("/customer/profile")} data-testid="menu-profile">
                    <UserCircle className="h-4 w-4 mr-2" />
                    My Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/customer/addresses")} data-testid="menu-addresses-mobile">
                    <MapPin className="h-4 w-4 mr-2" />
                    Saved Addresses
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/customer/payment-methods")} data-testid="menu-payment-methods-mobile">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Payment Methods
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleSignOut} data-testid="menu-signout">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile Menu Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[300px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-4 mt-6">
            {profile?.role === "customer" && (
              <>
                <Link href="/customer">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-nav-orders"
                  >
                    <Home className="h-4 w-4 mr-2" />
                    My Orders
                  </Button>
                </Link>
                <Link href="/customer/addresses">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-nav-addresses"
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Saved Addresses
                  </Button>
                </Link>
                <Link href="/customer/payment-methods">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-nav-payment-methods"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Payment Methods
                  </Button>
                </Link>
                <Link href="/customer/profile">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-nav-profile"
                  >
                    <UserCircle className="h-4 w-4 mr-2" />
                    My Profile
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Notifications Sheet */}
      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            {notificationCount === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No new notifications</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm font-medium">Sample Notification</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Notification system coming soon...
                  </p>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
