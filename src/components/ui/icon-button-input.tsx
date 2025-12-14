import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Button } from "./button";

type IconConfig = {
  icon: React.ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
    className?: string;
  }>;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
};

function IconButtonInput({
  className,
  startIcon,
  endIcon,
  ...props
}: React.ComponentProps<"input"> & {
  startIcon?: IconConfig;
  endIcon?: IconConfig;
}) {
  const renderIcon = (config: IconConfig, position: "start" | "end") => {
    const Icon = config.icon;
    const content = (
      <Icon
        size={18}
        className={cn(
          config.onClick && !config.disabled && "cursor-pointer",
          config.className
        )}
      />
    );

    const positionClasses =
      position === "start"
        ? "absolute left-3 top-1/2 transform -translate-y-1/2"
        : "absolute right-3 top-1/2 transform -translate-y-1/2";

    if (config.onClick) {
      return (
        <Button
          onClick={config.onClick}
          disabled={config.disabled}
          title={config.title}
          size="icon-sm"
          variant="ghost"
          className={cn(
            positionClasses
          )}
        >
          {content}
        </Button>
      );
    }

    return <div className={positionClasses}>{content}</div>;
  };

  return (
    <div className="w-full relative">
      {startIcon && renderIcon(startIcon, "start")}
      <Input
        className={cn(
          startIcon && "pl-10",
          endIcon && "pr-10",
          className
        )}
        {...props}
      />
      {endIcon && renderIcon(endIcon, "end")}
    </div>
  );
}

export { IconButtonInput };
export type { IconConfig };