import { Logo } from "../Logo";

export default function LogoExample() {
  return (
    <div className="space-y-8 p-8">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Sizes</h3>
        <div className="flex flex-wrap items-center gap-8">
          <Logo size="sm" />
          <Logo size="md" />
          <Logo size="lg" />
          <Logo size="xl" />
        </div>
      </div>
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Icon Only</h3>
        <div className="flex flex-wrap items-center gap-8">
          <Logo size="sm" showText={false} />
          <Logo size="md" showText={false} />
          <Logo size="lg" showText={false} />
        </div>
      </div>
    </div>
  );
}
