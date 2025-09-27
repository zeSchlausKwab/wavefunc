import {
    NDKNip07Signer,
    NDKPrivateKeySigner,
    useNDKCurrentUser,
    useNDKSessionLogin,
    useNDKSessionLogout,
    type NDKUserProfile,
} from "@nostr-dev-kit/ndk-hooks";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

export function LoginSessionButtons() {
  const login = useNDKSessionLogin();
  const logout = useNDKSessionLogout();
  const currentUser = useNDKCurrentUser();

  const [loading, setLoading] = useState(false);

  const [ndkProfile, setNdkProfile] = useState<NDKUserProfile | null>(null);

  useEffect(() => {
    if (currentUser) {
      currentUser.fetchProfile().then((profile) => {
        setNdkProfile(profile);
      });
    } else {
      console.log("User is not logged in");
    }
  }, [currentUser]);

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
          {ndkProfile?.name ? (
            <p>Logged in as: {ndkProfile.name}</p>
          ) : (
            <p>Logged in as: {currentUser?.pubkey}</p>
          )}
          <Button onClick={() => logout()}>Logout</Button>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Button onClick={handleSignup}>Signup</Button>
          <Button onClick={handleNip07Login} disabled={loading}>
            {loading ? "Logging in..." : "Login with NIP-07"}
          </Button>
        </div>
      )}
    </div>
  );
}
