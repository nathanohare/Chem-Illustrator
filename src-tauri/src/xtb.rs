// The 3-D Model window's third tier: conformers re-optimised with GFN2-xTB, the Grimme group's
// semiempirical method. xtb (https://github.com/grimme-lab/xtb) is free software under the GNU
// LGPL 3.0 or later; it isn't shipped with the app. The person installs it (conda-forge, or the
// project's release builds) and the app runs that program, found on PATH or chosen by them.
//
// Only a program called xtb (xtb.exe on Windows) is ever run, with arguments built here, in a
// folder of its own under the system's temporary folder that is removed afterwards.

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

#[derive(serde::Deserialize)]
pub struct XtbJob {
    /// The xtb program: "xtb" to find it on PATH, or a path to it.
    exe: String,
    /// The conformer as an XYZ file (Å).
    xyz: String,
    charge: i32,
    /// Unpaired electrons.
    uhf: u32,
    /// An implicit solvent (ALPB), such as "water" or "thf"; none for the gas phase.
    solvent: Option<String>,
    /// Optimise the geometry (otherwise a single-point energy).
    opt: bool,
}

#[derive(serde::Serialize)]
pub struct XtbResult {
    /// The optimised geometry as an XYZ file (the input's when not optimising).
    xyz: String,
    /// Total energy, in hartree.
    energy: f64,
}

/// The longest one conformer may take.
const LIMIT: Duration = Duration::from_secs(15 * 60);

static NEXT: AtomicU32 = AtomicU32::new(1);

/// Bumped by Stop (xtb_stop): an xtb started before it is ended, not left to run to the end.
static STOP: AtomicU32 = AtomicU32::new(0);

/// Whether a program path names xtb itself (so no other program can be run through this).
fn is_xtb(exe: &str) -> bool {
    // (split on both kinds of slash, so a Windows path reads the same everywhere)
    let name = exe.rsplit(['/', '\\']).next().unwrap_or("").to_lowercase();
    name == "xtb" || name == "xtb.exe"
}

/// An ALPB solvent name as xtb knows them: letters, digits, commas and hyphens only.
fn safe_solvent(s: &str) -> bool {
    !s.is_empty() && s.len() <= 40 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == ',' || c == '-')
}

/// The total energy (hartree) from xtb's output: the "TOTAL ENERGY ... Eh" line of its summary.
pub fn parse_energy(out: &str) -> Option<f64> {
    out.lines()
        .rev()
        .find(|l| l.contains("TOTAL ENERGY") && l.contains("Eh"))
        .and_then(|l| l.split_whitespace().find_map(|w| w.parse::<f64>().ok()))
}

fn command(exe: &str) -> Command {
    #[allow(unused_mut)] // (changed only on Windows)
    let mut c = Command::new(exe);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // no console window flashing up
        c.creation_flags(0x0800_0000);
    }
    c
}

/// Runs a command to the end (or the time limit, or Stop), returning its standard output.
fn run_to_end(mut c: Command, limit: Duration) -> Result<String, String> {
    let stop_at = STOP.load(Ordering::SeqCst);
    let mut child = c.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("xtb could not be started: {e}"))?;
    // both outputs are read as they come: a pipe nobody reads fills (about 64 KB) and xtb then
    // waits on it until the time limit
    fn read_all<R: std::io::Read + Send + 'static>(from: Option<R>) -> std::thread::JoinHandle<String> {
        std::thread::spawn(move || {
            let mut s = String::new();
            if let Some(mut o) = from {
                let _ = o.read_to_string(&mut s);
            }
            s
        })
    }
    let reader = read_all(child.stdout.take());
    let errors = read_all(child.stderr.take());
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let text = reader.join().unwrap_or_default();
                let err = errors.join().unwrap_or_default();
                if !status.success() && parse_energy(&text).is_none() {
                    // what xtb said about it: its error output, else the end of its output
                    let said = if err.trim().is_empty() { &text } else { &err };
                    let tail: Vec<&str> = said.lines().rev().take(6).collect();
                    return Err(format!("xtb stopped with an error: {}", tail.into_iter().rev().collect::<Vec<_>>().join(" ").trim()));
                }
                return Ok(text);
            }
            Ok(None) => {
                if STOP.load(Ordering::SeqCst) != stop_at {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("stopped".into());
                }
                if start.elapsed() > limit {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("xtb took more than 15 minutes on one conformer, so it was stopped.".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("xtb could not be watched: {e}")),
        }
    }
}

