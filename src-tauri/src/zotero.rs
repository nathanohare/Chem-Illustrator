// Citing live with Zotero (src/document/zotero-live.ts): the page talks to the Zotero app on
// this computer through Zotero's HTTP citing protocol. Zotero refuses requests that come from a
// web page, so they are sent from here. Only Zotero's own address (127.0.0.1, port 23119) and
// its citing endpoints are reached.

use std::time::Duration;

const ZOTERO: &str = "http://127.0.0.1:23119";
/// The largest answer read (a document's citations, with their items, are well under this).
const MAX_BYTES: usize = 64 * 1024 * 1024;

#[derive(serde::Serialize)]
pub struct ZoteroReply {
    status: u16,
    body: String,
}

/// Post to one of Zotero's citing endpoints, or ask whether Zotero is running (`ping`).
///
/// While Zotero's citation window is open, Zotero answers only once it is closed, so there is no
/// short time limit; a quarter of an hour covers anyone choosing references.
#[tauri::command]
pub async fn zotero_post(endpoint: String, body: String) -> Result<ZoteroReply, String> {
    let path = match endpoint.as_str() {
        "execCommand" => "/connector/document/execCommand",
        "respond" => "/connector/document/respond",
        "ping" => "/connector/ping",
        _ => return Err("Not a request the app sends to Zotero.".into()),
    };
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("ChemIllustrator/", env!("CARGO_PKG_VERSION")))
        // Zotero is on this computer: never through a proxy
        .no_proxy()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(if endpoint == "ping" { 5 } else { 15 * 60 }))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Could not get ready to reach Zotero: {e}"))?;
    let res = client
        .post(format!("{ZOTERO}{path}"))
        .header("content-type", "application/json")
        .header("x-zotero-connector-api-version", "2")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Could not reach Zotero: {e}"))?;
    let status = res.status().as_u16();
    let bytes = res.bytes().await.map_err(|e| format!("Could not read Zotero's answer: {e}"))?;
    if bytes.len() > MAX_BYTES {
        return Err("Zotero's answer is too large.".into());
    }
    Ok(ZoteroReply { status, body: String::from_utf8_lossy(&bytes).into_owned() })
}

/// Bring the app's window to the front (Zotero asks when its citation window closes).
#[tauri::command]
pub fn zotero_activate(window: tauri::WebviewWindow) {
    #[cfg(desktop)]
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}
