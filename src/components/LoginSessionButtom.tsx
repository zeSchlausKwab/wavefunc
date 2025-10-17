import {
    NDKNip07Signer,
    NDKPrivateKeySigner,
    useNDKCurrentUser,
    useNDKSessionLogin,
    useNDKSessionLogout
} from "@nostr-dev-kit/ndk-hooks";
import { useState } from "react";
import { MiniProfile } from "./MiniProfile";
import { Button } from "./ui/button";
import { KeyRoundIcon } from "./ui/icons/lucide-key-round";

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

  return (
    <div className="flex items-center gap-4">
      {currentUser ? (
        <div className="flex items-center gap-4">
          <MiniProfile userOrPubkey={currentUser} />
          <Button onClick={() => logout()}>Logout</Button>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Button onClick={handleSignup}>
            <KeyRoundIcon className="w-5 h-5" />
            Signup
          </Button>
          <Button onClick={handleNip07Login} disabled={loading}>
            {loading ? "Logging in..." : "Login with NIP-07"}
          </Button>
        </div>
      )}
    </div>
  );
}
