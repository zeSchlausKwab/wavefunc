use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;

use cdk::amount::SplitTarget;
use cdk::nuts::{
    CurrencyUnit, KeySetInfo, PaymentMethod, PublicKey as CdkPublicKey, SpendingConditions, Token,
};
use cdk::wallet::{ReceiveOptions, SendMemo, SendOptions, Wallet};
use cdk::Amount;
use cdk_redb::WalletRedbDatabase;
use nostr::prelude::*;
use sha2::{Digest, Sha256};

use crate::config::{DEFAULT_CASHU_MINTS, NUTZAP_INFO_KIND, NUTZAP_KIND, STATION_KIND};
use crate::error::{Result, WavefuncError};
use crate::models::{
    CashuMintBalance, CashuMintQuoteInfo, CashuReceiveResult, CashuSendResult, CashuWalletStatus,
    RecipientNutzapInfo, ZapPaymentResult,
};

/// Normalize a Cashu mint URL by stripping trailing slashes.
pub fn normalize_mint_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

/// Derive a deterministic 64-byte CDK wallet seed from a seed phrase or key material.
pub fn derive_wallet_seed(seed_material: &str) -> [u8; 64] {
    let mut hasher1 = Sha256::new();
    hasher1.update(b"wavefunc-cashu-seed-v1:");
    hasher1.update(seed_material.as_bytes());
    let first = hasher1.finalize();

    let mut hasher2 = Sha256::new();
    hasher2.update(b"wavefunc-cashu-seed-v1-ext:");
    hasher2.update(first);
    let second = hasher2.finalize();

    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&first);
    out[32..].copy_from_slice(&second);
    out
}

/// Multi-mint Cashu wallet powered by `cdk 0.18` + pure-Rust `cdk-redb`.
pub struct CashuWalletManager {
    localstore: Arc<WalletRedbDatabase>,
    seed: [u8; 64],
    wallets: HashMap<String, Arc<Wallet>>,
}

impl CashuWalletManager {
    pub async fn open(
        db_dir: &str,
        seed_material: &str,
        mints: &[String],
    ) -> Result<Self> {
        let dir = PathBuf::from(db_dir);
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Could not create wallet dir: {e}")))?;
        let db_path = dir.join("wavefunc_cashu.redb");

        let localstore = Arc::new(
            WalletRedbDatabase::new(&db_path)
                .map_err(|e| WavefuncError::Wallet(format!("Could not open Cashu DB: {e}")))?,
        );
        let seed = derive_wallet_seed(seed_material);

        let mut mgr = Self {
            localstore,
            seed,
            wallets: HashMap::new(),
        };

        let target_mints: Vec<String> = if mints.is_empty() {
            DEFAULT_CASHU_MINTS.iter().map(|s| (*s).to_string()).collect()
        } else {
            mints.to_vec()
        };

        for mint in target_mints {
            let _ = mgr.ensure_mint(&mint).await;
        }

        Ok(mgr)
    }

    pub async fn ensure_mint(&mut self, mint_url: &str) -> Result<Arc<Wallet>> {
        let normalized = normalize_mint_url(mint_url);
        if normalized.is_empty() || !normalized.starts_with("http") {
            return Err(WavefuncError::Wallet(format!(
                "Invalid Cashu mint URL: {mint_url}"
            )));
        }

        if let Some(existing) = self.wallets.get(&normalized) {
            return Ok(existing.clone());
        }

        let wallet = Wallet::new(
            &normalized,
            CurrencyUnit::Sat,
            self.localstore.clone(),
            self.seed,
            None,
        )
        .map_err(|e| WavefuncError::Wallet(format!("Could not initialize mint {normalized}: {e}")))?;

        let arc = Arc::new(wallet);
        let _ = arc.recover_incomplete_sagas().await;
        self.wallets.insert(normalized, arc.clone());
        Ok(arc)
    }

    pub async fn status(&self) -> CashuWalletStatus {
        let mut mints = Vec::with_capacity(self.wallets.len());
        let mut total: u64 = 0;

        for (url, wallet) in &self.wallets {
            let bal = wallet
                .total_balance()
                .await
                .map(u64::from)
                .unwrap_or(0);
            total = total.saturating_add(bal);
            mints.push(CashuMintBalance {
                mint_url: url.clone(),
                balance_sats: bal,
            });
        }
        mints.sort_by(|a, b| b.balance_sats.cmp(&a.balance_sats).then_with(|| a.mint_url.cmp(&b.mint_url)));

        CashuWalletStatus {
            initialized: true,
            total_balance_sats: total,
            mints,
        }
    }

