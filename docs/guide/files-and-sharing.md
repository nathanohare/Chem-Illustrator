# Files and sharing

This page covers the files Chem Illustrator opens and saves, copying and pasting with ChemDraw and Office, Split View, workspaces, AutoSave and recovery, Version History, shared folders, recent files, printing and fonts.

## File types

Each kind of tab saves to its own file type. **Save** (Ctrl+S) uses the first type in the list; **Save As…** (Ctrl+Shift+S) offers the others.

| Tab | Opens | Saves | Also exports |
|---|---|---|---|
| Canvas | .cdxml, .cdx, .cds, .mol, .rxn, .mrv, .ket, .cml, ChemDoodle .json | .cdxml (the default), .cdx, .mol, .sdf, .rxn, .mrv, .ket, .cml, ChemDoodle .json | Molfile (.mol), PDF, PNG, TIFF, SVG, EMF, EPS |
| Presentation | .pptx | .pptx | PDF (one page per slide), PNG, TIFF, SVG, EMF or EPS of the current slide |
| Design | .pptx | .pptx (one slide) | PDF, PNG, TIFF, SVG, EMF, EPS |
| Document | .docx, .doc, .rtf, .odt | .docx (the default), .rtf, .odt | PDF |
| Spreadsheet | .xlsx, .xlsm, .xls, .ods, .csv, .tsv, .txt, .sdf | .xlsx, .xlsm, .csv, .sdf | Charts as PNG or SVG |
| Workspace | .ciworkspace | .ciworkspace | |

Open files with **File ▸ Open…** (Ctrl+O), or drop them onto the window. Picture files (PNG, JPEG, GIF, SVG, EMF, BMP, WebP) dropped on a canvas, slide, design or document are placed as pictures.

### ChemDraw files

- **.cdxml** is the default for canvases. When you save a ChemDraw file you opened, only what you changed is rewritten, so the rest stays exactly as ChemDraw wrote it.
- **.cdx** is ChemDraw's binary format. It opens and saves, and it is what ChemDraw reads from the clipboard.
- **Other programs' chemistry files** open as canvases in your drawing style, at your bond length: molfiles (.mol, V2000 and V3000), reaction files (.rxn, V2000 and V3000), Marvin documents (.mrv), Ketcher drawings (.ket), Chemical Markup Language (.cml) and ChemDoodle JSON (.json). Abbreviations the file marks (OMe, Boc) come back as labels, and a reaction keeps its starting materials, reagents and products. **Save As** writes them too, and .sdf (one record per structure). These formats hold less than .cdxml: molfiles and SD files keep the structures only, RXN the first reaction step, ChemDoodle JSON the structures and arrows, and Marvin, Ketcher and CML the structures, straight arrows, + signs and text. Molfiles, SD and RXN files are written as V2000, which every program reads, except that a file opened as V3000 is saved back as V3000, and a structure with more than 999 atoms or bonds is always written as V3000. The save message says what was left out, and AutoSave leaves these files alone. ACD/ChemSketch's .sk2 has no published description, so it can't be read: save from ChemSketch as .mol instead.
- **.cds** is a ChemDraw style sheet. It opens like a drawing, and the app offers to keep its settings (bond length, line widths, label font) as one of your own drawing styles, so you can pick it in **Drawing Style** in any mode or start new drawings in it. Style sheets open but are never written back to: Save asks for a .cdxml or .cdx file.

### Structures in Office files

- **Word (.docx):** structures show as pictures in Word. Open the file here again and they are editable drawings, even after Word has saved it. ChemDraw drawings embedded in a Word file made elsewhere keep the look they had in Word; double-click one to make it an editable structure. Edited, it is saved back as a ChemDraw object, so it still opens in ChemDraw from Word.
- **PowerPoint (.pptx):** the same: pictures in PowerPoint, editable drawings when opened here again. A ChemDraw object embedded in a PowerPoint slide comes in as editable structures, where and at the size PowerPoint showed it, and is saved back as a ChemDraw object, so double-clicking it in PowerPoint still opens it in ChemDraw. Anything drawn onto its structures (a bond added to one) goes back in the object with them.
- **Excel (.xlsx):** structures are pictures with their SMILES in the cell, and become editable drawings again when opened here.

