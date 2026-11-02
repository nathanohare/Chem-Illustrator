# Your libraries and Find Structure in Files

This page covers the two libraries Chem Illustrator keeps for you between sessions, shared by every file and every mode: your **reference library** and your **compound library**. It also covers **File ▸ Find Structure in Files…**, which searches a folder of your files for a structure.

## Where the libraries are kept

Both libraries live in one file. By default it is in the program's own data folder (in the web version, the browser's storage for the page). In the desktop app, **Chemistry ▸ Compound Library ▸ Library Location…** (also **Library Location…** in the reference window) lets you keep it in a folder you pick instead, such as one in OneDrive or on a group drive. The folder then holds `Chem Illustrator Library.json` and a `Chem Illustrator Library PDFs` folder for attached PDFs.

Each save reads what is in the file first and merges it in, so two computers (or two people) using the same folder keep each other's changes. If both change the same reference or compound, the later change wins. Moving the library to a new folder merges what is already there with what you have.

## The reference library

**Insert ▸ Reference Manager…** (in a document, **References** tab ▸ **Manage References…**) opens the references window. **My Library** is the first group in it, above the references of each open file. Copy references from the library into a file, or from a file into the library, with **Copy to…** or by dragging them onto a group's name. A file keeps its own copy, so a file sent to someone else still has its references.

- **Add by DOI…** looks a reference up on Crossref. **Add by PubMed ID…** looks it up on PubMed (type the number, `PMID: 31234567`, or paste the PubMed link; several at once is fine). Both need the internet.
- **Add by Hand…**, **Import BibTeX / RIS…** and **Paste BibTeX / RIS…** work as they do for a file.
- With My Library picked, **Show** filters the list by collection or tag. **Collections…** makes, renames, nests and deletes collections. **Tags and Collections…** sets them for the references picked.
- **Attach PDF…** keeps a PDF with a reference (a 📎 shows in the list), and **Open PDF** opens it in your PDF reader.
- **Sync with Zotero…** brings your Zotero library in: its items, their tags and its collections. It needs your Zotero user number (or a group's number or link) and an API key with read access, made at zotero.org ▸ Settings ▸ Security. Each sync brings only what changed since the last one, and the references here are updated in place, keeping your PDFs and your own tags. The sync only reads from Zotero; nothing is written back to it.

## The compound library

**Chemistry ▸ Compound Library ▸ Compound Library…** opens the list of your compounds: a picture of each, its number, name, formula, mass and the files it appears in.

- **Add Selected** adds the structures selected in the drawing (or right-click a structure ▸ **Add to Compound Library**). The number under a structure comes with it. **Add by Name or SMILES…** adds one by name or SMILES. **Add Numbered from File** adds every numbered structure in the file showing. **Import SD File…** and **Export SD File…** move compounds to and from other programs.
- A compound already in the library is not added twice; its number or name is filled in if it had none.
- **Edit…** (or double-click a compound) changes its number, name, other names, CAS number, tags and notes, and lists the files it is in with an **Open** button for each.
- **Contains Drawn Structure** shows only the compounds containing the structure selected in the drawing; **Show All** shows them all again. The tag list filters by tag.
- **Insert** (also **Insert ▸ Compound from Library…**) puts the compound in the file showing: in a drawing with its number under it, in a document as a drawing, in a spreadsheet in the cell picked.

When you save or open a file, the library notes which of its compounds are in that file (by structure), so a compound's **Files** list fills in as you work. AutoSave doesn't count.

## Find Structure in Files (desktop app)

**File ▸ Find Structure in Files…** searches a folder for a structure: ChemDraw drawings (`.cdxml`, `.cdx`), Word documents, PowerPoint presentations and Excel workbooks.

1. Choose the folder. Leave **And the folders inside it** ticked to search those too.
2. Select a structure in the drawing and click **Use Selected**, or type a name or SMILES. From the compound library, **Find in Files…** starts with the compound picked.
3. Pick **Any structure containing it** (a substructure search, the default) or **Only the same structure**, and click **Search** (or press Enter). **Stop** stops a long search.

Each find says the file, where in it (the drawing, slide 3, figure 2, `Sheet1!B4`), the number under the structure if it has one, and whether it is the same structure or contains it. Double-click a find (or pick it and click **Open**) to open the file at that spot with the structure selected.

Files read once aren't read again until they change, so searching the same folder a second time is quick. That index is kept on this computer only. Up to 20,000 files are searched at a time; pick a smaller folder for more.