    pub async fn create_mint_quote(
        &mut self,
        mint_url: &str,
        amount_sats: u64,
    ) -> Result<CashuMintQuoteInfo> {
        if amount_sats == 0 {
            return Err(WavefuncError::InvalidInput(
                "Deposit amount must be greater than zero".to_string(),
            ));
        }
        let normalized = normalize_mint_url(mint_url);
        let wallet = self.ensure_mint(&normalized).await?;
        let quote = wallet
            .mint_quote(
                PaymentMethod::BOLT11,
                Some(Amount::from(amount_sats)),
                Some("WaveFunc Radio deposit".to_string()),
                None,
            )
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Mint quote failed: {e}")))?;

        Ok(CashuMintQuoteInfo {
            mint_url: normalized,
            quote_id: quote.id,
            bolt11: quote.request,
            amount_sats,
        })
    }

    pub async fn claim_mint_quote(
        &mut self,
        mint_url: &str,
        quote_id: &str,
    ) -> Result<CashuWalletStatus> {
        let normalized = normalize_mint_url(mint_url);
        let wallet = self.ensure_mint(&normalized).await?;
        wallet
            .mint(quote_id, SplitTarget::default(), None)
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Mint claim failed: {e}")))?;
        Ok(self.status().await)
    }

    pub async fn receive_token(&mut self, encoded_token: &str) -> Result<CashuReceiveResult> {
        let trimmed = encoded_token.trim();
        let parsed = Token::from_str(trimmed)
            .map_err(|e| WavefuncError::Wallet(format!("Invalid Cashu token: {e}")))?;
        let mint_url = parsed
            .mint_url()
            .map_err(|e| WavefuncError::Wallet(format!("Token missing mint URL: {e}")))?
            .to_string();
        let normalized = normalize_mint_url(&mint_url);
        let wallet = self.ensure_mint(&normalized).await?;
        let received = wallet
            .receive(trimmed, ReceiveOptions::default())
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Token redemption failed: {e}")))?;

        let status = self.status().await;
        Ok(CashuReceiveResult {
            received_sats: u64::from(received),
            mint_url: normalized,
            status,
        })
    }

    pub async fn send_token(
        &mut self,
        mint_url: Option<&str>,
        amount_sats: u64,
        memo: Option<&str>,
    ) -> Result<CashuSendResult> {
        if amount_sats == 0 {
            return Err(WavefuncError::InvalidInput(
                "Send amount must be greater than zero".to_string(),
            ));
        }

        let target_mint = self.pick_mint_with_balance(mint_url, amount_sats, None).await?;
        let wallet = self.ensure_mint(&target_mint).await?;
        let prepared = wallet
            .prepare_send(Amount::from(amount_sats), SendOptions::default())
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Prepare send failed: {e}")))?;

        let send_memo = memo
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(SendMemo::for_token);
        let token = prepared
            .confirm(send_memo)
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Confirm send failed: {e}")))?;

        let status = self.status().await;
        Ok(CashuSendResult {
            token: token.to_string(),
            amount_sats,
            mint_url: target_mint,
            status,
        })
    }

    /// Melt Cashu ecash to pay a BOLT11 Lightning invoice (used for Cashu-funded NIP-57 zaps!).
    pub async fn pay_invoice(
        &mut self,
        mint_url: Option<&str>,
        bolt11: &str,
        amount_sats: u64,
    ) -> Result<ZapPaymentResult> {
        let cleaned = bolt11.trim();
        let target_mint = self.pick_mint_with_balance(mint_url, amount_sats, None).await?;
        let wallet = self.ensure_mint(&target_mint).await?;

        let quote = wallet
            .melt_quote(PaymentMethod::BOLT11, cleaned, None, None)
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Cashu melt quote failed: {e}")))?;

        let prepared = wallet
            .prepare_melt(&quote.id, HashMap::new())
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Cashu prepare melt failed: {e}")))?;

        let finalized = prepared
            .confirm()
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Cashu melt payment failed: {e}")))?;

        let preimage = finalized
            .payment_proof()
            .map(str::to_string)
            .unwrap_or_else(|| quote.id.clone());

        Ok(ZapPaymentResult {
            preimage,
            amount_sats,
            bolt11: cleaned.to_string(),
        })
    }

