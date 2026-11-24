use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;

use cdk::amount::SplitTarget;
use cdk::cdk_database::WalletDatabase;
use cdk::mint_url::MintUrl;
use cdk::nuts::{
    CurrencyUnit, KeySetInfo, PaymentMethod, Proof, PublicKey as CdkPublicKey, SpendingConditions,
    State, Token,
};
use cdk::types::ProofInfo;
use cdk::wallet::{ReceiveOptions, SendMemo, SendOptions, Wallet};
use cdk::Amount;
use cdk_redb::WalletRedbDatabase;
use nostr::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::config::{DEFAULT_CASHU_MINTS, NUTZAP_INFO_KIND, NUTZAP_KIND, STATION_KIND};
use crate::error::{Result, WavefuncError};
use crate::models::{
    CashuMintBalance, CashuMintQuoteInfo, CashuReceiveResult, CashuSendResult, CashuWalletStatus,
    Nip60DecryptedTokenEvent, RecipientNutzapInfo, ZapPaymentResult,
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

/// Parsed contents of a NIP-60 `kind 17375` wallet metadata event.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ParsedNip60WalletConfig {
    pub privkey: Option<String>,
    pub mints: Vec<String>,
    pub relays: Vec<String>,
}

/// Parsed JSON body of a NIP-60 `kind 7375` token proof event.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Nip60TokenPayload {
    pub mint: String,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub proofs: Vec<Proof>,
    #[serde(default)]
    pub del: Vec<String>,
}

/// Parse decrypted JSON tag array from a NIP-60 `kind 17375` event.
pub fn parse_nip60_wallet_content(plaintext: &str) -> ParsedNip60WalletConfig {
    let mut cfg = ParsedNip60WalletConfig::default();
    let Ok(tags) = serde_json::from_str::<Vec<Vec<String>>>(plaintext.trim()) else {
        return cfg;
    };
    for tag in tags {
        match tag.first().map(|s| s.as_str()) {
            Some("privkey") => {
                if let Some(pk) = tag.get(1).map(|v| v.trim()).filter(|v| !v.is_empty()) {
                    cfg.privkey = Some(pk.to_string());
                }
            }
            Some("mint") => {
                if let Some(url) = tag
                    .get(1)
                    .map(|v| normalize_mint_url(v))
                    .filter(|v| v.starts_with("http"))
                {
                    if !cfg.mints.contains(&url) {
                        cfg.mints.push(url);
                    }
                }
            }
            Some("relay") => {
                if let Some(url) = tag
                    .get(1)
                    .map(|v| v.trim().to_string())
                    .filter(|v| v.starts_with("ws://") || v.starts_with("wss://"))
                {
                    if !cfg.relays.contains(&url) {
                        cfg.relays.push(url);
                    }
                }
            }
            _ => {}
        }
    }
    cfg
}

/// Parse decrypted JSON content from a NIP-60 `kind 7375` token proof event.
pub fn parse_nip60_token_content(plaintext: &str) -> Option<Nip60TokenPayload> {
    let mut payload: Nip60TokenPayload = serde_json::from_str(plaintext.trim()).ok()?;
    payload.mint = normalize_mint_url(&payload.mint);
    if !payload.mint.starts_with("http") {
        return None;
    }
    // Only sat-denominated proofs are managed by the sat wallet.
    if let Some(unit) = payload.unit.as_deref() {
        if !unit.eq_ignore_ascii_case("sat") && !unit.is_empty() {
            return None;
        }
    }
    Some(payload)
}

/// Multi-mint Cashu wallet powered by `cdk 0.18` + pure-Rust `cdk-redb`,
/// synchronized with NIP-60 (`kind 17375` + `kind 7375`) on Nostr relays.
pub struct CashuWalletManager {
    localstore: Arc<WalletRedbDatabase>,
    seed: [u8; 64],
    wallets: HashMap<String, Arc<Wallet>>,
    nip60_synced: bool,
    wallet_relays: Vec<String>,
    active_token_events: HashMap<String, Vec<String>>,
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
            nip60_synced: false,
            wallet_relays: Vec::new(),
            active_token_events: HashMap::new(),
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

        let token_event_count: u32 = self
            .active_token_events
            .values()
            .map(|v| v.len() as u32)
            .sum();

