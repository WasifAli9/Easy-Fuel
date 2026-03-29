import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppHeader } from "@/components/AppHeader";
import { OrderCard } from "@/components/OrderCard";
import { CreateOrderDialog } from "@/components/CreateOrderDialog";
import { ViewOrderDialog } from "@/components/ViewOrderDialog";
import { Button } from "@/components/ui/button";
import { Filter, X, ListOrdered, Clock, CheckCircle, Menu } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DashboardSidebarAside,
  DashboardSidebarInner,
  DashboardNavSection,
  DashboardNavButton,
} from "@/components/dashboard/DashboardSidebar";
import { cn } from "@/lib/utils";

type CustomerTab = "all" | "active" | "completed";

export default function CustomerDashboard() {
  const { profile, session, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<CustomerTab>("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedFuelTypeId, setSelectedFuelTypeId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const processedOrderIdRef = useRef<string | null>(null);

  // Fetch orders from API
  const { data: ordersData, isLoading } = useQuery<any[]>({
    queryKey: ["/api/orders"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "customer",
    refetchInterval: 30000, // Poll every 30 seconds (WebSocket handles real-time updates)
    staleTime: 15 * 1000, // Consider data fresh for 15 seconds
    retry: false, // Don't retry on errors
  });

  // Ensure orders is always an array (never null/undefined)
  const orders = ordersData || [];

  // Handle orderId from URL query parameter (from notification clicks)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderIdFromUrl = urlParams.get("orderId");
    
    // Skip if already processed or no orderId
    if (!orderIdFromUrl || processedOrderIdRef.current === orderIdFromUrl) {
      return;
    }
    
    // Wait for orders to load, then check
    if (!isLoading && orders) {
      processedOrderIdRef.current = orderIdFromUrl;
      
      // Check if order exists in the orders list
      const orderExists = (orders || []).some((order: any) => order.id === orderIdFromUrl);
      
      if (orderExists) {
        // Order exists, open the dialog
        setSelectedOrderId(orderIdFromUrl);
        setViewDialogOpen(true);
        // Clear the query parameter from URL
        window.history.replaceState({}, "", "/customer");
      } else {
        // Order not found in list, try to fetch it directly
        (async () => {
          try {
            const response = await apiRequest("GET", `/api/orders/${orderIdFromUrl}`);
            if (response.ok) {
              // Order found, open the dialog
              setSelectedOrderId(orderIdFromUrl);
              setViewDialogOpen(true);
              // Clear the query parameter from URL
              window.history.replaceState({}, "", "/customer");
            } else {
              throw new Error("Order not found");
            }
          } catch (error) {
            // Order not found
            toast({
              title: "Order Not Found",
              description: "The order you're looking for could not be found.",
              variant: "destructive",
            });
            // Clear the query parameter from URL
            window.history.replaceState({}, "", "/customer");
          }
        })();
      }
    }
  }, [orders, isLoading, toast]);

  // Listen for real-time order updates via WebSocket
  useWebSocket((message) => {
    console.log("[CustomerDashboard] WebSocket message received:", message.type, message);
    
    // Handle both direct message types and payload-wrapped messages
    const messageType = message.type;
    const orderId = message.orderId || message.payload?.orderId;
    const orderData = message.order || message.payload?.order;
    
    if (messageType === "order_updated" && orderData) {
      // Directly update the query cache with new order data (like chat messages)
      console.log("[CustomerDashboard] Updating order in cache:", orderId);
      
      // Update orders list
      queryClient.setQueryData<any[]>(["/api/orders"], (old = []) => {
        const exists = old.findIndex((o: any) => o.id === orderId);
        if (exists >= 0) {
          // Update existing order
          const updated = [...old];
          updated[exists] = orderData;
          return updated;
        } else {
          // Add new order to the beginning
          return [orderData, ...old];
        }
      });
      
      // Update single order query if it's the selected order
      if (selectedOrderId && orderId === selectedOrderId) {
        queryClient.setQueryData(["/api/orders", orderId], orderData);
      }
    } else if (messageType === "order_update" || messageType === "order_created" || messageType === "order_state_changed" || messageType === "driver_offer_received") {
      // Fallback: invalidate queries for other message types
      console.log("[CustomerDashboard] Invalidating orders due to:", messageType);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      
      if (selectedOrderId && orderId === selectedOrderId) {
        queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedOrderId] });
      }
    }
  });

  // Fetch fuel types for filter
  const { data: fuelTypesData } = useQuery<any[]>({
    queryKey: ["/api/fuel-types"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "customer",
    retry: false, // Don't retry on errors
  });

  // Ensure fuelTypes is always an array (never null/undefined)
  const fuelTypes = fuelTypesData || [];

  // Helper function to format delivery address
  const formatAddress = (order: any) => {
    if (order.delivery_addresses) {
      const parts = [
        order.delivery_addresses.address_street,
        order.delivery_addresses.address_city,
      ].filter(Boolean); // Remove empty/null/undefined values
      
      if (parts.length > 0) {
        return parts.join(", ");
      }
    }
    // Fallback to GPS coordinates
    return `${order.drop_lat}, ${order.drop_lng}`;
  };

  // Helper function to filter out old orders
  const filterOutOldOrders = (ordersToFilter: any[] = []) => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    return ordersToFilter.filter((order) => {
      // Filter out cancelled orders older than 1 day
      if (order.state === "cancelled") {
        const cancelledAt = order.updated_at ? new Date(order.updated_at) : null;
        const createdAt = order.created_at ? new Date(order.created_at) : null;
        
        // Use updated_at if available (when order was cancelled), otherwise use created_at
        const orderDate = cancelledAt || createdAt;
        
        if (!orderDate) {
          return true; // Keep if we can't determine the date
        }
        
        // Remove if cancelled/created more than 1 day ago
        return orderDate > oneDayAgo;
      }
      
      // Filter out delivered orders older than 2 days
      if (order.state === "delivered") {
        const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : null;
        
        // If no delivered_at timestamp, use created_at as fallback
        if (!deliveredAt) {
          const createdAt = order.created_at ? new Date(order.created_at) : null;
          if (!createdAt) {
            return true; // Keep if we can't determine the date
          }
          // Only remove if created more than 2 days ago
          return createdAt > twoDaysAgo;
        }
        
        // Remove if delivered more than 2 days ago
        return deliveredAt > twoDaysAgo;
      }
      
      // Keep all other orders (active, en_route, picked_up, etc.)
      return true;
    });
  };

  // Helper function to filter orders by fuel type
  const filterOrdersByFuelType = (ordersToFilter: any[] = []) => {
    if (!selectedFuelTypeId) {
      return ordersToFilter;
    }
    return ordersToFilter.filter((order) => {
      // Check both the relationship object and direct field
      const fuelTypeId = order.fuel_types?.id || order.fuel_type_id;
      return fuelTypeId === selectedFuelTypeId;
    });
  };

  // Get selected fuel type label for display
  const selectedFuelTypeLabel = selectedFuelTypeId
    ? fuelTypes.find((ft) => ft.id === selectedFuelTypeId)?.label || null
    : null;

  const navItems: { value: CustomerTab; label: string; icon: typeof ListOrdered }[] = [
    { value: "all", label: "All Orders", icon: ListOrdered },
    { value: "active", label: "Active", icon: Clock },
    { value: "completed", label: "Completed", icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />

      <div className="flex flex-1 min-h-0">
        <DashboardSidebarAside aria-label="Orders navigation">
          <DashboardSidebarInner label="Orders">
            <DashboardNavSection>
              {navItems.map(({ value, label, icon: Icon }) => (
                <DashboardNavButton
                  key={value}
                  active={activeTab === value}
                  icon={Icon}
                  onClick={() => setActiveTab(value)}
                  data-testid={value === "all" ? "tab-all" : value === "active" ? "tab-active" : "tab-completed"}
                >
                  {label}
                </DashboardNavButton>
              ))}
            </DashboardNavSection>
          </DashboardSidebarInner>
        </DashboardSidebarAside>

        <Button variant="outline" size="icon" className="md:hidden fixed bottom-4 right-4 z-40 rounded-full shadow-lg" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            className="w-[min(100vw-2rem,288px)] p-0 overflow-hidden flex flex-col bg-sidebar border-r border-sidebar-border"
          >
            <div className="flex flex-col h-full min-h-0">
              <DashboardSidebarInner label="Orders">
                <DashboardNavSection>
                  {navItems.map(({ value, label, icon: Icon }) => (
                    <DashboardNavButton
                      key={value}
                      active={activeTab === value}
                      icon={Icon}
                      onClick={() => {
                        setActiveTab(value);
                        setSidebarOpen(false);
                      }}
                    >
                      {label}
                    </DashboardNavButton>
                  ))}
                </DashboardNavSection>
              </DashboardSidebarInner>
            </div>
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0 overflow-auto dashboard-main-area">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8 rounded-2xl border border-border/60 bg-gradient-to-br from-card/95 via-card/80 to-primary/[0.05] p-6 sm:p-7 shadow-lg shadow-primary/[0.06] backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary/90">Customer</p>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My orders</h1>
                  <p className="text-sm text-muted-foreground">Track and manage your fuel deliveries</p>
                </div>
                <CreateOrderDialog
                  onOrderCreated={(orderId) => {
                    setSelectedOrderId(orderId);
                    setViewDialogOpen(true);
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filter" className="self-start sm:self-auto">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                  {selectedFuelTypeLabel && (
                    <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {selectedFuelTypeLabel}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Filter by Fuel Type</Label>
                    {selectedFuelTypeId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedFuelTypeId(null);
                          setFilterOpen(false);
                        }}
                        className="h-6 px-2 text-xs"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                  <Select
                    value={selectedFuelTypeId ? selectedFuelTypeId : "all"}
                    onValueChange={(value) => {
                      if (value === "all") {
                        setSelectedFuelTypeId(null);
                      } else {
                        setSelectedFuelTypeId(value);
                      }
                      // Close popover after selection
                      setTimeout(() => setFilterOpen(false), 150);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select fuel type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Fuel Types</SelectItem>
                      {(fuelTypes || []).map((fuelType) => (
                        <SelectItem key={fuelType.id} value={fuelType.id}>
                          {fuelType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
            </div>

            {activeTab === "all" && (
            <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
            ) : (() => {
              const safeOrders = orders || [];
              const recentOrders = filterOutOldOrders(safeOrders);
              const filteredOrders = filterOrdersByFuelType(recentOrders);
              return filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {selectedFuelTypeId ? "No orders found for the selected fuel type." : "No orders found. Create your first order!"}
                </div>
              ) : (
                <>
                  {(selectedFuelTypeId || recentOrders.length !== safeOrders.length) && (
                    <div className="text-sm text-muted-foreground mb-2">
                      Showing {filteredOrders.length} of {recentOrders.length} orders
                      {selectedFuelTypeLabel && ` (filtered by ${selectedFuelTypeLabel})`}
                      {recentOrders.length !== safeOrders.length && (
                        <span>
                          {" "}
                          (completed orders older than 2 days and cancelled orders older than 1 day are hidden)
                        </span>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      id={order.id}
                      fuelType={order.fuel_types?.label || "Unknown"}
                      litres={parseFloat(order.litres)}
                      location={formatAddress(order)}
                      date={new Date(order.created_at).toLocaleString()}
                      totalAmount={order.total_cents / 100}
                      status={order.state}
                      onView={() => {
                        setSelectedOrderId(order.id);
                        setViewDialogOpen(true);
                      }}
                    />
                  ))}
                  </div>
                </>
              );
            })()}
            </div>
            )}

            {activeTab === "active" && (
            <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
            ) : (() => {
              const safeOrders = orders || [];
              const activeOrders = safeOrders.filter(o => !["delivered", "cancelled"].includes(o.state));
              const recentActiveOrders = filterOutOldOrders(activeOrders);
              const filteredOrders = filterOrdersByFuelType(recentActiveOrders);
              return filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {selectedFuelTypeId ? "No active orders found for the selected fuel type." : "No active orders found."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      id={order.id}
                      fuelType={order.fuel_types?.label || "Unknown"}
                      litres={parseFloat(order.litres)}
                      location={formatAddress(order)}
                      date={new Date(order.created_at).toLocaleString()}
                      totalAmount={order.total_cents / 100}
                      status={order.state}
                      onView={() => {
                        setSelectedOrderId(order.id);
                        setViewDialogOpen(true);
                      }}
                    />
                  ))}
                </div>
              );
            })()}
            </div>
            )}

            {activeTab === "completed" && (
            <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
            ) : (() => {
              const safeOrders = orders || [];
              const completedOrders = safeOrders.filter(o => o.state === "delivered");
              const recentCompletedOrders = filterOutOldOrders(completedOrders);
              const filteredOrders = filterOrdersByFuelType(recentCompletedOrders);
              return filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {selectedFuelTypeId ? "No completed orders found for the selected fuel type." : "No completed orders found."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      id={order.id}
                      fuelType={order.fuel_types?.label || "Unknown"}
                      litres={parseFloat(order.litres)}
                      location={formatAddress(order)}
                      date={new Date(order.created_at).toLocaleString()}
                      totalAmount={order.total_cents / 100}
                      status={order.state}
                      onView={() => {
                        setSelectedOrderId(order.id);
                        setViewDialogOpen(true);
                      }}
                    />
                  ))}
                </div>
              );
            })()}
            </div>
            )}
          </div>
        </main>
      </div>

      {/* View/Edit Order Dialog */}
      {selectedOrderId && (
        <ViewOrderDialog
          orderId={selectedOrderId}
          open={viewDialogOpen}
          onOpenChange={setViewDialogOpen}
        />
      )}
    </div>
  );
}
