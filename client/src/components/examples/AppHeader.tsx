import { AppHeader } from "../AppHeader";

export default function AppHeaderExample() {
  return (
    <div className="space-y-4">
      <AppHeader 
        onMenuClick={() => console.log("Menu clicked")}
        notificationCount={3}
      />
      <div className="p-8 text-center text-muted-foreground">
        <p>Header is sticky - scroll to see the effect</p>
      </div>
    </div>
  );
}
