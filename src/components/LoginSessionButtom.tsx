import {
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  useNDKCurrentUser,
  useNDKSessionLogin,
  useNDKSessionLogout,
} from "@nostr-dev-kit/react";
import { useState } from "react";
import { MiniProfile } from "./MiniProfile";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { AppWindowIcon } from "./ui/icons/lucide-app-window";
import { KeyRoundIcon } from "./ui/icons/lucide-key-round";
import { QrCodeIcon } from "./ui/icons/lucide-qr-code";
import { WalletButton } from "./WalletButton";
import { LogOutIcon } from "./ui/icons/lucide-log-out";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Nip46LoginDialog } from "./Nip46LoginDialog";

export function LoginSessionButtons() {
  const login = useNDKSessionLogin();
  const logout = useNDKSessionLogout();
  const currentUser = useNDKCurrentUser();

  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    try {
      const signer = NDKPrivateKeySigner.generate();
      await login(signer);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleNip07Login = async () => {
    try {
      setLoading(true);
      const signer = new NDKNip07Signer();
      await login(signer);
    } catch (error) {
      console.error("Extension login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNip46Login = async (signer: NDKNip46Signer) => {
    try {
      setLoading(true);
      await login(signer);
    } catch (error) {
      console.error("NIP-46 login failed:", error);
      throw error; // Re-throw so the dialog can handle it
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      {currentUser ? (
        <ButtonGroup>
          <WalletButton />
          <MiniProfile userOrPubkey={currentUser} />
          <Button onClick={() => logout()}>
            <LogOutIcon className="w-5 h-5" />
          </Button>
        </ButtonGroup>
      ) : (
        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleSignup}>
                <KeyRoundIcon className="w-5 h-5" />
                signup
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Create a new nsec.</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleNip07Login} disabled={loading}>
                <AppWindowIcon className="w-5 h-5" />
                {loading ? "Logging in..." : "extension"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Use your nostr extension.</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <Nip46LoginDialog
              onLogin={handleNip46Login}
              trigger={
                <TooltipTrigger asChild>
                  <Button disabled={loading}>
                    <QrCodeIcon className="w-5 h-5" />
                    {loading ? "Logging in..." : "signer"}
                  </Button>
                </TooltipTrigger>
              }
            />
            <TooltipContent>
              <p>Use an external signer.</p>
            </TooltipContent>
          </Tooltip>
        </ButtonGroup>
      )}
    </div>
  );
}