/// The version line xtb prints, to check the program chosen is xtb and runs.
#[tauri::command]
pub async fn xtb_version(exe: String) -> Result<String, String> {
    if !is_xtb(&exe) {
        return Err("Choose the xtb program itself (xtb, or xtb.exe on Windows).".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = command(&exe);
        c.arg("--version");
        let out = run_to_end(c, Duration::from_secs(30))?;
        out.lines()
            .find(|l| l.contains("xtb version"))
            .map(|l| l.trim().trim_matches('*').trim().to_string())
            .ok_or_else(|| "That program didn't say it is xtb.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stop: ends any xtb running now (the 3-D Model window's Stop, or the window closed).
#[tauri::command]
pub fn xtb_stop() {
    STOP.fetch_add(1, Ordering::SeqCst);
}

/// One conformer through xtb: optimised (or a single point) at GFN2-xTB.
#[tauri::command]
pub async fn xtb_run(job: XtbJob) -> Result<XtbResult, String> {
    if !is_xtb(&job.exe) {
        return Err("Choose the xtb program itself (xtb, or xtb.exe on Windows).".into());
    }
    if let Some(s) = &job.solvent {
        if !safe_solvent(s) {
            return Err(format!("\"{s}\" isn't a solvent name xtb knows."));
        }
    }
    if job.uhf > 20 || job.charge.abs() > 20 {
        return Err("The charge or number of unpaired electrons is out of range.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let dir: PathBuf = std::env::temp_dir().join(format!("chem-illustrator-xtb-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let result = (|| {
            std::fs::write(dir.join("input.xyz"), &job.xyz).map_err(|e| e.to_string())?;
            let mut c = command(&job.exe);
            c.current_dir(&dir).arg("input.xyz").args(["--gfn", "2", "--chrg", &job.charge.to_string(), "--uhf", &job.uhf.to_string()]);
            if job.opt {
                c.args(["--opt", "normal"]);
            }
            if let Some(s) = &job.solvent {
                c.args(["--alpb", s]);
            }
            // every core for each run: the app runs conformers one after another
            c.env("OMP_NUM_THREADS", std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1).to_string()).env("OMP_STACKSIZE", "1G");
            let out = run_to_end(c, LIMIT)?;
            let energy = parse_energy(&out).ok_or_else(|| "xtb finished without an energy.".to_string())?;
            let xyz = if job.opt {
                std::fs::read_to_string(dir.join("xtbopt.xyz")).map_err(|_| "xtb finished without an optimised geometry.".to_string())?
            } else {
                job.xyz.clone()
            };
            Ok(XtbResult { xyz, energy })
        })();
        let _ = std::fs::remove_dir_all(&dir);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_xtb_runs() {
        assert!(is_xtb("xtb"));
        assert!(is_xtb("/opt/xtb/bin/xtb"));
        assert!(is_xtb("C:\\xtb\\bin\\XTB.EXE"));
        assert!(!is_xtb("/bin/sh"));
        assert!(!is_xtb("xtb-helper"));
        assert!(!is_xtb("cmd.exe"));
    }

    #[test]
    fn solvent_names() {
        assert!(safe_solvent("water"));
        assert!(safe_solvent("ch2cl2"));
        assert!(!safe_solvent("water; rm -rf /"));
        assert!(!safe_solvent(""));
    }

    #[cfg(unix)]
    #[test]
    fn stop_ends_a_run() {
        let t = std::thread::spawn(|| {
            let mut c = Command::new("sleep");
            c.arg("30");
            run_to_end(c, Duration::from_secs(60))
        });
        std::thread::sleep(Duration::from_millis(300));
        let start = Instant::now();
        xtb_stop();
        assert_eq!(t.join().unwrap(), Err("stopped".to_string()));
        assert!(start.elapsed() < Duration::from_secs(5));
    }

    #[cfg(unix)]
    #[test]
    fn much_error_output_does_not_stall_a_run() {
        // 200 KB on stderr, more than a pipe holds; an unread pipe left this waiting for the limit
        let run = || {
            let mut c = Command::new("sh");
            c.args(["-c", "head -c 200000 /dev/zero | tr '\\0' x >&2; echo done"]);
            run_to_end(c, Duration::from_secs(10))
        };
        let start = Instant::now();
        // (Stop pressed by the test above, running at the same time, ends a run too: once more then)
        let got = match run() { Err(e) if e == "stopped" => run(), r => r };
        assert_eq!(got.map(|s| s.trim().to_string()), Ok("done".to_string()));
        assert!(start.elapsed() < Duration::from_secs(5));
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_run_says_what_xtb_wrote_to_its_error_output() {
        let run = || {
            let mut c = Command::new("sh");
            c.args(["-c", "echo normal output; echo 'abnormal termination of xtb' >&2; exit 1"]);
            run_to_end(c, Duration::from_secs(10))
        };
        let got = match run() { Err(e) if e == "stopped" => run(), r => r };
        assert_eq!(got, Err("xtb stopped with an error: abnormal termination of xtb".to_string()));
    }

    #[test]
    fn energy_from_the_summary() {
        let out = "  | TOTAL ENERGY             -5.070544440612 Eh   |\n  | GRADIENT NORM               0.000146 Eh/α |\n";
        assert_eq!(parse_energy(out), Some(-5.070544440612));
        assert_eq!(parse_energy("nothing here"), None);
    }
}
