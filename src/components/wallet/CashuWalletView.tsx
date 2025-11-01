import { useState, useEffect } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { QRCodeSVG } from "qrcode.react";
import { Scanner } from "@yudiel/react-qr-scanner";
import {
  Coins,
  TrendingUp,
  TrendingDown,
  QrCode,
  Copy,
  Check,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Wallet,
  RefreshCw,
  ExternalLink,
  Settings,
  Plus,
  Trash2,
  Star,
  Scan,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { useWalletStore } from "../../stores/walletStore";
import { formatDistanceToNow } from "date-fns";

interface Transaction {
  id: string;
  type: "deposit" | "withdraw" | "send" | "receive";
  amount: number;
  timestamp: number;
  status: "pending" | "completed" | "failed";
  memo?: string;
  mint?: string;
}

export function CashuWalletView() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const {
    cashuWallet,
    cashuConnection,
    cashuBalance,
    updateCashuBalance,
    updateCashuConnection,
  } = useWalletStore();

  const [balance, setBalance] = useState<number>(0);
  const [mintBalances, setMintBalances] = useState<Record<string, number>>({});
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Deposit state
  const [depositAmount, setDepositAmount] = useState("");
  const [depositInvoice, setDepositInvoice] = useState<string | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cashuTokenInput, setCashuTokenInput] = useState("");
  const [isRedeemingToken, setIsRedeemingToken] = useState(false);
  const [redeemTokenSuccess, setRedeemTokenSuccess] = useState(false);
  const [showDepositQR, setShowDepositQR] = useState(false);
  const [depositBalanceSnapshot, setDepositBalanceSnapshot] =
    useState<number>(0);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [showWithdrawQR, setShowWithdrawQR] = useState(false);
  const [mintTokenAmount, setMintTokenAmount] = useState("");
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [isMintingToken, setIsMintingToken] = useState(false);

  // Settings state
  const [mints, setMints] = useState<string[]>(cashuConnection?.mints || []);
  const [relays, setRelays] = useState<string[]>(cashuConnection?.relays || []);
  const [primaryMint, setPrimaryMint] = useState<string>(
    cashuConnection?.primaryMint || cashuConnection?.mints?.[0] || ""
  );
  const [newMint, setNewMint] = useState("");
  const [newRelay, setNewRelay] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Load balance and transactions on mount
  useEffect(() => {
    loadBalance();
    loadTransactions();
  }, [cashuWallet]);

  // Sync local state with store
  useEffect(() => {
    if (cashuConnection) {
      setMints(cashuConnection.mints || []);
      setRelays(cashuConnection.relays || []);
      setPrimaryMint(
        cashuConnection.primaryMint || cashuConnection.mints?.[0] || ""
      );
    }
  }, [cashuConnection]);

  // Listen for wallet balance updates from the store
  useEffect(() => {
    // When the store balance changes, update local state and reload breakdown
    if (cashuBalance !== balance && cashuWallet) {
      console.log("Store balance changed to:", cashuBalance);
      setBalance(cashuBalance);
      loadBalance(); // Reload to get per-mint breakdown
    }
  }, [cashuBalance]);

  // Debug withdraw state
  useEffect(() => {
    console.log("Withdraw state:", {
      withdrawAmount,
      withdrawAddress,
      isWithdrawing,
      buttonDisabled: isWithdrawing || !withdrawAmount || !withdrawAddress,
    });
  }, [withdrawAmount, withdrawAddress, isWithdrawing]);

  // Monitor balance changes for deposit success detection
  useEffect(() => {
    if (
      depositInvoice &&
      depositBalanceSnapshot > 0 &&
      balance > depositBalanceSnapshot
    ) {
      console.log(
        "Deposit detected! Balance increased from",
        depositBalanceSnapshot,
        "to",
        balance
      );
      setDepositSuccess(true);
      setDepositError(null);

      // Auto-clear success message and reset after a few seconds
      setTimeout(() => {
        setDepositSuccess(false);
        setDepositInvoice(null);
        setDepositAmount("");
        setDepositBalanceSnapshot(0);
      }, 5000);
    }
  }, [balance, depositInvoice, depositBalanceSnapshot]);

  const loadBalance = async () => {
    if (!cashuWallet) return;

    setIsLoadingBalance(true);
    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Get balance using the wallet state methods
      const totalBal = wallet.state?.getBalance() || 0;
      const mintBals = wallet.state?.getMintsBalance() || {};

      console.log("Loading balance - Total:", totalBal, "Per mint:", mintBals);

      setBalance(totalBal);
      setMintBalances(mintBals);
      updateCashuBalance(totalBal);
    } catch (error) {
      console.error("Failed to load balance:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const loadTransactions = async () => {
    if (!cashuWallet || !ndk || !currentUser) return;

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Fetch token events (kind 7375) - these represent actual token movements
      const filter = {
        kinds: [7375], // NDKCashuToken events
        authors: [currentUser.pubkey],
      };

      const events = await ndk.fetchEvents(filter, { groupable: false });

      const txs: Transaction[] = [];

      for (const event of Array.from(events)) {
        try {
          // Decrypt the event content
          await event.decrypt();

          // Parse the token data
          const content = JSON.parse(event.content || "{}");
          const proofs = content.proofs || [];

          // Calculate amount from proofs
          const amount = proofs.reduce(
            (sum: number, proof: any) => sum + (proof.amount || 0),
            0
          );

          // Get metadata from tags
          const mint = event.tagValue("mint") || cashuConnection?.mints?.[0];
          const direction = event.tagValue("direction") || "unknown";
          const memo =
            event.tagValue("memo") || event.tagValue("description") || "Token";

          // Determine transaction type
          let txType: "deposit" | "withdraw" | "send" | "receive" = "receive";
          if (
            memo.toLowerCase().includes("payment") ||
            memo.toLowerCase().includes("withdraw")
          ) {
            txType = "withdraw";
          } else if (memo.toLowerCase().includes("deposit")) {
            txType = "deposit";
          }

          txs.push({
            id: event.id,
            type: txType,
            amount: txType === "withdraw" ? -amount : amount,
            timestamp: (event.created_at || 0) * 1000,
            status: "completed",
            memo,
            mint,
          });
        } catch (err) {
          console.error("Failed to parse token event:", err, event);
        }
      }

      // Sort by timestamp, newest first
      txs.sort((a, b) => b.timestamp - a.timestamp);

      setTransactions(txs);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!cashuWallet || !depositAmount) return;

    const amount = parseInt(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setDepositError("Please enter a valid amount");
      return;
    }

    setIsGeneratingInvoice(true);
    setDepositError(null);
    setDepositSuccess(false);

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Get the primary mint
      const depositMint =
        cashuConnection?.primaryMint || cashuConnection?.mints?.[0];
      if (!depositMint) {
        throw new Error("No mints configured");
      }

      // Capture current balance to detect changes
      setDepositBalanceSnapshot(balance);
      console.log("Invoice generated, balance snapshot:", balance);

      // Generate deposit invoice using the primary mint
      const deposit = wallet.deposit(amount, depositMint);

      // Start the deposit and get the invoice
      const invoice = await deposit.start();
      setDepositInvoice(invoice);

      // Listen for success
      deposit.on("success", async () => {
        await loadBalance();
        await loadTransactions();
      });

      deposit.on("error", (error) => {
        setDepositError(error);
      });

      // Add pending transaction
      const newTransaction: Transaction = {
        id: Date.now().toString(),
        type: "deposit",
        amount,
        timestamp: Date.now(),
        status: "pending",
        mint: depositMint,
      };
      setTransactions([newTransaction, ...transactions]);
    } catch (error) {
      console.error("Failed to generate invoice:", error);
      setDepositError(
        error instanceof Error ? error.message : "Failed to generate invoice"
      );
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  const handleWithdraw = async () => {
    if (!cashuWallet || !withdrawAmount || !withdrawAddress) return;

    const amount = parseInt(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError("Please enter a valid amount");
      return;
    }

    if (amount > balance) {
      setWithdrawError("Insufficient balance");
      return;
    }

    setIsWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(false);

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Withdraw to Lightning address or invoice
      await wallet.lnPay({ pr: withdrawAddress });

      // Refresh balance and transactions
      await loadBalance();
      await loadTransactions();

      setWithdrawSuccess(true);
      setWithdrawAmount("");
      setWithdrawAddress("");
    } catch (error) {
      console.error("Failed to withdraw:", error);
      setWithdrawError(
        error instanceof Error ? error.message : "Failed to withdraw"
      );
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleRedeemToken = async () => {
    if (!cashuWallet || !cashuTokenInput.trim()) return;

    setIsRedeemingToken(true);
    setDepositError(null);

    try {
      const wallet = cashuWallet as NDKCashuWallet;
      const token = cashuTokenInput.trim();

      console.log("Receiving Cashu token...");

      // Receive the token - this will add the sats to the wallet
      // The receiveToken method handles decoding and mint extraction automatically
      const result = await wallet.receiveToken(token, "Deposited via QR/paste");

      if (!result) {
        throw new Error("Failed to receive token");
      }

      console.log("Token received successfully");

      // Refresh balance and transactions
      await loadBalance();
      await loadTransactions();

      setCashuTokenInput("");
      setDepositError(null);
      setRedeemTokenSuccess(true);

      // Auto-clear success message after 3 seconds
      setTimeout(() => {
        setRedeemTokenSuccess(false);
      }, 3000);
    } catch (error) {
      console.error("Failed to redeem token:", error);
      setDepositError(
        error instanceof Error ? error.message : "Failed to redeem token"
      );
    } finally {
      setIsRedeemingToken(false);
    }
  };

  const handleMintToken = async () => {
    if (!cashuWallet || !mintTokenAmount) return;

    const amount = parseInt(mintTokenAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError("Please enter a valid amount");
      return;
    }

    if (amount > balance) {
      setWithdrawError("Insufficient balance");
      return;
    }

    setIsMintingToken(true);
    setWithdrawError(null);

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Get the primary mint
      const mint = cashuConnection?.primaryMint || cashuConnection?.mints?.[0];
      if (!mint) {
        throw new Error("No mint configured");
      }

      // Create a Cashu token from wallet balance
      // This involves creating a token that can be shared
      // @ts-ignore - WalletState API may vary
      const proofs = await wallet.state?.getProofsForAmount(amount, mint);

      if (!proofs || proofs.length === 0) {
        throw new Error("No proofs available to create token");
      }

      // Encode proofs as a Cashu token string
      const token = JSON.stringify({
        token: [
          {
            mint,
            proofs,
          },
        ],
      });

      const encodedToken = `cashuA${btoa(token)}`;
      setMintedToken(encodedToken);

      // Refresh balance and transactions
      await loadBalance();
      await loadTransactions();
    } catch (error) {
      console.error("Failed to mint token:", error);
      setWithdrawError(
        error instanceof Error ? error.message : "Failed to mint token"
      );
    } finally {
      setIsMintingToken(false);
    }
  };

  const handleDepositQRScan = (result: string) => {
    // Check if it's a Cashu token
    if (result.startsWith("cashuA") || result.includes("cashu")) {
      setCashuTokenInput(result);
      setShowDepositQR(false);
    }
  };

  const handleWithdrawQRScan = (result: string) => {
    // Clean up the result
    const cleaned = result.trim();
    console.log("Scanned Lightning QR code:", cleaned);

    // Check if it's a Lightning invoice (various formats)
    const lowerResult = cleaned.toLowerCase();
    if (
      lowerResult.startsWith("lnbc") ||
      lowerResult.startsWith("lnurl") ||
      lowerResult.startsWith("lightning:")
    ) {
      // Remove lightning: prefix if present
      const invoice = cleaned.replace(/^lightning:/i, "");
      console.log("Detected Lightning invoice:", invoice);
      setWithdrawAddress(invoice);
      setShowWithdrawQR(false);
    } else {
      // If it doesn't look like a Lightning invoice, still try to set it
      // in case it's a valid format we didn't recognize
      console.log("Unknown format, setting anyway:", cleaned);
      setWithdrawAddress(cleaned);
      setShowWithdrawQR(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat().format(amount);
  };

  // Settings handlers
  const handleAddMint = () => {
    if (newMint.trim() && !mints.includes(newMint.trim())) {
      const updatedMints = [...mints, newMint.trim()];
      setMints(updatedMints);
      setNewMint("");
      // If this is the first mint, set it as primary
      if (!primaryMint) {
        setPrimaryMint(newMint.trim());
      }
    }
  };

  const handleRemoveMint = (mint: string) => {
    if (mints.length <= 1) {
      setSettingsError("You must have at least one mint configured");
      return;
    }
    const updatedMints = mints.filter((m) => m !== mint);
    setMints(updatedMints);
    // If removing the primary mint, set a new one
    if (primaryMint === mint) {
      setPrimaryMint(updatedMints[0] || "");
    }
    setSettingsError(null);
  };

  const handleAddRelay = () => {
    if (newRelay.trim() && !relays.includes(newRelay.trim())) {
      setRelays([...relays, newRelay.trim()]);
      setNewRelay("");
    }
  };

  const handleRemoveRelay = (relay: string) => {
    setRelays(relays.filter((r) => r !== relay));
  };

  const handleSetPrimaryMint = (mint: string) => {
    setPrimaryMint(mint);
  };

  const handleSaveSettings = () => {
    if (mints.length === 0) {
      setSettingsError("You must have at least one mint configured");
      return;
    }

    if (!primaryMint || !mints.includes(primaryMint)) {
      setSettingsError("Primary mint must be one of the configured mints");
      return;
    }

    try {
      updateCashuConnection(mints, relays, primaryMint);
      setSettingsSuccess(true);
      setSettingsError(null);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSettingsError(
        error instanceof Error ? error.message : "Failed to save settings"
      );
    }
  };

  if (!cashuWallet) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No Cashu wallet connected</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-background p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="w-4 h-4" />
              <span>Total Balance</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadBalance}
              disabled={isLoadingBalance}
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoadingBalance ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-5xl font-bold tracking-tight">
              {formatAmount(balance)}
            </h2>
            <span className="text-2xl text-muted-foreground">sats</span>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Balance by mint:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {cashuConnection?.mints?.map((mint, idx) => {
                const mintBalance = mintBalances[mint] || 0;
                return (
                  <div
                    key={idx}
                    className="text-xs px-3 py-2 bg-background/50 backdrop-blur-sm rounded-md border border-border/50 flex justify-between items-center"
                  >
                    <span className="truncate flex-1">
                      {new URL(mint).hostname}
                    </span>
                    <span className="font-semibold ml-2">
                      {formatAmount(mintBalance)} sats
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Action Tabs */}
      <Tabs defaultValue="deposit" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="deposit">
            <ArrowDownToLine className="w-4 h-4 mr-2" />
            Deposit
          </TabsTrigger>
          <TabsTrigger value="withdraw">
            <ArrowUpFromLine className="w-4 h-4 mr-2" />
            Withdraw
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            History
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Deposit Tab */}
        <TabsContent value="deposit" className="space-y-4">
          {/* Lightning Invoice Deposit */}
          <div className="rounded-lg border border-border p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5" />
                Deposit via Lightning
              </h3>
              <p className="text-sm text-muted-foreground">
                Generate a Lightning invoice to deposit sats into your Cashu
                wallet
              </p>
            </div>

            {!depositInvoice ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="deposit-amount">Amount (sats)</Label>
                  <Input
                    id="deposit-amount"
                    type="number"
                    placeholder="1000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex gap-2">
                  {[1000, 5000, 10000, 50000].map((amt) => (
                    <Button
                      key={amt}
                      variant="outline"
                      size="sm"
                      onClick={() => setDepositAmount(amt.toString())}
                    >
                      {formatAmount(amt)}
                    </Button>
                  ))}
                </div>

                {depositError && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                    {depositError}
                  </div>
                )}

                <Button
                  onClick={handleGenerateInvoice}
                  disabled={isGeneratingInvoice || !depositAmount}
                  className="w-full"
                >
                  {isGeneratingInvoice ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Generating Invoice...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-2" />
                      Generate Invoice
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                {!depositSuccess ? (
                  <>
                    <div className="flex justify-center p-6 bg-white rounded-lg">
                      <QRCodeSVG value={depositInvoice} size={256} level="M" />
                    </div>

                    <div className="space-y-2">
                      <Label>Lightning Invoice</Label>
                      <div className="flex gap-2">
                        <Input
                          value={depositInvoice}
                          readOnly
                          className="font-mono text-xs"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(depositInvoice)}
                        >
                          {copied ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 text-sm bg-blue-500/10 rounded-md border border-blue-500/20">
                      <p className="text-blue-600 dark:text-blue-400">
                        Scan this QR code or copy the invoice to pay with any
                        Lightning wallet. Waiting for payment...
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => {
                        setDepositInvoice(null);
                        setDepositAmount("");
                        setDepositBalanceSnapshot(0);
                      }}
                      className="w-full"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col items-center justify-center p-12 space-y-4">
                      <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
                        <Check className="w-12 h-12 text-green-600" />
                      </div>
                      <h3 className="text-2xl font-bold text-green-600">
                        Payment Received!
                      </h3>
                      <p className="text-muted-foreground text-center">
                        Your deposit of {depositAmount} sats has been added to
                        your wallet
                      </p>
                    </div>

                    <div className="p-4 text-sm text-green-600 bg-green-600/10 rounded-md border border-green-600/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Check className="w-4 h-4" />
                        <span className="font-semibold">
                          Transaction Successful
                        </span>
                      </div>
                      <p className="text-xs">
                        New balance: {formatAmount(balance)} sats
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Cashu Token Redemption */}
          <div className="rounded-lg border border-border p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Coins className="w-5 h-5" />
                Redeem Cashu Token
              </h3>
              <p className="text-sm text-muted-foreground">
                Paste or scan a Cashu token to add sats to your wallet
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cashu-token">Cashu Token</Label>
              <Textarea
                id="cashu-token"
                placeholder="cashuA..."
                value={cashuTokenInput}
                onChange={(e) => setCashuTokenInput(e.target.value)}
                className="font-mono text-xs min-h-[100px]"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDepositQR(true)}
                className="flex-1"
              >
                <Scan className="w-4 h-4 mr-2" />
                Scan QR Code
              </Button>
              <Button
                onClick={handleRedeemToken}
                disabled={isRedeemingToken || !cashuTokenInput.trim()}
                className="flex-1"
              >
                {isRedeemingToken ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Redeeming...
                  </>
                ) : (
                  <>
                    <Coins className="w-4 h-4 mr-2" />
                    Redeem Token
                  </>
                )}
              </Button>
            </div>

            {redeemTokenSuccess && (
              <div className="p-3 text-sm text-green-600 bg-green-600/10 rounded-md border border-green-600/20">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span className="font-semibold">
                    Token Redeemed Successfully!
                  </span>
                </div>
                <p className="text-xs mt-1">
                  Sats have been added to your wallet. New balance:{" "}
                  {formatAmount(balance)} sats
                </p>
              </div>
            )}

            {/* QR Scanner Modal */}
            {showDepositQR && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-background rounded-lg p-6 max-w-md w-full space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Scan Cashu Token</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDepositQR(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <Scanner
                    onScan={(result) => {
                      if (result && result.length > 0 && result[0]?.rawValue) {
                        handleDepositQRScan(result[0].rawValue);
                      }
                    }}
                    styles={{
                      container: { width: "100%" },
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Withdraw Tab */}
        <TabsContent value="withdraw" className="space-y-4">
          <div className="rounded-lg border border-border p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ArrowUpFromLine className="w-5 h-5" />
                Withdraw Sats
              </h3>
              <p className="text-sm text-muted-foreground">
                Send sats from your Cashu wallet to a Lightning address or
                invoice
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">Amount (sats)</Label>
              <Input
                id="withdraw-amount"
                type="number"
                placeholder="1000"
                value={withdrawAmount}
                onChange={(e) => {
                  console.log("Withdraw amount changed:", e.target.value);
                  setWithdrawAmount(e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Available: {formatAmount(balance)} sats
              </p>
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-2">
              {[1000, 5000, 10000].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setWithdrawAmount(amt.toString())}
                  disabled={amt > balance}
                >
                  {formatAmount(amt)}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount(balance.toString())}
              >
                Max
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-address">
                Lightning Address or Invoice
              </Label>
              <div className="flex gap-2">
                <Input
                  id="withdraw-address"
                  type="text"
                  placeholder="user@getalby.com or lnbc..."
                  value={withdrawAddress}
                  onChange={(e) => {
                    console.log("Withdraw address changed:", e.target.value);
                    setWithdrawAddress(e.target.value);
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowWithdrawQR(true)}
                >
                  <Scan className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {withdrawError && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {withdrawError}
              </div>
            )}

            {withdrawSuccess && (
              <div className="p-3 text-sm text-green-600 bg-green-600/10 rounded-md border border-green-600/20">
                Withdrawal successful! Your sats are on the way.
              </div>
            )}

            {/* Debug info */}
            {(!withdrawAmount || !withdrawAddress) && (
              <div className="p-2 text-xs text-muted-foreground bg-muted/50 rounded-md">
                {!withdrawAmount && <div>⚠️ Please enter an amount</div>}
                {!withdrawAddress && (
                  <div>⚠️ Please enter a Lightning address or invoice</div>
                )}
              </div>
            )}

            <Button
              onClick={handleWithdraw}
              disabled={isWithdrawing || !withdrawAmount || !withdrawAddress}
              className="w-full"
            >
              {isWithdrawing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="w-4 h-4 mr-2" />
                  Withdraw{" "}
                  {withdrawAmount
                    ? formatAmount(parseInt(withdrawAmount))
                    : ""}{" "}
                  sats
                </>
              )}
            </Button>

            {/* QR Scanner Modal for Lightning Invoice */}
            {showWithdrawQR && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-background rounded-lg p-6 max-w-md w-full space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Scan Lightning Invoice</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowWithdrawQR(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <Scanner
                    onScan={(result) => {
                      if (result && result.length > 0 && result[0]?.rawValue) {
                        handleWithdrawQRScan(result[0].rawValue);
                      }
                    }}
                    styles={{
                      container: { width: "100%" },
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mint Cashu Token */}
          <div className="rounded-lg border border-border p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Coins className="w-5 h-5" />
                Mint Cashu Token
              </h3>
              <p className="text-sm text-muted-foreground">
                Create a Cashu token from your wallet balance to share or use
                offline
              </p>
            </div>

            {!mintedToken ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mint-amount">Amount (sats)</Label>
                  <Input
                    id="mint-amount"
                    type="number"
                    placeholder="1000"
                    value={mintTokenAmount}
                    onChange={(e) => setMintTokenAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available: {formatAmount(balance)} sats
                  </p>
                </div>

                <div className="flex gap-2">
                  {[1000, 5000, 10000].map((amt) => (
                    <Button
                      key={amt}
                      variant="outline"
                      size="sm"
                      onClick={() => setMintTokenAmount(amt.toString())}
                      disabled={amt > balance}
                    >
                      {formatAmount(amt)}
                    </Button>
                  ))}
                </div>

                <Button
                  onClick={handleMintToken}
                  disabled={isMintingToken || !mintTokenAmount}
                  className="w-full"
                >
                  {isMintingToken ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Minting...
                    </>
                  ) : (
                    <>
                      <Coins className="w-4 h-4 mr-2" />
                      Mint Token
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center p-6 bg-white rounded-lg">
                  <QRCodeSVG value={mintedToken} size={256} level="M" />
                </div>

                <div className="space-y-2">
                  <Label>Cashu Token</Label>
                  <Textarea
                    value={mintedToken}
                    readOnly
                    className="font-mono text-xs min-h-[100px]"
                  />
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(mintedToken)}
                    className="w-full"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Token
                      </>
                    )}
                  </Button>
                </div>

                <div className="p-3 text-sm bg-blue-500/10 rounded-md border border-blue-500/20">
                  <p className="text-blue-600 dark:text-blue-400">
                    Share this token to send sats. The recipient can redeem it
                    in any Cashu wallet.
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    setMintedToken(null);
                    setMintTokenAmount("");
                  }}
                  className="w-full"
                >
                  Mint New Token
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="rounded-lg border border-border p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <History className="w-5 h-5" />
                Transaction History
              </h3>
              <p className="text-sm text-muted-foreground">
                View all your Cashu wallet transactions
              </p>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No transactions yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your transaction history will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className={`p-2 rounded-full ${
                        tx.type === "deposit" || tx.type === "receive"
                          ? "bg-green-500/10 text-green-600"
                          : "bg-orange-500/10 text-orange-600"
                      }`}
                    >
                      {tx.type === "deposit" || tx.type === "receive" ? (
                        <TrendingDown className="w-5 h-5" />
                      ) : (
                        <TrendingUp className="w-5 h-5" />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium capitalize">{tx.type}</h4>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            tx.status === "completed"
                              ? "bg-green-500/10 text-green-600"
                              : tx.status === "pending"
                              ? "bg-yellow-500/10 text-yellow-600"
                              : "bg-red-500/10 text-red-600"
                          }`}
                        >
                          {tx.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDistanceToNow(tx.timestamp, { addSuffix: true })}
                      </p>
                      {tx.memo && (
                        <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                          {tx.memo}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-lg font-semibold ${
                          tx.amount > 0 ? "text-green-600" : "text-orange-600"
                        }`}
                      >
                        {tx.amount > 0 ? "+" : ""}
                        {formatAmount(Math.abs(tx.amount))}
                      </p>
                      <p className="text-xs text-muted-foreground">sats</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <div className="rounded-lg border border-border p-6 space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Wallet Settings
              </h3>
              <p className="text-sm text-muted-foreground">
                Manage your Cashu mints and backup relays
              </p>
            </div>

            {/* Mints Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Cashu Mints</Label>
                <p className="text-sm text-muted-foreground">
                  Mints are trusted servers that issue Cashu tokens. You need at
                  least one mint configured.
                </p>
              </div>

              <div className="space-y-2">
                {mints.map((mint) => (
                  <div
                    key={mint}
                    className={`flex items-center gap-2 p-3 rounded-md border ${
                      mint === primaryMint
                        ? "bg-orange-500/5 border-orange-500/20"
                        : "bg-muted border-border"
                    }`}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetPrimaryMint(mint)}
                      className={`p-1 ${
                        mint === primaryMint
                          ? "text-orange-500"
                          : "text-muted-foreground"
                      }`}
                      title={
                        mint === primaryMint
                          ? "Primary mint (used for deposits)"
                          : "Set as primary mint"
                      }
                    >
                      <Star
                        className={`w-4 h-4 ${
                          mint === primaryMint ? "fill-current" : ""
                        }`}
                      />
                    </Button>
                    <span className="text-sm flex-1 break-all">{mint}</span>
                    {mint === primaryMint && (
                      <span className="text-xs px-2 py-1 bg-orange-500/20 text-orange-600 rounded-full">
                        Primary
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMint(mint)}
                      disabled={mints.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://mint.example.com"
                  value={newMint}
                  onChange={(e) => setNewMint(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMint()}
                />
                <Button onClick={handleAddMint} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            {/* Relays Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Backup Relays</Label>
                <p className="text-sm text-muted-foreground">
                  Relays store your encrypted Cashu tokens. Using multiple
                  relays ensures your tokens are backed up.
                </p>
              </div>

              <div className="space-y-2">
                {relays.map((relay) => (
                  <div
                    key={relay}
                    className="flex items-center gap-2 p-3 bg-muted rounded-md border border-border"
                  >
                    <span className="text-sm flex-1 break-all">{relay}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveRelay(relay)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="wss://relay.example.com"
                  value={newRelay}
                  onChange={(e) => setNewRelay(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddRelay()}
                />
                <Button onClick={handleAddRelay} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            {settingsError && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {settingsError}
              </div>
            )}

            {settingsSuccess && (
              <div className="p-3 text-sm text-green-600 bg-green-600/10 rounded-md border border-green-600/20">
                Settings saved successfully!
              </div>
            )}

            <Button onClick={handleSaveSettings} className="w-full">
              <Settings className="w-4 h-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