To save structures as ChemDraw objects instead of pictures, so that double-clicking one in Word or PowerPoint opens it in ChemDraw, choose **ChemDraw objects** in **Settings ▸ General ▸ Save structures in Word files as** (and **…in PowerPoint files as**). The choice is used each time a file is saved, so changing it and saving again converts the structures drawn here either way. ChemDraw objects show as their picture on computers without ChemDraw, and pictures (SVG and PNG) look the same in every program, including Google Docs, LibreOffice and Keynote. Either way the file opens here again with editable drawings. In Word, structures that float on the page, are turned or flipped, or have a frame or border are saved as pictures, since Word keeps objects in line with the text.

### Older Excel files, macro-enabled workbooks and OpenDocument

- **.xls** (Excel 97 to 2003) opens with its values, formulas, number formats, bold and italic, alignment, merged cells and column widths. Save it as .xlsx. A password-protected .xls can't be opened; save it without the password in Excel first. Files from Excel 95 and older open with their values only.
- **.xlsm** (macro-enabled) opens like an .xlsx. Its macros are never run here, but they are kept: save it as .xlsm again and Excel finds them exactly as they were. Saving as .xlsx leaves them out, and the app says so.
- **.ods** (LibreOffice Calc and other OpenDocument programs) opens with its values, formulas, styles, merged cells, column widths and row heights. Save it as .xlsx; LibreOffice opens that too.

### Alt text and the accessibility checker

**Alt Text…** (on the right-click menu, the **Review** tab in Presentations, Spreadsheets and Documents, and **Insert ▸ Alt Text…**) gives a picture, chart or structure a description for people using a screen reader. It is saved where Word, PowerPoint and Excel keep their own alt text, and in .cdxml files. A structure with no alt text of its own is described by its SMILES in Office files, as before.

**File ▸ Check Accessibility** (or **Review** ▸ **Check Accessibility**) lists what makes the file harder to read: pictures, charts and structures with no alt text, text with too little contrast against its background (WCAG 2.2: 4.5:1, or 3:1 for large text), slides with no title or the same title as another, slide titles that a screen reader would not reach first, skipped heading levels, tables with no heading row, floating pictures, merged cells and unnamed sheets. Click an item to go to it; **Add Alt Text…** fixes a missing description there and then. **Check Again** looks again after changes.

### Checking a figure for a journal

**File ▸ Check Figure for Journal…** (or **Check for Journal** on the Design tab) checks the drawing, design page or slide against a journal's published author guidelines before you export it. Pick the journal (ACS, RSC, Elsevier, Nature or Wiley journals), the width it will print at (one column, two columns, or a table of contents graphic), and whether it prints as drawn or is made to fill that width.

A figure wider than the column is shrunk by the journal, which makes its text and lines smaller too, so the check measures every piece of text and every line at the size it will be printed. It lists, errors first:

- the figure's width and height against the journal's sizes;
- text smaller than the journal allows (ACS 4.5 pt, Elsevier 6 pt, Nature 5 pt) or than it asks for (RSC, Elsevier and Wiley 7 pt), and text over Nature's 7 pt;
- fonts other than the ones the journal asks for;
- lines thinner than the journal allows (ACS 0.5 pt, Wiley 0.2 pt, Elsevier 0.1 pt);
- pictures in the figure with too few dots at the printed size;
- the resolution and file format to export at (for example ACS: 1200 dpi for black and white line art; RSC: TIFF at 600 dpi; Nature: PDF or EPS, not TIFF or PNG).

**Select** picks out what a finding is about. **Make It Fit** scales the drawing to the width, **Enlarge Text** and **Thicken Lines** make just what is too small big enough, **Use Arial** changes other fonts, and **Use Journal Drawing Style** redraws the structures in the journal's own style. Each is one undo. **Export for Journal…** opens Export Picture at the resolution the journal asks for (or Export PDF for Nature). The numbers come from each publisher's author guidelines, linked at the foot of the box; journals change them, so check the journal's own page before sending.

### Other formats

