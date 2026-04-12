import {
  useAuth,
} from "../lib/nostr/auth";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MiniProfile } from "./MiniProfile";
import { WalletButton } from "./WalletButton";
import { Nip46LoginDialog } from "./Nip46LoginDialog";
import { SignupDialog } from "./SignupDialog";
import { useUIStore } from "../stores/uiStore";
import { usePlatform } from "../lib/hooks/usePlatform";
import { cn } from "../lib/utils";

export function LoginSessionButtons() {
  const {
    currentAccount,
    loginWithBunker,
    loginWithExtension,
    loginWithPrivateKey,
    logout,
  } = useAuth();
  const shouldPulseLogin = useUIStore((state) => state.shouldPulseLogin);
  const { isTauri } = usePlatform();

  const [loading, setLoading] = useState(false);
  const [showSignupDialog, setShowSignupDialog] = useState(false);

  const handleSignup = async (key: string) => {
    try {
      await loginWithPrivateKey(key);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const handleNip07Login = async () => {
    try {
      setLoading(true);
      await loginWithExtension();
    } catch (error) {
      console.error("Extension login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNip46Login = async (bunker: string) => {
    try {
      setLoading(true);
      await loginWithBunker(bunker);
    } catch (error) {
      console.error("NIP-46 login failed:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  if (currentAccount) {
    return (
      <div className="flex justify-end">
        <div className="flex h-9 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]">
          <WalletButton />
          <MiniProfile userOrPubkey={currentAccount} />
          <Link to="/settings">
            <button
              className="h-full px-3 border-r-4 border-on-background flex items-center hover:bg-surface-container-high transition-colors"
              title="Settings"
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
            </button>
          </Link>
          <button
            onClick={() => logout()}
            className="h-full px-3 flex items-center hover:bg-surface-container-high transition-colors"
            title="Log out"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "flex h-9 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] transition-all",
          shouldPulseLogin && "animate-pulse ring-4 ring-primary/50"
        )}
      >
        <button
          onClick={() => setShowSignupDialog(true)}
          className="h-full px-3 flex items-center gap-1.5 border-r-4 border-on-background hover:bg-surface-container-high transition-colors"
          title="Create account / import key"
        >
          <span className="material-symbols-outlined text-[16px]">
            key
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
            NSEC
          </span>
        </button>

        {!isTauri && (
          <button
            onClick={handleNip07Login}
            disabled={loading}
            className="h-full px-3 flex items-center gap-1.5 border-r-4 border-on-background hover:bg-surface-container-high transition-colors disabled:opacity-40"
            title="Login with browser extension"
          >
            <span className="material-symbols-outlined text-[16px]">
              {loading ? "sync" : "extension"}
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
              {loading ? "..." : "EXT"}
            </span>
          </button>
        )}

        <Nip46LoginDialog
          onLogin={handleNip46Login}
          trigger={
            <button
              disabled={loading}
              className="h-full px-3 flex items-center gap-1.5 hover:bg-surface-container-high transition-colors disabled:opacity-40"
              title="Login with remote signer"
            >
              <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
                SIGNER
              </span>
            </button>
          }
        />
      </div>

      <SignupDialog
        open={showSignupDialog}
        onOpenChange={setShowSignupDialog}
        onConfirm={handleSignup}
      />
    </div>
  );
}