    /// Create P2PK-locked Cashu proofs for a NIP-61 Nutzap (`kind 9321`), returning
    /// `(mint_url, Vec<proof_json_strings>)`.
    pub async fn create_p2pk_nutzap_proofs(
        &mut self,
        recipient_p2pk_hex: &str,
        accepted_mints: &[String],
        amount_sats: u64,
    ) -> Result<(String, Vec<String>)> {
        if amount_sats == 0 {
            return Err(WavefuncError::InvalidInput(
                "Nutzap amount must be greater than zero".to_string(),
            ));
        }

        let clean_key = recipient_p2pk_hex.trim().to_ascii_lowercase();
        let compressed_hex = if clean_key.len() == 64 {
            format!("02{clean_key}")
        } else {
            clean_key
        };
        let cdk_pk = CdkPublicKey::from_hex(&compressed_hex)
            .map_err(|e| WavefuncError::Wallet(format!("Invalid recipient P2PK key: {e}")))?;

        let target_mint = self
            .pick_mint_with_balance(None, amount_sats, Some(accepted_mints))
            .await?;
        let wallet = self.ensure_mint(&target_mint).await?;

        let opts = SendOptions {
            conditions: Some(SpendingConditions::new_p2pk(cdk_pk, None)),
            ..Default::default()
        };
        let prepared = wallet
            .prepare_send(Amount::from(amount_sats), opts)
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Prepare P2PK nutzap failed: {e}")))?;

        let token = prepared
            .confirm(None)
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Confirm P2PK nutzap failed: {e}")))?;

        let keyset_infos: Vec<KeySetInfo> = wallet
            .keysets(Default::default())
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Load mint keysets failed: {e}")))?
            .into_iter()
            .map(|ks| KeySetInfo {
                id: ks.id,
                unit: ks.unit,
                active: ks.active.unwrap_or(true),
                input_fee_ppk: ks.input_fee_ppk,
                final_expiry: ks.final_expiry,
            })
            .collect();

        let proofs = token
            .proofs(&keyset_infos)
            .map_err(|e| WavefuncError::Wallet(format!("Extract nutzap proofs failed: {e}")))?;

        let proof_jsons: Vec<String> = proofs
            .iter()
            .filter_map(|p| serde_json::to_string(p).ok())
            .collect();
        if proof_jsons.is_empty() {
            return Err(WavefuncError::Wallet(
                "No proofs produced for P2PK nutzap".to_string(),
            ));
        }
        Ok((target_mint, proof_jsons))
    }

    async fn pick_mint_with_balance(
        &self,
        preferred: Option<&str>,
        min_sats: u64,
        allowed: Option<&[String]>,
    ) -> Result<String> {
        let allowed_set: Option<Vec<String>> = allowed
            .map(|list| list.iter().map(|m| normalize_mint_url(m)).collect());

        let is_allowed = |url: &str| -> bool {
            match &allowed_set {
                None => true,
                Some(list) => list.iter().any(|a| a.eq_ignore_ascii_case(url)),
            }
        };

        if let Some(pref) = preferred.map(normalize_mint_url).filter(|s| !s.is_empty()) {
            if is_allowed(&pref) {
                if let Some(w) = self.wallets.get(&pref) {
                    let bal = w.total_balance().await.map(u64::from).unwrap_or(0);
                    if bal >= min_sats {
                        return Ok(pref);
                    }
                }
            }
        }

        let mut best: Option<(String, u64)> = None;
        for (url, wallet) in &self.wallets {
            if !is_allowed(url) {
                continue;
            }
            let bal = wallet.total_balance().await.map(u64::from).unwrap_or(0);
            if bal >= min_sats {
                match &best {
                    Some((_, best_bal)) if *best_bal >= bal => {}
                    _ => best = Some((url.clone(), bal)),
                }
            }
        }

        best.map(|(url, _)| url).ok_or_else(|| {
            if allowed_set.is_some() {
                WavefuncError::Wallet(format!(
                    "No compatible Cashu mint has at least {min_sats} sats"
                ))
            } else {
                WavefuncError::Wallet(format!(
                    "Insufficient Cashu balance (need {min_sats} sats)"
                ))
            }
        })
    }
}