- **SMILES:** **Edit ▸ Copy As ▸ Copy as SMILES** (Ctrl+Alt+C) copies the selected structures as SMILES; **Edit ▸ Paste Special ▸ Paste SMILES** (Ctrl+Alt+P) draws them. A SMILES string pasted with Ctrl+V is drawn too.
- **Molfile:** **File ▸ Export ▸ Export Molfile…** saves the selected structures (or all of them) as a .mol file; **Edit ▸ Copy As ▸ Copy as Molfile Text** copies them as text. A molfile pasted with Ctrl+V is drawn.
- **CDXML text:** **Edit ▸ Copy As ▸ Copy as CDXML Text** copies the drawing as ChemDraw XML.
- **Reactions:** **Edit ▸ Copy As ▸ Copy Reaction as SMILES** copies the selected reaction step (or the only one) as reaction SMILES (starting materials>reagents>products), and **Copy Reaction as RXN** as an MDL RXN file, for electronic notebooks and reaction databases. Paste either with Ctrl+V and the reaction is drawn: starting materials with + between them, the arrow with the reagents over it, and the products.
- **Many files at once:** **File ▸ Export ▸ Batch Convert…** turns a set of CDXML, CDX, molfile, SD, SMILES, RXN, Marvin, Ketcher, CML and ChemDoodle files into CDXML, CDX, molfiles, SVG or PNG pictures, or one SMILES list. Each record of an SD file and each line of a SMILES file becomes a file of its own, named after its title. The desktop app saves them in a folder you pick or in one zip; the web version saves a zip.
- **SD files (.sdf):** open in a spreadsheet with one row per structure and its data fields as columns.
- **PDF:** **File ▸ Export ▸ Export PDF…** for canvases, presentations, designs and documents. Structures and text stay sharp at any zoom. The fonts go inside the file, so it looks the same everywhere and passes journals' "all fonts embedded" checks. Arial, Helvetica and similar fonts are drawn with Arimo, Times with Tinos and Courier with Cousine: free fonts with exactly the same letter widths. A character none of those has (an arrow such as →) uses the reader's Symbol font.
- **Pictures:** **File ▸ Export ▸ Export Picture…** for a canvas, the current slide or a design page. Pick a white or page-colored background or a see-through one.
  - **PNG** and **TIFF** are pictures made of dots. Type the dpi (300 for color, 600 to 1200 for line art). TIFF files are LZW-compressed, the kind many journals ask for.
  - **SVG**, **EMF** and **EPS** keep shapes and text sharp at any size. SVG suits Illustrator, Inkscape and web pages; EMF suits Word and PowerPoint on Windows; EPS suits older journal systems. EPS uses the standard PostScript fonts (Helvetica, Times, Courier and Symbol), and has no see-through colors, so those are mixed with white.

### Opening files from Explorer or Finder (desktop app)

Double-click a file, or right-click it and choose **Open with ▸ Chem Illustrator**, and it opens in a new tab. A file opened while the program is already running goes to the open window rather than starting a second copy.

- **Windows**: the first time it starts, Chem Illustrator adds itself to the **Open with** list of .cdxml, .cdx, .cds, .mol, .sdf, .rxn, .mrv, .ket and .cml files, for you only. **Edit ▸ Settings ▸ File Types** chooses which kinds of file it is offered for, including .docx, .pptx and .xlsx. It never makes itself the program that opens a file on a double-click: Windows keeps that choice for you. **Choose Defaults in Windows Settings…** on that page opens Windows' Default apps page, where you can pick Chem Illustrator for each kind of file. A portable copy leaves the computer's file types alone until you check them yourself. Uninstalling takes it off the lists again.
- **macOS**: right-click a file and choose **Open With ▸ Chem Illustrator**. To open a kind of file here every time, select one in Finder, choose **File ▸ Get Info**, pick Chem Illustrator under **Open with** and click **Change All**.
- **Linux**: Chem Illustrator is in your file manager's **Open With** list for these files; your desktop's Default Applications settings choose the default.

## Copy and paste

**Edit ▸ Copy** (Ctrl+C) copies the selection, or the whole drawing when nothing is selected.

| Where you paste | What arrives |
|---|---|
| Chem Illustrator | Everything, fully editable |
| ChemDraw (Windows app) | Editable structures, through the CDX format |
| Word, PowerPoint or Excel (Windows app) | A Chem Illustrator drawing object: a sharp picture you can double-click to edit here (see below) |
| Other programs, or from the browser version or on macOS and Linux | A high-resolution picture |

In the Windows app, **Paste** (Ctrl+V) takes drawings copied in ChemDraw, and ChemDraw objects copied in PowerPoint or Word, as editable structures, and spectra copied in MestReNova as sharp lines and text. **Edit ▸ Paste Special ▸ Show Clipboard Formats** lists what is on the clipboard, which helps when a paste doesn't come out as expected.

### Editing drawings inside Word, PowerPoint and Excel (Windows)

A drawing copied here and pasted into Word, PowerPoint or Excel is a Chem Illustrator object, as ChemDraw's drawings are. Double-click it (or right-click ▸ **Chem Illustrator Object ▸ Edit**) and it opens here in a tab of its own, named after the document. Change it, press **Save** (Ctrl+S) and the drawing in the document changes too; close the tab when you're done. Word's **Insert ▸ Object ▸ Chem Illustrator Drawing** starts a new one.

