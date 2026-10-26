# Troubleshooting

This page covers the problems people meet most often: the program won't install or start, settings that went wrong, work that seems lost, and where the program keeps its files. If your problem isn't here, see [Feedback, problems and ideas](feedback.md).

## Installing and starting

**"Windows protected your PC".** This is SmartScreen, which warns about programs that aren't signed with a paid Windows certificate. Click **More info**, then **Run anyway**. An IT department's rules can still block the program; if so, ask them.

**Nothing happens when the app starts (Windows).** The app needs Microsoft's WebView2 Runtime. Windows 10 and 11 normally have it, but some managed computers remove it. Install the "Evergreen Standalone Installer" from Microsoft's WebView2 page, then start the app again.

**The window is bigger than the screen, or the status bar is cut off.** Maximise the window (double-click the menu bar), or make the whole interface smaller with **View ▸ Window and Colours ▸ Interface Size**.

**The menus or the window are the wrong colours.** **View ▸ Window and Colours ▸ Theme** chooses light, dark, or as the computer is set. The drawing's page has its own dark look: **View ▸ Dark Page** (or the eye button).

## Settings

Settings (hotkeys, your nicknames and templates, styles, palettes and every preference) are kept in one file, `settings.json`:

- **Windows:** `%APPDATA%\io.github.nathanohare.chemillustrator`
- **macOS:** `~/Library/Application Support/io.github.nathanohare.chemillustrator`
- **Linux:** `~/.config/io.github.nathanohare.chemillustrator`
- **Portable copy:** the **Chem Illustrator Data** folder next to the app.
- **Web version:** the browser's storage for the page.

**Keeping a copy.** **Edit ▸ Settings File ▸ Export Settings…** saves every setting in one file, to keep or to set up another computer. **Import Settings…** reads it back.

**A damaged settings file.** Each time the settings read whole, the program keeps a copy beside them (`settings.bak`). If `settings.json` is ever damaged (a power cut while saving, a sync conflict), the program moves it aside as `settings.damaged-….json`, puts the last good copy back, and says so. Nothing is lost except changes made since that copy.

**Starting again from the defaults.** Export your settings first if you might want them back. Then close the app and delete (or rename) `settings.json` in the folder above. The next start uses the defaults.

## Work that seems lost

- **The app closed without saving** (a crash, a power cut, Windows restarting for updates): the next start offers your unsaved work back. To look again later, use **File ▸ Versions and Recovery ▸ Recover Unsaved Work…**.
- **You saved over something you wanted:** **File ▸ Versions and Recovery ▸ Version History…** lists earlier versions kept each time the file was saved; open one as a copy, or restore it.
- **A file isn't where it was:** **File ▸ Open Recent** (desktop app) names the folder each recent file was in. A file moved or renamed since is taken off the list.

Recovery copies and versions are kept in the **Kept** folder of the app's data folder (on Windows, `%LOCALAPPDATA%\io.github.nathanohare.chemillustrator\Kept`). In the web version they are kept in the browser’s storage; the program asks the browser to keep it, but a browser can still clear it, so save files you care about.

How often copies are made, and how many versions are kept, is in **File ▸ Versions and Recovery ▸ AutoSave and Recovery Options…**.

## Slow or stuck

- **A big drawing is slow:** **View ▸ Developer Tools** adds a Speed panel to the side panel that shows how long each frame takes. A report with those numbers (and the file, if you can share it) helps most.
- **"The chemistry engine is still loading":** the first start after installing can take a few seconds longer. If it never finishes, report it with **Help ▸ Report a Problem…**.
- **A file takes a long time to open, or never does:** report it with the file if you can, from **Help ▸ Report a Problem…**.

## Getting help

- **Help ▸ Hotkeys and Tips** lists the keys that matter most; [Keyboard and mouse](keyboard-and-mouse.md) has them all.
- **Help ▸ User Guide** opens these pages inside the program.
- **Help ▸ Copy Diagnostics** copies the version, the computer and the newest part of the error log, to paste into a report or a message.
- **Help ▸ Report a Problem…** opens a report already filled in with the version and computer.

Next: [Getting started](getting-started.md) · [Files and sharing](files-and-sharing.md) · [Feedback, problems and ideas](feedback.md)
