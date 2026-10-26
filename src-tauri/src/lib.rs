// The desktop shell. All drawing and chemistry happen in the web page (../src);
// this opens the window, reads and writes the files the user picks, and runs a
// self-test used by the automatic Windows build.

mod ai;
mod clipboard;
mod file_types;
mod keep;
mod ole;
mod open_dialog;
mod portable;
mod print;
mod recognise;
mod web;

use std::path::PathBuf;
use std::time::Duration;

/// Starting the app with CHEM_ILLUSTRATOR_SELFTEST set to a file path makes the page check
/// that drawing and the chemistry engine work, write a report to that file, and close.
fn selftest_path() -> Option<PathBuf> {
    std::env::var_os("CHEM_ILLUSTRATOR_SELFTEST").map(PathBuf::from)
}

#[tauri::command]
fn selftest_requested() -> bool {
    selftest_path().is_some()
}

#[tauri::command]
fn selftest_report(app: tauri::AppHandle, report: String, ok: bool) {
    if let Some(path) = selftest_path() {
        let _ = std::fs::write(path, report);
    }
    app.exit(if ok { 0 } else { 1 });
}

/// Read a file the user chose in an Open dialog.
#[tauri::command]
fn read_text_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    ai::guard_key_file(&app, &path)?;
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read {path}: {e}"))
}

/// Save a file the user chose. The text goes to a temporary file next to it first, so a
/// failed save (full disk, lost network drive) never leaves a half-written drawing.
#[tauri::command]
fn write_text_file(app: tauri::AppHandle, path: String, contents: String) -> Result<(), String> {
    ai::guard_key_file(&app, &path)?;
    write_bytes(&path, contents.as_bytes())
}

/// Whether a file is there already (File > Save Workspace, so it doesn't write over one).
#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// Whether another program holds a file open for changing it (Windows): Word keeps the file it
/// edits open that way, and writes no "~$" owner file for one in OneDrive with AutoSave on.
/// Asking to read it while letting nobody else write fails then, with a sharing violation; the
/// file itself is never changed. Asked twice, so OneDrive syncing it for a moment doesn't count.
#[tauri::command(async)]
fn file_held(path: String) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_SHARE_READ: u32 = 1;
        const ERROR_SHARING_VIOLATION: i32 = 32;
        let held = || {
            std::fs::OpenOptions::new().read(true).share_mode(FILE_SHARE_READ).open(&path).err().and_then(|e| e.raw_os_error()) == Some(ERROR_SHARING_VIOLATION)
        };
        if !held() {
            return false;
        }
        std::thread::sleep(Duration::from_millis(400));
        held()
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        false
    }
}

/// Read a file the user chose, as bytes (PowerPoint files, CDX drawings, pictures).
#[tauri::command]
fn read_binary_file(app: tauri::AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    ai::guard_key_file(&app, &path)?;
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("Could not read {path}: {e}"))
}

/// Save bytes to a file the user chose. The page sends the bytes as they are, with the path
/// in a "path" header (percent-encoded, since headers only carry plain ASCII).
#[tauri::command]
fn write_binary_file(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file's bytes".into());
    };
    let raw = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("no file name given")?;
    let path = percent_decode(raw)?;
    ai::guard_key_file(&app, &path)?;
    write_bytes(&path, bytes)
}

fn percent_decode(s: &str) -> Result<String, String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = b.get(i + 1..i + 3).and_then(|h| std::str::from_utf8(h).ok()).ok_or("bad file name")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "bad file name")?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "bad file name".into())
}

/// Write through a temporary file next to the target, so a failed save never leaves half a file.
fn write_bytes(path: &str, bytes: &[u8]) -> Result<(), String> {
    let target = PathBuf::from(path);
    let mut tmp = target.clone().into_os_string();
    tmp.push(".saving");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, bytes)
        .and_then(|_| std::fs::rename(&tmp, &target))
        .map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            format!("Could not save {path}: {e}")
        })
}

/// The person's settings file (key map and preferences): settings.json in the app's
/// settings folder, e.g. %APPDATA%\io.github.nathanohare.chemillustrator on Windows, or in the
/// "Chem Illustrator Data" folder next to a portable copy.
fn settings_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    if let Some(dir) = portable::settings_folder() {
        return Ok(dir.join("settings.json"));
    }
    let dir = app.path().app_config_dir().map_err(|e| format!("No settings folder: {e}"))?;
    Ok(dir.join("settings.json"))
}

/// Whether this is a portable copy: its folder, whether it can be written to, and whether it
/// updates itself in place (Windows) rather than with the installer.
#[tauri::command]
fn portable_info() -> serde_json::Value {
    match portable::get() {
        Some(p) => serde_json::json!({
            "folder": p.folder.to_string_lossy(),
            "writable": p.writable,
            "updatesInPlace": cfg!(windows),
        }),
        None => serde_json::Value::Null,
    }
}

