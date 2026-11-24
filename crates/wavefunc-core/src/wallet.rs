use std::time::Duration;

use nostr::nips::nip47::{NostrWalletConnectUri, PayInvoiceRequest};
use nwc::NostrWalletConnect;
use reqwest::Client as HttpClient;
use serde::Deserialize;
use url::Url;

use crate::error::{Result, WavefuncError};
use crate::models::{NwcWalletStatus, ZapPaymentResult};

#[derive(Debug, Clone)]
pub struct LnurlPayParams {
    pub callback: String,
    pub min_sendable_msat: u64,
    pub max_sendable_msat: u64,
    pub allows_nostr: bool,
    pub recipient_lud16: String,
}

#[derive(Debug, Deserialize)]
struct RawLnurlPayResponse {
    status: Option<String>,
    reason: Option<String>,
    callback: Option<String>,
    #[serde(rename = "minSendable")]
    min_sendable: Option<u64>,
    #[serde(rename = "maxSendable")]
    max_sendable: Option<u64>,
    #[serde(rename = "allowsNostr")]
    allows_nostr: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RawLnurlInvoiceResponse {
    status: Option<String>,
    reason: Option<String>,
    pr: Option<String>,
}

/// Resolve a Lightning address (`lud16` = `user@domain`) to its LNURL-pay endpoint parameters.
pub async fn fetch_lnurl_pay_params(
    http: &HttpClient,
    lud16: Option<&str>,
    lud06: Option<&str>,
) -> Result<LnurlPayParams> {
    let (endpoint, display_addr) = if let Some(addr) = lud16.map(str::trim).filter(|s| !s.is_empty())
    {
        let mut parts = addr.splitn(2, '@');
        let username = parts.next().unwrap_or_default().trim();
        let domain = parts.next().unwrap_or_default().trim();
        if username.is_empty() || domain.is_empty() || !domain.contains('.') {
            return Err(WavefuncError::Wallet(format!(
                "Invalid Lightning address: {addr}"
            )));
        }
        (
            format!("https://{domain}/.well-known/lnurlp/{username}"),
            addr.to_string(),
        )
    } else if let Some(lnurl) = lud06.map(str::trim).filter(|s| !s.is_empty()) {
        return Err(WavefuncError::Wallet(format!(
            "Unsupported lud06 Lightning address ({}) — recipient must configure lud16",
            &lnurl[..lnurl.len().min(16)]
        )));
    } else {
        return Err(WavefuncError::Wallet(
            "Station owner has no Lightning address (lud16) configured".to_string(),
        ));
    };

    let resp = http
        .get(&endpoint)
        .timeout(Duration::from_secs(12))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(WavefuncError::Wallet(format!(
            "LNURL endpoint returned HTTP {}",
            resp.status().as_u16()
        )));
    }

    let data: RawLnurlPayResponse = resp.json().await?;
    if data.status.as_deref() == Some("ERROR") {
        return Err(WavefuncError::Wallet(
            data.reason
                .unwrap_or_else(|| "LNURL endpoint returned error".to_string()),
        ));
    }

    let callback = data
        .callback
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| WavefuncError::Wallet("LNURL response missing callback URL".to_string()))?;

    Ok(LnurlPayParams {
        callback,
        min_sendable_msat: data.min_sendable.unwrap_or(1_000),
        max_sendable_msat: data.max_sendable.unwrap_or(100_000_000_000),
        allows_nostr: data.allows_nostr.unwrap_or(false),
        recipient_lud16: display_addr,
    })
}

/// Request a BOLT11 Lightning invoice from an LNURL-pay callback, attaching an optional
/// signed NIP-57 `kind 9734` zap request JSON.
pub async fn request_lnurl_invoice(
    http: &HttpClient,
    callback: &str,
    amount_msat: u64,
    comment: Option<&str>,
    signed_zap_request_json: Option<&str>,
) -> Result<String> {
    let mut url = Url::parse(callback)
        .map_err(|e| WavefuncError::Wallet(format!("Invalid LNURL callback URL: {e}")))?;

    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("amount", &amount_msat.to_string());
        if let Some(c) = comment.map(str::trim).filter(|s| !s.is_empty()) {
            pairs.append_pair("comment", c);
        }
        if let Some(zap_json) = signed_zap_request_json.filter(|s| !s.trim().is_empty()) {
            pairs.append_pair("nostr", zap_json);
        }
    }

    let resp = http
        .get(url)
        .timeout(Duration::from_secs(15))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(WavefuncError::Wallet(format!(
            "LNURL invoice callback returned HTTP {}",
            resp.status().as_u16()
        )));
    }

    let data: RawLnurlInvoiceResponse = resp.json().await?;
    if data.status.as_deref() == Some("ERROR") {
        return Err(WavefuncError::Wallet(
            data.reason
                .unwrap_or_else(|| "LNURL invoice generation failed".to_string()),
        ));
    }

    data.pr
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| WavefuncError::Wallet("LNURL response missing bolt11 invoice".to_string()))
}

/// Active NIP-47 Nostr Wallet Connect session.
pub struct ActiveNwcSession {
    client: NostrWalletConnect,
    wallet_pubkey: String,
    relay: Option<String>,
    lud16: Option<String>,
    cached_balance_sats: Option<u64>,
}

impl ActiveNwcSession {
    pub fn connect(nwc_uri: &str) -> Result<Self> {
        let parsed = NostrWalletConnectUri::parse(nwc_uri.trim())
            .map_err(|e| WavefuncError::Wallet(format!("Invalid NWC URI: {e}")))?;

        let wallet_pubkey = parsed.public_key.to_hex();
        let relay = parsed.relays.first().map(|r| r.to_string());
        let lud16 = parsed.lud16.clone();

        let client = NostrWalletConnect::builder(parsed)
            .timeout(Duration::from_secs(30))
            .build();

        Ok(Self {
            client,
            wallet_pubkey,
            relay,
            lud16,
            cached_balance_sats: None,
        })
    }

    pub fn status(&self) -> NwcWalletStatus {
        NwcWalletStatus {
            connected: true,
            wallet_pubkey: Some(self.wallet_pubkey.clone()),
            relay: self.relay.clone(),
            lud16: self.lud16.clone(),
            balance_sats: self.cached_balance_sats,
        }
    }

    pub async fn refresh_balance(&mut self) -> Result<u64> {
        let resp = self
            .client
            .get_balance()
            .timeout(Duration::from_secs(15))
            .await?;
        let sats = resp.balance / 1000;
        self.cached_balance_sats = Some(sats);
        Ok(sats)
    }

    pub async fn pay_invoice(&mut self, bolt11: &str, amount_sats: u64) -> Result<ZapPaymentResult> {
        let cleaned = bolt11.trim();
        if cleaned.is_empty() {
            return Err(WavefuncError::Wallet("Invoice cannot be empty".to_string()));
        }

        let resp = self
            .client
            .pay_invoice(PayInvoiceRequest::new(cleaned))
            .timeout(Duration::from_secs(45))
            .await?;

        if let Some(bal) = self.cached_balance_sats {
            self.cached_balance_sats = Some(bal.saturating_sub(amount_sats));
        }

        Ok(ZapPaymentResult {
            preimage: resp.preimage,
            amount_sats,
            bolt11: cleaned.to_string(),
        })
    }

    pub async fn shutdown(&self) {
        let _ = self.client.shutdown().await;
    }
}
