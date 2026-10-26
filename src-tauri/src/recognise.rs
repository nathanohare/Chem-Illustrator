// The structure reader's model pack (File > Import > From PDF, From Picture): downloaded once,
// the first time it is used, from the release .github/workflows/recognition-model.yml publishes,
// into the app's data folder. Each file is checked against the pack's list (its size and
// SHA-256) before it is kept, so a broken or changed download is never used.

use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::PathBuf;
use std::sync::LazyLock;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::Notify;

const RELEASES: &str = "https://github.com/nathanohare/Chem-Illustrator/releases/download";

#[derive(serde::Deserialize)]
struct PackFile {
    name: String,
    bytes: u64,
    sha256: String,
}

#[derive(serde::Deserialize)]
struct Manifest {
    files: Vec<PackFile>,
}

fn safe_name(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') && !s.starts_with('.')
}

fn pack_folder(app: &tauri::AppHandle, pack: &str) -> Result<PathBuf, String> {
    use tauri::Manager;
    if !safe_name(pack) {
        return Err("Not a model pack.".into());
    }
    let root = match crate::portable::settings_folder() {
        Some(dir) => dir.join("recognition"),
        None => app.path().app_local_data_dir().map_err(|e| format!("No data folder: {e}"))?.join("recognition"),
    };
    Ok(root.join(pack))
}

fn read_manifest(dir: &std::path::Path) -> Option<Manifest> {
    serde_json::from_str(&std::fs::read_to_string(dir.join("manifest.json")).ok()?).ok()
}

/// Whether the pack is here and whole, and how many bytes it is (to say before downloading).
#[tauri::command]
pub fn pack_ready(app: tauri::AppHandle, pack: String) -> Result<bool, String> {
    let dir = pack_folder(&app, &pack)?;
    let Some(m) = read_manifest(&dir) else { return Ok(false) };
    Ok(m.files.iter().all(|f| std::fs::metadata(dir.join(&f.name)).is_ok_and(|md| md.len() == f.bytes)))
}

/// How long a download waits for more of a file before it gives up (Wi-Fi gone, the laptop slept, a proxy holding on).
const READ_TIMEOUT: Duration = Duration::from_secs(60);

/// Told when the person presses Cancel in the download window.
static CANCEL: LazyLock<Notify> = LazyLock::new(Notify::new);

fn client(read: Duration) -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent(concat!("ChemIllustrator/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(read)
        .build()
        .map_err(|e| format!("Could not get ready to download: {e}"))
}

#[derive(serde::Serialize, Clone)]
struct Progress {
    done: u64,
    total: u64,
}

/// Download the pack (what isn't here already), telling the page how far it has got ("pack-progress").
/// Stops at once on pack_cancel: the request is dropped, and a file half downloaded is fetched again next time.
#[tauri::command]
pub async fn pack_download(app: tauri::AppHandle, pack: String) -> Result<(), String> {
    let cancelled = CANCEL.notified();
    tokio::select! {
        r = download(&app, &pack) => r,
        _ = cancelled => Err("Cancelled.".into()),
    }
}

/// The download window's Cancel (or Esc).
#[tauri::command]
pub fn pack_cancel() {
    CANCEL.notify_waiters();
}

async fn download(app: &tauri::AppHandle, pack: &str) -> Result<(), String> {
    let dir = pack_folder(app, pack)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not make {}: {e}", dir.display()))?;
    let http = client(READ_TIMEOUT)?;
    let base = format!("{RELEASES}/{pack}");
    let text = http
        .get(format!("{base}/manifest.json"))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Could not download the structure reader: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Could not download the structure reader: {e}"))?;
    let m: Manifest = serde_json::from_str(&text).map_err(|_| "The structure reader's file list could not be read.".to_string())?;
    if !m.files.iter().all(|f| safe_name(&f.name)) {
        return Err("The structure reader's file list could not be read.".into());
    }
    let total: u64 = m.files.iter().map(|f| f.bytes).sum();
    let mut done = 0u64;
    for f in &m.files {
        let path = dir.join(&f.name);
        if std::fs::metadata(&path).is_ok_and(|md| md.len() == f.bytes) {
            done += f.bytes;
            continue;
        }
        let part = dir.join(format!("{}.part", f.name));
        let mut out = std::fs::File::create(&part).map_err(|e| format!("Could not save {}: {e}", f.name))?;
        let mut res = http
            .get(format!("{base}/{}", f.name))
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("Could not download {}: {e}", f.name))?;
        let mut hash = Sha256::new();
        let mut got = 0u64;
        let mut told = 0u64;
        while let Some(chunk) = res.chunk().await.map_err(|e| stopped(&f.name, &e))? {
            got += chunk.len() as u64;
            if got > f.bytes {
                break;
            }
            hash.update(&chunk);
            out.write_all(&chunk).map_err(|e| format!("Could not save {}: {e}", f.name))?;
            if got - told > 2 * 1024 * 1024 {
                told = got;
                let _ = app.emit("pack-progress", Progress { done: done + got, total });
            }
        }
        drop(out);
        let sum: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if got != f.bytes || sum != f.sha256.to_ascii_lowercase() {
            let _ = std::fs::remove_file(&part);
            return Err(format!("The download of {} was not complete or not what was expected. Try again.", f.name));
        }
        std::fs::rename(&part, &path).map_err(|e| format!("Could not save {}: {e}", f.name))?;
        done += f.bytes;
        let _ = app.emit("pack-progress", Progress { done, total });
    }
    std::fs::write(dir.join("manifest.json"), text).map_err(|e| format!("Could not save the file list: {e}"))?;
    Ok(())
}

fn stopped(name: &str, e: &reqwest::Error) -> String {
    if e.is_timeout() {
        format!("The download of {name} stalled: nothing came for {} s. Check the connection and try again.", READ_TIMEOUT.as_secs())
    } else {
        format!("The download of {name} stopped: {e}")
    }
}

/// One file of the pack, for the reader to load.
#[tauri::command]
pub fn pack_read(app: tauri::AppHandle, pack: String, name: String) -> Result<tauri::ipc::Response, String> {
    if !safe_name(&name) {
        return Err("Not a file of the pack.".into());
    }
    let path = pack_folder(&app, &pack)?.join(&name);
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn a_stalled_download_gives_up() {
        // a server that sends 1 KB of a "140 MB" file, then nothing (the connection stays open)
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = [0u8; 1024];
            let _ = s.read(&mut buf);
            let _ = s.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 140000000\r\n\r\n");
            let _ = s.write_all(&[0u8; 1024]);
            std::thread::sleep(Duration::from_secs(30));
        });
        let started = std::time::Instant::now();
        let got = tauri::async_runtime::block_on(async {
            let http = client(Duration::from_secs(1)).unwrap();
            let mut res = http.get(format!("http://127.0.0.1:{port}/encoder.onnx")).send().await.map_err(|e| e.to_string())?;
            while let Some(_c) = res.chunk().await.map_err(|e| stopped("encoder.onnx", &e))? {}
            Ok::<(), String>(())
        });
        let e = got.expect_err("the download should stop");
        assert!(e.contains("stalled"), "{e}");
        assert!(started.elapsed() < Duration::from_secs(10));
    }
}