/// Parse a recipient's NIP-61 `kind 10019` nutzap info event.
pub fn parse_nutzap_info_event(event: &Event) -> Option<RecipientNutzapInfo> {
    if event.kind != Kind::Custom(NUTZAP_INFO_KIND) {
        return None;
    }

    let mut p2pk_pubkey: Option<String> = None;
    let mut mints: Vec<String> = Vec::new();
    let mut relays: Vec<String> = Vec::new();

    for tag in event.tags.iter() {
        let s = tag.as_slice();
        match s.first().map(|x| x.as_str()) {
            Some("pubkey") => {
                if let Some(pk) = s.get(1).map(|v| v.trim()).filter(|v| !v.is_empty()) {
                    p2pk_pubkey = Some(pk.to_string());
                }
            }
            Some("mint") => {
                if let Some(url) = s.get(1).map(|v| normalize_mint_url(v)).filter(|v| !v.is_empty()) {
                    if !mints.contains(&url) {
                        mints.push(url);
                    }
                }
            }
            Some("relay") => {
                if let Some(url) = s.get(1).map(|v| v.trim().to_string()).filter(|v| !v.is_empty()) {
                    if !relays.contains(&url) {
                        relays.push(url);
                    }
                }
            }
            _ => {}
        }
    }

    Some(RecipientNutzapInfo {
        pubkey: event.pubkey.to_hex(),
        p2pk_pubkey,
        mints,
        relays,
    })
}

/// Build a NIP-61 `kind 9321` Nutzap event targeting a WaveFunc station.
pub fn build_station_nutzap_builder(
    station_event_id: &str,
    station_pubkey: &str,
    station_address: &str,
    mint_url: &str,
    proof_jsons: &[String],
    comment: Option<&str>,
) -> Result<EventBuilder> {
    if !station_address.starts_with(&format!("{STATION_KIND}:")) {
        return Err(WavefuncError::InvalidStationAddress(
            station_address.to_string(),
        ));
    }

    let mut tags = Vec::with_capacity(proof_jsons.len() + 5);
    for proof in proof_jsons {
        tags.push(Tag::parse(["proof", proof])?);
    }
    tags.push(Tag::parse(["u", mint_url])?);
    tags.push(Tag::parse(["unit", "sat"])?);
    tags.push(Tag::parse(["p", station_pubkey])?);
    tags.push(Tag::parse(["a", station_address])?);
    if !station_event_id.trim().is_empty() {
        tags.push(Tag::parse(["e", station_event_id])?);
    }

    let content = comment.map(str::trim).unwrap_or("");
    Ok(EventBuilder::new(Kind::Custom(NUTZAP_KIND), content).tags(tags))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_deterministic_64_byte_seed() {
        let a = derive_wallet_seed("test-seed-material");
        let b = derive_wallet_seed("test-seed-material");
        let c = derive_wallet_seed("different-seed");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_ne!(&a[..32], &a[32..]);
    }

    #[test]
    fn parses_nutzap_info_event_and_builds_nutzap() {
        let keys = Keys::generate();
        let ev = EventBuilder::new(Kind::Custom(NUTZAP_INFO_KIND), "")
            .tags([
                Tag::parse(["pubkey", "02deadbeef"]).unwrap(),
                Tag::parse(["mint", "https://mint.minibits.cash/Bitcoin/"]).unwrap(),
                Tag::parse(["mint", "https://mint.coinos.io"]).unwrap(),
                Tag::parse(["relay", "wss://relay.damus.io"]).unwrap(),
            ])
            .finalize(&keys)
            .unwrap();

        let parsed = parse_nutzap_info_event(&ev).expect("should parse kind 10019");
        assert_eq!(parsed.pubkey, keys.public_key().to_hex());
        assert_eq!(parsed.p2pk_pubkey.as_deref(), Some("02deadbeef"));
        assert_eq!(
            parsed.mints,
            vec![
                "https://mint.minibits.cash/Bitcoin".to_string(),
                "https://mint.coinos.io".to_string()
            ]
        );
        assert_eq!(parsed.relays, vec!["wss://relay.damus.io".to_string()]);

        let addr = format!("{STATION_KIND}:{}:station-1", keys.public_key().to_hex());
        let nutzap = build_station_nutzap_builder(
            "abcd1234",
            &keys.public_key().to_hex(),
            &addr,
            "https://mint.minibits.cash/Bitcoin",
            &[r#"{"amount":21,"secret":"s"}"#.to_string()],
            Some("Great station!"),
        )
        .unwrap()
        .finalize(&keys)
        .unwrap();

        assert_eq!(nutzap.kind, Kind::Custom(NUTZAP_KIND));
        assert_eq!(nutzap.content, "Great station!");
        assert!(nutzap.tags.iter().any(|t| t.as_slice() == ["unit", "sat"]));
        assert!(nutzap
            .tags
            .iter()
            .any(|t| t.as_slice() == ["u", "https://mint.minibits.cash/Bitcoin"]));
    }
}