- The document keeps a picture of the drawing, so it looks right on computers without Chem Illustrator, in PDFs and when printed. Only editing needs the app.
- Copying the object out of Word and pasting it here gives the drawing back, editable.
- AutoSave doesn't save these tabs: Word gets the drawing when you press Save. If you close the Word document first, the drawing stays here as an unsaved drawing.
- The installed app sets this up the first time it starts, for you only (no administrator needed). **Edit ▸ Settings ▸ File Types** turns it off, and then drawings paste as pictures (which still hold the drawing, so copying one back here keeps it editable). A portable copy leaves it off unless you check it there. Uninstalling removes it.

Tables travel too:

- A table selected on a canvas or slide and copied pastes into Word or Excel as real cells.
- Cells copied from Excel, Word or a spreadsheet here paste onto a canvas or slide as a new table.
- Cells copied from a spreadsheet paste into Excel with their values, and SMILES for structures.

Charts in a spreadsheet have **Copy as Picture** on the **Chart** tab, to paste into Word, PowerPoint, or a document or slide here.

## Split View

Split View puts a canvas beside a document, spreadsheet, presentation or design, so you can draw and write at the same time.

![A canvas beside a document in Split View](../images/split-view.png)

1. In a document, spreadsheet, presentation or design tab, choose **View ▸ Split View: Canvas Beside**. A canvas opens on the right: the first canvas tab, or a new one.
2. Click a side to work on it. Beside a document or spreadsheet, both sides stay live; Ctrl+Z and Ctrl+S act on the side you clicked last. Beside slides or a design, the side you aren't working on shows as a picture until you click it.
3. The bar above the canvas picks another open canvas or a new one. **Insert into Document** (or **Cell**, **Slide** or **Design**) puts the selected structures, or the whole drawing, in at the caret, the selected cell, the slide or the design.
4. Drag the divider to change the widths. The × closes the split; the canvas stays open in its own tab.

## Workspaces

A workspace saves all your open tabs together, so a project's scheme, slides, SI document and data sheet open in one go. Workspaces are in the desktop app only.

1. **File ▸ Workspace ▸ Save Workspace**. A window lists any tabs that have never been saved and offers two choices:
   - **Put copies of files kept in other folders into the workspace folder.** On: everything ends up in one folder. Off: the workspace points to the files where they are.
   - **Save changes to tabs already saved as files.**
2. Click **Choose Folder…**, pick or make a folder, and name the workspace.

The folder then holds your files plus a small `.ciworkspace` file listing the tabs, their order, which tab was showing and any Split View. Tabs never saved are saved there under their tab names; a file that would replace another gets "(2)" added instead.

To open it again, use **File ▸ Workspace ▸ Open Workspace…** or **File ▸ Open**, and pick the `.ciworkspace` file. **Save Workspace** then saves back to the same place, and **Save Workspace As…** saves a new one.

Files inside the workspace folder are listed by name, so you can move or copy the whole folder (to another computer through a cloud drive, say) and it still opens. If a file has been moved or deleted, the rest open and a message names the missing ones.

## AutoSave, recovery and Version History

Every kind of tab (canvases, presentations, spreadsheets, documents and designs) is kept safe in three ways. Set them all in **File ▸ Versions and Recovery ▸ AutoSave and Recovery Options…**.

### Recovery copies

While you work, each tab with unsaved changes is copied every 2 minutes (choose 1 to 30 minutes, or never) to the app's own data folder. Closing the app normally deletes the copies. If it stops without closing (a crash, a power cut, Windows restarting for updates), the next start shows **Recover Unsaved Work**: check the files to reopen and click **Reopen**. Reopened files come back unsaved, under their own names; Save puts a file that had been saved back where it was. **Not Now** keeps the copies for later in **File ▸ Versions and Recovery ▸ Recover Unsaved Work…**, and they are deleted after 7 days (you can change this).

### AutoSave

With AutoSave on, a file that has been saved saves itself a few seconds after your last change (30 seconds unless you change it), and every two minutes or so during long stretches of work. Switch it on for every file in AutoSave and Recovery Options, or for the file showing with **File ▸ AutoSave** (a file never saved is saved first). It is off unless you switch it on.

- AutoSave never writes CSV, TSV or SD files, which keep only one sheet's values.
- If AutoSave can't write a file (a full disk, a network drive gone), a notice says so and AutoSave waits until you save it with Ctrl+S. Your changes are still in the tab and in the recovery copies.
- In a browser, AutoSave works in Chrome and Edge for files opened from or saved to your computer.

### Version History

