import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Truck, Building2, ShieldCheck } from "lucide-react";

interface RoleSelectorProps {
  onSelectRole: (role: "customer" | "driver" | "supplier" | "admin") => void;
}

export function RoleSelector({ onSelectRole }: RoleSelectorProps) {
  const roles = [
    {
      id: "customer" as const,
      title: "Customer",
      description: "Order fuel delivery to your site",
      icon: User,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      id: "driver" as const,
      title: "Driver",
      description: "Accept delivery jobs and earn",
      icon: Truck,
      color: "text-green-600 dark:text-green-400",
    },
    {
      id: "supplier" as const,
      title: "Supplier",
      description: "Manage depots and fuel pricing",
      icon: Building2,
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      id: "admin" as const,
      title: "Admin",
      description: "Manage platform operations",
      icon: ShieldCheck,
      color: "text-red-600 dark:text-red-400",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Choose Your Role</h2>
        <p className="text-muted-foreground">Select how you want to use Easy Fuel</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <Card 
              key={role.id} 
              className="hover-elevate cursor-pointer transition-all"
              onClick={() => onSelectRole(role.id)}
              data-testid={`card-role-${role.id}`}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted`}>
                    <Icon className={`h-6 w-6 ${role.color}`} />
                  </div>
                  <div>
                    <CardTitle>{role.title}</CardTitle>
                    <CardDescription>{role.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full" 
                  variant="outline"
                  data-testid={`button-select-${role.id}`}
                >
                  Select {role.title}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
