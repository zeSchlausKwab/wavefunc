import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { type ReactNode, type MouseEvent, forwardRef } from "react";
import { useUIStore } from "../stores/uiStore";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "@/lib/utils";

interface AuthRequiredButtonProps extends React.ComponentPropsWithoutRef<typeof Button> {
  children: ReactNode;
  loginTooltipMessage?: string;
}

export const AuthRequiredButton = forwardRef<HTMLButtonElement, AuthRequiredButtonProps>(
  function AuthRequiredButton(
    {
      children,
      onClick,
      className,
      variant,
      disabled = false,
      loginTooltipMessage = "Please log in to continue",
      ...props
    },
    ref
  ) {
    const currentUser = useNDKCurrentUser();
    const pulseLogin = useUIStore((state) => state.pulseLogin);

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if (!currentUser) {
        // Prevent opening sheets/dialogs when not logged in
        e.preventDefault();
        e.stopPropagation();
        // Trigger visual cue on login buttons
        pulseLogin();
        return;
      }

      // When logged in, call onClick if provided
      if (onClick && !disabled) {
        onClick(e);
      }
    };

    // Visual disabled state when not logged in
    const isVisuallyDisabled = !currentUser || disabled;

    const button = (
      <Button
        ref={ref}
        variant={variant}
        onClick={handleClick}
        className={cn(
          className,
          isVisuallyDisabled && "opacity-50 cursor-not-allowed"
        )}
        data-auth-required={!currentUser}
        type="button"
        disabled={disabled}
        {...props}
      >
        {children}
      </Button>
    );

    // Show tooltip when not logged in
    if (!currentUser) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{loginTooltipMessage}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // If logged in but disabled for other reasons, still show tooltip if provided
    if (disabled && loginTooltipMessage) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{loginTooltipMessage}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  }
);