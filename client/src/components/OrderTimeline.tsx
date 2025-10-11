import { CheckCircle2, Circle, Clock } from "lucide-react";

interface TimelineStep {
  label: string;
  timestamp?: string;
  status: "completed" | "current" | "pending";
}

interface OrderTimelineProps {
  steps: TimelineStep[];
}

export function OrderTimeline({ steps }: OrderTimelineProps) {
  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        
        return (
          <div key={index} className="relative flex gap-4" data-testid={`timeline-step-${index}`}>
            {/* Icon */}
            <div className="flex flex-col items-center">
              <div className={`
                rounded-full p-1
                ${step.status === 'completed' ? 'bg-green-100 dark:bg-green-950' : ''}
                ${step.status === 'current' ? 'bg-primary/20' : ''}
                ${step.status === 'pending' ? 'bg-muted' : ''}
              `}>
                {step.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />}
                {step.status === 'current' && <Clock className="h-5 w-5 text-primary" />}
                {step.status === 'pending' && <Circle className="h-5 w-5 text-muted-foreground" />}
              </div>
              
              {/* Connector line */}
              {!isLast && (
                <div className={`
                  w-0.5 h-full mt-1
                  ${step.status === 'completed' ? 'bg-green-200 dark:bg-green-900' : 'bg-border'}
                `} />
              )}
            </div>
            
            {/* Content */}
            <div className="flex-1 pb-8">
              <p className={`
                font-medium
                ${step.status === 'completed' ? 'text-foreground' : ''}
                ${step.status === 'current' ? 'text-primary' : ''}
                ${step.status === 'pending' ? 'text-muted-foreground' : ''}
              `}>
                {step.label}
              </p>
              {step.timestamp && (
                <p className="text-sm text-muted-foreground mt-1">
                  {step.timestamp}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