/// The Stable channel's list of installers: a copy of the latest.json of a build that has been
/// tried on a real computer, put on the "stable" release by the Mark Stable workflow
/// (.github/workflows/stable.yml). The Latest channel reads the endpoint in tauri.conf.json.
const STABLE_FEED: &str = "https://github.com/nathanohare/Chem-Illustrator/releases/download/stable/stable.json";

#[cfg(desktop)]
/// An updater that reads the chosen channel ("stable" or "latest").
fn updater_for(app: &tauri::AppHandle, channel: &str, target: Option<&str>) -> Result<tauri_plugin_updater::Updater, String> {
    use tauri_plugin_updater::UpdaterExt;
    let mut b = app.updater_builder();
    if channel == "stable" {
        let url = tauri::Url::parse(STABLE_FEED).map_err(|e| e.to_string())?;
        b = b.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    if let Some(t) = target {
        b = b.target(t);
    }
    b.build().map_err(|e| e.to_string())
}

/// A newer version found by update_check, in the shape the updater's own JavaScript (Update)
/// takes, so downloading and installing it goes through the updater as before.
#[cfg(desktop)]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateFound {
    rid: tauri::ResourceId,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[cfg(desktop)]
/// Help > Check for Updates, and the check when the app starts: ask the chosen channel for a
/// newer version. Nothing when this is the newest.
#[tauri::command]
async fn update_check(webview: tauri::Webview, channel: String, target: Option<String>) -> Result<Option<UpdateFound>, String> {
    use tauri::Manager;
    let Some(update) = updater_for(webview.app_handle(), &channel, target.as_deref())?
        .check()
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(None);
    };
    let date = update.raw_json.get("pub_date").and_then(|d| d.as_str()).map(str::to_owned);
    Ok(Some(UpdateFound {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date,
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    }))
}

#[cfg(desktop)]
/// Help > Check for Updates in a portable copy on Windows: download the newer portable app,
/// check its signature, put it in place of this one and start it. Reports how far the download
/// has got (0 to 1, or -1 when the size isn't known).
#[tauri::command]
async fn portable_install_update(app: tauri::AppHandle, channel: Option<String>, on_progress: tauri::ipc::Channel<f64>) -> Result<(), String> {
    if !cfg!(windows) || portable::get().is_none() {
        return Err("Only portable copies on Windows update themselves in place.".into());
    }
    let update = updater_for(&app, channel.as_deref().unwrap_or("latest"), Some(portable::UPDATE_TARGET))?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("There is no newer version.")?;
    let mut got = 0usize;
    let bytes = update
        .download(
            |chunk, total| {
                got += chunk;
                let _ = on_progress.send(total.map_or(-1.0, |t| (got as f64 / t as f64).min(1.0)));
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    let exe = std::env::current_exe().map_err(|e| format!("Could not find the running app: {e}"))?;
    portable::swap_in(&exe, &bytes)?;
    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| format!("The new version is in place but didn't start ({e}); open it again."))?;
    app.exit(0);
    Ok(())
}

/// On an iPad the App Store keeps the app up to date: there is never an update to offer here.
#[cfg(mobile)]
#[tauri::command]
fn update_check() -> Option<()> {
    None
}

#[cfg(mobile)]
#[tauri::command]
fn portable_install_update() -> Result<(), String> {
    Err("Updates come from the App Store.".into())
}

#[tauri::command]
fn settings_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(settings_file(&app)?.to_string_lossy().into_owned())
}