        CashuWalletStatus {
            initialized: true,
            total_balance_sats: total,
            mints,
            nip60_synced: self.nip60_synced,
            wallet_relays: self.wallet_relays.clone(),
            token_event_count,
        }
    }

    pub fn is_nip60_synced(&self) -> bool {
        self.nip60_synced
    }

    pub fn wallet_relays(&self) -> &[String] {
        &self.wallet_relays
    }

    /// Reconcile decrypted NIP-60 `kind 17375` + `kind 7375` events into the local `cdk-redb` store,
    /// filtering deleted/rolled-over events and verifying proof spend state via NUT-07.
    pub async fn apply_nip60_sync(
        &mut self,
        wallet_config: Option<&ParsedNip60WalletConfig>,
        decrypted_tokens: &[Nip60DecryptedTokenEvent],
        deleted_ids: &[String],
        extra_mints: &[String],
        wallet_relays: &[String],
    ) -> Result<CashuWalletStatus> {
        let mut all_deleted: HashSet<String> = deleted_ids.iter().cloned().collect();
        let mut parsed_tokens: Vec<(String, Nip60TokenPayload)> = Vec::new();

        for item in decrypted_tokens {
            if all_deleted.contains(&item.id) {
                continue;
            }
            if let Some(payload) = parse_nip60_token_content(&item.plaintext) {
                for del_id in &payload.del {
                    if !del_id.trim().is_empty() {
                        all_deleted.insert(del_id.trim().to_string());
                    }
                }
                parsed_tokens.push((item.id.clone(), payload));
            }
        }

        // Second pass: drop any token event whose ID appeared in another token's `"del"` rollover list.
        let mut mint_proofs: HashMap<String, Vec<Proof>> = HashMap::new();
        let mut active_events_by_mint: HashMap<String, Vec<String>> = HashMap::new();
        let mut seen_ys: HashSet<CdkPublicKey> = HashSet::new();

        for (event_id, payload) in parsed_tokens {
            if all_deleted.contains(&event_id) {
                continue;
            }
            active_events_by_mint
                .entry(payload.mint.clone())
                .or_default()
                .push(event_id);

            let bucket = mint_proofs.entry(payload.mint).or_default();
            for proof in payload.proofs {
                if let Ok(y) = proof.y() {
                    if seen_ys.insert(y) {
                        bucket.push(proof);
                    }
                }
            }
        }

        // Collect all mints from wallet config, nutzap info, and token events.
        let mut discovered_mints: Vec<String> = Vec::new();
        if let Some(cfg) = wallet_config {
            for m in &cfg.mints {
                if !discovered_mints.contains(m) {
                    discovered_mints.push(m.clone());
                }
            }
        }
        for m in extra_mints {
            let norm = normalize_mint_url(m);
            if norm.starts_with("http") && !discovered_mints.contains(&norm) {
                discovered_mints.push(norm);
            }
        }
        for m in mint_proofs.keys() {
            if !discovered_mints.contains(m) {
                discovered_mints.push(m.clone());
            }
        }

        for mint_url in &discovered_mints {
            let _ = self.ensure_mint(mint_url).await;
        }

        // Import & NUT-07-verify synced proofs per mint.
        for (mint_url, proofs) in mint_proofs {
            let Ok(wallet) = self.ensure_mint(&mint_url).await else {
                continue;
            };
            let Ok(parsed_mint_url) = MintUrl::from_str(&mint_url) else {
                continue;
            };

            // Verify spend state with mint (NUT-07). If mint is offline, keep non-deleted proofs.
            let mut unspent_proofs: Vec<Proof> = Vec::new();
            let mut spent_ys: Vec<CdkPublicKey> = Vec::new();
            if !proofs.is_empty() {
                match wallet.check_proofs_spent(proofs.clone()).await {
                    Ok(states) if states.len() == proofs.len() => {
                        for (proof, ps) in proofs.into_iter().zip(states.into_iter()) {
                            match ps.state {
                                State::Spent => spent_ys.push(ps.y),
                                _ => unspent_proofs.push(proof),
                            }
                        }
                    }
                    _ => {
                        unspent_proofs = proofs;
                    }
                }
            }

            let added: Vec<ProofInfo> = unspent_proofs
                .into_iter()
                .filter_map(|p| {
                    ProofInfo::new(p, parsed_mint_url.clone(), State::Unspent, CurrencyUnit::Sat)
                        .ok()
                })
                .collect();

            if !added.is_empty() || !spent_ys.is_empty() {
                let _ = self.localstore.update_proofs(added, spent_ys).await;
            }
        }

        // Also prune any previously cached local proofs that were spent on another device.
        for wallet in self.wallets.values() {
            if let Ok(existing) = wallet.get_proofs_by_states(vec![State::Unspent]).await {
                if !existing.is_empty() {
                    let _ = wallet.check_proofs_spent(existing).await;
                }
            }
        }

        self.nip60_synced = true;
        self.wallet_relays = wallet_relays.to_vec();
        self.active_token_events = active_events_by_mint;
        Ok(self.status().await)
    }

    /// Build a NIP-60 `kind 7375` JSON payload containing all currently unspent proofs for `mint_url`
    /// plus the list of superseded `kind 7375` event IDs to delete.
    pub async fn build_nip60_rollover_payload(
        &self,
        mint_url: &str,
    ) -> Result<(Option<String>, Vec<String>)> {
        let normalized = normalize_mint_url(mint_url);
        let old_ids = self
            .active_token_events
            .get(&normalized)
            .cloned()
            .unwrap_or_default();

        let Some(wallet) = self.wallets.get(&normalized) else {
            return Ok((None, old_ids));
        };
        let proofs = wallet
            .get_proofs_by_states(vec![State::Unspent])
            .await
            .map_err(|e| WavefuncError::Wallet(format!("Read unspent proofs failed: {e}")))?;

        if proofs.is_empty() {
            return Ok((None, old_ids));
        }

        let payload = Nip60TokenPayload {
            mint: normalized,
            unit: Some("sat".to_string()),
            proofs,
            del: old_ids.clone(),
        };
        let json = serde_json::to_string(&payload)?;
        Ok((Some(json), old_ids))
    }

    /// Record the newly published `kind 7375` event ID for `mint_url` after a NIP-60 rollover.
    pub fn record_nip60_token_event(&mut self, mint_url: &str, new_event_id: Option<String>) {
        let normalized = normalize_mint_url(mint_url);
        match new_event_id {
            Some(id) => {
                self.active_token_events.insert(normalized, vec![id]);
            }
            None => {
                self.active_token_events.remove(&normalized);
            }
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

    /// Melt Cashu ecash to pay a BOLT11 Lightning invoice, returning `(mint_url, result)`.
    pub async fn pay_invoice_with_mint(
        &mut self,
        mint_url: Option<&str>,
        bolt11: &str,
        amount_sats: u64,
    ) -> Result<(String, ZapPaymentResult)> {
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

        Ok((
            target_mint,
            ZapPaymentResult {
                preimage,
                amount_sats,
                bolt11: cleaned.to_string(),
            },
        ))
    }

    /// Melt Cashu ecash to pay a BOLT11 Lightning invoice (used for Cashu-funded NIP-57 zaps!).
    pub async fn pay_invoice(
        &mut self,
        mint_url: Option<&str>,
        bolt11: &str,
        amount_sats: u64,
    ) -> Result<ZapPaymentResult> {
        let (_, res) = self.pay_invoice_with_mint(mint_url, bolt11, amount_sats).await?;
        Ok(res)
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

    #[test]
    fn parses_nip60_wallet_config_and_token_rollover() {
        let wallet_json = r#"[
            ["privkey", "deadbeef"],
            ["mint", "https://mint.minibits.cash/Bitcoin/"],
            ["mint", "https://mint.coinos.io"],
            ["relay", "wss://relay.minibits.cash"]
        ]"#;
        let cfg = parse_nip60_wallet_content(wallet_json);
        assert_eq!(cfg.privkey.as_deref(), Some("deadbeef"));
        assert_eq!(
            cfg.mints,
            vec![
                "https://mint.minibits.cash/Bitcoin".to_string(),
                "https://mint.coinos.io".to_string()
            ]
        );
        assert_eq!(cfg.relays, vec!["wss://relay.minibits.cash".to_string()]);

        let token_json = r#"{
            "mint": "https://mint.minibits.cash/Bitcoin/",
            "unit": "sat",
            "proofs": [],
            "del": ["old-event-1", "old-event-2"]
        }"#;
        let parsed = parse_nip60_token_content(token_json).expect("should parse kind 7375");
        assert_eq!(parsed.mint, "https://mint.minibits.cash/Bitcoin");
        assert_eq!(parsed.del, vec!["old-event-1", "old-event-2"]);

        let usd_token = r#"{"mint": "https://mint.minibits.cash/Bitcoin", "unit": "usd", "proofs": []}"#;
        assert!(parse_nip60_token_content(usd_token).is_none());
    }
}