**File ▸ Versions and Recovery ▸ Version History…** lists earlier versions of the file showing, newest first. A version is kept each time you save, and the file as it was before your first save in each session is kept too, so AutoSave can never lose what was there. While AutoSave is on, it adds a version at most every 10 minutes.

- **Open a Copy** opens a version in a new tab to look at or copy from. The file isn't changed.
- **Restore** puts the version in the tab in place of what it has now. What it had is kept as a version first, so a restore can be undone.
- **Delete** removes a kept version.

Up to 30 versions of each file are kept, for 60 days; both can be changed (0 versions switches Version History off).

### Shared folders and OneDrive (desktop app)

For files kept in OneDrive, SharePoint or a shared lab drive:

- **Changed on disk.** If a file you have open is changed outside Chem Illustrator (by another program, by someone else, or by OneDrive bringing in their changes), a notice offers **Reload**, **Keep Mine** (your next save replaces theirs) or **Open Theirs** (their version in a new tab, to compare). AutoSave waits until you choose. Saving over a changed file asks first. You can choose to reload such files automatically when they have no unsaved changes here, or to ignore changes.
- **Open somewhere else.** While a file is open, a small hidden lock file named `.~lock.<file name>#` sits beside it, in the format LibreOffice uses. When you open a file that someone else has open (in Chem Illustrator, LibreOffice, Word, Excel or PowerPoint), a notice says who and where, and offers **Work on a Copy**. You're told when they close it. The lock file is deleted when you close the file, and can be switched off.
- **OneDrive conflict copies.** When a file changes in two places at once, OneDrive keeps the clashing changes in a copy named with your computer's name (for example `Scheme 1-LAB-PC.cdxml`). A notice offers to open it, so you can copy across what you need.

Recovery copies and versions are kept in a folder named `Kept` in the app's local data folder (on Windows `%LOCALAPPDATA%\io.github.nathanohare.chemillustrator\Kept`), or in the `Chem Illustrator Data` folder of a portable copy. The browser version keeps them in the browser's storage for the page.

## Recent files

**File ▸ Open Recent** lists the last ten files and workspaces you opened or saved, newest first. Click one to open it. If it has been moved or deleted, a message says so and it comes off the list. **Clear Recent Files** empties the list.

The web version keeps a recent list too in Chrome and Edge, which let a page open a file again by itself: the browser asks once for leave to open it. Other browsers (Firefox, Safari) don't allow this, so there the menu stays hidden.

## Printing

**File ▸ Print…** (Ctrl+P) asks a question or two, then opens your system's Print window, where you pick the printer and copies, or save a PDF. In the Windows app the printer, copies and pages are picked in Chem Illustrator's own Print window instead, so pages print at their own size and the right way around (pick **Microsoft Print to PDF** to save a PDF).

| Tab | Choices |
|---|---|
| Canvas | Letter or A4; orientation to suit the drawing, portrait or landscape; actual size (smaller only if it wouldn't fit) or as large as fits |
| Presentation | Full page slides, or handouts with 2, 3 (with lines for notes), 4, 6 or 9 to a page, optionally framed |
| Design | The page at its own size |
| Document | Every page as laid out on screen |
| Spreadsheet | The whole sheet or the selected cells; portrait or landscape; with or without gridlines |

## Fonts

Every font box (the Document ribbon, the text bar while you type a caption, Slide Master, **File ▸ Drawing Style…**) shows the fonts in groups, each name in its own font:

- **Sans:** Inter, Source Sans 3, IBM Plex Sans, Lato
- **Serif:** Source Serif 4, Merriweather, Libre Baskerville
- **Poster:** Montserrat, Oswald, Bebas Neue, Archivo Black, Barlow Condensed
- **Monospace:** JetBrains Mono, IBM Plex Mono
- **On this computer** (folded away; click the heading to open it): Arial, Calibri, Times New Roman and the rest of your installed fonts.

Type in the box to filter the list, or type the name of any font installed on your computer.

The first fourteen are free fonts (SIL Open Font License) that come with the app. When you use them in a document or slide deck, they are saved inside the .docx or .pptx file, so it looks the same in Word or PowerPoint on a computer that doesn't have them. Only the fonts you used are included. Fonts from your own computer are not embedded, as Word does by default for fonts that may not be shared.

Next: [Getting started](getting-started.md) · [Canvas](drawing.md) · [Keyboard and mouse](keyboard-and-mouse.md) · [Presentation](slides.md) · [Document](documents.md) · [Spreadsheet](sheets.md) · [Design](design.md) · [Feedback](feedback.md)