/// The saved settings, or nothing before the first change.
#[tauri::command]
fn settings_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_file(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

#[tauri::command]
fn settings_write(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = settings_file(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not make {}: {e}", dir.display()))?;
    }
    write_bytes(&path.to_string_lossy(), contents.as_bytes())
}

/// The window as first opened (1400 × 900) can be taller than a laptop screen, which leaves the
/// status bar below its bottom edge when the window isn't maximised: made smaller to fit the
/// screen's work area (the part the taskbar leaves) and centred there.
#[cfg(desktop)]
fn fit_to_screen(w: &tauri::WebviewWindow) {
    let (Ok(Some(m)), Ok(outer), Ok(inner)) = (w.current_monitor(), w.outer_size(), w.inner_size()) else { return };
    let area = m.work_area();
    if outer.width <= area.size.width && outer.height <= area.size.height {
        return;
    }
    // the frame (title bar and borders) around the page, in pixels
    let (fw, fh) = (outer.width.saturating_sub(inner.width), outer.height.saturating_sub(inner.height));
    let width = outer.width.min(area.size.width);
    let height = outer.height.min(area.size.height);
    let _ = w.set_size(tauri::PhysicalSize::new(width.saturating_sub(fw), height.saturating_sub(fh)));
    let x = area.position.x + (area.size.width - width) as i32 / 2;
    let y = area.position.y + (area.size.height - height) as i32 / 2;
    let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn decodes_file_names() {
        assert_eq!(percent_decode("C%3A%5CUsers%5Cn%C3%BC%5CTalk%201.pptx").unwrap(), "C:\\Users\\nü\\Talk 1.pptx");
        assert_eq!(percent_decode("plain.pptx").unwrap(), "plain.pptx");
        assert!(percent_decode("bad%zz").is_err());
    }
}

/// A panic is written to "diagnostics/panic-<time>.txt" in the kept folder before the app goes
/// on (or stops), and the page reads it on the next start to offer a problem report
/// (src/diagnostics.ts). Nothing is sent anywhere.
fn catch_panics(app: &tauri::AppHandle) {
    let Ok(dir) = keep::root(app).map(|r| r.join("diagnostics")) else { return };
    let earlier = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis());
        let thread = std::thread::current().name().unwrap_or("unnamed").to_owned();
        let text = format!("Version {}, thread '{thread}' {info}\n", env!("CARGO_PKG_VERSION"));
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join(format!("panic-{ms}.txt")), text);
        earlier(info);
    }));
}

/// View > Developer Tools > Inspector: the web inspector, built into the Windows and Linux apps
/// (the "devtools" feature in Cargo.toml). Apple doesn't allow it in App Store apps.
#[tauri::command]
fn open_inspector(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(any(debug_assertions, windows, target_os = "linux"))]
    {
        window.open_devtools();
        Ok(())
    }
    #[cfg(not(any(debug_assertions, windows, target_os = "linux")))]
    {
        let _ = window;
        Err("The inspector isn't built into this version of the app.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // a file opened (double-clicked) while the app is running goes to this window, not a second app
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        file_types::open_files(app, file_types::files_in(args, Some(std::path::Path::new(&cwd))));
    }));
    // Help > Check for Updates: fetches the newest release from GitHub, checks its signature
    // against the public key in tauri.conf.json, installs it and restarts the app (on an iPad
    // the App Store does this)
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build()).plugin(tauri_plugin_process::init());
    builder
        .manage(file_types::Waiting::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            catch_panics(app.handle());
            portable::tidy();
            // the files the app was opened with (double-clicked, or "Open with")
            file_types::open_files(app.handle(), file_types::files_in(std::env::args(), None));
            file_types::refresh();
            // Word and PowerPoint reach the app here to edit drawings embedded in their documents
            ole::start(app.handle());
            #[cfg(desktop)]
            if let Some(w) = tauri::Manager::get_webview_window(app, "main") {
                fit_to_screen(&w);
            }
            // A self-test that never reports (the page failed to load) still ends.
            if let Some(path) = selftest_path() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(90));
                    let _ = std::fs::write(path, "{\"error\": \"timed out: the page never reported\"}");
                    handle.exit(2);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            selftest_requested,
            open_inspector,
            selftest_report,
            read_text_file,
            write_text_file,
            read_binary_file,
            write_binary_file,
            path_exists,
            file_held,
            settings_path,
            settings_read,
            settings_write,
            portable_info,
            update_check,
            portable_install_update,
            keep::keep_folder,
            keep::keep_put,
            keep::keep_get,
            keep::keep_list,
            keep::keep_remove,
            keep::file_stamp,
            keep::who_am_i,
            keep::write_lock_file,
            keep::remove_lock_file,
            clipboard::clipboard_write,
            clipboard::clipboard_read,
            clipboard::clipboard_formats,
            open_dialog::open_shared_dialog,
            file_types::launch_files,
            file_types::file_types_get,
            file_types::file_types_set,
            file_types::file_types_defaults,
            ole::ole_pending,
            ole::ole_save,
            ole::ole_close,
            ole::ole_registered,
            ole::ole_register,
            ole::ole_object_folder,
            web::web_get,
            ai::ai_key_set,
            ai::ai_key_has,
            ai::ai_request,
            recognise::pack_ready,
            recognise::pack_download,
            recognise::pack_cancel,
            recognise::pack_read,
            print::printers,
            print::print_page
        ])
        .build(tauri::generate_context!())
        .expect("error while running Chem Illustrator")
        .run(|_app, _event| {
            // macOS hands over files opened from Finder as an event, not on the command line
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let files = urls.into_iter().filter_map(|u| u.to_file_path().ok()).map(|p| p.to_string_lossy().into_owned()).collect();
                file_types::open_files(_app, files);
            }
        });
}
