// Portable copies: a folder named "Chemweave Data" next to the app makes it keep the
// person's settings in that folder instead of the computer's settings folder, so the app can run
// from a flash drive or any folder without being installed. The portable download is a zip of the
// app and that folder. Without the folder the app behaves as an installed copy.
//
// A portable copy on Windows also updates itself in place: the updater downloads the new app
// (checked against the same signing key as the installers) and swaps it for this one, rather than
// running the installer, which would install a second copy on the computer.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const FOLDER: &str = "Chemweave Data";
/// The folder's name before the app was renamed; portable copies made then keep working.
pub const OLD_FOLDER: &str = "Chem Illustrator Data";

/// What the release's latest.json calls the portable Windows app.
pub const UPDATE_TARGET: &str = "windows-x86_64-portable";

pub struct Portable {
    /// The "Chemweave Data" folder.
    pub folder: PathBuf,
    /// False when the folder can't be written to (a locked or read-only drive): settings are then
    /// kept on the computer as usual.
    pub writable: bool,
}

/// The portable folder, when this copy has one.
pub fn get() -> Option<&'static Portable> {
    static IT: OnceLock<Option<Portable>> = OnceLock::new();
    IT.get_or_init(|| home().and_then(|h| find(&h))).as_ref()
}

/// Where the settings go in a portable copy that can write to its folder.
pub fn settings_folder() -> Option<&'static Path> {
    get().filter(|p| p.writable).map(|p| p.folder.as_path())
}

/// The folder the app sits in as the person sees it: the .exe's on Windows, the one holding the
/// .app on a Mac, the AppImage's on Linux.
fn home() -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    if let Some(image) = std::env::var_os("APPIMAGE") {
        return PathBuf::from(image).parent().map(Path::to_path_buf);
    }
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    #[cfg(target_os = "macos")]
    if let Some(app) = dir.parent().and_then(Path::parent).filter(|p| p.extension().is_some_and(|e| e == "app")) {
        // Chemweave.app/Contents/MacOS/chem-illustrator
        return app.parent().map(Path::to_path_buf);
    }
    Some(dir.to_path_buf())
}

fn find(home: &Path) -> Option<Portable> {
    let folder = [FOLDER, OLD_FOLDER].iter().map(|f| home.join(f)).find(|f| f.is_dir())?;
    let probe = folder.join(".write-test");
    let writable = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    Some(Portable { folder, writable })
}

/// The copy an update left behind: Windows lets a running program be renamed but not replaced,
/// so the old one steps aside as "Chemweave.exe.old" and is deleted the next time.
fn old_copy(exe: &Path) -> PathBuf {
    let mut name = exe.as_os_str().to_owned();
    name.push(".old");
    PathBuf::from(name)
}

/// Delete what the last update left behind.
pub fn tidy() {
    if get().is_some() {
        if let Ok(exe) = std::env::current_exe() {
            let _ = std::fs::remove_file(old_copy(&exe));
        }
    }
}

/// Put `bytes` (the new app) in place of the running app at `exe`. On failure the running app is
/// left where it was.
pub fn swap_in(exe: &Path, bytes: &[u8]) -> Result<(), String> {
    let old = old_copy(exe);
    let mut new = exe.as_os_str().to_owned();
    new.push(".new");
    let new = PathBuf::from(new);
    let _ = std::fs::remove_file(&old);
    std::fs::write(&new, bytes).map_err(|e| format!("Could not write the new version next to {}: {e}", exe.display()))?;
    if let Err(e) = std::fs::rename(exe, &old) {
        let _ = std::fs::remove_file(&new);
        return Err(format!("Could not move the old version aside: {e}"));
    }
    if let Err(e) = std::fs::rename(&new, exe) {
        let _ = std::fs::rename(&old, exe);
        let _ = std::fs::remove_file(&new);
        return Err(format!("Could not put the new version in place: {e}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ci-portable-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn portable_only_with_the_folder() {
        let dir = scratch("find");
        assert!(find(&dir).is_none());
        std::fs::create_dir(dir.join(FOLDER)).unwrap();
        let p = find(&dir).unwrap();
        assert!(p.writable);
        assert_eq!(p.folder, dir.join(FOLDER));
        assert!(!dir.join(FOLDER).join(".write-test").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn finds_a_folder_made_before_the_rename() {
        let dir = scratch("old-name");
        std::fs::create_dir(dir.join(OLD_FOLDER)).unwrap();
        assert_eq!(find(&dir).unwrap().folder, dir.join(OLD_FOLDER));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn swaps_the_app() {
        let dir = scratch("swap");
        let exe = dir.join("Chemweave.exe");
        std::fs::write(&exe, b"old").unwrap();
        swap_in(&exe, b"new").unwrap();
        assert_eq!(std::fs::read(&exe).unwrap(), b"new");
        assert_eq!(std::fs::read(old_copy(&exe)).unwrap(), b"old");
        // a second update replaces the copy the first left behind
        swap_in(&exe, b"newer").unwrap();
        assert_eq!(std::fs::read(&exe).unwrap(), b"newer");
        assert_eq!(std::fs::read(old_copy(&exe)).unwrap(), b"new");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
