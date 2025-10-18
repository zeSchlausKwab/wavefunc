import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ZapIcon } from "./ui/icons/lucide-zap";
import type { NDKStation } from "../lib/NDKStation";

interface ZapDialogProps {
  station: NDKStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onZap?: (amount: number) => Promise<void>;
}

export const ZapDialog: React.FC<ZapDialogProps> = ({
  station,
  open,
  onOpenChange,
  onZap,
}) => {
  const [amount, setAmount] = useState("21");
  const [isZapping, setIsZapping] = useState(false);

  const presetAmounts = [21, 100, 500, 1000, 5000];

  const handleZap = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) return;

    setIsZapping(true);
    try {
      if (onZap) {
        await onZap(amountNum);
      }
      // Mock implementation - in real app, this would create a zap
      console.log(`Zapping ${amountNum} sats to station:`, station.name);

      // Close dialog after successful zap
      onOpenChange(false);
      setAmount("21");
    } catch (error) {
      console.error("Error zapping:", error);
    } finally {
      setIsZapping(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ZapIcon className="w-5 h-5 text-yellow-500" />
            Zap {station.name}
          </DialogTitle>
          <DialogDescription>
            Support this radio station with a lightning payment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (sats)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount in sats"
              min="1"
            />
          </div>

          {/* Preset Amounts */}
          <div className="space-y-2">
            <Label>Quick amounts</Label>
            <div className="flex flex-wrap gap-2">
              {presetAmounts.map((preset) => (
                <Button
                  key={preset}
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(preset.toString())}
                  className={
                    amount === preset.toString()
                      ? "border-yellow-500 bg-yellow-50"
                      : ""
                  }
                >
                  {preset.toLocaleString()} sats
                </Button>
              ))}
            </div>
          </div>

          {/* Mock Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <p className="font-semibold">Mock Implementation</p>
            <p className="text-xs mt-1">
              This is a placeholder. Lightning payment integration is not yet implemented.
            </p>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleZap}
            disabled={!amount || parseInt(amount) <= 0 || isZapping}
            className="bg-yellow-500 hover:bg-yellow-600 text-white"
          >
            <ZapIcon className="w-4 h-4 mr-2" />
            {isZapping ? "Zapping..." : `Zap ${amount} sats`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};