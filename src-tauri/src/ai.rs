// Edit > Settings > AI Model: the API key for the person's own AI model, and the requests that
// carry it. The key stays out of settings.json (so Export Settings never carries it) in a file of
// its own beside it, readable only by this user where the system allows. The page never gets the
// key back: it asks this side to send a request, and the key is added here, only ever to the
// address the key was saved for.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

/// The largest answer read (a model's answer is text; this is far more than one).
const MAX_BYTES: usize = 20 * 1024 * 1024;

#[derive(serde::Serialize, serde::Deserialize, Clone, Default)]
struct Saved {
    key: String,
    /// The address the key may go to (for a service of the person's choosing).
    base: String,
}

fn keys_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    if let Some(dir) = crate::portable::settings_folder() {
        return Ok(dir.join("ai-keys.json"));
    }
    let dir = app.path().app_config_dir().map_err(|e| format!("No settings folder: {e}"))?;
    Ok(dir.join("ai-keys.json"))
}

fn read_keys(app: &tauri::AppHandle) -> HashMap<String, Saved> {
    keys_file(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// The fixed address of each named service; None for one the person typed in.
fn fixed_base(provider: &str) -> Option<&'static str> {
    match provider {
        "anthropic" => Some("https://api.anthropic.com"),
        "openai" => Some("https://api.openai.com/v1"),
        "gemini" => Some("https://generativelanguage.googleapis.com/v1beta"),
        _ => None,
    }
}

fn known(provider: &str) -> bool {
    fixed_base(provider).is_some() || provider == "compatible"
}

fn web_address(base: &str) -> bool {
    let b = base.to_ascii_lowercase();
    b.starts_with("https://") || b.starts_with("http://")
}

#[tauri::command]
pub fn ai_key_set(app: tauri::AppHandle, provider: String, key: String, base: String) -> Result<(), String> {
    if !known(&provider) {
        return Err("Unknown AI service.".into());
    }
    let base = fixed_base(&provider).map(str::to_string).unwrap_or(base);
    if !web_address(&base) {
        return Err("The address must start with http:// or https://.".into());
    }
    let mut keys = read_keys(&app);
    if key.trim().is_empty() {
        keys.remove(&provider);
    } else {
        keys.insert(provider, Saved { key: key.trim().to_string(), base: base.trim_end_matches('/').to_string() });
    }
    let path = keys_file(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not make {}: {e}", dir.display()))?;
    }
    let text = serde_json::to_string_pretty(&keys).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("Could not save the key: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[tauri::command]
pub fn ai_key_has(app: tauri::AppHandle, provider: String) -> bool {
    read_keys(&app).get(&provider).is_some_and(|s| !s.key.is_empty())
}

#[derive(serde::Serialize)]
pub struct AiReply {
    status: u16,
    body: String,
}

/// Send one request to the linked service, with its key added here.
#[tauri::command]
pub async fn ai_request(
    app: tauri::AppHandle,
    provider: String,
    base: String,
    method: String,
    path: String,
    body: Option<String>,
) -> Result<AiReply, String> {
    if !known(&provider) {
        return Err("Unknown AI service.".into());
    }
    let base = fixed_base(&provider).map(str::to_string).unwrap_or(base).trim_end_matches('/').to_string();
    if !web_address(&base) {
        return Err("The AI service's address must start with http:// or https://.".into());
    }
    if !path.starts_with('/') || path.contains("..") || path.contains("://") {
        return Err("Not a request the app sends.".into());
    }
    let saved = read_keys(&app).remove(&provider).unwrap_or_default();
    // a key typed for one address never goes to another
    let key = if fixed_base(&provider).is_some() || saved.base == base { saved.key } else { String::new() };
    if key.is_empty() && provider != "compatible" {
        return Err("No API key is saved for this AI service. Add one in Edit > Settings > AI Model.".into());
    }
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("ChemIllustrator/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("Could not get ready to reach the AI service: {e}"))?;
    let url = format!("{base}{path}");
    let mut req = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        _ => return Err("Not a request the app sends.".into()),
    };
    req = match provider.as_str() {
        "anthropic" => req.header("x-api-key", &key).header("anthropic-version", "2023-06-01"),
        "gemini" => req.header("x-goog-api-key", &key),
        _ if key.is_empty() => req,
        _ => req.bearer_auth(&key),
    };
    if let Some(b) = body {
        req = req.header("content-type", "application/json").body(b);
    }
    let res = req.send().await.map_err(|e| format!("Could not reach the AI service: {e}"))?;
    let status = res.status().as_u16();
    let bytes = res.bytes().await.map_err(|e| format!("Could not read the AI service's answer: {e}"))?;
    if bytes.len() > MAX_BYTES {
        return Err("The AI service's answer is too large.".into());
    }
    Ok(AiReply { status, body: String::from_utf8_lossy(&bytes).into_owned() })
}
