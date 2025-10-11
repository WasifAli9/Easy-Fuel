import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { Bell, User, Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AppHeaderProps {
  onMenuClick?: () => void;
  notificationCount?: number;
  showMenu?: boolean;
}

export function AppHeader({ onMenuClick, notificationCount = 0, showMenu = true }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          {showMenu && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={onMenuClick}
              className="md:hidden"
              data-testid="button-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <Logo size="sm" />
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            className="relative"
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
          
          <Button 
            variant="ghost" 
            size="icon"
            data-testid="button-profile"
          >
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
