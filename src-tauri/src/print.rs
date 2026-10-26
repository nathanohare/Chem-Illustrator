//! File > Print on Windows: the page prints through WebView2's own print settings, which give
//! it its paper size and orientation and leave out the browser's header and footer (date, title,
//! address, page numbers). WebView2's Print window doesn't follow the page's CSS `@page` size,
//! so a landscape page came out turned on portrait paper. The printer, copies and pages are
//! chosen in the app's own Print window. Elsewhere the page uses the system's Print window.

#[derive(serde::Serialize)]
pub struct Printers {
    names: Vec<String>,
    default: Option<String>,
}

/// The printers Windows knows (installed and connected), and its default one.
#[tauri::command]
pub fn printers() -> Printers {
    imp::printers()
}

/// Print the page as it now is to `printer`, on w × h point pages (turned landscape when wider
/// than tall), `copies` times; `pages` like "1-3, 5" (empty: all of them).
#[tauri::command]
pub async fn print_page(window: tauri::WebviewWindow, printer: String, w: f64, h: f64, copies: i32, pages: String) -> Result<(), String> {
    imp::print(window, printer, w, h, copies, pages).await
}

#[cfg(windows)]
mod imp {
    use super::Printers;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::PrintCompletedHandler;
    use windows::core::{Interface, HSTRING, PWSTR};
    use windows::Win32::Graphics::Printing::{EnumPrintersW, GetDefaultPrinterW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W};

    pub fn printers() -> Printers {
        let mut names = Vec::new();
        unsafe {
            let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            let (mut need, mut count) = (0u32, 0u32);
            let _ = EnumPrintersW(flags, None, 4, None, &mut need, &mut count);
            if need > 0 {
                // u64s, so the PRINTER_INFO_4W records at its start are aligned
                let mut buf = vec![0u64; (need as usize).div_ceil(8)];
                let bytes = std::slice::from_raw_parts_mut(buf.as_mut_ptr().cast::<u8>(), buf.len() * 8);
                if EnumPrintersW(flags, None, 4, Some(bytes), &mut need, &mut count).is_ok() {
                    let infos = std::slice::from_raw_parts(buf.as_ptr().cast::<PRINTER_INFO_4W>(), count as usize);
                    names.extend(infos.iter().filter_map(|i| i.pPrinterName.to_string().ok()));
                }
            }
        }
        let default = unsafe {
            let mut len = 0u32;
            let _ = GetDefaultPrinterW(None, &mut len);
            let mut buf = vec![0u16; len as usize + 1];
            if len > 0 && GetDefaultPrinterW(Some(PWSTR(buf.as_mut_ptr())), &mut len).as_bool() {
                Some(String::from_utf16_lossy(&buf[..(len as usize).saturating_sub(1)]))
            } else {
                None
            }
        };
        Printers { names, default }
    }

    pub async fn print(window: tauri::WebviewWindow, printer: String, w: f64, h: f64, copies: i32, pages: String) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let done = tx.clone();
        window
            .with_webview(move |wv| {
                let started = (|| -> windows::core::Result<()> {
                    unsafe {
                        let core: ICoreWebView2_16 = wv.controller().CoreWebView2()?.cast()?;
                        let env: ICoreWebView2Environment6 = core.cast::<ICoreWebView2_2>()?.Environment()?.cast()?;
                        let s = env.CreatePrintSettings()?;
                        // the paper upright, turned by the orientation (as WebView2 takes them)
                        s.SetPageWidth(w.min(h) / 72.0)?;
                        s.SetPageHeight(w.max(h) / 72.0)?;
                        s.SetOrientation(if w > h { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE } else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })?;
                        s.SetMarginTop(0.0)?;
                        s.SetMarginBottom(0.0)?;
                        s.SetMarginLeft(0.0)?;
                        s.SetMarginRight(0.0)?;
                        s.SetScaleFactor(1.0)?;
                        s.SetShouldPrintBackgrounds(true)?;
                        s.SetShouldPrintHeaderAndFooter(false)?;
                        let s2: ICoreWebView2PrintSettings2 = s.cast()?;
                        s2.SetMediaSize(COREWEBVIEW2_PRINT_MEDIA_SIZE_CUSTOM)?;
                        s2.SetPrinterName(&HSTRING::from(printer.as_str()))?;
                        s2.SetCopies(copies.clamp(1, 999))?;
                        if !pages.trim().is_empty() {
                            s2.SetPageRanges(&HSTRING::from(pages.trim()))?;
                        }
                        let handler = PrintCompletedHandler::create(Box::new(move |hr, status| {
                            let _ = done.send(match (hr, status) {
                                (Err(e), _) => Err(e.message()),
                                (Ok(()), COREWEBVIEW2_PRINT_STATUS_SUCCEEDED) => Ok(()),
                                (Ok(()), COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE) => Err("The printer isn't available.".into()),
                                (Ok(()), _) => Err("The printer couldn't print it.".into()),
                            });
                            Ok(())
                        }));
                        core.Print(&s, &handler)
                    }
                })();
                if let Err(e) = started {
                    let _ = tx.send(Err(format!("unsupported: {}", e.message())));
                }
            })
            .map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || rx.recv().unwrap_or_else(|_| Err("Printing stopped.".into())))
            .await
            .map_err(|e| e.to_string())?
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Printers;

    pub fn printers() -> Printers {
        Printers { names: Vec::new(), default: None }
    }

    pub async fn print(_window: tauri::WebviewWindow, _printer: String, _w: f64, _h: f64, _copies: i32, _pages: String) -> Result<(), String> {
        Err("unsupported: printing through the app's own Print window is on Windows only".into())
    }
}
