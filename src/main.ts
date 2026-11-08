// The app window: menus, a tab for each open file (drawings, slide decks and sheets), the
// toolbar, the drawing area (with the slide list and notes in Slides mode, or the grid in Sheet
// mode), and the panels on the right.

// the menus made from the command list, before anything looks for their items
import { infoTipsOnOpen } from './ui/info-tip';
import './commands/menus';
import { newDocDesign, setNewDocDesign } from './document/themes';
import { fieldEnv } from './document/fields';
import type { QuickPart } from './document/quick-parts';
import { SLIDE_TABLE_STYLES, DEFAULT_SLIDE_TABLE_STYLE } from './deck/table-styles';
import { commandIcon, RIBBON_ONLY_ICONS } from './ui/command-icons';
import './app.css';
import type { MethylStyle } from './chem/hydrogens';
import { STANDARD_COLOURS, usedColours } from './colours';
import { ICONS } from './icons';
import { Toolboxes, lockIcon, sideFolded, commandButton, defaultToolboxes, menuCommands, boxIds, boxGrid, boxTitle, flyGrid, isEditable, withoutGoneItems, isOwnBox, overflowOf, CONTEXT_BOXES, type ContextBox, type Pickable, type ToolboxDef, type ToolboxState } from './ui/toolboxes';
import { gridItems, inBlock, oneColumn, shownGrid, wrapped, type Grid, type Shown } from './ui/toolbox-grid';
import { ToolboxEditor } from './ui/toolbox-editor';
import { RibbonEditor } from './ui/ribbon-editor';
import { readRibbons, applyRibbon, type RibbonInfo, type RibbonsPrefs } from './ui/ribbon-custom';
import { editPalettes, getPalettes, onPalettes, setPalettes, useDrawingColours, usePaletteMenus } from './ui/palette-ui';
import { Doc, Atom, Bond, type BondDisplay, type Arrow, PARTIAL, Caption, Shape, type TextRun, outsideValence, Contents, CHIRAL_FLAGS, PICTURE_STYLES, type PictureLook, type Attachment, type HighlightStyle, type ShapeMath, PAPER, keepOnPage, type PageSetup, type PageWalls } from './model';
import { Renderer, measureText, forgetTextWidths, WARN_LOOKS, type WarnLook } from './render/renderer';
import { Editor, TOOLS, ringsWereFilled, setMarkTint, type HighlightToggle, type Selection } from './editor/editor';
import { LENGTH_UNITS, setAidTint } from './editor/cursor-aids';
import { BUILT_IN_LOOKS, type HighlightLookPreset } from './ui/highlight-looks';
import { selectionBox, atomsBox, POINTS, type Align, units, moveUnit } from './editor/arrange';
import { defaultColumns } from './editor/grid-arrange';
import { askGridLayout, type GridPick } from './ui/grid-picker';
import { groupSelection, selectedGroups } from './editor/groups';
import { chemistrySelection, loneStructure, repeatsOnAll } from './editor/lone-pick';
import { readCdxml, ReadStats } from './io/cdxml';
import { readCml } from './io/cml';
import { ChemClient } from './chem/client';
import type { FragmentResult } from './worker/chem-worker';
import { COMMON_ADDUCTS } from './chem/hrms';
import { pubchemName, pubchemCid, pubchemCompound, compoundPage, pubchemCidForCas, pubchemSafetyRecord, isCas as isCasNumber } from './chem/pubchem';
import { CasMemory, readCas, casTypoMessage, structureForCas, casForStructure, type CasDeps, type CasFound } from './chem/cas';
import { casHtml, casRuns, type CasState } from './ui/cas-panel';
import { pubchemHtml, pubchemRuns, type PubChemState } from './ui/pubchem-panel';
import { paragraphPages } from './document/doc-file';
import { reviewAuthor, setReviewAuthor } from './document/revisions';
import { NMR_SOLVENTS, NmrPanel } from './ui/nmr-panel';
import { compareMode, nmrQuality, nmrSpectrumMhz, setCompareMode, setNmrQuality, setNmrSpectrumMhz } from './ui/nmr-spectrum';
import { nmrAutoPredict, nmrRange, peakLabels, setNmrAutoPredict, setNmrRange, setPeakLabels } from './ui/nmr-settings';
import { analysisHtml, adductHtml, ionInfo, formulaHtml, electronsHtml, analysisRuns, withRepeats, polymerHtml, descriptorRuns, DEFAULT_DESCRIPTORS, nameHtml, type RepeatUnit, type NameState } from './ui/analysis-panel';
import { attachedAtoms, attachWhereItIs, defaultGap, nearestStructure, placeAttached, structureSig } from './editor/attached';
import { repeatGroups, lipDirection } from './chem/polymer';
import { rGroupsOf, substituted, rowNumbers, parseRows, rGroupCells, type RowMass } from './chem/rgroup';
import type { Rect, Vec } from './geom';
import { isCurved } from './objects';
import { captionPlaces, fragmentRuns } from './chem/fragments';
import { toMolfile, addMolfile } from './chem/molfile';
import { molfileOrSmiles } from './chem/text-molfile';
import { allSpecies, captionChemWarning, captionReading, captionSpecies, chargeSign, chemicalCaptions, groupedIons, placeSpecies, speciesSmiles, type PlacedSpecies } from './chem/species';
import { bestFit, fitMove, fitMatters } from './chem/orient';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { copyDrawing, copyImage, copySvg, drawingSvg, forgetCopy, looksLikeChemistry, extractDrawing, insertDrawing, isEmpty, nativeClipboard, readClipboardText, readNativeClipboard, readPasteEvent, readWebClipboard, clipboardFormats, fitPasted, typicalBondLength, Pasted,
  nativeFirst, writeNativeFormats, looksLikeCdxml, cfHtml, fromCfHtml, CELLS_FORMAT, OWN_FORMAT, CDX_FORMAT, setWordObjects, embeddedPicture, packFormats } from './io/clipboard';
import { cdxToCdxml, cdxmlToCdx } from './io/cdx';
import { writeCdxml } from './io/cdxml-write';
import { WORKSPACE, folderOf } from './io/workspace-file';
import { askLink, followLink, setLinkHost, type LinkPlace } from './ui/links-ui';
import type { LigandLibraryWindow } from './ui/ligand-library';
import { SHOW_JUMPS, SHOW_TOOLS, cellOfLink, keyOfLink, linkSpans, normalizeLink, removeLink, setLink, slideOfLink } from './links';
import { openFileDialog, openManyBytesDialog, openBytesDialog, CSV, openAnyBytesDialog, stampOf, readRef, saveFileDialog, writeFile, showError, baseName, readPath, withExtension, setEmbeddedWriter, KEYMAP_FILE, SETTINGS_FILE, MOL, PDF, SDF, PICTURE, SVG, TIFF, EMF, EPS, PPTX, SLIDES_OPEN_ONLY, DOCX, PICTURE_EXTENSIONS, type FileType } from './io/files';
import { writeTiff } from './render/tiff';
import { itemsToEps } from './render/eps';
import { Workspace, Tab } from './workspace';
import { Deck, LayoutId, WIDE, STANDARD, Image as SlideImage, sizeName, SlideSize, slideBackground, slideColours, type SlideSource, contentArea, deckLayouts, type SizeFit } from './deck/deck';
import { shapeMathPicture, shapeMathScale, shapeMathSize } from './deck/equation';
import { solid } from './deck/background';
import { pictureFormat } from './ui/picture-dialog';
import { fxPng } from './render/picture-fx';
import { drawSlidePage, recordSlide, paintSlide, drawDrawing, SURROUND, type SlidePage } from './deck/slide-view';
import { escapeAction, sameView, type InPlace, type PlaceView } from './ui/in-place';
import { writePdf, jpegInfo, PdfPage, PdfImage } from './io/pdf';
import { SlideList } from './ui/slide-list';
import { CanvasKeys } from './ui/canvas-keys';
import { addKeyframe, insertKeyframe, keyframeAround, keyRect, keysBounds, moveKeyframe, removeKeyframe, unionRect, ZOOM_IN_MAX, TEXTURES, PARALLAX_MAX, type CanvasLook, type CanvasShow, type Texture } from './deck/canvas';
import { mix } from './render/fills';
import { splitCanvas, type SplitSlide } from './deck/canvas-export';
import { DesignLibrary, GEO_DRAG_TYPE, pickDesignSize, sizeLabel, setShapeInk } from './ui/design-panel';
import { ShapeMenu } from './ui/shape-menu';
import { whenIconsLoaded } from './design/icons';
import { SlideTextRibbon } from './ui/slide-text-ribbon';
import { CaptionEditor, setCaptionTint } from './ui/caption-editor';
import { LayersPanel } from './ui/layers-panel';
import { Scrollbars } from './ui/scrollbars';
import type { Presenter, ShowOptions } from './ui/present';
import { editHeaderFooter } from './ui/header-footer-dialog';
import { ReferencesDialog, editReference, type RefHolder } from './ui/references-dialog';
import { docHolder, deckHolder } from './ui/ref-holders';
import { editSlideRefs } from './ui/slide-refs-dialog';
import { chooseRefsToInsert, type RefGroup } from './ui/insert-ref-dialog';
import { deckFormat, lookChanges, refLook, referenceRuns, slideRefBlock } from './deck/slide-refs';
import { fetchDoi, type Reference } from './document/references';
import { citeFormat as citeFormatOf, preferredStyle as preferredCiteStyle } from './document/cite-styles';
import { defaultShow, showOrder } from './deck/show-setup';
import { recordingToWav, NARRATION_NAME } from './deck/narration';
import { clockText } from './deck/show-link';
import type { PresenterView } from './ui/presenter-view';
import { editDrawingStyle } from './ui/style-dialog';
import { usedObjects, type DocText } from './document/document';
import { DARK_PALETTES, darkPaletteNamed, showDarkPage, type DarkPalette } from './dark-page';
import { STYLE_PRESETS, applyStyle, presetNamed, restyleContents, sameLook, styleNamed, type StyleMode } from './drawing-styles';
import { askCleanUpOption } from './ui/cleanup-picker';
import { looksTangled, turnOption } from './chem/cleanup';
import { recordPicture, pictureSvg, pictureCanvas, canvasPng, bitmapScale, EXPORT_MAX_SIDE, EXPORT_MAX_PIXELS } from './render/picture';
import { pngWithDpi } from './render/emf-read';
import { whiteToClear } from './render/background';

import { AnimationUI } from './ui/animation-ui';
import { SlideComments } from './ui/slide-comments';
import type { PptxOptions } from './io/pptx-write';
import { EFFECTS, animName, newAnim, highlightParts } from './deck/animation';
import { askKeyViews } from './ui/key-views';
import { SLIDE_TEMPLATES, applyTemplate, type SlideTemplate } from './deck/templates';
import { showContextMenu, setMenuKeys, topMenuEntry, type MenuItem } from './ui/context-menu';
import { QuickBar } from './ui/quick-bar';
import { SmartPane } from './ui/smart-pane';
import { commandDef } from './commands/registry';
import { defaultHandout, handoutLayout, handoutPageSvg, notesPageSize, notesPageSvg, type HandoutSetup } from './deck/notes-pages';
import { OutlineView } from './ui/outline-view';
import { NotesPageView, editHandoutMaster, editNotesMaster } from './ui/notes-page-view';
import { GuideTip, SlideRulers, drawGuides, gridAndGuides } from './ui/slide-guides';
import { defaultView, guideNear, rulerText, snapMove, type RulerPrefs, type SlideView } from './deck/guides';
import { effectPatch, effectsMenu, showStyleGallery, styleColours, stylePatch } from './ui/shape-styles';
import { CommandSearch, uniqueCommands, type CommandItem } from './ui/command-search';
import { fillTemplate, templateSize } from './design/templates';
import { putDiagram, type DiagramData } from './design/diagrams';
import type { EnergyData } from './design/energy';
import type { PlateData, PlateKind } from './design/plates';
import { refreshZooms, summaryParts, zoomGrid, zoomShape } from './deck/zoom';
import { AUDIO_TYPES, VIDEO_TYPES, mediaMime, probeAudio, probeVideo, speakerPng, filmPng } from './deck/media';
import { newChartBox, sizedBox } from './sheet/chart-box';
import { chartBoxPng } from './render/chart-box-paint';
import { itemsToSvg } from './render/svg';
import { itemsToEmf, type EmfBox } from './render/emf';
import type { Item } from './render/vector';
import { PAPERS, defaultPaper, orient, placeIn, inside, placeSvg, pageSvg } from './print-layout';
import { printPages } from './ui/print';
import { SHEETS } from './io/cdxml-print';
import { dataUrl, fromDataUrl, imageSize, loadImage, onImageReady, pictureMime, showableSrc, webpToPng } from './render/images';
import { freeRing, matchStructure, straightenLinear, fusedRing, placeRing, sprout, ringOnAtom, ringDir, straightenAt } from './chem/chemgeom';
import { Toolbar, ToolbarItem, PaletteDef, type ToolDef } from './ui/toolbar';
import { StylePanel, tidyStyle } from './ui/style-panel';
import { installCombos } from './ui/combo';
import { installFontList, registerBundledFonts, bundledFaces, pdfFonts } from './fonts';
import { applyRibbonIcons } from './ui/ribbon-icons';
import { applyIconSet } from './ui/icon-set';
import { RibbonLive } from './ui/ribbon-live';
import { installRibbonFlyouts } from './ui/ribbon-flyout';
import { buildColourGalleries, buildSelectGalleries } from './ui/select-gallery';
import { TEMPLATES, Template, templateById, ownTemplates, setOwnTemplates, templateFromAtoms, placeTemplate, freePlacement } from './chem/templates';
import { freeLigandFor, loadFullLigands, placeFreeLigand } from './chem/expand';
import { centreEnd, haptoLook } from './chem/hapto';
import { viewNow, viewRingOf, type RingView } from './chem/ring-views';
import { countElectrons } from './chem/electrons';
import { addNicknames, removeNickname, isBuiltInNickname, builtInNicknames, labelPrefs, alkylPrefs, ALKYL_LOOKS, type AlkylLook, tokenize as tokenizeLabel } from './chem/labels';
import { restyleAlkyl } from './text/alkyl-restyle';
import { selectedGroup } from './chem/group-smiles';
import { templateIcon } from './ui/template-icons';
import { StructureChecks } from './chem/warnings';
import { idText, labelClashes, parseIdStart, type IdStyle } from './chem/compound-numbers';
import { schemeItems, isReactionArrow, reactionSteps, itemFinder, plainMeasure } from './chem/reaction';
import { stoichiometryBook, type StoichRow, type StoichRole } from './chem/stoichiometry';
import { isReactionSmiles, isRxn, parseRxn, reactionSmiles, rxnBlock, splitReactionSmiles } from './chem/reaction-io';
import { showBalance } from './ui/balance-dialog';
import { withoutCharge } from './chem/formula';
import { ORBITAL_KINDS, ORBITAL_LOOKS, angleOfDir, openDirection, orbitalAtom, orbitalShapes, orbitalsAmong, putOrbital, readAngle, readOrbital, redrawOrbital, takenDirections, type OrbitalKind, type OrbitalLook, type OrbitalSpec } from './chem/orbitals';
import { BATCH_FORMATS, BATCH_INPUTS, readBatchFile, smilesLine, uniqueName, writeBatchItem, type BatchDeps, type BatchFormat } from './io/batch-convert';
import { zipSync } from 'fflate';
import { labelsOf, schemePrefs, setSchemePrefs, SPACING, type SchemePrefs } from './chem/scheme-layout';
import { plainText, savableChar } from './richtext';
import { buildTextToolbox, type TextToolboxHooks } from './ui/text-toolbox';
import { buildTextBar } from './ui/text-bar';
import { buildGuidesToolbox, GUIDES_INFO, type GuidesToolboxHooks } from './ui/guides-toolbox';
import { htmlToRich } from './text/html';
import { LiveStereo } from './chem/live-stereo';
import { setStereoShown, shownDescriptor, axialStyle } from './chem/stereo';
import { keymap, COMMAND_NAMES, registerToolNames, displayChord, actionName, chordOf, parseAction, KeyContext, KeyOverrides } from './editor/keymap';
import { loadSettings, saveSettings, settingsLocation, exportText, importSettings, Settings, SLIDE_PANE_MIN, SLIDE_PANE_MAX, NOTES_MIN, NOTES_MAX } from './settings';
import { arrowGaps } from './chem/mechanism';
import { HotkeysDialog } from './ui/hotkeys-dialog';
import { TypingDialog } from './ui/typing-dialog';
import { ModeColoursDialog, ModeColours, DEFAULT_MODE_COLOURS, applyModeColours as applyModeColoursOnly, modeColour } from './ui/mode-colours';
import { typingPrefs, setTypingPrefs, onTypingPrefs } from './text/typing';
import { NicknameChooser } from './ui/nickname-chooser';
import { ask, askChoice, type Field } from './ui/ask';
import { ACTION_LINKS, geoShapeStyle } from './design/geo';
import { BuildHint } from './ui/build-hint';
import { alkylSwatch, bondEndSwatch, chargeSwatch, counterionSwatch, cursorAidSwatch, mechanismPreview, methylSwatch, problemSwatch, saltSwatch, navigationPreview, schemePreview, pageGridPreview, readingPreview, stylePreview } from './ui/settings-previews';
import { AUTO_STEPS_DEFAULTS, markPieces, stepAnims, stepClicks, stepPieces, type AutoStepsOptions, type StepPiece } from './deck/auto-steps';
import { UpdateUI } from './ui/update-ui';
import { canUpdate, appVersion, portableInfo, STAGE, STAGE_NOTE, UPDATE_CHANNELS, type UpdateChannel } from './updates';
import { computerName } from './feedback';
import { guideSpot } from './ui/guide-spot';
import type { GuideWindow, GuideHeading } from './ui/guide-window';
import { SettingsWindow, type SettingsHost, type SettingsPage } from './ui/settings-window';
import { fileTypesPage, FILE_TYPES, APPS_PAGE_TITLE } from './ui/file-types-page';
import { watchRibbons, fitRibbons, setRibbonCollapsed, ribbonCollapsed, addLookToggle, repaintArrows } from './ui/ribbon-fit';
import { CANVAS_TABS, CanvasRibbon } from './ui/canvas-ribbon';
import { AnalysisBox, WarningsBox } from './ui/canvas-ribbon-boxes';
import { placeTitleBar, titleBarPlace } from './ui/title-bar';
import { canScaleUi, setUiScale, stepUiScale, uiScale, UI_SCALES } from './ui/ui-scale';
import { installTouchUi, keypadShowing, markSketch, setTouchMode, showKeypad, touchMode, touchOn } from './ui/touch-ui';
import { FeedbackDialog } from './ui/feedback-dialog';
import { addRecent, removeRecent, recentLabel } from './recent';
import { canKeepHandles, forgetHandles, handleFor, isHandleEntry, keepHandle } from './recent-handles';
import { groupWarnings } from './ui/warning-groups';
import { NameReader, captionName, attachmentAtoms, cxNotes } from './chem/names';
import { Model3dBuilder } from './chem/model3d';
import { StructureNamer, confirmedName, nameRuns, type NameTools } from './chem/namer';
import { placeView } from './chem/place3d';
import type { ConformerTools, Viewer3d } from './ui/viewer3d';
import { DEFAULT_XTB, KCAL_PER_HARTREE, refineWithXtb, type XtbOptions } from './chem/xtb';
import type { Model3d } from './chem/model3d-build';
import { mergeConformers } from './chem/conformer-rank';
import { groupLabel, neighbours, newmanConformers, newmanView, norm360, sameAtomOrder, torsion, type NewmanConformer, type NewmanGroup } from './chem/newman';
import { extrema, fitProfile, type Extremum, type Profile } from './chem/torsion-profile';
import { torsionCsv, type TorsionData } from './design/torsion';
import type { ChartChoice } from './ui/newman-chart-tab';
import { parseNewmanPrefs, structureKey, type NewmanData, type NewmanLook, type NewmanPrefs } from './design/newman';
import { depthCues } from './editor/perspective';
import type { NewmanChoice } from './ui/newman-dialog';
import { chargeAndMultiplicity, xyzFile, type QmOptions } from './chem/qm-input';
import { NameDialog } from './ui/name-dialog';
import { SequenceDialog } from './ui/sequence-dialog';
import { ArrangeDialog } from './ui/arrange-dialog';
import type { AnimateDialog } from './ui/animate-dialog';
import { PeriodicTable } from './ui/periodic-table';
import type { SheetMode, ClipboardCells } from './ui/sheet-mode';
import type { DocumentMode, DocPaste } from './ui/doc-mode';
import { askReviewName } from './ui/review-name';
import { docBoxPrefs, docRulerPrefs, formulaBarPrefs, parseDocPins } from './ui/mode-prefs';
import { setScreenMeasure, figures } from './document/doc-file';
import type { DocxDeps } from './io/docx-write';
import type { DocxReadDeps } from './io/docx-read';
import { FIGURE_MARGIN } from './document/figures';
import { recordPages } from './document/doc-paint';
import { preferredStyle, setPreferredStyle } from './document/cite-styles';
import { layoutTable } from './table';
import { SheetChem } from './sheet/sheet-chem';
import { structureDoc, structureMolfile } from './sheet/structure-doc';
import { StructurePictures } from './ui/structure-pictures';
import { LabelTooltip } from './ui/label-tooltip';
import { ToolTip } from './ui/tool-tip';
import { toolHelp, allKeys, statusHint, arrowHandleHelp, shapeHandleHelp, splitTitle, withoutKeys } from './ui/tool-help';
import { starAtoms } from './chem/label-tip';
import { structurePlace } from './sheet/layout';
// sheet and document files' readers and writers load the first time one is opened or saved
import type { SheetFileDeps } from './io/sheet-files';
import { fromEmbedSource, type Embedded } from './io/ole-object';
import { objectPicture, type ObjectPicture } from './render/object-picture';
import { ACS_1996, BOND_END_CHOICES, bondEndPrefs, DocStyle, docMapLook, MAP_LOOKS, mapLookPrefs, type MapBoxStyle, type MapLook } from './style';
import { DEFAULT_DEPTH_SHADE, depthShadePrefs } from './render/depth-shade';
import { emptyTable, tableFromCells } from './table';
import type { TableData } from './model';
import { checkDrawing, checkDocument, checkWorkbook, repeatedTitles, structureAlt, setStructureAlt, type Issue, type IssuePlace } from './accessibility';
import { AccessibilityPane, askAltText } from './ui/accessibility-pane';
import type { PreflightPane } from './ui/preflight-pane';
import { shapeBox } from './objects';
import { SlideComparePane } from './ui/slide-compare';
import { pickFileTemplate } from './ui/file-templates';
import type { PastedRows } from './io/table-clip';
import { Keeper } from './keep/keeper';
import { choose as chooseButtons, notice } from './ui/keep-ui';
import { runZoteroOn, type ZoteroCommand } from './document/zotero-live';
import { DeckStore, type DeckZoteroHost } from './deck/zotero-deck';
import { DEFAULT_KEEP, type KeepPrefs } from './keep/prefs';
import { Brush, paintObjects, pickObjectLook, type ObjectLook, type TextLook } from './format-painter';
import { popupMenu } from './ui/popup-menu';
import { favoriteSummary, freshFavoriteName, ribbonFavorites, withFavorite, type FormatFavorite } from './ui/format-favorites';
import { SymbolWindow } from './ui/symbol-window';
import { Navigator, EdgeArrows, paintGrid, paintTint, type Target } from './ui/orientation';
import { type OrientPrefs, DEFAULT_ORIENT } from './orientation-prefs';
import { type PageLook, type Side, DEFAULT_PAGE_LOOK, SIDES, SIDE_NAMES, pageExtent, extentRect, pageCount, pageKey, scrollBox, wallRect, wallsOf, setWall, usedPages, pagesToPrint, fixedCount, crossesWalls, clampMove, insetWalls, wrapPieces } from './page-grid';
import { paintPages } from './ui/page-grid-view';
import { addRecent as addRecentSymbol } from './text/symbols';
import type { CellBlock } from './sheet/workbook';
import { DEFAULT_AI, type AiPrefs } from './ai/link';
import type { AssistantAction, AssistantMode, SendItem } from './ai/assistant';
import { cappedText, TEXT_CAP } from './ai/assistant';
import type { AssistantBar } from './ui/assistant-bar';
import { aiSettingsDialog } from './ui/ai-settings';
import { freeSpace } from './editor/free-space';
import { canReadStructures, importPictureFiles, importPdfDrawings, MOST_PAGES, pdfDrawings, type ImportHost } from './ui/import-structures';
import { placeRead } from './recognise/check';
import { Diagnostics, catchErrors, errorReport, formatEntry, stamp, type LogEntry, type UnexpectedClose } from './diagnostics';
import { keepStore, getText, putText } from './keep/store';
import { Library, storePlace, folderPlace, readPlaceChoice, writePlaceChoice, LIBRARY_FILE } from './library/library-store';
import { compoundBySmiles, newId, noteMentions, type LibCompound, type LibSpectrum } from './library/library';
import { fetchPubmed, type ZoteroLink } from './library/online';
import { structuresIn, foundInContents, foundInDocument, foundInWorkbook, foundInFile, type Found, type Spot, type FileReaders } from './library/structures';
import { parseIndex, indexText } from './library/file-index';
import { libraryHolder } from './ui/library-refs';
import type { CompoundLibraryWindow, CompoundLibraryHost, StructureIn } from './ui/compound-library';
import type { KnowledgeBaseHost, KnowledgeBaseWindow } from './ui/knowledge-base';
import { joinAttachment, looksLikeSmiles } from './kb/tables';
import type { FindInFilesWindow, FindInFilesHost, ListedFile } from './ui/find-in-files';
import { later, madeLater } from './lazy';

// dialogs for slides, design and charts load the first time they open
const askEquation = later(() => import('./ui/equation-dialog'), 'askEquation');
const formatBackground = later(() => import('./ui/background-dialog'), 'formatBackground');
const setUpShow = later(() => import('./ui/show-setup-dialog'), 'setUpShow');
const editCustomShows = later(() => import('./ui/show-setup-dialog'), 'editCustomShows');
const editMaster = later(() => import('./ui/master-dialog'), 'editMaster');
const pickSlideTemplate = later(() => import('./ui/slide-templates'), 'pickSlideTemplate');
const editLayouts = later(() => import('./ui/layout-editor'), 'editLayouts');
const pickSlideSize = later(() => import('./ui/slide-size-dialog'), 'pickSlideSize');
const pickTemplate = later(() => import('./ui/template-gallery'), 'pickTemplate');
const askCycle = later(() => import('./ui/cycle-dialog'), 'askCycle');
const askEnergy = later(() => import('./ui/energy-dialog'), 'askEnergy');
import type { EnergyStructureHooks } from './ui/energy-dialog';

// help text in data-info attributes becomes an "i" beside its header as each window opens
infoTipsOnOpen();
const askNewman = later(() => import('./ui/newman-dialog'), 'askNewman');
const newmanSettings = later(() => import('./ui/newman-settings'), 'newmanSettings');
const askPlate = later(() => import('./ui/plate-dialog'), 'askPlate');
const askMo = later(() => import('./ui/mo-dialog'), 'askMo');
const askCrystal = later(() => import('./ui/crystal-dialog'), 'askCrystal');
const askDiagram = later(() => import('./ui/diagram-dialog'), 'askDiagram');
const editChart = later(() => import('./ui/chart-editor'), 'editChart');
const editMedia = later(() => import('./ui/media-dialog'), 'editMedia');
const pickReuseSlides = later(() => import('./ui/reuse-slides'), 'pickReuseSlides');
// and windows most sessions never open
const showLabCalculator = later(() => import('./ui/lab-calc-dialog'), 'showLabCalculator');

// Crash handling (src/diagnostics.ts): errors nothing else caught go to a log kept on this computer,
// with a notice offering to report them through Send Feedback. The desktop app (not the iPad, whose
// apps the system ends whenever it likes) also notices when it stopped without closing last time.
const iPadApp = isTauri() && /Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1;
// NMR prediction is a desktop feature: its data (about 48 MB) is past what the browser version may
// download, and the iPad app leaves it out (the builds for both drop public/nmr).
const nmrHere = (isTauri() && !iPadApp) || import.meta.env.DEV;
// (one copy of the desktop app runs at a time, so a marker left by another stopped, however recent)
const diagnostics = new Diagnostics({ store: keepStore(), markers: isTauri() && !iPadApp, oneCopy: true });
// (shown once the page has finished setting up: an error while it starts can come before the notice can show)
catchErrors(window, { diagnostics, show: (e) => setTimeout(() => { try { errorNotice(e); } catch { /* the page never finished starting */ } }, 0) });
const lastClose = diagnostics.start().catch(() => null);

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const doc = new Doc();
const host = $<HTMLDivElement>('#canvas-host');
const scene = $<HTMLCanvasElement>('#scene');
const overlay = $<HTMLCanvasElement>('#overlay');
const renderer = new Renderer(scene, overlay);
const editor = new Editor(doc, renderer, host);

/**
 * Colour the window for a mode; in Canvas mode the selection, hover and drawing marks and the box
 * round text being typed take the mode's teal too, so the accent is the same everywhere (UI rule 5).
 */
function applyModeColours(mode: Parameters<typeof applyModeColoursOnly>[0], c: ModeColours): void {
  applyModeColoursOnly(mode, c);
  const tint = mode === 'drawing' ? modeColour('drawing', c) : null;
  setMarkTint(tint);
  setAidTint(tint);
  setCaptionTint(tint);
  editor.requestScene();
}
const chem = new ChemClient(document.baseURI);
const checks = new StructureChecks(doc);
renderer.checks = checks;
// R/S and E/Z for every structure, worked out in the background after each change
const live = new LiveStereo(doc, (jobs) => chem.stereo(jobs));
doc.stereo = live;
live.onChange = (atoms, bonds) => {
  checks.recheck(atoms);
  checks.recheck(bonds.flatMap((id) => { const b = doc.bonds.get(id); return b ? [b.a1] : []; }));
  const all = renderer.previewStereo;
  for (const id of atoms) {
    const a = doc.atoms.get(id);
    if (a && (all || a.showStereo || a.stereoLabel)) doc.dirtyRects.push({ x1: a.x, y1: a.y, x2: a.x, y2: a.y });
  }
  for (const id of bonds) {
    const b = doc.bonds.get(id);
    if (!b || !(all || b.showStereo || b.stereoLabel)) continue;
    const p = doc.atoms.get(b.a1)!, q = doc.atoms.get(b.a2)!;
    doc.dirtyRects.push({ x1: Math.min(p.x, q.x), y1: Math.min(p.y, q.y), x2: Math.max(p.x, q.x), y2: Math.max(p.y, q.y) });
  }
  editor.requestScene();
  scheduleAnalysis();
  // the style panel shows R/S and E/Z of what is selected
  stylePanel.refresh();
};
function updateStereo(): void {
  if (chem.ready) void live.update();
}
const startMs = performance.now();

// Split view (View > Split View): a drawing beside a document, sheet or slides.
/** The share of the width the drawing takes (settings.json). */
let splitWidth = 0.38;
/** Your own drawing styles, and the style each kind of new tab starts with (settings.json). */
let ownStyles: DocStyle[] = [];
let modeStyles: Partial<Record<StyleMode, string>> = {};
/** The style each mode's new tabs take when you haven't chosen one: slides are seen from the back of a room, so their structures are twice ACS size. */
const MODE_STYLE_DEFAULTS: Partial<Record<StyleMode, string>> = { slides: 'Slides (ACS 1996 × 2)' };
const modeStyleFor = (mode: StyleMode): string | undefined => modeStyles[mode] ?? MODE_STYLE_DEFAULTS[mode];
/** View > Reading Mode: on or off, which palette, and your own palettes. */
const dark = { on: false, palette: 'Graphite', own: [] as DarkPalette[] };
/** Finding your way round drawings (Settings ▸ Navigation): navigator, edge arrows, dot grid, outside tint, Fit and Go to Selection buttons. */
let orientPrefs: OrientPrefs = { ...DEFAULT_ORIENT };
/** How the drawing's page grid looks, and what a paste past a fixed edge does (Settings ▸ Page Grid). */
let pageLook: PageLook = { ...DEFAULT_PAGE_LOOK };
/** Beside slides: the deck whose drawing is being worked on (the drawing's tab shows; the slide is a picture). */
let slideSplit: Tab | null = null;
/** Beside a document or sheet: the drawing has the keys and menus (it was clicked last). */
let splitDrawing = false;

// ---------------------------------------------------------------- layout

function resize(): boolean {
  const r = host.getBoundingClientRect();
  // hidden (a sheet is showing): keep the last size
  if (r.width < 1 || r.height < 1) return false;
  if (!renderer.resize(r.width, r.height, window.devicePixelRatio || 1)) return false;
  editor.requestScene();
  return true;
}
// resizing a canvas blanks it: when the window or a panel beside the drawing changes size,
// paint again at once, before the browser shows the blank canvas (a flicker)
// a slide, page or drawing still fitted to the window is fitted again, so a smaller window never cuts it off
new ResizeObserver(() => {
  const refit = editor.stillFitted;
  if (!resize()) return;
  if (refit) editor.fit();
  editor.frame();
}).observe(host);

// ---------------------------------------------------------------- toolbar

const ARROWS: PaletteDef = {
  palette: 'arrows',
  title: 'Arrows',
  items: [
    { name: 'arrow', title: 'Reaction arrow. Shift+drag from an arrow\'s end or middle to branch a new arrow off it' },
    { name: 'arrow-dashed', title: 'Dashed arrow' },
    { name: 'arrow-hollow', title: 'Arrow with a hollow head' },
    { name: 'arrow-double', title: 'Resonance arrow (heads at both ends)' },
    { name: 'arrow-equilibrium', title: 'Equilibrium arrows' },
    { name: 'arrow-retro', title: 'Retrosynthetic arrow' },
    { name: 'arrow-nogo', title: 'Crossed-out arrow (reaction does not go)' },
    { name: 'arrow-nogo-hash', title: 'Hashed-out arrow (reaction does not go)' },
    { name: 'arrow-dipole', title: 'Dipole arrow (the crossed end is the positive end)' },
    { name: 'arrow-curved', title: 'Curved arrow (electron pair). Drag from an atom or bond to an atom or bond and it snaps like a mechanism arrow; hold Alt or Space to draw freely' },
    { name: 'arrow-fishhook', title: 'Curved half-headed arrow (one electron). Snaps between atoms and bonds like the curved arrow; hold Alt or Space to draw freely' },
    { name: 'arrow-s', title: 'S-shaped curved arrow (two bends), for electrons that have to go around something. Snaps like the curved arrow; hold Alt to draw freely' },
    { name: 'arrow-s-fishhook', title: 'S-shaped half-headed arrow (one electron, two bends). Snaps like the curved arrow; hold Alt to draw freely' },
  ],
};

const SHAPES: PaletteDef = {
  palette: 'shapes',
  title: 'Frames',
  items: [
    { name: 'shape-rect', title: 'Rectangle' },
    { name: 'shape-rect-rounded', title: 'Rounded rectangle' },
    { name: 'shape-rect-shadow', title: 'Rectangle with shadow' },
    { name: 'shape-rect-rounded-shadow', title: 'Rounded rectangle with shadow' },
    { name: 'shape-rect-dashed', title: 'Dashed rectangle' },
    { name: 'shape-oval', title: 'Oval (Shift: circle)' },
    { name: 'shape-oval-shadow', title: 'Oval with shadow (Shift: circle)' },
    { name: 'shape-circle', title: 'Circle, drawn from its center' },
    { name: 'shape-circle-filled', title: 'Filled circle, drawn from its center' },
    { name: 'shape-line', title: 'Line' },
    { name: 'shape-line-dashed', title: 'Dashed line' },
    { name: 'shape-line-bold', title: 'Bold line' },
    { name: 'shape-freeform', title: 'Freeform: click each point (drag to curve through it); click the first point to close, double-click to end open' },
  ],
};

const BRACKETS: PaletteDef = {
  palette: 'brackets',
  title: 'Brackets',
  items: [
    { name: 'bracket-square', title: 'Square brackets [ ]' },
    { name: 'bracket-round', title: 'Parentheses ( )' },
    { name: 'bracket-curly', title: 'Braces { }' },
    { name: 'bracket-ts', title: 'Transition-state brackets: square brackets with ‡ at the upper right' },
    { name: 'bracket-left', title: 'Single bracket [ (left half only)' },
    { name: 'bracket-right', title: 'Single bracket ] (right half only)' },
  ],
};

const SYMBOLS: PaletteDef = {
  palette: 'symbols',
  title: 'Mechanism symbols',
  items: [
    { name: 'sym-lonepair', title: 'Lone pair: click an atom to put one in its most open space, or press on the atom and drag around it to aim it (Alt: 15° steps)' },
    { name: 'sym-radical', title: 'Radical dot: click an atom (it becomes a radical); drag around the atom to aim it' },
    { name: 'sym-plus', title: 'Circled plus: click an atom to give it a + charge shown in a circle; drag around the atom to aim it' },
    { name: 'sym-minus', title: 'Circled minus: click an atom to give it a − charge shown in a circle; drag around the atom to aim it' },
    { name: 'sym-delta-plus', title: 'Partial positive charge (δ+): click an atom' },
    { name: 'sym-delta-minus', title: 'Partial negative charge (δ−): click an atom' },
    { name: 'sym-radical-cation', title: 'Radical cation (•+): click an atom or a bracket; an atom becomes a radical with a + charge' },
    { name: 'sym-radical-anion', title: 'Radical anion (•−): click an atom or a bracket; an atom becomes a radical with a − charge' },
    { name: 'sym-dagger', title: 'Dagger (†), for a footnote or a compound' },
    { name: 'sym-ddagger', title: 'Double dagger (‡) for a transition state' },
    { name: 'sym-lobe', title: 'Single orbital lobe: click an atom to put one in its most open space, or press on the atom and drag around it to aim it (Alt: 15° steps). Uses the phases and size last picked in the Orbital window; double-click it to change it' },
  ],
};

// The person's own templates; the first button saves the selected structure as a new one
const OWN_ADD = 'own-template-add';
const OWN_PALETTE: PaletteDef = {
  palette: 'tpl-own',
  title: 'My templates',
  items: [{ name: OWN_ADD, title: 'Save Selection as Custom Template' }],
  columns: 4,
  large: true,
  // (in the open fly-out the save button is a plain teal "+"; on the bar it keeps its own icon)
  icon: (name, size) => {
    if (name === OWN_ADD) return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" style="color: var(--accent)" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>`;
    const t = templateById(name.slice(4));
    return t ? templateIcon(t, size) : ICONS[name] ?? name;
  },
};

// Template palettes, one per kind of structure
// 3-D templates kept off the palettes until they are redrawn; Fuse a Ring Here still uses some of them.
const OFF_PALETTE = new Set([
  'boat-ae', 'twist-boat', 'half-chair', 'half-chair-ae', 'cyclohexanone', 'envelope', 'envelope-ae', 'c5-twist', 'cyclopentene',
  'cyclobutane', 'cyclobutane-ae', 'cyclopropane-ae', 'c7-twist-chair', 'c8-boat-chair', 'c8-crown', 'cot-tub',
  'cis-bicyclooctane', 'perhydroazulene', 'twistane',
]);
const templatePalette = (group: Template['group'] | Template['group'][], palette: string, title: string, columns: number, iconSize?: number, first: { name: string; title: string }[] = []): PaletteDef => ({
  palette,
  title,
  items: [...first, ...TEMPLATES.filter((t) => (Array.isArray(group) ? group.includes(t.group) : t.group === group) && !OFF_PALETTE.has(t.id)).map((t) => ({ name: `tpl-${t.id}`, title: t.name }))],
  columns,
  large: true,
  iconSize,
  icon: (name, size) => { const t = templateById(name.slice(4)); return t ? templateIcon(t, size) : ICONS[name] ?? name; },
});
/** The Ligands palette's first button: the Ligand Library window. */
const LIGAND_LIBRARY_OPEN = 'ligand-library-open';

/** Turning structures in perspective: as a flat sheet (as ChemDraw does), or in their real 3-D shape. */
const PERSPECTIVE_TOOLS: PaletteDef = {
  palette: 'perspective',
  title: 'Perspective',
  items: [
    { name: 'perspective', title: 'Perspective: drag a structure to tilt it in 3-D as a flat sheet (Shift: 15° steps)' },
    { name: 'perspective-3d', title: '3-D Perspective: drag a structure to turn its real 3-D shape, built from the drawing; wedges and bold bonds say which shape is meant (Shift: 15° steps)' },
  ],
  columns: 2,
};

/** The wedges that are drawn from scratch: solid, hollow and wavy (the hashed wedge has its own button). */
const WEDGES: PaletteDef = {
  palette: 'wedges',
  title: 'Wedges',
  items: [
    { name: 'bond-wedge', title: 'Wedge. Click again to reverse' },
    { name: 'bond-hollowWedge', title: 'Hollow wedge. Click again to reverse' },
    { name: 'bond-wavyWedge', title: 'Wavy wedge: the wave widens away from the stereocenter. Click again to reverse' },
  ],
  columns: 3,
};

/** Dashed lines between atoms: a dashed bond, a hydrogen bond and an ionic bond. */
const DASHES: PaletteDef = {
  palette: 'dashes',
  title: 'Dashed and Non-Covalent Bonds',
  items: [
    { name: 'bond-dash', title: 'Dashed bond' },
    { name: 'bond-hydrogen', title: 'Hydrogen bond: drag from the H to the acceptor. Dotted, and leaves both atoms\' hydrogens as they were' },
    { name: 'bond-ionic', title: 'Ionic bond: drag from the positive end. Dashed, and leaves both atoms\' hydrogens as they were' },
  ],
  columns: 3,
};

/** Bonds to the middle of a ring: hapto (to a metal) and variable attachment (a group on one of its atoms). */
const HAPTO_TOOLS: PaletteDef = {
  palette: 'hapto',
  title: 'Hapto and Variable Attachment',
  items: [
    { name: 'bond-hapto', title: 'Hapto (η) bond: drag from a metal into a ring or onto a π-bond to bond it to the middle (η⁵-Cp, η⁶-arene, η²-alkene); click inside a ring or on a bond for a new metal there. Click a hapto bond to draw it to each atom' },
    { name: 'bond-variable', title: 'Variable attachment: drag from a group into a ring to put it on one of the ring\'s atoms, then click ring atoms to add or take them out' },
  ],
  columns: 2,
};

/** Box select, with the lasso (freehand) on the same button. */
const SELECT_TOOLS: PaletteDef = {
  palette: 'select',
  title: 'Select',
  items: [
    { name: 'select', title: 'Select and move: drag a box around what to select' },
    { name: 'lasso', title: 'Lasso select: drag a loop around what to select, to pick pieces out of a crowded scheme' },
  ],
  columns: 2,
};

const TOOL_GROUPS: ToolbarItem[][] = [
  [
    SELECT_TOOLS,
    { name: 'eraser', title: 'Eraser' },
  ],
  [
    { name: 'bond-single', title: 'Single bond. Click a bond: single, double, triple' },
    { name: 'bond-double', title: 'Double bond. Click again to move the second line' },
    { name: 'bond-triple', title: 'Triple bond' },
    WEDGES,
    { name: 'bond-hashWedge', title: 'Hashed wedge. Click again to reverse' },
    { name: 'bond-hash', title: 'Hashed bond' },
    { name: 'bond-bold', title: 'Bold bond' },
    DASHES,
    { name: 'bond-partial', title: 'Partial bond: one forming or breaking in a transition state, drawn dashed. It leaves both atoms\' hydrogens as they were (hotkey P over a bond)' },
    { name: 'bond-wavy', title: 'Wavy bond' },
    { name: 'bond-dative', title: 'Dative bond: draw from the donor atom to the acceptor. Click again to reverse' },
    HAPTO_TOOLS,
    { name: 'chain', title: 'Chain: drag to draw a zig-zag chain, or click to type how many atoms (Alt+click: the same number again)' },
  ],
  // the everyday tools next, where they show without scrolling
  [
    { name: 'text', title: 'Text: click an atom to label it, or empty space for a caption' },
    ARROWS,
    SYMBOLS,
    BRACKETS,
    SHAPES,
    { name: 'fragment', title: 'Mass fragmentation: drag a line across bonds (or click a bond) to break them and label each piece with its formula and mass' },
    PERSPECTIVE_TOOLS,
    { name: 'newman', title: 'Newman Projection: click a single bond to see it end on. The end you click nearer is in front' },
    { name: 'sketch', title: 'Sketch (for a pen): draw freehand. Lines become bonds, a loop with corners a ring, a circle benzene (inside a ring: aromatic), letters label atoms (C N O S P F Cl Br I H, + −), a scribble erases' },
  ],
  [
    // (the aromatic rings first: the ones drawn most)
    { name: 'ring-benzene', title: 'Benzene. Shift+click swaps the double bonds; Ctrl+click draws it with a circle' },
    { name: 'ring-cp', title: 'Cyclopentadiene. Ctrl+click draws it with a circle' },
    { name: 'ring-3', title: 'Cyclopropane' },
    { name: 'ring-4', title: 'Cyclobutane' },
    { name: 'ring-5', title: 'Cyclopentane' },
    { name: 'ring-6', title: 'Cyclohexane' },
    { name: 'ring-7', title: 'Cycloheptane' },
    { name: 'ring-8', title: 'Cyclooctane' },
  ],
  [
    templatePalette('rings', 'tpl-rings', 'Ring systems', 5),
    templatePalette('heterocycles', 'tpl-heterocycles', 'Heterocycles', 7),
    templatePalette('amino', 'tpl-amino', 'Amino acids', 5, 64),
    templatePalette('sugars', 'tpl-sugars', 'Sugars (Haworth)', 5, 64),
    templatePalette('nucleic', 'tpl-nucleic', 'Nucleic acids: bases, nucleosides and nucleotides', 6, 64),
    templatePalette(['conformers', 'fused'], 'tpl-conformers', 'Conformers and fused rings in 3-D', 5, 64),
    templatePalette(['projections', 'stereo'], 'tpl-projections', 'Projections and stereocenters', 6, 56),
    templatePalette('cycloalkanes', 'tpl-cycloalkanes', 'Large rings', 6, 56),
    templatePalette('aromatics', 'tpl-aromatics', 'Aromatics', 6, 56),
    templatePalette('perspective', 'tpl-perspective', 'Rings in perspective', 6, 56),
    templatePalette(['geometries', 'organometallic'], 'tpl-metal', 'Metal complexes', 6, 64),
    templatePalette('metallocenes', 'tpl-metallocenes', 'Metallocenes and half-sandwich complexes', 6, 64),
    templatePalette('ligands', 'tpl-ligands', 'Ligands', 6, 64, [{ name: LIGAND_LIBRARY_OPEN, title: 'Ligand Library: several hundred ligands by family, to find and use (Chemistry > Metals > Ligand Library)' }]),
    OWN_PALETTE,
  ],
];

/** Tools kept off the bar, still reached by their keys, Search and the menus (Chemistry > Periodic Table). */
const OFF_BAR: ToolbarItem[] = [
  { name: 'bond-quadruple', title: 'Quadruple bond (metal–metal)' },
  { name: 'element', title: 'Periodic table: pick an element, then click atoms to change them' },
];

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
/** Text that names the Ctrl key, as a Mac reads it (Cmd: the app takes ⌘ wherever it takes Ctrl). */
const macKeys = (text: string) => (isMac ? text.replace(/\bCtrl\+/g, 'Cmd+') : text);
// the ribbons' and menus' own tool tips, once
if (isMac) for (const el of document.querySelectorAll<HTMLElement>('[title*="Ctrl+"]')) el.title = macKeys(el.title);

/** The keys that do an action, as people read them. */
function keysOf(ctx: KeyContext, action: string): string[] {
  return keymap.keysFor(ctx, action).map((k) => displayChord(k, isMac));
}

// Tool names for the Hotkeys window: the tool tip up to its first full stop or colon.
const toolNames: Record<string, string> = {};
/** Each tool's whole tooltip, as its button has it. */
const toolTitles: Record<string, string> = {};
for (const group of [...TOOL_GROUPS, OFF_BAR]) {
  for (const item of group) {
    for (const t of 'palette' in item ? item.items : [item]) { toolTitles[t.name] = t.title; toolNames[t.name] = t.title.replace(/\s*\(.*?\)/g, '').split(/[.:] /)[0]; }
  }
}
registerToolNames(toolNames);

/** Each fly-out palette by name, and the palette each tool in one comes in (for its picture). */
const PALETTES = new Map<string, PaletteDef>();
const TOOL_PALETTE = new Map<string, PaletteDef>();
for (const group of TOOL_GROUPS) for (const item of group) {
  if (!('palette' in item)) continue;
  PALETTES.set(item.palette, item);
  for (const t of item.items) TOOL_PALETTE.set(t.name, item);
}
/** What the Drawing Tools toolbox comes with: the tool bar's groups, a divider between each. */
const MAIN_ITEMS: string[] = TOOL_GROUPS.flatMap((g, i) => [...(i ? ['sep'] : []), ...g.map((it) => ('palette' in it ? `pal:${it.palette}` : `tool:${it.name}`))]);

const periodicTable = new PeriodicTable((z) => editor.pickElement(z), () => editor.element);
const toolbar = new Toolbar($<HTMLDivElement>('#tools'), TOOL_GROUPS, (name) => {
  if (name === OWN_ADD) { void saveTemplate(); return; }
  if (name === LIGAND_LIBRARY_OPEN) { openLigandLibrary(); return; }
  pickTool(name);
}, (name) => {
  const keys = keysOf('space', `tool ${name}`);
  return keys.length ? ` (${keys.join(', ')})` : '';
}, (name, size) => TOOL_PALETTE.get(name)?.icon?.(name, size));

// The Canvas ribbon: the chemistry commands without a toolbox of their own (Smart Schemes, energy
// diagrams, mechanism checks, look-ups), with Analysis and the warnings in two small boxes
/** The Canvas ribbon's Font and Paragraph groups: their rows, filled once the text hooks are made (further down). */
let canvasTextRows: { font: HTMLElement; paragraph: HTMLElement } | null = null;
let canvasFont: { refresh(): void } | null = null;
// (NMR prediction is desktop only: its ribbon groups are left out elsewhere)
if (!nmrHere) for (const t of CANVAS_TABS) t.groups = t.groups.filter((g) => g.name !== 'NMR');
const canvasRibbon = new CanvasRibbon({
  command: (cmd) => { command(cmd); },
  pickTool: (name) => pickTool(name),
  hasTool: (name) => name in TOOLS,
  icon: (it) => ('cmd' in it ? commandIcon(it.cmd) ?? RIBBON_ONLY_ICONS[it.cmd] ?? ICONS[it.cmd] : ICONS[it.tool]),
  textGroups: (font, paragraph) => { canvasTextRows = { font, paragraph }; },
  pasteMenu: (r) => { popupMenu(r.left, r.bottom + 2, [['Paste', () => command('paste')], ['Paste SMILES', () => command('paste-smiles')]]); },
}, $('#sheet-ribbon'));
const analysisBox = new AnalysisBox($('#analysis-section'));
const warningsBox = new WarningsBox($('#warnings-section'));
canvasRibbon.bodyEnd.append(analysisBox.el);
canvasRibbon.tabEnd.append(warningsBox.button);
canvasRibbon.el.addEventListener('cr-tab', () => fitRibbons());

// (the Canvas ribbon's tabs stay put; what is selected brings out its context toolbox)
const showRibbonContext = () => { contextBoxes.follow(); };

/**
 * The context toolboxes (Smart Schemes, Diagrams, Tables and Charts, Perspective and 3-D) come out
 * while their kind of object is selected and go away with it. One opened by hand stays open, and
 * one closed while its object is still selected stays closed until that selection goes.
 */
const contextBoxes = {
  /** Set once the toolboxes are made (selections can change before that). */
  ready: false,
  auto: new Set<ContextBox>(),
  dismissed: new Set<ContextBox>(),
  wanted(): Set<ContextBox> {
    const s = editor.sel;
    const want = new Set<ContextBox>();
    if (s.shapes.size + s.captions.size + s.arrows.size + s.atoms.size && editor.selectedSmart() !== null) want.add('schemes');
    for (const id of s.shapes) {
      const sh = doc.shapes.get(id);
      if (!sh) continue;
      if (sh.smart) want.add('schemes');
      if (sh.energy || sh.torsion || sh.newman || sh.diagram) want.add('diagrams');
      if (sh.table || sh.chart || sh.plate) want.add('tables');
    }
    for (const id of s.atoms) {
      const a = doc.atoms.get(id);
      if (a && (a.xyz || a.depth !== undefined)) { want.add('perspective'); break; }
    }
    return want;
  },
  follow(): void {
    if (!this.ready) return;
    const want = this.wanted();
    for (const id of CONTEXT_BOXES) {
      const shown = toolboxes.isShown(id);
      if (want.has(id)) {
        // (closed by hand while its object is still selected: left closed)
        if (this.auto.has(id) && !shown) { this.auto.delete(id); this.dismissed.add(id); }
        if (!shown && !this.dismissed.has(id)) { this.auto.add(id); toolboxes.toggle(id, true); }
      } else {
        this.dismissed.delete(id);
        if (this.auto.delete(id) && shown) toolboxes.toggle(id, false);
      }
    }
  },
  /** View > Toolboxes: shown or hidden by hand, it stays that way. */
  byHand(id: ContextBox): void {
    this.auto.delete(id);
    toolboxes.toggle(id);
    if (!toolboxes.isShown(id)) this.dismissed.add(id);
  },
};

// Design mode's shape library (made further down, once the page is ready)
let designLib: DesignLibrary | null = null;
/** Insert > Shapes in Slides and Documents. */
const shapeMenu = new ShapeMenu();
let layers: LayersPanel | null = null;
let animUi: AnimationUI | null = null;
let slideCmts: SlideComments | null = null;
/** View > Ruler and Gridlines (kept in the settings); the rulers' units and where they count from. */
const slideLook = { ruler: false, grid: false };
/** Presentation and Design keep the side panel's Warnings and Analysis hidden until asked for (View > Show). */
const chemPanes = { warnings: false, analysis: false };
function showChemPanes(): void {
  document.body.classList.toggle('show-warnings-pane', chemPanes.warnings);
  document.body.classList.toggle('show-analysis-pane', chemPanes.analysis);
  for (const b of document.querySelectorAll<HTMLInputElement>('[data-cmd="view-warnings-pane"]')) b.checked = chemPanes.warnings;
  for (const b of document.querySelectorAll<HTMLInputElement>('[data-cmd="view-analysis-pane"]')) b.checked = chemPanes.analysis;
}
const rulerPrefs: RulerPrefs = { units: 'in', from: 'centre' };
/** A guide being dragged: which, and the guides as they are while it moves. */
let guideDrag: { which: { axis: 'x' | 'y'; i: number }; view: SlideView } | null = null;
/**
 * Smart guides (moved things snap into line with other things and the page, with pink lines), on
 * or off for presentations (View > Grid Settings) and designs (the ribbon's Guides box). Canvases
 * have the Guides toolbox instead.
 */
const guidesOn: Record<'slides' | 'design', boolean> = { slides: true, design: true };
const guideMode = (): keyof typeof guidesOn | null => {
  const m = ws.active.mode;
  return m === 'slides' || m === 'design' ? m : null;
};
/** The Guides toolbox, while it is shown (it shows the drawing's guides). */
let guidesToolbox: { refresh(): void } | null = null;
/** The Text Formatting toolbox's buttons, while it is shown (they show which are on). */
let textToolbox: { refresh(): void } | null = null;
/** Turn the smart guides on or off for the kind of tab showing, and show the drawing's guides in the Guides toolbox. */
function showGuides(): void {
  guidesToolbox?.refresh();
  textToolbox?.refresh();
  const m = guideMode();
  editor.smartGuides = !!m && guidesOn[m];
  if (m === 'design') $<HTMLInputElement>('#dz-guides').checked = guidesOn.design;
}

editor.onToolChange = (name) => {
  toolbar.setActive(name);
  markSketch(name === 'sketch');
  for (const b of document.querySelectorAll<HTMLElement>('.tb-tool')) b.classList.toggle('active', b.dataset.tool === name);
  designLib?.setActive(name);
  toolStep = 0;
  showToolStatus();
  showRibbonContext();
};
let statusReady = false;
/** Which step of the tool in use the status bar marks (0: the first; 1 once the mouse is pressed). */
let toolStep = 0;
/** The tool's name as its button says it ("Wedge", "Curved arrow (electron pair)"). */
function toolLabel(name: string): string {
  const title = toolTitles[name];
  return title ? splitTitle(title, false).name : name.startsWith('geo:') ? 'Shape' : TOOLS[name]?.kind === 'template' ? 'Template' : name;
}
/**
 * The status bar for the tool in use, step by step, with the keys that change it; with one arrow
 * or shape selected (by the Select tool, or an arrow tool on an arrow), what each of its handles does.
 */
function showToolStatus(): void {
  // (the first tool is picked before the tabs exist: its hint comes once they do)
  if (!statusReady) { queueMicrotask(() => { statusReady = true; showToolStatus(); }); return; }
  if (stepHintOn || (ws.active.mode === 'sheet' || ws.active.mode === 'document') && !splitDrawing) return;
  // while text is typed: the keys that work in it
  if (typingKeys) {
    const keys = typingKeys.split(' · ').map((k): [string, string] => { const i = k.indexOf(': '); return [k.slice(0, i), k.slice(i + 2)]; });
    setStatus({ name: 'Typing', steps: [], numbered: false, at: -1, keys, full: typingKeys });
    return;
  }
  const name = editor.toolName, t = TOOLS[name];
  const sel = editor.sel;
  // one arrow or shape selected: what its handles do
  let one: { name: string; handles: string[] } | null = null;
  if (sel.atoms.size + sel.bonds.size + sel.captions.size === 0 && sel.arrows.size + sel.shapes.size === 1) {
    const r = sel.arrows.size ? editor.doc.arrows.get([...sel.arrows][0]) : undefined;
    const sh = sel.shapes.size ? editor.doc.shapes.get([...sel.shapes][0]) : undefined;
    one = r ? arrowHandleHelp(r) : sh && (sh.kind === 'rect' || sh.kind === 'oval' || sh.kind === 'line') ? shapeHandleHelp(sh.kind === 'line') : null;
  }
  const s = statusHint({ name, label: toolLabel(name), t, st: editor.statusState(), step: toolStep, one, key: (action, ctx = 'command') => keysOf(ctx, action)[0] });
  // (the same hint again leaves the bar alone: this runs on every change to the drawing)
  if (lastStatus && $('#hint').classList.contains('steps') && JSON.stringify(s) === JSON.stringify(lastStatus)) return;
  setStatus(s);
}
/** The keys that work in the text being typed ("Enter: new paragraph · …"), shown in the status bar; null when nothing is typed. */
let typingKeys: string | null = null;
CaptionEditor.onHint = (h) => { typingKeys = h; showToolStatus(); };
/** The hint the status bar shows now (to fit it again when the window changes width). */
let lastStatus: { name: string; steps: string[]; numbered: boolean; at: number; keys: [string, string][]; full: string } | null = null;
/** The status bar's step-by-step hint: the tool, its steps (the one in hand marked), then its keys. */
function setStatus(s: { name: string; steps: string[]; numbered: boolean; at: number; keys: [string, string][]; full: string }): void {
  const el = $('#hint');
  const esc = (x: string) => x.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  const kbd = (k: string) => `<kbd>${esc(isMac ? k.replace(/^Ctrl\b/, '⌘').replace(/^Alt\b/, '⌥') : k)}</kbd>`;
  const steps = s.steps.map((x, i) => `<span class="st-step${s.numbered && i < s.at ? ' done' : ''}${s.numbered && i === s.at ? ' now' : ''}">${s.numbered ? `<i>${i + 1}</i>` : ''}${esc(macKeys(x))}</span>`);
  el.innerHTML = `<b class="st-tool">${esc(s.name)}</b>${steps.join(s.numbered ? '<span class="st-sep">›</span>' : '<span class="st-sep">·</span>')}`
    + s.keys.map(([k, what]) => `<span class="st-key">${kbd(k)} ${esc(what)}</span>`).join('');
  el.classList.add('steps');
  el.title = s.full;
  lastStatus = s;
  fitStatus(el);
}
/**
 * Drop whole hints from the end of the status bar until the rest fit, never leaving one cut off
 * ("Double-…"): the keys go first (the last first), then the steps after the one in hand. All of
 * them are in the bar's tooltip.
 */
function fitStatus(el: HTMLElement): void {
  const over = () => el.scrollWidth > el.clientWidth + 1;
  if (!el.clientWidth) return;
  while (over()) {
    const keys = el.querySelectorAll('.st-key');
    if (keys.length) { keys[keys.length - 1].remove(); continue; }
    const steps = [...el.querySelectorAll('.st-step')];
    const last = steps.length > 1 ? steps[steps.length - 1] : null;
    if (!last || last.classList.contains('now')) break;
    if (last.previousElementSibling?.classList.contains('st-sep')) last.previousElementSibling.remove();
    last.remove();
  }
}
// (a wider window has room for the hints dropped again)
window.addEventListener('resize', () => { const el = $('#hint'); if (lastStatus && el.classList.contains('steps')) setStatus(lastStatus); });
// resting the mouse on a tool: what it does and the keys that change it
const toolTip = new ToolTip((b) => {
  const name = b.dataset.tipTool!, t = TOOLS[name];
  const title = b.getAttribute('aria-label') ?? toolTitles[name] ?? name;
  const known = !!t || name.startsWith('geo:');
  const h = known ? toolHelp(name, t) : null;
  const { name: label, rest } = splitTitle(title, !!h && allKeys(h).length > 0);
  return { name: label, hotkey: keysOf('space', `tool ${name}`)[0] ?? '', body: rest || (h ? withoutKeys(h.what) : ''), keys: h ? allKeys(h) : [], more: b.dataset.tipMore };
}, isMac);
// the step in hand: pressing on the drawing starts the second step, letting go goes back to the first
host.addEventListener('pointerdown', (e) => { if (e.button === 0 && toolStep === 0) { toolStep = 1; showToolStatus(); } });
window.addEventListener('pointerup', () => { if (toolStep) { toolStep = 0; showToolStatus(); } });

/** The status bar's hint: its first sentence, short enough to read at a glance; the whole of it when you point at it. */
function setHint(text: string): void {
  const el = $('#hint');
  text = macKeys(text);
  el.classList.remove('steps');
  const dot = text.search(/\.(\s|$)/);
  let short = dot > 0 ? text.slice(0, dot + 1) : text;
  // a second short sentence fits too ("Ctrl+drag to copy. Hold Shift while dragging to lock orientation.")
  const rest = text.slice(short.length);
  const dot2 = rest.search(/\.(\s|$)/);
  if (dot > 0 && dot2 > 0 && short.length + dot2 + 1 <= 80) short = text.slice(0, short.length + dot2 + 1);
  const semi = short.indexOf('; ');
  if (short.length > 90 && semi > 0) short = short.slice(0, semi) + '.';
  el.textContent = short;
  el.title = short === text ? '' : text;
}
// a hint for the step in hand (drawing an arrow through points), and back to the tool's own after
/** A hint for the step in hand is showing (it stays until the editor takes it back). */
let stepHintOn = false;
editor.onHint = (text) => { stepHintOn = !!text; if (text) setHint(text); else editor.onToolChange(editor.toolName); };
editor.onNotice = (text, ms) => flash(text, ms);
// a drag under way, or the keyboard highlight coming or going: the status bar's hints follow
editor.onStatus = () => { if (statusReady) showToolStatus(); };
// Canvas mode starts on Select (the marquee, Space), as new and opened drawings do too
editor.setTool('select');

// tablets: bigger buttons, long-press menus, double taps and the atom keypad (View > Window and Colours > Touch Mode)
installTouchUi({
  canvasHost: host,
  keypad: (atom, bond) => editor.keypad(atom, bond),
  command: (cmd) => { command(cmd); },
  say: (msg) => flash(msg),
  changed: (on) => $('[data-cmd="atom-keypad"]')?.setAttribute('aria-checked', String(on && keypadShowing())),
}, 'auto');

// ---------------------------------------------------------------- top bar actions

/** The quick bar beside the menus (made once the toolboxes are, further down). */
let quickBar: QuickBar | null = null;

/** Developer > Stress Test: how many drug-sized molecules it can draw. */
const STRESS_SIZES = [100, 500, 2000, 5000];
$('#help-hotkeys').addEventListener('click', () => { $<HTMLDialogElement>('#help').close(); hotkeysDialog.open(); });
$('#help-close').addEventListener('click', () => $<HTMLDialogElement>('#help').close());
/** View > Show R/S Preview: every R/S and E/Z label in red, on screen only. */
function previewStereo(on: boolean): void {
  renderer.previewStereo = on;
  $('[data-cmd="show-stereo"]')?.setAttribute('aria-checked', String(on));
  renderer.repaintAll();
  editor.requestScene();
}

// The webview's own right-click menu (Back, Refresh, Save as, Inspect) is no use in the app, and
// its Refresh reloads it: left out wherever the app gives no menu of its own, except in text boxes
// (cut, copy, paste and spelling there). Caught on the way in, before anything over the slide
// (a shape's own handler, say) can stop it reaching the window (laptop bench pp-effects-masters).
if (isTauri()) {
  window.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, [contenteditable=""], [contenteditable="true"]')) return;
    e.preventDefault();
  }, true);
}

// Files dropped on the window: pictures go on the drawing or slide, other files open in tabs
// (the desktop app leaves drops to the page: tauri.conf.json's dragDropEnabled is off, which
// WebView2 needs for dragging inside the page, such as PivotTable fields, too).
const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  host.classList.add('drop');
});
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) host.classList.remove('drop'); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  host.classList.remove('drop');
  void dropFiles([...(e.dataTransfer?.files ?? [])], { x: e.clientX, y: e.clientY });
});

async function dropFiles(files: File[], at: { x: number; y: number }): Promise<void> {
  const r = host.getBoundingClientRect();
  const inside = at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom;
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    // a crystal structure: into the crystal structure window, to turn and place
    if (/\.cif$/i.test(f.name) && !sheetActive() && !docActive()) { await plateFigure('crystal', null, { name: f.name, text: new TextDecoder().decode(bytes) }); continue; }
    const mime = /\.(cdxml|cdx|cds|mol|mdl|rxn|mrv|ket|cml|json|pptx|xlsx|xlsm|xls|ods|docx|csv|tsv|txt|sdf?)$/i.test(f.name) ? null : pictureMime(f.name, bytes);
    if (mime && sheetActive()) flash('Pictures can\'t go in a cell yet. Drop sheet files (.xlsx, .csv, .sdf) to open them.');
    else if (mime && docActive()) docMode.dropPicture(bytes, mime);
    else if (mime) placePicture(bytes, mime, inside ? renderer.toDoc(at.x - r.left, at.y - r.top) : null);
    else await ws.openBytes(bytes, f.name);
  }
}

// ---------------------------------------------------------------- cut, copy and paste

/** True when keys go into a text box rather than to the drawing. */
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range', 'color', 'file'].includes((el as HTMLInputElement).type);
}

/** True when some text on the page (not the drawing) is selected, so Ctrl+C should copy that. */
function textSelected(): boolean {
  const s = document.getSelection();
  return !!s && !s.isCollapsed && s.toString().trim() !== '';
}

/** Copy the selection, or the whole drawing when nothing is selected. */
function copy(): Promise<void> {
  return copyDrawing(doc, editor.hasSelection() ? editor.sel : null).then(flash, (err) => flash('Could not copy: ' + String(err)));
}

async function cut(): Promise<void> {
  if (!editor.hasSelection()) { flash('Select something to cut.'); return; }
  let msg: string;
  try {
    msg = await copyDrawing(doc, editor.sel);
  } catch (err) {
    flash('Could not copy: ' + String(err));
    return;
  }
  editor.deleteSelection();
  flash(msg.replace(/^Copied/, 'Cut'));
}

function paste(): void {
  void pasteFrom(nativeClipboard ? readNativeClipboard : readWebClipboard);
}

// In a browser, Ctrl+V arrives as a paste event, which carries the clipboard's text.
window.addEventListener('paste', (e) => {
  if (isTyping(e.target) || (e.target as HTMLElement | null)?.closest?.('dialog')) return;
  e.preventDefault();
  if (sheetActive()) { void sheetMode.paste(nativeClipboard ? null : e); return; }
  if (docActive()) { void docMode.paste(nativeClipboard ? null : e); return; }
  if (nativeClipboard) paste();
  else void pasteFrom(() => readPasteEvent(e));
});

async function pasteFrom(read: () => Pasted | Promise<Pasted>): Promise<void> {
  let got: Pasted;
  try {
    got = await read();
  } catch (err) {
    flash('Could not paste: ' + String(err));
    return;
  }
  // a Smart Scheme's dashed species box selected: what is pasted becomes that species
  const holder = editor.selectedHolder();
  if (holder !== null) { await pasteIntoSpeciesBox(holder, got); return; }
  if (got.kind === 'drawing') {
    if (isEmpty(got.doc)) { flash('There is nothing to paste.'); return; }
    // on slides, structures can take the slide master's bond length; elsewhere they keep their size
    const deck = deckNow();
    fitPasted(got.doc, doc.style, deck?.master.fitPasted ? deck.master.drawing.bondLength : undefined);
    // a scheme too big for the slide's content area is made smaller to fit it, below the title
    const area = slideContentArea(), b = got.doc.bounds(), L = typicalBondLength(got.doc);
    if (area && b && L) {
      const k = Math.min(1, (0.95 * (area.x2 - area.x1)) / Math.max(1, b.x2 - b.x1), (0.95 * (area.y2 - area.y1)) / Math.max(1, b.y2 - b.y1));
      if (k < 0.999) fitPasted(got.doc, doc.style, L * k);
    }
    doc.edit('Paste', () => {
      editor.sel = insertDrawing(doc, got.doc, pastePoint());
      editor.placeClear(placingPage());
    });
    editor.changed();
    await keepPasteInside();
  } else if (got.kind === 'text') await pasteText(got.text, got.html);
  else if (got.kind === 'picture') placePicture(got.bytes, got.mime, null);
  else if (got.kind === 'table') pasteTable(got.rows);
  else flash('There is nothing to paste.');
}

/** A structure pasted into a Smart Scheme's dashed species box: a drawing, a SMILES string or a molfile. */
async function pasteIntoSpeciesBox(holder: number, got: Pasted): Promise<void> {
  let drawing: Doc | null = null;
  if (got.kind === 'drawing' && !isEmpty(got.doc) && got.doc.atoms.size) { fitPasted(got.doc, doc.style); drawing = got.doc; }
  else if (got.kind === 'text') {
    const mb = chem.ready ? await molfileOrSmiles(got.text.trim(), (t) => chem.smilesToMol(t)) : null;
    const c = mb ? molContents(mb) : null;
    if (c) drawing = structureDoc(c, doc.style);
  }
  if (!drawing) { flash('There is no structure on the clipboard to put in this species: copy a structure, a SMILES string or a molfile.', 6000); return; }
  editor.fillSpeciesBox(holder, drawing);
}

/** Cells from Excel, Word or a sheet become a table in the ACS style, with the first row as headings. */
function pasteTable(rows: PastedRows): void {
  const t = tableFromCells(rows, textMeasure, doc.style.captionSize);
  placeTable(t, 'Paste table');
  flash(`Pasted a table of ${t.rows.length} rows and ${t.cols.length} columns. Double-click a cell to type; the Style panel has its rows, columns and lines.`, 7000);
}

const textMeasure = (t: string, size: number, family: string, style: string) => measureText(t, size, family, style);

/** Put a table in the middle of the window (or slide), selected. */
function placeTable(t: TableData, label: string, top?: Vec): number {
  finishTyping();
  renderer.useStyle(doc);
  const lay = renderer.tableLayout(t);
  const c = top ?? pasteCentre();
  const x1 = c.x - lay.width / 2, y1 = top ? top.y : c.y - lay.height / 2;
  let id = 0;
  doc.edit(label, () => { id = doc.addShape({ kind: 'table', x1, y1, x2: x1 + lay.width, y2: y1 + lay.height, table: t }).id; });
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set([id]) };
  editor.tablePart = { id, part: { r: 0, c: 0 } };
  editor.changed();
  return id;
}

/** The table style last picked for a slide table (PowerPoint's default, Medium Style 2 – Accent 1, at first). */
let lastTableStyle = DEFAULT_SLIDE_TABLE_STYLE;

/** Insert > Table: an empty table of the rows and columns asked for, ready to type into. */
async function insertTable(): Promise<void> {
  finishTyping();
  // on slides the look is a choice: a journal's ACS rules, or a PowerPoint style
  const onSlide = !!deckNow();
  const got = await ask('Insert Table', [
    { name: 'rows', label: 'Rows', value: '4', type: 'number' },
    { name: 'cols', label: 'Columns', value: '3', type: 'number' },
    ...(onSlide ? [{ name: 'style', label: 'Style', value: lastTableStyle, options: [{ value: '', label: 'ACS rules' }, ...SLIDE_TABLE_STYLES.map((st) => ({ value: st.id, label: st.name }))] }] : []),
  ], { ok: 'Insert', note: onSlide ? 'The Style panel changes the style, its options, the cells\' colors and which cells are merged.' : 'An ACS-style table: a rule above and below the heading row and under the last row. The Style panel changes the lines, headings, rows and columns.' });
  if (!got) return;
  const rows = Math.max(1, Math.min(500, Math.round(Number(got.rows) || 4)));
  const cols = Math.max(1, Math.min(60, Math.round(Number(got.cols) || 3)));
  if (onSlide) lastTableStyle = got.style ?? '';
  // columns centred (the Style panel lines up each column its own way)
  const t0 = { ...emptyTable(rows, cols, doc.style.captionSize), align: Array(cols).fill('center') };
  const id = placeTable(onSlide && got.style ? { ...t0, style: got.style } : t0, 'Insert table');
  editor.editTable(id, { r: 0, c: 0 });
}

/** The part of the slide showing that pasted things go in (below the title), in Slides mode. */
function slideContentArea(): Rect | null {
  const deck = deckNow();
  // a canvas slide has no edge: things go where the window is, as on a drawing
  return deck && !deck.current?.canvas ? contentArea(deck.current?.layout ?? 'blank', deck.size, deck.master) : null;
}

/** The page things put down are kept on (the slide; none on a drawing or a canvas slide). */
function placingPage(): { w: number; h: number } | undefined {
  const deck = deckNow();
  return deck && !deck.current?.canvas ? deck.size : undefined;
}

/** Where pasted things go: the middle of the slide's content area in Slides mode, else the middle of the window. */
function pasteCentre(): { x: number; y: number } {
  const a = slideContentArea();
  return a ? { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 } : renderer.toDoc(renderer.width / 2, renderer.height / 2);
}

/**
 * Where a paste goes: under the mouse when it is on the drawing (Ctrl+V), else as pasteCentre;
 * it is then moved clear of what is already there (placeClear).
 */
function pastePoint(): { x: number; y: number } {
  return ((!deckNow() || deckNow()?.current?.canvas) && editor.mouseOnPage) || pasteCentre();
}

/** Paste a SMILES string or a molfile as a structure. With `quiet`, text that isn't one is left (false) without a message. */
async function pasteChemistry(text: string, quiet = false): Promise<boolean> {
  if (!chem.ready) { flash('The chemistry engine is still loading.'); return true; }
  const c = pastePoint();
  if (isRxn(text) || isReactionSmiles(text)) return pasteReaction(text.trim(), c);
  let mb: string | null = text.includes('M  END') ? text : null;
  if (!mb && !/\s/.test(text)) mb = await chem.smilesToMol(text);
  if (!mb) { if (!quiet) flash('Paste a SMILES string or a molfile.'); return false; }
  try {
    let ids: number[] = [];
    doc.edit('Paste', () => {
      ids = addMolfile(doc, mb!, c.x, c.y);
      editor.sel = { atoms: new Set(ids), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() };
      editor.placeClear(placingPage());
    });
    selectNewAtoms(ids);
    await keepPasteInside();
  } catch (err) {
    flash(String(err));
  }
  return true;
}

/**
 * Pasted text on a drawing, slide or design: a SMILES string or a molfile becomes a structure;
 * other text (a Document's, Word's, a web page's) a text box in the middle, with its bold,
 * italics, sub- and superscripts and colours from the HTML that came with it.
 */
async function pasteText(text: string, html?: string): Promise<void> {
  if (looksLikeChemistry(text) && await pasteChemistry(text, true)) return;
  const rich = html ? htmlToRich(html) : null;
  // (the drawing's caption font and size, as typed text gets)
  const runs = (rich?.runs ?? [{ text } as TextRun]).map(({ size: _s, font: _f, obj: _o, ...r }: TextRun) => r).filter((r) => r.text);
  if (!runs.length) { flash('There is nothing to paste.'); return; }
  const paras = rich && rich.paras.length > 1 ? rich.paras : undefined;
  finishTyping();
  renderer.useStyle(doc);
  const c = pastePoint();
  // long text wraps: to the slide's content area, or about 25 bond lengths on a drawing
  const area = slideContentArea();
  const most = area ? area.x2 - area.x1 : doc.style.bondLength * 25;
  const frame = (wrap?: number) => renderer.captionFrame({ id: -1, x: 0, y: 0, runs, justify: 'left', ...(paras ? { paras } : {}), ...(wrap ? { wrap } : {}) } as Caption);
  let b = frame();
  const wrap = b.x2 - b.x1 > most ? most : undefined;
  if (wrap) b = frame(wrap);
  let id = 0;
  doc.edit('Paste text', () => {
    id = doc.addCaption({ x: c.x - (b.x1 + b.x2) / 2, y: c.y - (b.y1 + b.y2) / 2, runs, justify: 'left', ...(paras ? { paras } : {}), ...(wrap ? { wrap } : {}) }).id;
    editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set([id]), arrows: new Set(), shapes: new Set() };
    editor.placeClear(placingPage());
  });
  editor.changed();
}

/** Insert ▸ Catalytic Cycle…: a ready-made cycle to edit, or the selected structures put round one. */
async function insertCycle(): Promise<void> {
  finishTyping();
  const got = await askCycle(editor.selectedStructures().length);
  if (got) editor.insertCycle(got.spec, got.look, pasteCentre(), deckNow()?.size);
}

/** The Energy Diagram window's preview: the diagram as it will be drawn, fitted to the canvas. */
function paintEnergyPreview(d: EnergyData, canvas: HTMLCanvasElement): void {
  const { doc: tmp, box } = editor.energyPreview(d);
  const w = canvas.clientWidth || 360, h = canvas.clientHeight || 200, dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bw = box.x2 - box.x1, bh = box.y2 - box.y1, pad = 8;
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  ctx.setTransform(k * dpr, 0, 0, k * dpr, (w / 2 - (box.x1 + bw / 2) * k) * dpr, (h / 2 - (box.y1 + bh / 2) * k) * dpr);
  drawDrawing(ctx, tmp);
}

/** Insert ▸ Energy Diagram…, or the selected diagram's numbers to change (`id`, its frame). */
async function energyDiagram(id: number | null): Promise<void> {
  finishTyping();
  const L = doc.style.bondLength;
  const now = id !== null ? doc.shapes.get(id)?.energy ?? null : null;
  const got = await askEnergy(now, { w: Math.round(18 * L), h: Math.round(12 * L) }, paintEnergyPreview, async (mb) => (await chem.layouts(mb))[0] ?? null, energyStructureHooks);
  if (got) editor.putEnergyDiagram(got, pasteCentre(), now ? id! : undefined, deckNow()?.size);
}

/** A molfile drawn on its own, in this drawing's style, as contents (null when it can't be read). */
function molContents(mb: string, attach: number[] = []): Contents | null {
  const tmp = new Doc();
  tmp.style = { ...doc.style };
  try { tmp.bulk(() => { addNamed({ mb, attach }, 0, 0, tmp); }); } catch { return null; }
  return tmp.atoms.size ? tmp.contents() : null;
}

/** The Energy Diagram window's Structure column: drawn in the drawing area, pasted, or from a name. */
const energyStructureHooks: EnergyStructureHooks = {
  edit: (contents, title) => new Promise((resolve) => editCellStructure(contents, title, (c) => resolve(c), doc.style)),
  async paste() {
    let p: Pasted;
    try { p = nativeClipboard ? await readNativeClipboard() : await readWebClipboard(); } catch (e) { return { error: 'Could not read the clipboard: ' + String(e) }; }
    if (p.kind === 'drawing' && !isEmpty(p.doc)) { fitPasted(p.doc, doc.style); return p.doc.contents(); }
    if (p.kind === 'text') {
      const mb = await molfileOrSmiles(p.text, (s) => chem.smilesToMol(s));
      const c = mb ? molContents(mb) : null;
      if (c) return c;
    }
    return { error: 'There is no structure on the clipboard: copy one (or a SMILES or molfile) first.' };
  },
  async fromText(text) {
    if (!/\s/.test(text.trim()) && /[=#()\[\]@]|^[BCNOPSFIclbrcnops0-9]+$/.test(text.trim())) {
      const mb = await chem.smilesToMol(text.trim()).catch(() => null);
      const c = mb ? molContents(mb) : null;
      if (c) return c;
    }
    const got = await nameToMolfile(text);
    if ('error' in got) return { error: got.error };
    return molContents(got.mb, got.attach) ?? { error: 'The structure could not be drawn.' };
  },
  thumb(contents, canvas) {
    const tmp = structureDoc(contents, doc.style);
    const b = tmp.bounds();
    const ctx = canvas.getContext('2d');
    if (!b || !ctx) return;
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const k = Math.min(1, (w - 6) / Math.max(1, b.x2 - b.x1), (h - 6) / Math.max(1, b.y2 - b.y1));
    ctx.setTransform(k * dpr, 0, 0, k * dpr, (w / 2 - ((b.x1 + b.x2) / 2) * k) * dpr, (h / 2 - ((b.y1 + b.y2) / 2) * k) * dpr);
    drawDrawing(ctx, tmp);
  },
};
editor.onEnergy = (id) => void energyDiagram(id);

/** The TLC Plate and Gel windows' preview: the plate as it will be drawn, fitted to the canvas. */
function paintPlatePreview(d: PlateData, canvas: HTMLCanvasElement): void {
  const { doc: tmp, box } = editor.platePreview(d);
  const w = canvas.clientWidth || 360, h = canvas.clientHeight || 200, dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bw = box.x2 - box.x1, bh = box.y2 - box.y1, pad = 8;
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  ctx.setTransform(k * dpr, 0, 0, k * dpr, (w / 2 - (box.x1 + bw / 2) * k) * dpr, (h / 2 - (box.y1 + bh / 2) * k) * dpr);
  drawDrawing(ctx, tmp);
}

/** Insert ▸ Lab Figures ▸ TLC Plate… or Gel…, or the selected plate's lanes to change (`id`, its frame). */
async function plateFigure(kind: PlateKind | null, id: number | null, file?: { name: string; text: string }): Promise<void> {
  finishTyping();
  const now = id !== null ? doc.shapes.get(id)?.plate ?? null : null;
  const k = now?.kind ?? kind ?? 'tlc';
  const got = k === 'mo' ? await askMo(now, doc.style, paintPlatePreview, (d, w) => editor.moRoom(d, w))
    : k === 'crystal' ? await askCrystal(now, doc.style.bondLength, crystalOptions(file))
    : await askPlate(k, now, doc.style.bondLength, paintPlatePreview);
  if (got) editor.putPlateAt(got, pasteCentre(), now ? id! : undefined, deckNow()?.size);
}
editor.onPlate = (id) => void plateFigure(null, id);
editor.onOrbital = () => void editOrbital();

/** What the crystal structure window needs from here: a CIF file to open, and the clipboard. */
function crystalOptions(file?: { name: string; text: string }) {
  return {
    file,
    async pickFile() {
      const f = await openBytesDialog('CIF files', [], ['cif']).catch(() => null);
      return f ? { name: f.name, text: new TextDecoder().decode(f.bytes) } : null;
    },
    async copy(text: string, html: string) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      } catch {
        await navigator.clipboard.writeText(text).catch(() => flash('Could not use the clipboard.'));
      }
    },
  };
}

/** How the last orbital was asked for, so the next starts the same way (and the single-lobe button's phases and size). */
const orbitalChoice: Record<string, string> = { kind: 'p', look: 'shaded', size: '1.1', angle: 'Auto', flip: 'false' };
editor.lobeLook = () => ({ look: (ORBITAL_LOOKS.some((k) => k.value === orbitalChoice.look) ? orbitalChoice.look : 'shaded') as OrbitalLook, size: orbitalSize(orbitalChoice.size), flip: orbitalChoice.flip === 'true' });

/** Which way an orbital on this atom points when left to choose: hybrids away from its bonds, a single lobe into the most open space, others up. */
function orbitalAngle(kind: OrbitalKind, atom: Atom | undefined): number {
  if (atom && kind === 'lobe') return angleOfDir(openDirection(takenDirections(doc, atom.id)));
  if (!atom || (kind !== 'sp' && kind !== 'sp2' && kind !== 'sp3')) return 0;
  let vx = 0, vy = 0;
  for (const n of doc.neighbors(atom.id)) { const d = Math.hypot(n.x - atom.x, n.y - atom.y) || 1; vx -= (n.x - atom.x) / d; vy -= (n.y - atom.y) / d; }
  if (Math.hypot(vx, vy) < 1e-3) return 0;
  return (Math.atan2(vx, -vy) * 180) / Math.PI;
}

/** A lobe length typed in bond lengths, kept to a sensible range. */
const orbitalSize = (text: string | undefined): number => Math.max(0.2, Math.min(5, Number(text) || 1.1));

/** The Orbital window's settings as an orbital to draw, on `atom` (or pointing up off it). */
function orbitalSpec(v: Record<string, string>, atom: Atom | undefined): OrbitalSpec {
  const kind = (ORBITAL_KINDS.some((k) => k.value === v.kind) ? v.kind : 'p') as OrbitalKind;
  const a = readAngle(v.angle);
  return { kind, look: (ORBITAL_LOOKS.some((k) => k.value === v.look) ? v.look : 'shaded') as OrbitalLook, angle: a === 'auto' ? orbitalAngle(kind, atom) : a, size: orbitalSize(v.size) * doc.style.bondLength, ...(v.flip === 'true' ? { flip: true } : {}) };
}

/** A picture of an orbital as the window will draw it: on its atom with the atom's bonds, as it will look there. */
function orbitalPreview(spec: OrbitalSpec, atom: Atom | undefined, at?: Vec): Node {
  const x = new Doc();
  x.style = { ...doc.style };
  x.edit('Preview', () => {
    let c = at ?? { x: 0, y: 0 };
    if (atom) {
      const a = x.addAtom(atom.x, atom.y, atom.z);
      x.updateAtom(a.id, { label: atom.label, charge: atom.charge });
      for (const n of doc.neighbors(atom.id)) { const m = x.addAtom(n.x, n.y, n.z); x.updateAtom(m.id, { label: n.label }); x.addBond(a.id, m.id); }
      c = atom;
    }
    for (const sh of orbitalShapes(spec, c)) x.addShape(sh);
  });
  const pic = recordPicture(x, 4);
  const box = document.createElement('div');
  box.className = 'orbital-preview';
  box.innerHTML = pic ? pictureSvg(pic).replace(/^<\?xml[^>]*>\s*/, '') : '';
  return box;
}

/** The Orbital window's boxes, filled in from `v`. */
function orbitalFields(v: Record<string, string>): Field[] {
  return [
    { name: 'kind', label: 'Orbital', value: v.kind, options: ORBITAL_KINDS },
    { name: 'look', label: 'Phases', value: v.look, options: ORBITAL_LOOKS },
    { name: 'angle', label: 'Pointing', value: v.angle, unit: '°', suggestions: ['Auto', '0', '45', '90', '135', '180', '225', '270', '315'], help: 'Degrees clockwise from straight up. Auto points hybrids away from the bonds, a single lobe into the most open space, and the others straight up.' },
    { name: 'size', label: 'Lobe length', value: v.size, type: 'number', unit: 'bond lengths' },
    { name: 'flip', label: 'Swap the phases', value: v.flip, type: 'checkbox' },
  ];
}

/** Chemistry ▸ Orbitals: an orbital on each selected atom (or in the middle of the view), its lobes stuck to the atom. */
async function insertOrbital(quick: boolean): Promise<void> {
  finishTyping();
  const atoms = [...editor.sel.atoms].map((id) => doc.atoms.get(id)).filter((a): a is Atom => !!a && !a.multi);
  if (quick && !atoms.length) { flash('Select the atoms of the π system first (drag around them, or Shift-click each).'); return; }
  let v: Record<string, string> = { ...orbitalChoice, kind: 'p', angle: 'Auto' };
  if (!quick) {
    const got = await ask('Orbital', orbitalFields(orbitalChoice), { ok: 'Insert', preview: { title: 'Preview', draw: (vals) => orbitalPreview(orbitalSpec(vals, atoms[0]), atoms[0]) }, note: atoms.length ? `One on each of the ${atoms.length} selected atom${atoms.length > 1 ? 's' : ''}; the lobes stay with the atoms. Double-click one later to change it.` : 'Select atoms first to put one on each; otherwise it goes in the middle of the view. Double-click one later to change it.' });
    if (!got) return;
    Object.assign(orbitalChoice, got);
    v = got;
  }
  const made: number[] = [];
  doc.edit(v.kind === 'p' && quick ? 'p Orbitals' : 'Orbital', () => {
    for (const at of atoms.length ? atoms : [undefined]) made.push(...putOrbital(doc, orbitalSpec(v, at), at ?? pasteCentre(), at?.id));
  });
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set(made) };
  editor.changed();
}

/** The orbitals selected (each as its parts). */
const selectedOrbitals = (): Shape[][] => orbitalsAmong(doc, editor.sel.shapes);

/**
 * Draw orbitals again with some settings changed (the Style panel's rows, the Edit Orbital
 * window): each keeps the settings not changed, its own angle and size among them, and stays
 * selected.
 */
function restyleOrbitals(list: Shape[][], patch: Partial<OrbitalSpec>, autoAngle = false): void {
  const made: number[] = [];
  doc.edit(list.length > 1 ? 'Change Orbitals' : 'Change Orbital', () => {
    for (const parts of list) {
      const now = readOrbital(parts);
      if (!now) continue;
      const spec: OrbitalSpec = { ...now.spec, ...patch };
      if (!spec.flip) delete spec.flip;
      // Auto: each points its own way on its own atom
      if (autoAngle) { const at = orbitalAtom(doc, parts); spec.angle = orbitalAngle(spec.kind, at !== undefined ? doc.atoms.get(at) : undefined); }
      made.push(...redrawOrbital(doc, parts, spec));
    }
  });
  editor.sel = { ...editor.sel, shapes: new Set([...[...editor.sel.shapes].filter((id) => doc.shapes.has(id)), ...made]) };
  editor.changed();
}

/** Edit Orbital… (or a double-click on one): the Orbital window with the selected orbitals' settings, to draw them again. */
async function editOrbital(): Promise<void> {
  finishTyping();
  const list = selectedOrbitals();
  if (!list.length) { flash('Select an orbital first.'); return; }
  const first = readOrbital(list[0]);
  if (!first) return;
  const atomId = orbitalAtom(doc, list[0]);
  const atom = atomId !== undefined ? doc.atoms.get(atomId) : undefined;
  const was: Record<string, string> = { kind: first.spec.kind, look: first.spec.look, angle: String(Math.round(first.spec.angle * 10) / 10), size: String(Math.round((first.spec.size / doc.style.bondLength) * 100) / 100), flip: String(!!first.spec.flip) };
  const got = await ask(list.length > 1 ? `Edit ${list.length} Orbitals` : 'Edit Orbital', orbitalFields(was), {
    ok: 'Apply',
    preview: { title: 'Preview', draw: (vals) => orbitalPreview({ ...orbitalSpec(vals, atom), ...(vals.size === was.size ? { size: first.spec.size } : {}) }, atom, first.at) },
    note: list.length > 1 ? 'Only the settings you change are applied to each orbital; each keeps its own angle and size unless you change them.' : 'Draws the orbital again with these settings, on the same atom.',
  });
  if (!got) return;
  // only what was changed: several orbitals each keep their own angle and size
  const patch: Partial<OrbitalSpec> = {};
  if (got.kind !== was.kind) patch.kind = got.kind as OrbitalKind;
  if (got.look !== was.look) patch.look = got.look as OrbitalLook;
  if (got.flip !== was.flip) patch.flip = got.flip === 'true';
  if (got.size !== was.size) patch.size = orbitalSize(got.size) * doc.style.bondLength;
  if (got.angle !== was.angle) { const a = readAngle(got.angle); if (a !== 'auto') patch.angle = a; }
  orbitalChoice.look = got.look; orbitalChoice.flip = got.flip; orbitalChoice.size = got.size;
  const auto = readAngle(got.angle) === 'auto';
  if (Object.keys(patch).length || auto) restyleOrbitals(list, patch, auto);
}

/** A diagram drawn as an SVG picture, for the diagram window's preview and its layout buttons. */
function diagramSvg(d: DiagramData): string {
  const x = new Doc();
  x.edit('Diagram', () => putDiagram(x, POINTS, d, { x: 0, y: 0 }));
  const pic = recordPicture(x, 2);
  return pic ? pictureSvg(pic) : '';
}

/** Insert ▸ Diagram…, or the selected diagram's text and look to change (`id`, its frame). */
async function smartDiagram(id: number | null): Promise<void> {
  finishTyping();
  const now = id !== null ? doc.shapes.get(id)?.diagram ?? null : null;
  const got = await askDiagram(now, { drawing: doc, preview: diagramSvg, scale: deckNow() ? 1 : 0.7 });
  if (got) editor.putDiagramAt(got, pasteCentre(), now ? id! : undefined, deckNow()?.size);
}
editor.onDiagram = (id) => void smartDiagram(id);

/** A document's diagram: a new one, or the one in a figure (its drawing) to change. Null when cancelled. */
async function documentDiagram(contents: Contents | null): Promise<Contents | null> {
  const d = structureDoc(contents ?? { atoms: [], bonds: [], captions: [], arrows: [], shapes: [] }, docStyle());
  const frame = [...d.shapes.values()].find((s) => s.diagram);
  const got = await askDiagram(frame?.diagram ?? null, { drawing: d, preview: diagramSvg, scale: 0.75 });
  if (!got) return null;
  d.edit(frame ? 'Change Diagram' : 'Diagram', () => putDiagram(d, POINTS, got, frame ? { x: Math.min(frame.x1, frame.x2), y: Math.min(frame.y1, frame.y2) } : { x: 0, y: 0 }, frame?.id));
  return d.contents();
}

/** Insert > Chart: a chart with its own data (sample data to type over), in the middle of the slide or window. */
async function insertChart(): Promise<void> {
  finishTyping();
  const deck = deckNow();
  // on a slide: most of the slide, with text the size PowerPoint gives a chart's (about 13 pt)
  const slides = !!deck && ws.active.mode === 'slides';
  const fit = deck ? Math.min(slides ? 2 : 1, (deck.size.w * 0.7) / 360, (deck.size.h * 0.7) / 216) : 1;
  const box = newChartBox('column', 360 * fit, 216 * fit);
  if (slides) box.chart.fontSize = 18;
  const got = await editChart(box, true, flash);
  if (!got || got === 'delete') return;
  const { w, h } = (await import('./ui/chart-editor')).chartPoints(got.chart);
  const c = pasteCentre();
  let made: Shape | null = null;
  doc.edit('Insert chart', () => {
    made = doc.addShape({ kind: 'picture', x1: c.x - w / 2, y1: c.y - h / 2, x2: c.x + w / 2, y2: c.y + h / 2, src: chartBoxPng(got, w, h), px: { w: got.chart.w, h: got.chart.h }, chart: got });
  });
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set([made!.id]) };
  editor.changed();
}

/** Double-clicking a chart on a slide or drawing: its data and settings. */
async function editChartShape(id: number): Promise<void> {
  finishTyping();
  const s = doc.shapes.get(id);
  if (!s?.chart) return;
  const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
  const got = await editChart(sizedBox(s.chart, Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1)), false, flash);
  if (!got || !doc.shapes.get(id)?.chart) return;
  if (got === 'delete') { doc.edit('Delete chart', () => doc.removeShape(id)); editor.changed(); return; }
  const { w, h } = (await import('./ui/chart-editor')).chartPoints(got.chart);
  doc.edit('Change chart', () => doc.updateShape(id, { chart: got, src: chartBoxPng(got, w, h), px: { w: got.chart.w, h: got.chart.h }, x1: x, y1: y, x2: x + w, y2: y + h, crop: undefined }));
  editor.changed();
}
editor.onChart = (id) => void editChartShape(id);

/** A video or sound's Playback window (double-click it, or Playback… in the panel). */
async function editMediaShape(id: number): Promise<void> {
  finishTyping();
  const s = doc.shapes.get(id);
  if (!s?.video) return;
  const got = await editMedia(s.video);
  if (!got || !doc.shapes.get(id)?.video) return;
  doc.edit(s.video.audio ? 'Audio playback' : 'Video playback', () => doc.updateShape(id, { video: got }));
  editor.changed();
}
editor.onMedia = (id) => void editMediaShape(id);

/** Insert > Slides > Video or Audio: a file put on the slide, starting when clicked and playing once, as in PowerPoint. */
async function insertMedia(audio: boolean): Promise<void> {
  const exts = Object.keys(audio ? AUDIO_TYPES : VIDEO_TYPES);
  let f;
  try {
    f = await openBytesDialog(audio ? 'Sounds' : 'Videos', [], exts);
  } catch (e) {
    await showError('Could not open the file: ' + String(e));
    return;
  }
  if (!f) return;
  const type = mediaMime(f.name);
  if (!type) { flash(`${f.name} isn't a ${audio ? 'sound' : 'video'} file this takes (${exts.join(', ')}).`); return; }
  if (f.bytes.length > 200 * 1024 * 1024) flash('This is a big file: it is kept inside the slide file, which grows by as much.', 8000);
  const src = dataUrl(f.bytes, type.mime);
  let px = { w: 128, h: 128 }, poster = '', length = 0, playable = true;
  if (type.audio) {
    poster = speakerPng();
    length = await probeAudio(src);
  } else {
    flash('Reading the video…');
    const got = await probeVideo(src);
    if (got) { px = { w: got.w, h: got.h }; poster = got.poster; length = got.length; }
    else playable = false;
  }
  // a video this system can't play still looks like a video (not a loudspeaker)
  if (!type.audio && !playable) px = { w: 640, h: 360 };
  if (!poster) poster = type.audio ? speakerPng() : filmPng(px.w, px.h);
  finishTyping();
  const deck = deckNow();
  const room = deck ? { w: deck.size.w * 0.6, h: deck.size.h * 0.6 } : { w: (renderer.width * 0.6) / renderer.view.scale, h: (renderer.height * 0.6) / renderer.view.scale };
  const k = type.audio ? 0.375 : Math.min(0.75, room.w / px.w, room.h / px.h);
  const w = px.w * k, h = px.h * k;
  const c = deck && type.audio ? { x: deck.size.w / 2, y: deck.size.h / 2 } : pasteCentre();
  let made: Shape | null = null;
  doc.edit(type.audio ? 'Insert audio' : 'Insert video', () => {
    made = doc.addShape({
      kind: 'picture', x1: c.x - w / 2, y1: c.y - h / 2, x2: c.x + w / 2, y2: c.y + h / 2, px, src: poster,
      video: { src, ...(type.audio ? { audio: true } : {}), start: 'click', once: true, ...(length ? { length: +length.toFixed(3) } : {}) },
    });
  });
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set([made!.id]) };
  editor.changed();
  // kept even so, for PowerPoint, which may play it
  if (!playable) flash(`${f.name} is on the slide, but this computer can't play it. MP4 (H.264) videos play everywhere, PowerPoint too.`, 8000);
  else flash(`${type.audio ? 'Sound' : 'Video'} added: it starts when clicked in the show. Double-click it to trim it or change how it plays.`, 6000);
}

/**
 * Insert > Zoom > Slide Zoom: pictures of the slides picked, on this slide; clicked in the show,
 * each zooms into its slide. Summary Zoom: a new slide before the first one picked, with a zoom
 * for each part of the deck (from each slide picked to the next), each coming back to it.
 */
async function insertZoom(summary: boolean): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') { flash('Zooms go on slides: use File > New > Presentation, or open a PowerPoint file.'); return; }
  finishTyping();
  refreshZooms(d);
  const pick = await pickReuseSlides('', d, false, summary
    ? { title: 'Summary Zoom', note: 'Click the first slide of each part of your talk (Shift+click picks a run). A new slide goes in before the first of them, with a zoom for each part: in the show, a click on one plays its part and comes back.', verb: (n) => (n ? `Insert Summary Zoom (${n} part${n === 1 ? '' : 's'})` : 'Insert Summary Zoom') }
    : { title: 'Slide Zoom', note: 'Click the slides to zoom to (Shift+click picks a run). In the show, a click on a zoom zooms into its slide; turn on Return to Zoom in the panel to come back afterwards.', verb: (n) => (n > 1 ? `Insert ${n} Zooms` : 'Insert Zoom') });
  if (!pick?.indices.length) return;
  if (summary) {
    const parts = summaryParts(pick.indices, d.slides.length);
    const ids = parts.map((p) => ({ first: d.slides[p.first].id, last: d.slides[p.last].id }));
    const at = parts[0].first;
    // each part's section is named by its first slide's title, as PowerPoint names them
    const names = parts.map((p) => [...d.docOf(p.first).captions.values()].find((c) => c.ph === 'title')?.runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim() ?? '');
    d.insertSummary(at, (sd) => {
      const title = [...sd.captions.values()].find((c) => c.ph === 'title');
      if (title) sd.updateCaption(title.id, { runs: [{ text: 'Summary' }] });
      const area = { x1: d.size.w * 0.06, y1: d.size.h * 0.26, x2: d.size.w * 0.94, y2: d.size.h * 0.94 };
      // the slides moved one along: their pictures are drawn from the deck before the new slide goes in
      zoomGrid(ids.length, d.size, area).forEach((box, k) => {
        const i = d.slides.findIndex((s) => s.id === ids[k].first);
        const z = i >= 0 ? zoomShape(d, i, box, { back: true, summary: true, ...(ids[k].last !== ids[k].first ? { to: `#slide=${ids[k].last}` } : {}) }) : null;
        if (z) sd.addShape(z);
      });
    }, ids.map((x) => x.first), names);
    flash('Summary Zoom added. In the show, click a zoom to play its part; the show comes back here after it.', 7000);
    return;
  }
  const area = { x1: d.size.w * 0.1, y1: d.size.h * 0.3, x2: d.size.w * 0.9, y2: d.size.h * 0.9 };
  const boxes = zoomGrid(pick.indices.length, d.size, area);
  const made: number[] = [];
  doc.edit(pick.indices.length > 1 ? 'Insert slide zooms' : 'Insert slide zoom', () => {
    pick.indices.forEach((i, k) => { const z = zoomShape(d, i, boxes[k], {}); if (z) made.push(doc.addShape(z).id); });
  });
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set(made) };
  editor.changed();
}

/** What a click does in the slide show (Insert > Slides > Action), for the selected shapes or action buttons. */
/** Insert ▸ Action Button…: a ready-made button with its action, or the back, home and next set, in the slide's bottom right corner. */
async function insertActionButton(): Promise<void> {
  const d = deckNow();
  if (!d) { flash('Action buttons work in the slide show: use them in a presentation.'); return; }
  finishTyping();
  const i = d.index;
  const slides = d.slides.map((s, k) => ({ link: `#slide=${s.id}`, label: `Slide ${k + 1}${slideTitle(d, k) ? `: ${slideTitle(d, k)}` : ''}` }));
  const regions = (d.slides[i].canvas?.keys ?? []).map((k, n) => ({ link: `#key=${k.id}`, label: k.title?.trim() || `View ${n + 1}` }));
  const { actionLook, actionSet, askActionButton } = await import('./ui/action-button-dialog');
  const got = await askActionButton(slides, regions);
  if (!got || deckNow() !== d || d.index !== i) return;
  const sdoc = d.docOf(i), W = d.size.w, H = d.size.h, edge = 18;
  const made: number[] = [];
  const al = actionLook(got.look);
  const put = (geo: string, x2: number, side: number, link: string) => {
    const look = geoShapeStyle(geo, editor.geoLook);
    if (!look) return;
    const y2 = H - edge;
    // the look picked in the window: its fill, line and line width
    const paint: Partial<Shape> = { filled: al.fill !== null, fillColor: al.fill ?? undefined, color: al.line, lineWidth: al.width };
    made.push(sdoc.addShape({ ...(look as Shape), ...paint, x1: x2 - side, y1: y2 - side, x2, y2, link: link || undefined }).id);
  };
  sdoc.edit('Insert Action Button', () => {
    if (got.geo === 'set') {
      const side = Math.round(al.size * 0.75), gap = Math.max(4, Math.round(side / 5));
      actionSet(regions.length > 0).reverse().forEach((g, k) => put(g, W - edge - k * (side + gap), side, ACTION_LINKS[g] ?? ''));
    } else put(got.geo, W - edge, al.size, got.link.startsWith('#') || !got.link ? got.link : normalizeLink(got.link) ?? '');
  });
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set(made) };
  editor.changed();
}

async function actionSettings(): Promise<void> {
  const d = deckNow();
  const shapes = [...editor.sel.shapes].map((id) => doc.shapes.get(id)).filter((s): s is Shape => !!s && s.kind === 'geo' && !s.diagram && !s.energy);
  if (!d || !shapes.length) { flash('Select an action button or a shape on a slide first (Insert > Shapes > Action buttons).'); return; }
  const cur = shapes[0].link ?? '';
  const slides = d.slides.map((s, i) => ({ value: `#slide=${s.id}`, label: `Slide ${i + 1}${slideTitle(d, i) ? `: ${slideTitle(d, i)}` : ''}` }));
  const jumps = [...Object.entries(SHOW_JUMPS), ...Object.entries(SHOW_TOOLS)].map(([value, label]) => ({ value, label }));
  const regions = (d.slides[d.index].canvas?.keys ?? []).map((k, n) => ({ value: `#key=${k.id}`, label: `Zoom to ${k.title?.trim() || `view ${n + 1}`}` }));
  const kind = !cur ? 'none' : cur in SHOW_JUMPS || cur in SHOW_TOOLS || keyOfLink(cur) !== null || slideOfLink(cur) !== null ? 'place' : 'url';
  const got = await ask('Action Settings', [
    { name: 'kind', label: 'On a click', value: kind, options: [{ value: 'none', label: 'Nothing' }, { value: 'place', label: 'Go to a slide' }, { value: 'url', label: 'Open a web page or file' }] },
    { name: 'place', label: 'Slide', value: kind === 'place' ? cur : '#next', options: [...jumps, ...regions, ...slides] },
    { name: 'url', label: 'Web page or file', value: kind === 'url' ? cur : '', placeholder: 'https://… or a file path' },
  ], { ok: 'OK', note: 'What happens when this is clicked in the slide show. Saved as PowerPoint\'s own action.' });
  if (!got) return;
  const link = got.kind === 'place' ? got.place : got.kind === 'url' ? normalizeLink(got.url) ?? '' : '';
  doc.edit('Action settings', () => { for (const s of shapes) doc.updateShape(s.id, { link: link || undefined }); });
  editor.changed();
}

/**
 * Insert > Equation on a slide or design: typed as LaTeX in the equation window, in the
 * master's body text (its font, colour and size), in the middle of the slide.
 */
// ------------------------------------------------------------------ links

/** A slide's title (its title placeholder's text), for the link window's list. */
function slideTitle(d: Deck, i: number): string {
  for (const c of d.docOf(i).captions.values()) if (c.ph === 'title') return plainText(c.runs).replace(/\s+/g, ' ').trim();
  return '';
}

/** The places in the deck a link can go to: each slide (by its title), and the slide show's own jumps. */
function slidePlaces(): { places: LinkPlace[]; title: string } | null {
  const d = deckNow();
  if (!d || ws.active.mode === 'design') return null;
  const places: LinkPlace[] = d.slides.map((s, i) => ({ link: `#slide=${s.id}`, label: `${i + 1}. ${slideTitle(d, i) || `Slide ${i + 1}`}` }));
  places.push({ link: '', label: 'In the slide show' }, ...Object.entries(SHOW_JUMPS).map(([link, label]) => ({ link, label, depth: 1 })));
  return { places, title: 'Slide in this deck' };
}

/** The selected captions (not one being typed). */
function pickedCaptions(): Caption[] {
  return [...editor.sel.captions].map((id) => doc.captions.get(id)).filter((c): c is Caption => !!c);
}

/**
 * Insert > Link (Ctrl+K) in drawings and slides: the text being typed (its selection), or the
 * whole text of the selected captions and text boxes, as PowerPoint links a whole shape.
 */
async function insertLink(): Promise<void> {
  const typing = editor.typingCaption;
  if (typing) { await typing.editLink(); return; }
  const caps = pickedCaptions();
  if (!caps.length) { flash('Select the text to link (or a text box or caption), then choose Link. Ctrl+K while typing links the selected words.'); return; }
  const first = caps[0];
  const old = linkSpans(first.runs)[0]?.link;
  const text = caps.length === 1 ? plainText(first.runs) : '';
  const p = slidePlaces();
  const got = await askLink({ text: caps.length === 1 && !text.includes('\n') ? text : null, link: old, places: p?.places, placeTitle: p?.title });
  if (!got) return;
  doc.edit('remove' in got ? 'Remove Link' : old ? 'Edit Link' : 'Insert Link', () => {
    for (const c of caps) {
      const n = plainText(c.runs).length;
      const runs = 'remove' in got ? removeLink(c.runs, 0, n) : setLink(c.runs, 0, n, got.link, caps.length === 1 ? got.text : undefined).runs;
      doc.updateCaption(c.id, { runs });
    }
  });
  editor.changed();
}

/** Remove Link on the text being typed, or on the selected captions. */
function removeLinks(): boolean {
  const typing = editor.typingCaption;
  if (typing) { typing.ed.removeLink(); return true; }
  const caps = pickedCaptions().filter((c) => c.runs.some((r) => r.link));
  if (!caps.length) { flash('Select text with a link first.'); return false; }
  doc.edit('Remove Link', () => { for (const c of caps) doc.updateCaption(c.id, { runs: removeLink(c.runs, 0, plainText(c.runs).length) }); });
  editor.changed();
  return true;
}

/** Open Link: the link in the text being typed, or the first in the selected captions. */
function openLink(): boolean {
  const link = editor.typingCaption?.ed.linkHere()?.link ?? pickedCaptions().map((c) => linkSpans(c.runs)[0]?.link).find(Boolean);
  if (!link) { flash('Select text with a link first.'); return false; }
  void followLink(link);
  return true;
}

CaptionEditor.linkPlaces = () => slidePlaces();

setLinkHost({
  goTo(place) {
    if (docActive()) return docMode.goToPlace(place);
    if (sheetActive()) return sheetMode.goToPlace(place);
    const d = deckNow();
    const id = slideOfLink(place);
    if (d && id !== null) {
      const i = d.slides.findIndex((s) => s.id === id);
      if (i < 0) return false;
      goSlide(i);
      return true;
    }
    if (d && place in SHOW_JUMPS) {
      // outside the slide show, the jumps go to the slide they would show
      const i = place === '#first' ? 0 : place === '#last' ? d.slides.length - 1 : place === '#next' ? d.index + 1 : d.index - 1;
      goSlide(Math.max(0, Math.min(d.slides.length - 1, i)));
      return true;
    }
    return false;
  },
  placeName(place) {
    if (docActive()) return docMode.placeName(place);
    const d = deckNow();
    const id = slideOfLink(place);
    if (d && id !== null) {
      const i = d.slides.findIndex((s) => s.id === id);
      return i < 0 ? null : `Slide ${i + 1}${slideTitle(d, i) ? `: ${slideTitle(d, i)}` : ''}`;
    }
    if (place in SHOW_JUMPS) return SHOW_JUMPS[place];
    const cell = cellOfLink(place);
    return cell ? `Cell ${cell.sheet ? `${cell.sheet}!` : ''}${cell.cell}` : null;
  },
  async openHere(path) {
    // drawings, documents, slides, sheets and workspaces open in a tab here
    if (!/\.(cdxml|cdx|cds|mol|rxn|mrv|ket|cml|docx|pptx|xlsx|xlsm|xls|ods|csv|tsv|sdf|sd)$/i.test(path) && !path.toLowerCase().endsWith(`.${WORKSPACE.extension}`)) return false;
    if (!isTauri()) return false;
    await openRecent(path);
    return true;
  },
  folder: () => (ws.active.ref.kind === 'path' ? folderOf(ws.active.ref.path) : null),
  flash: (text) => flash(text, 6000),
});

async function insertEquation(): Promise<void> {
  const deck = deckNow();
  if (!deck) { flash('Equations go on slides, designs and documents.'); return; }
  finishTyping();
  const m = deck.master;
  const font = m.bodyFont;
  const got = await askEquation({ tex: '', font, ok: 'Insert', app: 'PowerPoint' });
  if (!got || deckNow() !== deck) return;
  const math: ShapeMath = { tex: got.tex, size: m.bodySize, color: slideColours(m, deck.current?.layout ?? 'blank').textColor, font };
  const { w, h } = shapeMathSize(math, measureText);
  const c = pasteCentre();
  let made: Shape | null = null;
  doc.edit('Insert equation', () => {
    made = doc.addShape({ kind: 'picture', x1: c.x - w / 2, y1: c.y - h / 2, x2: c.x + w / 2, y2: c.y + h / 2, src: shapeMathPicture(math, measureText), px: { w: Math.round(w), h: Math.round(h) }, math });
  });
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set([made!.id]) };
  editor.changed();
}

/** Double-clicking an equation: change it in the equation window. Its box keeps its top left corner and how much it was enlarged. */
async function editEquationShape(id: number): Promise<void> {
  finishTyping();
  const s = doc.shapes.get(id);
  if (!s?.math) return;
  const k = shapeMathScale(s.math, s.x2 - s.x1, s.y2 - s.y1, measureText);
  const got = await askEquation({ tex: s.math.tex, font: s.math.font ?? 'Arial', ok: 'Apply', app: 'PowerPoint' });
  const now = doc.shapes.get(id);
  if (!got || !now?.math || got.tex === now.math.tex) return;
  const math = { ...now.math, tex: got.tex };
  const { w, h } = shapeMathSize(math, measureText);
  const x = Math.min(now.x1, now.x2), y = Math.min(now.y1, now.y2);
  doc.edit('Change equation', () => doc.updateShape(id, { math, src: shapeMathPicture(math, measureText), px: { w: Math.round(w), h: Math.round(h) }, x1: x, y1: y, x2: x + w * k, y2: y + h * k }));
  editor.changed();
}
editor.onEquation = (id) => void editEquationShape(id);

/** Select just these (new) atoms and their bonds. */
function selectNewAtoms(ids: number[]): void {
  editor.sel = { atoms: new Set(ids), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() };
  for (const id of ids) for (const b of doc.adj.get(id) ?? []) editor.sel.bonds.add(b);
  editor.changed();
}

// ------------------------------------------------------------------ 3-D model

const model3d = new Model3dBuilder(new URL('ocl-resources.json', document.baseURI).href);
let viewer3d: Viewer3d | null = null;

/**
 * Chemistry > 3-D Model: the selected structure (or the one last drawn) built in 3-D in a window
 * of its own, to turn and look at, and to turn the drawing to match (Place on Page).
 */
// the 3-D Perspective tool builds a structure's shape in the same worker, and checks a turn kept its meaning
editor.perspectiveHost = {
  pose: (molblock, cues, L) => model3d.pose(molblock, cues, L),
  smiles: (molblock) => chem.molToSmiles(molblock),
};

let lastTurn3d = { x: '0', y: '30', z: '0', shape: 'real' };
/** Turn in 3-D…: the selected structures turned by angles typed in, in their real shape or as a flat sheet. */
async function turn3dDialog(): Promise<void> {
  if (!editor.sel.atoms.size) { flash('Select a structure to rotate in 3-D.'); return; }
  const r = await ask('3-D Rotation', [
    { name: 'x', label: 'About X (left–right)', value: lastTurn3d.x, unit: 'degrees', type: 'number', help: 'Positive tips the top toward you.' },
    { name: 'y', label: 'About Y (up–down)', value: lastTurn3d.y, unit: 'degrees', type: 'number', help: 'Positive brings the left side toward you.' },
    { name: 'z', label: 'About Z (in the page)', value: lastTurn3d.z, unit: 'degrees', type: 'number', help: 'Positive values rotate clockwise.' },
    { name: 'shape', label: 'Turn', value: lastTurn3d.shape, options: [{ value: 'real', label: 'The real 3-D shape' }, { value: 'flat', label: 'The drawing as a flat sheet' }] },
  ], { ok: 'Turn', note: 'Drag with the Perspective tools to turn by eye.' });
  if (!r) return;
  const [x, y, z] = [r.x, r.y, r.z].map((v) => parseFloat(v || '0'));
  if (![x, y, z].every(Number.isFinite)) { flash('Type each angle in degrees.'); return; }
  lastTurn3d = { x: r.x, y: r.y, z: r.z, shape: r.shape };
  if (r.shape === 'real') flash('Building the 3-D shape…');
  await editor.turnSelectionBy(x, y, z, r.shape === 'real');
}

/** Depth shading on or off (Format ▸ Depth Shading): structures in 3-D fade from black in front to grey behind. */
function toggleDepthShading(): void {
  depthShadePrefs.on = !depthShadePrefs.on;
  depthShadingChanged();
  storeSettings();
  flash(depthShadePrefs.on ? 'Depth shading on: structures turned in 3-D fade from front to back.' : 'Depth shading off.');
}

/** Depth Shading Settings…: the colours in front and behind, how the fade goes, and whether lines thin with depth. */
async function depthShadingDialog(): Promise<void> {
  const s = depthShadePrefs;
  const r = await ask('Depth Shading', [
    { name: 'on', label: 'Shade structures drawn in 3-D by depth', type: 'checkbox', value: String(s.on),
      help: 'Structures turned with the Perspective tools, placed from the 3-D Model window, or drawn from conformer templates. Each is shaded over its own depth.' },
    { name: 'near', label: 'Nearest color', type: 'color', value: s.near },
    { name: 'far', label: 'Furthest color', type: 'color', value: s.far },
    { name: 'curve', label: 'Fade', value: s.curve, options: [{ value: 'linear', label: 'Even (linear)' }, { value: 'eased', label: 'Eased (slow at front and back)' }] },
    { name: 'thin', label: 'Thin the lines with depth too', type: 'checkbox', value: String(s.thin) },
    { name: 'thinTo', label: 'Line width at the back', type: 'number', unit: '% of the usual', value: String(Math.round(s.thinTo * 100)) },
  ], { ok: 'Apply', note: `Default: black in front fading evenly to ${DEFAULT_DEPTH_SHADE.far} gray behind, line widths unchanged. Copied and exported pictures keep the shading.` });
  if (!r) return;
  const pct = Number(r.thinTo);
  Object.assign(depthShadePrefs, {
    on: r.on === 'true', near: r.near || s.near, far: r.far || s.far, curve: r.curve === 'eased' ? 'eased' : 'linear',
    thin: r.thin === 'true', thinTo: isFinite(pct) ? Math.max(10, Math.min(100, pct)) / 100 : s.thinTo,
  });
  depthShadingChanged();
  storeSettings();
}

/** Repaint with the depth shading as it now is, and tick the menu. */
function depthShadingChanged(): void {
  for (const el of document.querySelectorAll('[data-cmd="depth-shading"][role="menuitemcheckbox"]')) el.setAttribute('aria-checked', String(depthShadePrefs.on));
  doc.allDirty = true;
  renderer.repaintAll();
  editor.requestScene();
  viewer3d?.redraw();
}

/** The 3-D Model window's settings for xTB and Gaussian/ORCA input, kept in this browser or app between sessions. */
const conformerPrefs = (() => {
  const KEY = 'ci.conformerTools';
  let saved: { xtb?: Partial<XtbOptions>; qm?: Partial<QmOptions> } = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { saved = {}; }
  const prefs = {
    xtb: { ...DEFAULT_XTB, ...(saved.xtb ?? {}) } as XtbOptions,
    qm: { ...(saved.qm ?? {}) } as Partial<QmOptions>,
    save() { try { localStorage.setItem(KEY, JSON.stringify({ xtb: prefs.xtb, qm: prefs.qm })); } catch { /* not kept */ } },
  };
  return prefs;
})();

/** The conformer tiers of the 3-D Model window, for the structure `molblock`. */
function conformerTools(molblock: string): ConformerTools {
  return {
    search: (opts, progress) => model3d.search(molblock, opts, progress),
    // (Stop ends the xtb running now too, rather than leaving it to finish its conformer)
    stop: () => { model3d.stop(); if (isTauri()) void invoke('xtb_stop').catch(() => {}); },
    ...(isTauri() ? {
      xtb: (job) => invoke<{ xyz: string; energy: number }>('xtb_run', { job }),
      xtbVersion: (exe: string) => invoke<string>('xtb_version', { exe }),
    } : {}),
    prefs: conformerPrefs,
    async saveFiles(files, ext) {
      const what = ext === 'gjf' ? 'Gaussian input' : 'ORCA input';
      const one: FileType = { description: what, extension: ext, mime: 'text/plain' };
      const zip: FileType = { description: `${what} files (zip)`, extension: 'zip', mime: 'application/zip' };
      const single = files.length === 1;
      const target = await saveFileDialog(single ? files[0].name : files[0].name.replace(/_conf\d+\.\w+$/, '') + `_${ext}.zip`, single ? one : zip).catch(async (e) => { await showError(String(e)); return null; });
      if (!target) return;
      try {
        if (single) await writeFile(target.ref, target.name, files[0].text, one);
        else await writeFile(target.ref, target.name, zipSync(Object.fromEntries(files.map((f) => [f.name, new TextEncoder().encode(f.text)]))), zip);
        flash(`Saved ${target.name}.`);
      } catch (e) {
        await showError(`Could not save ${target.name}: ${String(e)}`);
      }
    },
  };
}

async function show3dModel(): Promise<void> {
  const root = editor.sel.atoms.size ? [...editor.sel.atoms][0] : editor.lastEdited;
  if (root === null || !doc.atoms.has(root)) { flash('Select a structure to see in 3-D.'); return; }
  const ids = [...doc.fragmentOf(root)];
  const ex = toMolfile(doc, ids, '');
  if (ex.generic.length) { flash('A structure with R groups or labels that can\'t be read has no 3-D shape. Replace them with atoms first.'); return; }
  if (!viewer3d) viewer3d = new (await import('./ui/viewer3d')).Viewer3d((m) => flash(m));
  viewer3d.showBusy('3-D Model');
  try {
    viewer3d.tools = conformerTools(ex.molblock);
    const m = await model3d.build(ex.molblock, 12, 1);
    const before = await chem.molToSmiles(ex.molblock);
    viewer3d.show(m, '3-D Model', async (v) => {
      if (!ids.every((id) => doc.atoms.has(id))) { flash('The structure has changed since the model was built. Open 3-D Model again.'); return; }
      let unshown = 0;
      doc.edit('3-D Rotation', () => ({ unshown } = placeView(doc, ex.map, v.view)));
      editor.changed();
      // the drawing must still mean the same compound: a view where a wedge can't read right is taken back
      const after = await chem.molToSmiles(toMolfile(doc, doc.fragmentOf(root), '').molblock);
      if (unshown || (before && after && after !== before)) {
        editor.undo();
        flash('From this angle a stereocenter can\'t be drawn so it reads right (a bond points almost straight at you). Turn the model a little and place it again.', 7000);
      }
    }, ex.map.map((id) => { const a = id >= 0 ? doc.atoms.get(id) : undefined; return a ? { x: a.x, y: a.y } : null; }));
  } catch (e) {
    viewer3d.close();
    flash((e as Error).message || 'Could not build a 3-D model of this structure.');
  }
}

// ------------------------------------------------------------------ Newman projections

/** Settings ▸ Newman Projections: how projections and torsion charts look. */
let newmanPrefs: NewmanPrefs = parseNewmanPrefs(null);

/** What the Newman window last used, so the next one starts the same way. */
let lastNewman = { kind: null as NewmanChoice['kind'] | null, source: 'stable' as NewmanChoice['source'], linked: true };

/** Work on one structure for its Newman projections: its molfile, and the conformers (searched once per method). */
function newmanWork(frontId: number, backId: number) {
  const ids = [...doc.fragmentOf(frontId)];
  const ex = toMolfile(doc, ids, '');
  if (ex.generic.length) throw new Error('A structure with R groups or labels that can\'t be read has no 3-D shape. Replace them with atoms first.');
  const fi = ex.map.indexOf(frontId), bi = ex.map.indexOf(backId);
  if (fi < 0 || bi < 0) throw new Error('Pick a bond between two atoms drawn as atoms, not inside a label.');
  // a group drawn as a label (OTBS, CO2Et) keeps its label in the projection
  const drawn = (i: number): string | null => {
    const id = ex.map[i];
    const a = id !== undefined && id >= 0 ? doc.atoms.get(id) : undefined;
    return a?.label && (doc.adj.get(a.id) ?? []).length === 1 ? a.label : null;
  };
  // the groups are labelled through the model's atom numbers, so it must number them as the molfile does
  const mismatch = 'The 3-D model numbered this structure\'s atoms differently from the drawing, so its groups can\'t be labeled correctly. Please report this structure (Help ▸ Send Feedback).';
  const checked = <T extends { atoms: { z: number; charge: number }[] }>(m: T): T => {
    if (!sameAtomOrder({ atoms: m.atoms, bonds: [] }, ex.molblock)) throw new Error(mismatch);
    return m;
  };
  const models = new Map<string, Promise<Model3d>>();
  const modelFor = (method: 'mmff' | 'xtb', progress: (t: string) => void): Promise<Model3d> => {
    let p = models.get(method);
    if (!p) {
      const opts = { starts: 120, window: 6, rmsd: 0.3 };
      p = method === 'mmff'
        ? model3d.search(ex.molblock, opts, (done, total) => progress(`Searching conformers… ${done} of ${total}`)).then(checked).then((m) => withBondRotamers(m, ex.molblock, fi, bi, progress))
        : modelFor('mmff', progress).then((m) => {
          const t = conformerTools(ex.molblock);
          if (!t.xtb) throw new Error('xTB runs in the desktop app, with the xtb program installed.');
          return refineWithXtb(m, { ...conformerPrefs.xtb, count: Math.min(m.conformers.length, Math.max(conformerPrefs.xtb.count, 8)) }, t.xtb, (done, total) => progress(`xTB: ${done} of ${total} conformers done…`));
        });
      models.set(method, p);
      p.catch(() => models.delete(method));
    }
    return p;
  };
  const ends = (rev: boolean) => (rev ? [bi, fi] : [fi, bi]);
  const scans = new Map<string, Promise<ChartScan>>();
  return {
    ids, ex, fi, bi,
    /** The pairs of groups (one on each atom) a torsion chart can be measured between, the biggest pair first. */
    async pairs(rev: boolean): Promise<{ label: string; a: number; d: number }[]> {
      const m = await modelFor('mmff', () => {});
      const [f, b] = ends(rev);
      const v = newmanView(m, m.conformers[0].xyz, f, b, { drawn });
      if (v.front.some((g) => g.ring !== undefined)) throw new Error('This bond is in a ring, so it can\'t turn all the way around: there is no torsion chart for it.');
      const heavy = (gs: NewmanGroup[]) => { const h = gs.filter((g) => m.atoms[g.atom].z !== 1); return h.length ? h : gs.slice(0, 1); };
      const out: { label: string; a: number; d: number; size: number }[] = [];
      for (const p of heavy(v.front)) for (const q of heavy(v.back)) out.push({ label: `${p.label} (front) and ${q.label} (back)`, a: p.atom, d: q.atom, size: p.size + q.size });
      return out.sort((x, y) => y.size - x.size);
    },
    /** A relaxed scan of the bond, the torsion measured between groups c.a and c.d (once for each way of asking). */
    scan(rev: boolean, c: ChartChoice, progress: (t: string) => void): Promise<ChartScan> {
      const key = `${rev}|${c.a}|${c.d}|${c.step}|${c.method}`;
      let p = scans.get(key);
      if (!p) {
        p = (async () => {
          const m = await modelFor('mmff', progress);
          const [f, b] = ends(rev);
          const xyz0 = m.conformers[0].xyz;
          const r = await model3d.scan(ex.molblock, xyz0, [c.a, f, b, c.d], c.step, (done, total) => progress(`Scanning the bond… ${Math.round((100 * done) / total)}%`));
          let points = r.points.map((q) => ({ phi: q.phi, energy: q.energy }));
          let method = r.relaxed ? `${r.method}, relaxed scan` : `${r.method}, rigid scan`;
          if (c.method === 'xtb') {
            const run = conformerTools(ex.molblock).xtb;
            if (!run) throw new Error('xTB runs in the desktop app, with the xtb program installed.');
            const shapes: Model3d = { ...m, conformers: r.points.map((q) => ({ xyz: q.xyz, energy: q.energy })) };
            const { charge, multiplicity } = chargeAndMultiplicity(m);
            const es: number[] = [];
            for (let k = 0; k < r.points.length; k++) {
              const got = await run({ exe: conformerPrefs.xtb.exe, xyz: xyzFile(shapes, k, `phi ${r.points[k].phi}`), charge, uhf: multiplicity - 1, solvent: conformerPrefs.xtb.solvent || null, opt: false });
              es.push(got.energy * KCAL_PER_HARTREE);
              progress(`xTB energies: ${k + 1} of ${r.points.length}…`);
            }
            const e0 = Math.min(...es);
            points = points.map((q, i) => ({ phi: q.phi, energy: es[i] - e0 }));
            method = `GFN2-xTB${conformerPrefs.xtb.solvent ? ` (ALPB ${conformerPrefs.xtb.solvent})` : ''} at MMFF94s+ scan shapes`;
          }
          const profile = fitProfile(points);
          const view = newmanView(m, xyz0, f, b, { drawn });
          return { points, profile, extrema: extrema(profile), front: view.front, back: view.back, phi0: norm360(torsion(xyz0, c.a, f, b, c.d)), method };
        })();
        scans.set(key, p);
        p.catch(() => scans.delete(key));
      }
      return p;
    },
    /** Each end named by its group as written from the other end (CH(OH)CH3), once the conformers are in. */
    async names(): Promise<[string, string]> {
      const m = await modelFor('mmff', () => {});
      const nb = neighbours(m);
      // an end named by what is on it (its groups other than H): the OH, CH3 end
      const end = (a: number, other: number) => {
        const gs = nb[a].filter((n) => n.atom !== other && m.atoms[n.atom].z !== 1).map((n) => drawn(n.atom) ?? groupLabel(m, n.atom, a, nb));
        return gs.length ? `the ${gs.join(', ')} end` : `the ${groupLabel(m, a, other, nb)} end`;
      };
      const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
      return [`${cap(end(fi, bi))} in front`, `${cap(end(bi, fi))} in front`];
    },
    async list(rev: boolean, method: 'mmff' | 'xtb', progress: (t: string) => void): Promise<NewmanConformer[]> {
      const m = await modelFor(method, progress);
      const [f, b] = ends(rev);
      return newmanConformers(m, m.conformers, f, b, { drawn });
    },
    async drawn(rev: boolean): Promise<NewmanConformer | string> {
      const r = await model3d.pose(ex.molblock, depthCues(doc, ex), doc.style.bondLength || 14.4);
      if ('problem' in r) return r.message;
      const p = r.pose;
      const mol = { atoms: p.z.map((z) => ({ z, charge: 0 })), bonds: p.bonds.map(([a, b]) => ({ a, b, order: 1 })) };
      if (!sameAtomOrder(mol, ex.molblock)) return mismatch;
      // bond orders from the molfile (the pose keeps the molfile's atoms first, in order)
      const m = await modelFor('mmff', () => {}).catch(() => null);
      const withOrders = m && m.atoms.length === p.z.length ? m : mol;
      const [f, b] = ends(rev);
      const view = newmanView(withOrders, p.pts.flat(), f, b, { drawn });
      return { view, energy: null, index: 0 };
    },
  };
}

/**
 * A conformer search can miss some rotamers about one bond: the lowest conformers are also turned
 * 120° and 240° about it and relaxed, and those not already found are added (populations again).
 */
async function withBondRotamers(m: Model3d, molblock: string, fi: number, bi: number, progress: (t: string) => void): Promise<Model3d> {
  const nb = neighbours(m);
  const a = nb[fi].find((n) => n.atom !== bi)?.atom, d = nb[bi].find((n) => n.atom !== fi)?.atom;
  if (a === undefined || d === undefined || m.conformers.some((c) => c.energy === null)) return m;
  progress('Turning the bond to its other rotamers…');
  const extra = await model3d.rotamers(molblock, m.conformers.slice(0, 3).map((c) => c.xyz), [a, fi, bi, d]).catch(() => []);
  return { ...m, conformers: mergeConformers(m.atoms, m.conformers, extra) };
}

/** A bond's scan, ready to draw as a torsional energy chart. */
interface ChartScan {
  points: { phi: number; energy: number }[];
  profile: Profile;
  extrema: Extremum[];
  front: NewmanGroup[];
  back: NewmanGroup[];
  phi0: number;
  method: string;
}

/** The chart a choice on the Energy Chart tab makes. */
function torsionData(s: ChartScan, c: ChartChoice, look = newmanPrefs.look): TorsionData {
  const L = doc.style.bondLength || 14.4;
  return {
    profile: s.profile, extrema: s.extrema, front: s.front, back: s.back, phi0: s.phi0, a: c.a, d: c.d,
    unit: c.unit, insets: c.insets, names: c.names, barriers: c.barriers, barrierColor: newmanPrefs.chart.barrierColor,
    digits: 1, w: 26 * L, h: 8 * L, method: s.method, look: structuredClone(look), sawhorse: c.sawhorse, points: s.points,
  };
}

/** The Energy Chart tab's preview: the chart fitted to the canvas. */
function paintTorsionPreview(d: TorsionData, canvas: HTMLCanvasElement): void {
  const { doc: tmp, box } = editor.torsionPreview(d);
  const w = canvas.clientWidth || 560, h = canvas.clientHeight || 300, dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bw = box.x2 - box.x1, bh = box.y2 - box.y1, pad = 8;
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh, 3);
  ctx.setTransform(k * dpr, 0, 0, k * dpr, (w / 2 - (box.x1 + bw / 2) * k) * dpr, (h / 2 - (box.y1 + bh / 2) * k) * dpr);
  drawDrawing(ctx, tmp);
}

/** The projection a choice in the Newman window makes. */
function newmanData(w: ReturnType<typeof newmanWork>, choice: NewmanChoice, conf: NewmanConformer, frontId: number, backId: number, look = newmanPrefs.look): NewmanData {
  const [f, b] = choice.reversed ? [backId, frontId] : [frontId, backId];
  return {
    kind: choice.kind, front: conf.view.front, back: conf.view.back, turn: choice.turn,
    conformer: choice.source === 'drawn' ? 0 : choice.index,
    ...(conf.energy !== null ? { energy: conf.energy } : {}),
    method: choice.source === 'drawn' ? 'as drawn' : choice.method === 'xtb' ? 'GFN2-xTB' : 'MMFF94s+',
    source: choice.source,
    look: structuredClone(look),
    link: { atoms: w.ids, front: f, back: b, key: structureKey(doc, w.ids) },
  };
}

/** The Newman window's preview: the projection fitted to the canvas. */
function paintNewmanPreview(d: NewmanData, canvas: HTMLCanvasElement): void {
  const { doc: tmp, box } = editor.newmanPreview(d);
  const w = canvas.clientWidth || 230, h = canvas.clientHeight || 200, dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bw = box.x2 - box.x1, bh = box.y2 - box.y1, pad = 10;
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh, 3);
  ctx.setTransform(k * dpr, 0, 0, k * dpr, (w / 2 - (box.x1 + bw / 2) * k) * dpr, (h / 2 - (box.y1 + bh / 2) * k) * dpr);
  drawDrawing(ctx, tmp);
}

/**
 * Chemistry ▸ Newman Projection… (right-click a single bond, or the Newman tool): the bond seen
 * end on, from `frontId`'s end; or projection `editId` (its frame) to change.
 */
async function newmanProjection(bondId: number | null, frontId: number | null, editId?: number, chartFirst = false): Promise<void> {
  finishTyping();
  const old = editId !== undefined ? doc.shapes.get(editId)?.newman : undefined;
  let front: number, back: number;
  if (old) {
    if (!old.link || !doc.atoms.has(old.link.front) || !doc.atoms.has(old.link.back)) { await newmanLookOnly(editId!, old); return; }
    front = old.link.front; back = old.link.back;
  } else {
    const b = bondId !== null ? doc.bonds.get(bondId) : undefined;
    if (!b) { flash('Right-click a single bond (or click one with the Newman tool) to see its Newman projection.'); return; }
    if (b.order !== 1) { flash('A Newman projection looks down a single bond: pick one that can turn.'); return; }
    front = frontId === b.a2 ? b.a2 : b.a1;
    back = front === b.a1 ? b.a2 : b.a1;
  }
  let w: ReturnType<typeof newmanWork>;
  try { w = newmanWork(front, back); } catch (e) { flash((e as Error).message); return; }
  const start: NewmanChoice = {
    reversed: false,
    kind: old?.kind ?? lastNewman.kind ?? newmanPrefs.kind,
    source: old ? (old.source === 'drawn' ? 'drawn' : 'stable') : lastNewman.source,
    index: old?.conformer ?? 0,
    turn: old?.turn ?? 0,
    method: newmanPrefs.method,
    mark: old ? !!old.mark : newmanPrefs.mark,
    linked: old ? true : lastNewman.linked,
  };
  const got = await askNewman(start, {
    ends: ['The end you picked', 'The other end'],
    names: w.names(),
    xtb: !!conformerTools(w.ex.molblock).xtb,
    list: (rev, method, progress) => w.list(rev, method, progress),
    drawn: (rev) => w.drawn(rev),
    paint: (choice, conf, canvas) => paintNewmanPreview(newmanData(w, choice, conf, front, back, old?.look), canvas),
    stop: () => model3d.stop(),
  }, !!old, old ? undefined : {
    first: chartFirst,
    start: { ...newmanPrefs.chart, step: 10, sawhorse: true, method: newmanPrefs.method },
    host: {
      pairs: (rev) => w.pairs(rev),
      scan: (rev, c, progress) => w.scan(rev, c, progress),
      paint: (_rev, c, scan, canvas) => paintTorsionPreview(torsionData(scan as ChartScan, c), canvas),
      copy: (c, scan) => void copyText(torsionCsv(torsionData(scan as ChartScan, c)), `Copied ${(scan as ChartScan).points.length} angles and energies: paste them into a spreadsheet.`),
    },
  });
  if (!got) return;
  lastNewman = { kind: got.choice.kind, source: got.choice.source, linked: got.choice.linked };
  if ('chart' in got) {
    editor.putTorsionChart(torsionData(got.scan as ChartScan, got.chart), { near: front, page: deckNow()?.size });
    return;
  }
  if (!doc.atoms.has(front) || !doc.atoms.has(back)) { flash('The structure was changed while the window was open. Open Newman Projection again.'); return; }
  const data = newmanData(w, got.choice, got.conf, front, back, old?.look);
  editor.putNewmanProjection(data, { id: editId, mark: got.choice.mark ? (old?.mark?.color ?? newmanPrefs.markColor) : null, linked: got.choice.linked, page: deckNow()?.size });
}

/** A projection no longer linked to a structure: only its look and the Turn dial can change. */
async function newmanLookOnly(id: number, d: NewmanData): Promise<void> {
  const r = await ask('Edit Newman Projection', [
    { name: 'kind', label: 'Draw as', value: d.kind, options: [{ value: 'newman', label: 'Newman' }, { value: 'sawhorse', label: 'Sawhorse' }] },
    { name: 'turn', label: 'Turn the back atom', value: String(d.turn), unit: 'degrees', type: 'number' },
    { name: 'look', label: 'Look', value: 'keep', options: [{ value: 'keep', label: 'Keep its own look' }, { value: 'settings', label: 'Use Settings ▸ Newman Projections' }] },
  ], { ok: 'Redraw', note: 'This projection is not linked to a structure, so its conformation stays as it is. To work out another, right-click a bond of the structure ▸ Newman Projection….' });
  if (!r) return;
  const turn = parseFloat(r.turn);
  editor.putNewmanProjection({ ...d, kind: r.kind === 'sawhorse' ? 'sawhorse' : 'newman', turn: isFinite(turn) ? turn : d.turn, look: r.look === 'settings' ? structuredClone(newmanPrefs.look) : d.look }, { id });
}

/** Linked projections whose structure changed are worked out again, as the most stable conformer of the new structure (or as drawn). */
const newmanRedo = new Map<number, ReturnType<typeof setTimeout>>();
editor.onNewmanStale = (frames) => {
  for (const id of frames) {
    clearTimeout(newmanRedo.get(id));
    newmanRedo.set(id, setTimeout(() => { newmanRedo.delete(id); void redoNewman(id); }, 500));
  }
};
async function redoNewman(id: number): Promise<void> {
  const d = doc.shapes.get(id)?.newman;
  if (!d?.link || structureKey(doc, doc.fragmentOf(d.link.front)) === d.link.key) return;
  const { front, back } = d.link;
  try {
    const w = newmanWork(front, back);
    const method = d.method === 'GFN2-xTB' && conformerTools(w.ex.molblock).xtb ? 'xtb' : 'mmff';
    const conf = d.source === 'drawn' ? await w.drawn(false) : (await w.list(false, method, () => {}))[0];
    if (!conf || typeof conf === 'string') throw new Error(typeof conf === 'string' ? conf : 'No conformer was found.');
    const shape = doc.shapes.get(id);
    if (!shape?.newman?.link || !doc.atoms.has(front) || !doc.atoms.has(back)) return;
    const choice: NewmanChoice = { reversed: false, kind: d.kind, source: d.source === 'drawn' ? 'drawn' : 'stable', index: 0, turn: d.turn, method, mark: !!d.mark, linked: true };
    editor.putNewmanProjection(newmanData(w, choice, conf, front, back, d.look), { id, mark: d.mark ? d.mark.color : null, amend: true });
  } catch (e) {
    flash(`The Newman projection couldn't be recalculated: ${(e as Error).message}`);
  }
}
/** Settings ▸ Newman Projections. */
async function newmanSettingsPage(): Promise<void> {
  finishTyping();
  const sample = (look: NewmanLook, kind: NewmanPrefs['kind']): NewmanData => ({
    kind, turn: 0, conformer: 0, source: 'stable', look,
    front: [{ atom: 1, angle: 0, label: 'Ph', size: 2.8 }, { atom: 2, angle: 120, label: 'CH3', size: 1.74 }, { atom: 3, angle: 240, label: 'H', size: 0 }],
    back: [{ atom: 4, angle: 60, label: 'OH', size: 0.87 }, { atom: 5, angle: 180, label: 'CH3', size: 1.74 }, { atom: 6, angle: 300, label: 'H', size: 0 }],
  });
  const count = [...doc.shapes.values()].filter((x) => x.newman).length;
  await newmanSettings(newmanPrefs, (look, kind, canvas) => paintNewmanPreview(sample(look, kind), canvas), (p, restyle) => {
    newmanPrefs = structuredClone(p);
    storeSettings();
    if (restyle) editor.restyleNewman(newmanPrefs.look);
  }, count);
}

editor.onNewman = (bond, front) => void newmanProjection(bond, front);
editor.onNewmanEdit = (frame) => void newmanProjection(null, null, frame);
editor.onTorsionEdit = (frame) => void editTorsion(frame);

/** A torsional energy chart's look: its projections, names, units, barriers and sawhorse (the scan stays as it was). */
async function editTorsion(id: number): Promise<void> {
  finishTyping();
  const d = doc.shapes.get(id)?.torsion;
  if (!d) return;
  const r = await ask('Edit Torsional Energy Chart', [
    { name: 'insets', label: 'Projections', value: d.insets, options: [{ value: 'all', label: 'At every minimum and maximum' }, { value: 'minima', label: 'At the minima' }, { value: 'none', label: 'None' }] },
    { name: 'names', label: 'Names', value: d.names, options: [{ value: 'textbook', label: 'Textbook (gauche, eclipsed, anti…)' }, { value: 'klyne', label: 'Klyne–Prelog (synclinal…)' }, { value: 'none', label: 'None' }] },
    { name: 'unit', label: 'Units', value: d.unit, options: [{ value: 'kcal/mol', label: 'kcal/mol' }, { value: 'kJ/mol', label: 'kJ/mol' }] },
    { name: 'barriers', label: 'Barrier heights (dotted arrows)', type: 'checkbox', value: String(d.barriers) },
    { name: 'sawhorse', label: 'Sawhorse with the eye above the chart', type: 'checkbox', value: String(!!d.sawhorse) },
    { name: 'look', label: 'Projections\' look', value: 'keep', options: [{ value: 'keep', label: 'Keep its own look' }, { value: 'settings', label: 'Use Settings ▸ Newman Projections' }] },
  ], { ok: 'Redraw', note: `Energies: ${d.method ?? 'MMFF94s+'}. To scan the bond again (another step, pair of groups or xTB), right-click the bond ▸ Torsional Energy Chart….` });
  if (!r) return;
  editor.putTorsionChart({
    ...d,
    insets: r.insets === 'minima' || r.insets === 'none' ? r.insets : 'all',
    names: r.names === 'klyne' || r.names === 'none' ? r.names : 'textbook',
    unit: r.unit === 'kJ/mol' ? 'kJ/mol' : 'kcal/mol',
    barriers: r.barriers === 'true', sawhorse: r.sawhorse === 'true',
    look: r.look === 'settings' ? structuredClone(newmanPrefs.look) : d.look,
    ...(r.look === 'settings' ? { barrierColor: newmanPrefs.chart.barrierColor } : {}),
  }, { id });
}

// ------------------------------------------------------------------ name to structure

const names = new NameReader(new URL('opsin/opsin-data.dat', document.baseURI).href);
const nmrPanel = new NmrPanel({
  unavailable: nmrHere ? undefined : `Predicted NMR spectra are in the desktop app for Windows, Mac and Linux. <a href="https://github.com/nathanohare/Chem-Illustrator/releases/latest" target="_blank" rel="noopener">Download it</a>.`,
  url: new URL('nmr/nmr-hose.dat', document.baseURI).href, measuredUrl: new URL('nmr/nmr-measured.dat', document.baseURI).href, netUrl: new URL('nmr/nmr-net.dat', document.baseURI).href, splitUrl: new URL('nmr/nmr-ch2split.json', document.baseURI).href, fpUrl: new URL('nmr/nmr-fp.dat', document.baseURI).href,
  graph: (molblock) => chem.namerGraph(molblock),
  conformers: (molblock) => model3d.build(molblock, 30),
  redraw: () => editor.requestOverlay(),
  copy: (text) => navigator.clipboard.writeText(text),
  flash: (text) => flash(text),
  copyPicture: (png) => navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }) })]),
  placePicture: (png) => placePicture(png, 'image/png', null),
  importedTables: () => getText(keepStore(), KB_IMPORTED_KEY).catch(() => null),
  saveSpectra: (molblock, entries) => saveSpectraToLibrary(molblock, entries),
  savedReports: async (molblock) => {
    const [w] = await weighMolfiles([molblock]);
    if (!w) return [];
    const c = compoundBySmiles((await useLibrary()).now, w.smiles);
    return (c?.spectra ?? []).filter((x) => x.kind === 'measured').sort((a, b) => b.saved - a.saved).map((x) => x.text);
  },
});

/** NMR ▸ Save to Library: adds the structure to the Compound Library if needed and keeps the peak reports with it. */
async function saveSpectraToLibrary(molblock: string, entries: Omit<LibSpectrum, 'id' | 'saved'>[]): Promise<void> {
  const lib = await useLibrary();
  const [w] = await weighMolfiles([molblock]);
  if (!w) { flash('This structure could not be read for the Compound Library.'); return; }
  const { addStructures } = await import('./ui/compound-library');
  const now = Date.now();
  const t = ws.mainOf(ws.active);
  let id = '', kept = 0;
  lib.change((l0) => {
    const l = addStructures(l0, [{ molfile: molblock, smiles: w.smiles, formula: w.formula, mw: w.mw }], t.ref.kind === 'path' ? t.ref.path : '', now).lib;
    const c = compoundBySmiles(l, w.smiles);
    if (!c) return l0;
    id = c.id;
    const have = c.spectra ?? [];
    const fresh = entries.filter((e) => !have.some((h) => h.kind === e.kind && h.text === e.text)).map((e) => ({ ...e, id: newId('s'), saved: now }));
    kept = fresh.length;
    return { ...l, compounds: l.compounds.map((x) => (x.id === c.id ? { ...x, spectra: [...have, ...fresh], modified: now } : x)) };
  });
  if (!id) { flash('This structure could not be added to the Compound Library.'); return; }
  const what = entries.length > 1 ? 'predicted and measured spectra' : 'predicted spectrum';
  flash(kept ? `Saved the ${what} to the Compound Library.` : `The ${what} ${entries.length > 1 ? 'are' : 'is'} already saved in the Compound Library.`, 5000,
    { label: 'Show', run: () => void openCompoundLibrary([id]) });
}
let namesReady = false;

// ------------------------------------------------------------------ structure to name

const namer = new StructureNamer(new URL('pyodide/', document.baseURI).href, new URL('namer/openclatura-0.4.3-py3-none-any.whl', document.baseURI).href);
const nameTools: NameTools = {
  graph: (molblock) => chem.namerGraph(molblock),
  propose: (graph) => namer.propose(graph),
  read: async (name) => { const r = await names.read(name); return r.ok ? r.smiles : null; },
  canonical: (smiles) => chem.canonical(smiles),
};
/** Each structure's systematic name this session, by SMILES, for the Analysis panel. */
const nameStates = new Map<string, NameState>();

/** The checked systematic name of a structure (by its SMILES and molfile), kept for the Analysis panel. */
async function nameOf(smiles: string, molblock: string): Promise<NameState> {
  const known = nameStates.get(smiles);
  if (known && known.kind !== 'idle' && known.kind !== 'busy') return known;
  nameStates.set(smiles, { kind: 'busy', loading: !namer.ready });
  let state: NameState;
  try {
    const r = await confirmedName(molblock, nameTools);
    state = r.ok ? { kind: 'found', name: r.name } : { kind: 'none', message: r.message };
  } catch (e) {
    // the namer couldn't start: let the button try again
    nameStates.delete(smiles);
    throw e;
  }
  nameStates.set(smiles, state);
  return state;
}

/** The Analysis panel's IUPAC name button (and names once the namer is running). */
async function nameForPanel(smiles: string, molblock: string): Promise<void> {
  const p = nameOf(smiles, molblock);
  scheduleAnalysis(true);
  await p.catch((e) => flash((e as Error).message));
  scheduleAnalysis(true);
}

/**
 * Chemistry > Look Up > Structure to Name (and the right-click menu): the systematic name of each
 * chosen structure, put under it as a caption tied to it. A name is given only when the name
 * reader reads it back as exactly the structure drawn.
 */
async function structureToName(): Promise<void> {
  const frags = chosenStructures();
  if (!frags.length) { flash('Select a structure to name.'); return; }
  if (!chem.ready) { flash('The chemistry engine is still loading. Try again in a moment.'); return; }
  const todo: { frag: Set<number>; smiles: string; molblock: string }[] = [];
  let unreadable = '';
  for (const f of frags) {
    const ex = toMolfile(doc, f, '');
    if (ex.generic.length) { unreadable = 'A structure with R groups or labels that can\'t be read has no name. Replace them with atoms first.'; continue; }
    const smiles = await chem.molToSmiles(ex.molblock);
    if (!smiles) { unreadable = 'That structure can\'t be read (check valences).'; continue; }
    todo.push({ frag: f, smiles, molblock: ex.molblock });
  }
  if (!todo.length) { flash(unreadable || 'Select a structure to name.'); return; }
  if (!namer.ready) flash('Loading the namer (first time only)…', 15000);
  let states: NameState[];
  try {
    states = await Promise.all(todo.map((t) => nameOf(t.smiles, t.molblock)));
  } catch (e) {
    flash((e as Error).message);
    return;
  }
  scheduleAnalysis(true);
  const found = todo.flatMap((t, i) => { const s = states[i]; return s.kind === 'found' && [...t.frag].every((id) => doc.atoms.has(id)) ? [{ ...t, name: s.name }] : []; });
  const none = states.find((s): s is Extract<NameState, { kind: 'none' }> => s.kind === 'none');
  if (!found.length) { flash(none?.message ?? 'No name found.', 6000); return; }
  const m = editor.measure();
  doc.edit(found.length > 1 ? 'Name captions' : 'Name caption', () => {
    for (const t of found) {
      const c = doc.addCaption({ x: 0, y: 0, runs: nameRuns(t.name), justify: 'center', attach: { atoms: [...t.frag], side: 'below', gap: defaultGap(doc), shift: 0, role: 'caption' } });
      placeAttached(doc, c, m);
    }
  });
  editor.changed();
  const missed = todo.length - found.length;
  flash(missed ? `Named ${found.length} of ${todo.length} structures; the others have no name the namer could confirm.` : 'Added the name under the structure; it follows it. Double-click to edit.');
}

/** Names the name reader can't read are looked up on PubChem (Edit > Settings). */
let pubchemNames = true;
/** The person's own AI model, if linked (Edit > Settings > AI Model). */
let aiPrefs: AiPrefs = { ...DEFAULT_AI };

/** Why a name couldn't be turned into a structure: a plain message, the part that couldn't be read, and the name reader's own words. */
interface NameError { error: string; bad?: string; details?: string }

/** A short message for a name that couldn't be read, with the part the name reader stopped at. */
function unreadableName(name: string, parser: string): NameError {
  const ctx = /not understandable in the context it was used:\s*(.+?)\s*\.?$/m.exec(parser)?.[1];
  const sect = /following section of the name:\s*(.+?)\s*(?:The following|$)/m.exec(parser)?.[1];
  const bad = [ctx, sect].find((x) => x && name.includes(x.trim()))?.trim();
  return { error: `Couldn't read "${name.trim()}". Check the spelling, or try a CAS number, SMILES or a simpler name.`, bad };
}

/**
 * A name as a laid-out molfile, or why not. Systematic names are read here, on this computer;
 * a name that can't be read (a trade name, an abbreviation) is looked up on PubChem, unless
 * that is turned off in Edit > Settings.
 */
async function nameToMolfile(name: string): Promise<{ mb: string; attach: number[]; warnings: string[] } | NameError> {
  // a CAS RN is looked up (it can't be read like a name)
  const cas = readCas(name);
  if (cas) return casToMolfile(cas.kind === 'typo' ? { error: casTypoMessage(cas) } : await structureForCas(cas.cas, casDeps()));
  const r = await names.read(name);
  namesReady = true;
  if (!chem.ready) return { error: 'The chemistry engine is still loading; try again in a moment.' };
  if (!r.ok) {
    const why = r.message.trim().replace(/([^.])$/, '$1.');
    const failed = (more: string): NameError => ({ ...unreadableName(name, why), details: `${why}${more ? ' ' + more : ''}` });
    if (!pubchemNames || !name.trim()) return failed('');
    let found: Awaited<ReturnType<typeof pubchemName>>;
    try {
      found = await pubchemName(name);
    } catch (e) {
      return failed(`Looking it up on PubChem didn't work: ${(e as Error).message}`);
    }
    if (!found) return failed('PubChem doesn\'t know this name either.');
    const mb = await chem.smilesToMol(found.smiles).catch(() => null);
    if (!mb) return { error: `PubChem knows this name, but its structure could not be drawn (${found.smiles}).` };
    const same = found.title.toLowerCase() === name.trim().toLowerCase();
    return { mb, attach: [], warnings: [`Found on PubChem${same ? '' : ` as ${found.title}`} (CID ${found.cid}). Check it is the compound you meant.`] };
  }
  const mb = await chem.smilesToMol(r.smiles).catch(() => null);
  if (!mb) return { error: 'The name was read, but the structure could not be drawn (' + r.smiles + ').' };
  return { mb, attach: attachmentAtoms(r.smiles), warnings: [...r.warnings, ...cxNotes(r.smiles)] };
}

/** CAS RNs found before, kept on this computer (src/chem/cas.ts). */
const casMemory = new CasMemory();

/** What a CAS RN lookup needs: your Compound Library, the answers kept, and whether looking up online is allowed. */
function casDeps(): CasDeps {
  return {
    library: async () => (await useLibrary()).now.compounds,
    memory: casMemory,
    online: pubchemNames,
    canonical: async (smiles) => { const mb = await chem.smilesToMol(smiles); return mb ? chem.molToSmiles(mb) : null; },
  };
}

/** A CAS RN's structure as a laid-out molfile, or why not. */
async function casToMolfile(got: { smiles: string; note: string } | { error: string }): Promise<{ mb: string; attach: number[]; warnings: string[] } | NameError> {
  if ('error' in got) return { error: got.error };
  if (!chem.ready) return { error: 'The chemistry engine is still loading; try again in a moment.' };
  const mb = await chem.smilesToMol(got.smiles).catch(() => null);
  if (!mb) return { error: `The CAS RN was found, but its structure could not be drawn (${got.smiles}).` };
  return { mb, attach: [], warnings: [got.note] };
}

/** Adds a named structure centred at (x, y), its attachment points drawn as wavy lines. Use inside doc.edit (or `to`'s bulk). */
function addNamed(got: { mb: string; attach: number[] }, x: number, y: number, to: Doc = doc): number[] {
  const ids = addMolfile(to, got.mb, x, y);
  for (const i of got.attach) {
    if (ids[i] !== undefined) to.updateAtom(ids[i], { attach: 'Wavy', attachNum: undefined, z: 0, label: null, charge: 0 });
  }
  return ids;
}

/** Slides: structures locked so clicks reach the text near them. */
let structuresLocked = false;
/** The start view shows on the empty drawing the program opens with (Settings > General). */
let startView = true;
/** Settings ▸ Preferences: Enter finishes text typed with the Text tool, Alt+Enter starts a new line. */
let enterFinishesText = false;
/** Settings ▸ Preferences: a document whose structures aren't figures offers to make them figures on opening. */
let offerFigures = true;
// everywhere the Text tool types (Canvas, structures in documents and spreadsheets, text boxes on
// slides and designs); text in shapes, tables and slide placeholders follows it except on slides
// and designs, which keep PowerPoint's keys there
editor.enterFinishesText = (what) => enterFinishesText && (what === 'text' || (ws.active.mode !== 'slides' && ws.active.mode !== 'design'));
/** View > Focus View is on. */
let focusView = false;
/** View > Toolboxes > One Column Outside Drawing is on; and whether the toolboxes on screen were built that way. */
let oneColumnTools = false;
let toolsInOneColumn = false;
/** The toolboxes have been built once (the toolbox code is set up). */
let toolboxesBuilt = false;
const wantOneColumn = () => oneColumnTools && ws.active.mode !== 'drawing';

function toggleStructureLock(): void {
  structuresLocked = !structuresLocked;
  const slides = !!ws.active.deck && ws.active.mode !== 'design';
  editor.structuresLocked = slides && structuresLocked;
  $('#rb-lock-structures').setAttribute('aria-pressed', String(structuresLocked));
  if (structuresLocked) {
    // let go of any atoms and bonds picked up
    editor.sel.atoms.clear();
    editor.sel.bonds.clear();
    editor.changed();
  }
  flash(structuresLocked ? 'Structures locked: clicks go to text and pictures. Click Lock Structures again to edit structures.' : 'Structures can be clicked again.');
}

/** A species of a reaction step, read by the chemistry engine (formula, weight, SMILES), or text. */
interface StepSpecies {
  role: StoichRole;
  /** What the drawing calls it: a caption's text, else the structure's formula. */
  name: string;
  /** Its atoms on the drawing (none for conditions written as text). */
  atoms: number[];
  molblock?: string;
  formula?: string;
  charge?: number;
  mw?: number;
  smiles?: string;
}

/**
 * The step of the selected reaction arrow, or of the only one in the drawing; null (and a note
 * said) when there is none to choose.
 */
function pickedStep(what: string): { step: ReturnType<typeof reactionSteps>[number]; items: ReturnType<typeof schemeItems>; m: ReturnType<typeof editor.measure> } | null {
  const m = editor.measure();
  const items = schemeItems(doc, m);
  const steps = reactionSteps(doc, items);
  const picked = steps.filter((s) => editor.sel.arrows.has(s.arrow.id));
  const step = picked[0] ?? (steps.length === 1 ? steps[0] : null);
  if (!step) {
    flash(steps.length ? `Select the arrow of the step to ${what}.` : 'No reaction step found: draw the starting materials, an arrow and the products.', 6000);
    return null;
  }
  return { step, items, m };
}

/**
 * The species of a reaction step: its starting materials, the reagents over and under the arrow,
 * and its products, each read by the chemistry engine; text that isn't a compound (a solvent and
 * temperature, a yield) comes back as the conditions.
 */
async function stepSpecies(got: NonNullable<ReturnType<typeof pickedStep>>, maps = false): Promise<StepSpecies[]> {
  const { step, items, m } = got;
  const find = itemFinder(items);
  const wanted: { role: StoichRole; ref: string }[] = [
    ...step.roles.reactants.map((ref) => ({ role: 'Starting material' as const, ref })),
    ...[...step.roles.above, ...step.roles.below].map((ref) => ({ role: 'Reagent' as const, ref })),
    ...step.roles.products.map((ref) => ({ role: 'Product' as const, ref })),
  ];
  const rows: StepSpecies[] = [];
  const mols: { molblock: string; map: number[] }[] = [];
  const at: number[] = [];
  for (const w of wanted) {
    const it = find(w.ref);
    if (!it || it.plus) continue;
    const cap = it.caption !== undefined ? doc.captions.get(it.caption) : undefined;
    // (a reagent's text over or under the arrow is read as the compound it names: Me2SO is DMSO)
    const species = cap ? placeSpecies(doc, [cap], m, w.role === 'Reagent') : [];
    if (!it.atoms.length && !species.length) {
      if (cap) rows.push({ role: 'Conditions', name: plainText(cap.runs).trim(), atoms: [] });
      continue;
    }
    const name = cap ? plainText(cap.runs).trim() : '';
    const ex = toMolfile(doc, new Set(it.atoms), name.replace(/\s+/g, ' ').slice(0, 80), { species, maps });
    at.push(rows.length);
    mols.push({ molblock: ex.molblock, map: ex.map });
    rows.push({ role: w.role, name, atoms: it.atoms, molblock: ex.molblock });
  }
  const res = mols.length ? await chem.analyze(mols).catch(() => null) : null;
  at.forEach((r, i) => {
    const one = res?.results[i];
    if (!one || one.error) return;
    Object.assign(rows[r], { formula: one.formula, charge: one.charge, mw: one.mw, smiles: one.smiles });
    if (!rows[r].name) rows[r].name = one.formula;
  });
  return rows;
}

// ------------------------------------------------------------------ the Assistant (review item 35)

/**
 * What the Assistant could send about the page, each as an item of the "Will send" list: in a
 * drawing (or on a slide or design page) the selected structures as SMILES, the scheme's steps
 * as reaction SMILES with their conditions, or every structure when nothing is selected; in a
 * Document the selected text (the whole text is listed, off); in a Spreadsheet the selected cells.
 * Nothing else is gathered.
 */
async function assistantItems(): Promise<SendItem[]> {
  const mode = ws.active.mode;
  const items: SendItem[] = [];
  if (mode === 'document') {
    if (!docMode?.file) return items;
    const sel = docMode.selectedText().trim();
    if (sel) items.push({ id: 'text', ...cappedText('the selected text', sel, TEXT_CAP.selection), on: true });
    const all = docMode.documentText();
    // (ticked only when chosen in Settings > AI Model: a whole document is a large request)
    if (all.trim()) items.push({ id: 'document', ...cappedText('the whole document\'s text', all, TEXT_CAP.document), on: !sel && aiPrefs.sendDocument === true });
    return items;
  }
  if (mode === 'sheet') {
    const got = sheetMode?.selectedCellsText();
    if (got) items.push({ id: 'sheet', label: `the selected cells (${got.at})`, text: got.text, on: true });
    return items;
  }
  if (!chem.ready) return items;
  const smilesOf = async (atoms: Set<number>): Promise<string | null> => {
    const ex = toMolfile(doc, atoms, '');
    return ex.generic.length ? null : chem.molToSmiles(ex.molblock).catch(() => null);
  };
  const picked = editor.sel.atoms.size ? chosenStructures() : [];
  if (picked.length) {
    const got = (await Promise.all(picked.map(smilesOf))).filter((s): s is string => !!s);
    if (got.length) items.push({ id: 'selection', label: got.length === 1 ? 'the selected structure as SMILES' : `the ${got.length} selected structures as SMILES`, text: got.join('\n'), on: true });
  }
  const m = editor.measure();
  const schemeAt = schemeItems(doc, m);
  const steps = reactionSteps(doc, schemeAt);
  if (steps.length) {
    const lines: string[] = [];
    for (const [i, step] of steps.entries()) {
      const rows = await stepSpecies({ step, items: schemeAt, m });
      const part = (role: StoichRole) => rows.filter((r) => r.role === role).map((r) => r.smiles ?? `[${r.name || 'unreadable structure'}]`);
      const conditions = rows.filter((r) => r.role === 'Conditions').map((r) => r.name).filter(Boolean);
      lines.push(`Step ${i + 1}: ${part('Starting material').join('.')}>${part('Reagent').join('.')}>${part('Product').join('.')}${conditions.length ? `  (conditions: ${conditions.join('; ')})` : ''}`);
    }
    items.push({ id: 'scheme', label: steps.length === 1 ? 'the reaction step as reaction SMILES, with its conditions' : `the scheme's ${steps.length} steps as reaction SMILES, with their conditions`, text: lines.join('\n'), on: !picked.length });
  }
  if (!picked.length && !steps.length && doc.atoms.size) {
    const seen = new Set<number>();
    const frags: Set<number>[] = [];
    for (const id of doc.atoms.keys()) {
      if (seen.has(id) || frags.length >= 50) continue;
      const f = doc.fragmentOf(id);
      for (const x of f) seen.add(x);
      frags.push(f);
    }
    const got = (await Promise.all(frags.map(smilesOf))).filter((s): s is string => !!s);
    if (got.length) items.push({ id: 'drawing', label: got.length === 1 ? 'the structure in the drawing as SMILES' : `the ${got.length} structures in the drawing as SMILES`, text: got.join('\n'), on: true });
  }
  return items;
}

/**
 * Carry out a proposal the person accepted, as one step of Undo; what happened, for the pane.
 * Structures are read again by RDKit first, and one that doesn't read isn't drawn.
 */
async function applyAssistantAction(a: AssistantAction): Promise<string> {
  const mode = ws.active.mode;
  if (a.type === 'check') return 'Nothing to change.';
  if (a.type === 'text') {
    if (mode === 'document') return docMode?.writeText(a.text, a.replace) ? (a.replace ? 'Replaced the selected text.' : 'Added the text.') : 'The document can\'t be typed in now (Read Mode?).';
    if (mode === 'sheet') { await copyText(a.text, 'Copied the text: paste it where you want it.'); return 'Copied the text.'; }
    await pasteText(a.text);
    return 'Added the text as a text box.';
  }
  if (!chem.ready) return 'The chemistry engine is still loading. Try again in a moment.';
  const mb = await chem.smilesToMol(a.smiles).catch(() => null);
  if (!mb) return `The proposed structure (${a.smiles}) doesn't read as a valid structure, so it wasn't drawn.`;
  if (mode === 'document' || mode === 'sheet') {
    await copyText(a.smiles, 'Copied the structure as SMILES: paste it into a drawing, a cell or the document.');
    return 'Copied the structure as SMILES.';
  }
  // in place of what is selected now; with nothing selected it is drawn as a new structure (not in
  // place of the one last edited, which chosenStructures() falls back to)
  const old = a.replace && editor.sel.atoms.size ? chosenStructures() : [];
  let ids: number[] = [];
  if (old.length) {
    const atoms = old.flatMap((f) => [...f]);
    const xs = atoms.map((id) => doc.atoms.get(id)!.x), ys = atoms.map((id) => doc.atoms.get(id)!.y);
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    doc.edit('Assistant: Replace Structure', () => {
      for (const id of atoms) doc.removeAtom(id);
      ids = addMolfile(doc, mb, c.x, c.y);
    });
  } else {
    const c = pastePoint();
    doc.edit('Assistant: Draw Structure', () => {
      ids = addMolfile(doc, mb, c.x, c.y);
      editor.sel = { atoms: new Set(ids), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() };
      editor.placeClear(placingPage());
    });
  }
  selectNewAtoms(ids);
  await keepPasteInside();
  return old.length ? 'Replaced the selected structure.' : a.replace ? 'Drew the structure as a new one (nothing was selected to replace).' : 'Drew the structure.';
}


/** Edit > Assistant is only there once an AI model is linked. */
function showAssistantMenu(): void {
  for (const b of document.querySelectorAll<HTMLElement>('[data-cmd="assistant"]')) b.hidden = aiPrefs.provider === 'none';
  if (aiPrefs.provider === 'none') assistantBar.now()?.close();
}

/** Edit > Assistant (Ctrl+/): the prompt bar, loaded and made the first time. */
const assistantBar = madeLater(async (): Promise<AssistantBar> => new (await import('./ui/assistant-bar')).AssistantBar({
  prefs: () => aiPrefs,
  savePrefs: (p) => { aiPrefs = p; storeSettings(); },
  mode: () => ws.active.mode as AssistantMode,
  items: assistantItems,
  apply: applyAssistantAction,
  markStep: markAssistantStep,
  undo: () => { command('undo'); },
  openSettings: aiSettings,
  area: () => document.getElementById('work')?.getBoundingClientRect() ?? null,
  tab: () => ws.active,
}));

/** "Mark on drawing" for a finding about a step: select that step's arrow. False when there is no such step. */
function markAssistantStep(n: number): boolean {
  const steps = reactionSteps(doc, schemeItems(doc, editor.measure()));
  const step = steps[n - 1];
  if (!step) return false;
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set([step.arrow.id]), shapes: new Set() };
  editor.changed();
  return true;
}

/**
 * Chemistry > Reactions and Schemes > Stoichiometry Table: the amounts for a reaction step, in a
 * new sheet. The step is the selected arrow's, or the only one in the drawing.
 */
async function stoichiometryTable(): Promise<void> {
  if (!chem.ready) { flash('The chemistry engine is still loading. Try again in a moment.'); return; }
  const got = pickedStep('make the table for');
  if (!got) return;
  const rows: StoichRow[] = (await stepSpecies(got)).map((r) => ({ role: r.role, name: r.name, ...(r.formula ? { formula: r.formula } : {}), ...(r.mw ? { mw: r.mw } : {}) }));
  // starting materials, then reagents, then the conditions, then products
  const order: StoichRole[] = ['Starting material', 'Reagent', 'Conditions', 'Product'];
  rows.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  if (!rows.some((r) => r.mw)) { flash('None of this step could be read as a compound.', 6000); return; }
  finishTyping();
  ws.newSheet(stoichiometryBook(rows));
  flash('Stoichiometry table: type the equivalents, the millimoles of the first starting material and any densities; the rest follows. Green metrics are under the table.', 8000);
}

/** Chemistry > Reactions and Schemes > Check Balance: the atoms on each side of the step's arrow. */
async function checkStepBalance(): Promise<void> {
  if (!chem.ready) { flash('The chemistry engine is still loading. Try again in a moment.'); return; }
  const got = pickedStep('check');
  if (!got) return;
  const rows = await stepSpecies(got);
  const read = (r: StepSpecies) => ({ formula: withoutCharge(r.formula!, r.charge ?? 0), charge: r.charge ?? 0 });
  const of = (role: StoichRole) => rows.filter((r) => r.role === role && r.formula).map(read);
  const unread = rows.filter((r) => r.role !== 'Conditions' && !r.formula).map((r) => r.name || 'a structure');
  if (!of('Starting material').length && !of('Reagent').length) { flash('None of the starting materials could be read as a compound.', 6000); return; }
  if (!of('Product').length) { flash('None of the products could be read as a compound.', 6000); return; }
  await showBalance({ starting: of('Starting material'), reagents: of('Reagent'), products: of('Product'), unread });
}

/** Edit > Copy As > Reaction SMILES or RXN: the step of the selected arrow (or the only one). */
async function copyReaction(as: 'smiles' | 'rxn'): Promise<void> {
  if (!chem.ready) { flash('The chemistry engine is still loading.'); return; }
  const got = pickedStep('copy');
  if (!got) return;
  const rows = await stepSpecies(got, true);
  const bad = rows.filter((r) => r.role !== 'Conditions' && !r.smiles);
  if (bad.length) { flash(`Not copied: ${bad.map((r) => r.name || 'a structure').join(', ')} can't be read as a compound (check its valences).`, 8000); return; }
  const parts = <T,>(f: (r: StepSpecies) => T) => ({
    reactants: rows.filter((r) => r.role === 'Starting material').map(f),
    agents: rows.filter((r) => r.role === 'Reagent').map(f),
    products: rows.filter((r) => r.role === 'Product').map(f),
  });
  const text = as === 'smiles' ? reactionSmiles(parts((r) => r.smiles!)) : rxnBlock(parts((r) => r.molblock!));
  const left = rows.some((r) => r.role === 'Conditions') ? ' Conditions written as text are left out.' : '';
  await copyText(text, as === 'smiles' ? `Copied reaction SMILES: ${text}${left}` : `Copied the reaction as an RXN file.${left}`);
}

/**
 * Paste a reaction (reaction SMILES or an RXN file): its starting materials in a row with + signs,
 * an arrow with the agents over it, and its products, tidied by Clean Up Reaction.
 */
async function pasteReaction(text: string, c: { x: number; y: number }): Promise<boolean> {
  let mols: { reactants: string[]; agents: string[]; products: string[] } | null = null;
  if (isRxn(text)) mols = parseRxn(text);
  else {
    const p = splitReactionSmiles(text);
    const read = async (xs: string[]) => { const out: string[] = []; for (const x of xs) { const mb = await chem.smilesToMol(x); if (!mb) return null; out.push(mb); } return out; };
    const r = await read(p.reactants), a = await read(p.agents), q = await read(p.products);
    mols = r && a && q ? { reactants: r, agents: a, products: q } : null;
  }
  if (!mols) { flash('This reaction could not be read (each species must be valid SMILES, or the RXN file V2000).', 6000); return false; }
  finishTyping();
  renderer.useStyle(doc);
  const bl = doc.style.bondLength, gap = bl * 1.2, lw = doc.style.lineWidth;
  const made: number[] = [], arrows: number[] = [], caps: number[] = [];
  // (with the atoms' labels, so HO at the end of one structure doesn't run into the next)
  const boxOf = (ids: number[]) => atomsBox(doc, ids, editor.measure());
  try {
    doc.edit('Paste reaction', () => {
      let x = 0;
      const place = (mb: string, at: number, y = 0) => {
        const ids = addMolfile(doc, mb, 0, 0);
        const b = boxOf(ids);
        doc.moveAtoms(ids, at - b.x1, y - (b.y1 + b.y2) / 2);
        made.push(...ids);
        return b.x2 - b.x1;
      };
      const plus = (at: number) => {
        const runs = [{ text: '+' } as TextRun];
        const f = renderer.captionFrame({ id: -1, x: 0, y: 0, runs, justify: 'left' } as Caption);
        caps.push(doc.addCaption({ x: at - (f.x1 + f.x2) / 2, y: -(f.y1 + f.y2) / 2, runs, justify: 'left' }).id);
        return f.x2 - f.x1;
      };
      mols!.reactants.forEach((mb, i) => {
        if (i) { x += gap * 0.5; x += plus(x) + gap * 0.5; }
        x += place(mb, x);
      });
      x += gap;
      // the agents over the arrow, side by side
      const tail = x;
      let ax = tail + gap * 0.5;
      for (const mb of mols!.agents) {
        const ids = addMolfile(doc, mb, 0, 0);
        const b = boxOf(ids);
        doc.moveAtoms(ids, ax - b.x1, -bl * 0.6 - b.y2);
        made.push(...ids);
        ax += b.x2 - b.x1 + gap * 0.5;
      }
      const head = Math.max(tail + bl * 3, ax + gap * 0.5 - gap * 0.5 + gap * 0.5);
      arrows.push(doc.addArrow({ tail: { x: tail, y: 0 }, head: { x: head, y: 0 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: lw * 10, headWidth: lw * 2.5 }).id);
      x = head + gap;
      mols!.products.forEach((mb, i) => {
        if (i) { x += gap * 0.5; x += plus(x) + gap * 0.5; }
        x += place(mb, x);
      });
      // the whole reaction where pasting goes
      const dx = c.x - x / 2, dy = c.y;
      doc.moveAtoms(made, dx, dy);
      for (const id of arrows) { const a = doc.arrows.get(id)!; doc.updateArrow(id, { tail: { x: a.tail.x + dx, y: a.tail.y + dy }, head: { x: a.head.x + dx, y: a.head.y + dy } }); }
      for (const id of caps) { const k = doc.captions.get(id)!; doc.updateCaption(id, { x: k.x + dx, y: k.y + dy }); }
      editor.sel = { atoms: new Set(made), bonds: new Set(), captions: new Set(caps), arrows: new Set(arrows), shapes: new Set() };
      // tidied and moved clear of what is there, in the same undo step
      editor.cleanUpReaction();
      editor.placeClear(placingPage());
    });
    selectNewAtoms(made);
    await keepPasteInside();
  } catch (err) {
    flash(String(err));
  }
  return true;
}

/** How Number Compounds counted last time (offered again). */
const numbering = { style: 'numbers' as IdStyle, prefix: '', suffix: '', bold: true, same: true, align: true };

/**
 * Each structure's key for "the same structure, the same ID": its canonical SMILES (with
 * stereo), by atom. Structures the chemistry engine can't read have none.
 */
async function structureKeys(): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!chem.ready) return out;
  const frags = doc.fragments().filter((f) => f.size);
  const mols = frags.map((f) => { const ex = toMolfile(doc, f); return { molblock: ex.molblock, map: ex.map }; });
  if (!mols.length) return out;
  const res = await chem.analyze(mols).catch(() => null);
  frags.forEach((f, i) => {
    const r = res?.results[i];
    if (r && !r.error && r.smiles) for (const a of f) out.set(a, r.smiles);
  });
  return out;
}

/** Space left between things set out in a row, column or grid: as last chosen, or one and a half bonds. */
let lastGridGap: number | null = null;
let lastGridGaps: { rowGap: number; colGap: number } | null = null;
const gridGap = () => lastGridGap ?? 1.5 * doc.style.bondLength;

/** Format ▸ Align ▸ Arrange in a Grid…: rows × columns and the spacing, with a live preview. */
async function arrangeInGrid(): Promise<void> {
  finishTyping();
  const n = editor.gridCount();
  if (n < 2) { flash('Select two or more structures or objects to put in a grid.'); return; }
  const start = { cols: defaultColumns(n), rowGap: lastGridGaps?.rowGap ?? gridGap(), colGap: lastGridGaps?.colGap ?? gridGap() };
  const preview = (p: GridPick) => {
    const { units: us, offsets } = editor.gridPlan({ kind: 'grid', cols: p.cols, gap: p.colGap, rowGap: p.rowGap, colGap: p.colGap });
    const sel: Selection = { atoms: new Set(us.flatMap((u) => u.atoms)), bonds: new Set(), captions: new Set(us.flatMap((u) => u.captions)), arrows: new Set(us.flatMap((u) => u.arrows)), shapes: new Set(us.flatMap((u) => u.shapes)) };
    sel.bonds = new Set([...doc.bonds.values()].filter((b) => sel.atoms.has(b.a1) && sel.atoms.has(b.a2)).map((b) => b.id));
    const d = extractDrawing(doc, sel);
    d.bulk(() => us.forEach((u, i) => moveUnit(d, u, offsets[i])));
    const pic = recordPicture(d, 6);
    return pic ? pictureSvg(pic).replace(/^<\?xml[^>]*>\s*/, '') : '';
  };
  const got = await askGridLayout(n, start, preview);
  if (!got) return;
  lastGridGaps = { rowGap: got.rowGap, colGap: got.colGap };
  if (!editor.arrangeGrid({ kind: 'grid', cols: got.cols, gap: got.colGap, rowGap: got.rowGap, colGap: got.colGap })) flash('They are already in that grid.');
}

// ---------------------------------------------------------------- Clean Up Structure

/**
 * The chemistry engine's own layouts of the target structures that look tangled (bonds crossing,
 * atoms on top of one another), for Clean Up to try alongside its own. Empty when the engine
 * isn't ready or nothing is tangled.
 */
async function engineLayouts(): Promise<Map<number, Vec>[]> {
  if (!chem.ready) return [];
  const out: Map<number, Vec>[] = [];
  for (const f of editor.cleanUpTargets()) {
    if (!looksTangled(doc, f)) continue;
    try {
      const mf = toMolfile(doc, f);
      const layouts = await chem.layouts(mf.molblock);
      for (const coords of layouts) {
        const m = new Map<number, Vec>();
        mf.map.forEach((id, i) => { if (id >= 0 && coords[i]) m.set(id, { x: coords[i][0], y: coords[i][1] }); });
        out.push(m);
      }
    } catch { /* the engine can't read it: Clean Up manages on its own */ }
  }
  return out;
}

/** Structure > Clean Up Structure. Pressed again on the same structures, it steps through other ways of laying them out. */
async function cleanUpStructures(): Promise<void> {
  const seeds = await engineLayouts();
  const r = editor.cleanUp(seeds);
  if (!r) flash('Nothing to clean up: the structures are already tidy.');
  else if (r.k > 0) flash(`${r.label} (${r.k + 1} of ${r.of}). Clean Up again for the next, or Clean Up Options… to see them all.`, 4000);
}

/** Structure > Clean Up Options…: every way Clean Up can lay out the picked structures, to choose from. */
async function cleanUpChoices(): Promise<void> {
  finishTyping();
  const seeds = await engineLayouts();
  const { frags, options } = editor.cleanUpChoices(seeds);
  if (!options.length) { flash('Draw or select a structure first.'); return; }
  const count = Math.max(...options.map((o) => o.length));
  const labels = Array.from({ length: count }, (_, k) => options[0][Math.min(k, options[0].length - 1)].label);
  const atoms = new Set(frags.flatMap((f) => [...f]));
  const sel: Selection = { atoms, bonds: new Set([...doc.bonds.values()].filter((b) => atoms.has(b.a1)).map((b) => b.id)), captions: new Set(), arrows: new Set(), shapes: new Set() };
  const pickOf = (k: number, turn: number, mirror: boolean) => options.map((o) => turnOption(o[Math.min(k, o.length - 1)], turn, mirror));
  const preview = (k: number, turn: number, mirror: boolean) => {
    const d = extractDrawing(doc, sel);
    d.bulk(() => {
      for (const o of pickOf(k, turn, mirror)) {
        for (const [id, p] of o.pos) if (d.atoms.has(id)) d.updateAtom(id, { x: p.x, y: p.y });
        for (const [id, look] of o.displays) if (d.bonds.has(id)) d.updateBond(id, { display: look });
      }
    });
    const pic = recordPicture(d, 6);
    return pic ? pictureSvg(pic).replace(/^<\?xml[^>]*>\s*/, '') : '';
  };
  const got = await askCleanUpOption(labels, preview);
  if (!got) return;
  editor.applyCleanUp(pickOf(got.option, got.turn, got.mirror));
}

/**
 * Chemistry > Reactions and Schemes > Scheme Settings: spacing between structures and + signs, and the text above and below
 * arrows (size, alignment, gap, the + boxes, fitting the arrow to it). A blank distance follows
 * the drawing's bond length.
 */
/** Scheme settings as typed in Settings ▸ Schemes. */
function schemeFrom(got: Record<string, string>): Partial<SchemePrefs> {
  const len = (v: string | undefined) => { const n = Number(v); return !v || v.trim() === '' || !isFinite(n) || n < 0 ? null : Math.min(500, n); };
  return {
    structGap: len(got.structGap), plusGap: len(got.plusGap), textGap: len(got.textGap), lead: len(got.lead), headGap: len(got.headGap),
    // (its size and font are the drawing style's now: Settings > Drawing Style)
    textSize: null,
    textAlign: got.textAlign === 'left' || got.textAlign === 'right' ? got.textAlign : 'center',
    helpers: got.helpers === 'true', fit: got.fit === 'true', sameLength: got.sameLength === 'true',
  };
}

async function schemeSettings(): Promise<void> {
  finishTyping();
  const p = schemePrefs;
  const bond = doc.style.bondLength;
  const pt = (v: number | null) => (v === null ? '' : String(v));
  const auto = (frac: number) => `${Math.round(frac * bond * 10) / 10} pt`;
  const got = await ask('Scheme Settings', [
    { name: 'structGap', label: 'Gap between arrow and structures', value: pt(p.structGap), type: 'number', unit: 'pt', placeholder: auto(SPACING.gap) },
    { name: 'plusGap', label: 'Space either side of +', value: pt(p.plusGap), type: 'number', unit: 'pt', placeholder: auto(SPACING.plus) },
    { name: 'helpers', label: 'Show + boxes above and below new arrows', value: String(p.helpers), type: 'checkbox' },
    { name: 'textAlign', label: 'Text alignment', value: p.textAlign, options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
    { name: 'textGap', label: 'Gap between arrow and text', value: pt(p.textGap), type: 'number', unit: 'pt', placeholder: auto(SPACING.conditions) },
    { name: 'fit', label: 'Fit arrow length to its text (moves the products)', value: String(p.fit), type: 'checkbox' },
    { name: 'sameLength', label: 'Clean Up Reaction makes arrows the same length', value: String(p.sameLength), type: 'checkbox' },
    { name: 'lead', label: 'Arrow before the text starts', value: pt(p.lead), type: 'number', unit: 'pt', placeholder: auto(SPACING.overhang) },
    { name: 'headGap', label: 'Space between text and arrowhead', value: pt(p.headGap), type: 'number', unit: 'pt', placeholder: auto(SPACING.overhang) },
  ], { ok: 'Save', note: 'Used when you type text beside an arrow, and by Clean Up Reaction and Arrange Scheme. These are the usual values for every file; a drawing style can have its own (Drawing Style ▸ Reaction arrows, with a preview), and those win. The text\'s size and font are in Drawing Style too. Leave a distance blank to scale it with the bond length. Existing schemes change when you next clean them up.',
    preview: { title: 'Preview', below: true, draw: (v, focus) => schemePreview(doc.style, schemeFrom(v), undefined, focus) } });
  if (!got) return;
  setSchemePrefs(schemeFrom(got));
  storeSettings();
  editor.requestOverlay();
}

/**
 * Chemistry > Labels and Numbers > Number Compounds: ID labels under the selected structures (or all), in scheme order,
 * counted as chosen; copies of one structure share an ID. Labels are tied to their structures.
 */
async function numberCompounds(): Promise<void> {
  const next = editor.sel.atoms.size ? editor.nextCompoundNumber() : 1;
  const startText = idText(numbering.style, next, 0).replace(/^\d+(?=[a-z])/, '');
  const got = await ask('Number Compounds', [
    { name: 'style', label: 'Count', value: numbering.style, options: [
      { value: 'numbers', label: '1, 2, 3 …' }, { value: 'letters', label: '1a, 1b, 1c …' }, { value: 'lower', label: 'a, b, c …' },
      { value: 'upper', label: 'A, B, C …' }, { value: 'roman', label: 'i, ii, iii …' }, { value: 'ROMAN', label: 'I, II, III …' }] },
    { name: 'start', label: 'Start at', value: numbering.style === 'letters' ? String(next) : startText, type: 'text', placeholder: '1, c or iii' },
    { name: 'prefix', label: 'Before each', value: numbering.prefix, type: 'text', placeholder: 'e.g. S for S1, S2' },
    { name: 'suffix', label: 'After each', value: numbering.suffix, type: 'text', placeholder: 'e.g. ′' },
    { name: 'bold', label: 'Bold', value: String(numbering.bold), type: 'checkbox' },
    { name: 'same', label: 'Same structure, same ID', value: String(numbering.same), type: 'checkbox' },
    { name: 'align', label: 'Align numbers in each row', value: String(numbering.align), type: 'checkbox' },
    { name: 'old', label: 'IDs already there', value: 'renumber', options: [{ value: 'renumber', label: 'Renumber' }, { value: 'keep', label: 'Keep' }] },
    { name: 'reagents', label: 'Reagents over arrows', value: 'skip', options: [{ value: 'skip', label: 'Leave unnumbered' }, { value: 'number', label: 'Number them too' }] },
  ], { ok: 'Number', note: 'Puts an ID under each selected structure (or every structure), following the arrows of a scheme, else left to right and top to bottom. Each is tied to its structure and is ordinary text you can change. For 1a, 1b, “Start at” is the number.' });
  if (!got) return;
  const style = got.style as IdStyle;
  const start = parseIdStart(got.start, style);
  if (start === null) { flash(`“${got.start}” isn't a place to start counting ${style === 'roman' || style === 'ROMAN' ? 'in roman numerals' : style === 'lower' || style === 'upper' ? 'in letters' : 'from'}.`); return; }
  Object.assign(numbering, { style, prefix: got.prefix, suffix: got.suffix, bold: got.bold === 'true', same: got.same === 'true', align: got.align === 'true' });
  let keyOf: ((atoms: number[]) => string | undefined) | undefined;
  if (numbering.same) {
    const keys = await structureKeys();
    keyOf = (atoms) => keys.get(atoms[0]);
  }
  const n = editor.numberCompounds({ start: Math.max(0, start), style, prefix: got.prefix, suffix: got.suffix, bold: numbering.bold, align: numbering.align, keep: got.old === 'keep', reagents: got.reagents === 'number', keyOf });
  if (!n) flash('No structures to number.');
}

/**
 * Chemistry > Labels and Numbers > Add ID Label and Add Caption: text centred under each chosen structure, tied to
 * it, then typing straight away. An ID label is the next compound number (or the ID a copy of
 * the structure already has).
 */
async function addTiedText(role: 'label' | 'caption'): Promise<void> {
  const frags = chosenStructures();
  if (!frags.length) { flash('Select a structure first.'); return; }
  const m = editor.measure();
  // copies already labelled keep their ID
  const keys = role === 'label' && numbering.same ? await structureKeys() : new Map<number, string>();
  const known = new Map<string, string>();
  if (keys.size) {
    for (const c of doc.captions.values()) {
      if (c.attach?.role !== 'label') continue;
      const k = c.attach.atoms.map((a) => keys.get(a)).find((x) => x);
      if (k) known.set(k, plainText(c.runs).trim());
    }
  }
  // new IDs count on in the style Number Compounds last used, skipping any already in use
  const inUse = new Set([...doc.captions.values()].filter((c) => c.attach?.role === 'label').map((c) => plainText(c.runs).trim()));
  const base = numbering.style === 'numbers' || numbering.style === 'letters' ? editor.nextCompoundNumber() : 1;
  let k = 0;
  const freshId = () => {
    let t: string;
    do t = idText(numbering.style, base, k++, numbering.prefix, numbering.suffix); while (inUse.has(t));
    inUse.add(t);
    return t;
  };
  const made: number[] = [];
  doc.edit(role === 'label' ? 'Add ID label' : 'Add caption', () => {
    for (const f of frags) {
      const k = keys.get([...f][0]);
      const text = role === 'caption' ? '' : (k && known.get(k)) || freshId();
      if (k && role === 'label' && !known.has(k)) known.set(k, text);
      const c = doc.addCaption({ x: 0, y: 0, runs: [{ text, bold: role === 'label' && numbering.bold ? true : undefined }], justify: 'center',
        attach: { atoms: [...f], side: 'below', gap: defaultGap(doc), shift: 0, role } });
      placeAttached(doc, c, m);
      made.push(c.id);
    }
  });
  editor.changed();
  // type into the first (the others are selected, to style together)
  if (made.length === 1) editor.typeInto(made[0]);
  else { editor.clearSelection(); for (const id of made) editor.sel.captions.add(id); editor.changed(); }
}

// ---------------------------------------------------------------- text boxes read as chemistry

/** Settings ▸ Preferences: what happens to an ion typed as text. */
const chemText = { ionCharges: false, saltGroups: false };

/** The selected text boxes that are read as chemistry. */
function selectedSpecies(): Caption[] {
  const m = editor.measure();
  return [...editor.sel.captions].map((id) => doc.captions.get(id)).filter((c): c is Caption => !!c && !!captionSpecies(doc, c, m));
}

/**
 * What a command on "the selection, or else everything" counts: the atoms, and the text boxes
 * read as chemistry (selected ones, and ions grouped with the atoms as their salt).
 */
/** A lone picked atom or bond stands for its whole structure when copying chemistry (src/editor/lone-pick.ts). */
const loneAtomStructure = (): Set<number> | null => loneStructure(doc, editor.sel);

function chemistryInSelection(): { atoms: number[]; species: PlacedSpecies[] } {
  const chosen = selectedSpecies();
  const lone = chosen.length ? null : loneAtomStructure();
  const any = editor.sel.atoms.size > 0 || chosen.length > 0 || !!lone;
  const atoms = [...(lone ?? (any ? editor.sel.atoms : doc.atoms.keys()))];
  const caps = new Set<Caption>(any ? [...chosen, ...groupedIons(doc, atoms, editor.measure())] : [...chemicalCaptions(doc, editor.measure()).keys()].map((id) => doc.captions.get(id)!));
  return { atoms, species: placeSpecies(doc, caps, editor.measure()) };
}

/** Each text box read as chemistry, and whether it has a problem (for the marks on screen). */
let chemMarkKey = '';
function chemMark(c: Caption): 'chem' | 'warn' | null {
  if (!captionSpecies(doc, c, editor.measure()) && !(c.chem && !c.ignoreWarnings && captionChemWarning(doc, c, editor.measure()))) return null;
  return !c.ignoreWarnings && captionChemWarning(doc, c, editor.measure()) ? 'warn' : 'chem';
}
renderer.chemMarks = chemMark;
renderer.holderHints = true;

/** Repaint when which text boxes read as chemistry changes for some other reason than their own text (an arrow moved). */
function refreshChemMarks(): void {
  const key = [...doc.captions.values()].map((c) => { const k = chemMark(c); return k ? `${c.id}${k[0]}` : ''; }).join(',');
  if (key === chemMarkKey) return;
  const first = !chemMarkKey && !key;
  chemMarkKey = key;
  if (!first) { renderer.repaintAll(); editor.requestScene(); }
}

/**
 * Typing into a text box finished: an ion without its charge gets it, and an ion next to one of
 * the opposite charge is grouped with it as a salt, when the settings say so.
 */
function captionTyped(id: number): void {
  const c = doc.captions.get(id);
  if (!c) return;
  const m = editor.measure();
  let sp = captionSpecies(doc, c, m);
  if (!sp) return;
  if (chemText.ionCharges && sp.expected !== undefined && !sp.written) {
    const sign = chargeSign(sp.expected);
    const last = c.runs[c.runs.length - 1];
    doc.edit('Add charge', () => doc.updateCaption(id, { runs: [...c.runs, { ...last, text: sign, sub: undefined, sup: true, formula: undefined }] }));
    editor.changed();
    sp = captionSpecies(doc, doc.captions.get(id)!, m);
    if (!sp) return;
    flash(`Added the ${sign} charge of ${sp.name ?? sp.body}. Undo (Ctrl+Z) to take it off, or turn this off in Settings ▸ Preferences.`, 6000);
  }
  if (chemText.saltGroups && sp.charge) groupCounterion(id, sp.charge);
}

/** Group a text box holding an ion with the nearest structure or ion of the opposite charge (one salt). */
function groupCounterion(id: number, charge: number): void {
  const c = doc.captions.get(id)!;
  const m = editor.measure();
  const box = renderer.captionBox(c);
  const reach = doc.style.bondLength * 2.5;
  const gap = (p: { x: number; y: number }) => Math.hypot(Math.max(box.x1 - p.x, 0, p.x - box.x2), Math.max(box.y1 - p.y, 0, p.y - box.y2));
  let best: { d: number; atoms: number[]; caption?: number } | null = null;
  const seen = new Set<number>();
  for (const a of doc.atomsNear({ x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 }, reach + Math.hypot(box.x2 - box.x1, box.y2 - box.y1) / 2)) {
    if (seen.has(a.id)) continue;
    const f = doc.fragmentOf(a.id);
    for (const x of f) seen.add(x);
    let q = 0, d = Infinity;
    for (const x of f) { const at = doc.atoms.get(x)!; q += at.charge; d = Math.min(d, gap(at)); }
    if (q * charge < 0 && d <= reach && (!best || d < best.d)) best = { d, atoms: [...f] };
  }
  for (const o of doc.captions.values()) {
    if (o.id === id) continue;
    const sp = captionSpecies(doc, o, m);
    if (!sp || sp.charge * charge >= 0) continue;
    const ob = renderer.captionBox(o);
    const d = Math.hypot(Math.max(ob.x1 - box.x2, 0, box.x1 - ob.x2), Math.max(ob.y1 - box.y2, 0, box.y1 - ob.y2));
    if (d <= reach && (!best || d < best.d)) best = { d, atoms: [], caption: o.id };
  }
  if (!best) return;
  const other = best.caption !== undefined ? doc.captions.get(best.caption)?.grp : doc.atoms.get(best.atoms[0])?.grp;
  if (other !== undefined && other === c.grp) return;
  const sel = { atoms: new Set(best.atoms), bonds: new Set<number>(), captions: new Set([id, ...(best.caption !== undefined ? [best.caption] : [])]), arrows: new Set<number>(), shapes: new Set<number>() };
  doc.edit('Group salt', () => groupSelection(doc, sel));
  editor.changed();
  flash('Grouped the counterion with its partner as one salt. Undo (Ctrl+Z) to keep them apart, or turn this off in Settings ▸ Preferences.', 6000);
}
editor.onCaptionDone = captionTyped;

/** Set the selected text boxes to be read as chemistry, as plain text, or by themselves. */
function setCaptionChem(how: 'auto' | 'on' | 'off'): boolean {
  const caps = [...editor.sel.captions].map((id) => doc.captions.get(id)).filter((c): c is Caption => !!c);
  if (!caps.length) { flash('Select a text box first.'); return false; }
  const chem = how === 'auto' ? undefined : how === 'on';
  doc.edit(how === 'off' ? 'Read as plain text' : how === 'on' ? 'Read as chemistry' : 'Read text automatically', () => { for (const c of caps) doc.updateCaption(c.id, { chem }); });
  editor.changed();
  if (how === 'on') {
    const bad = caps.filter((c) => !captionSpecies(doc, doc.captions.get(c.id)!, editor.measure()));
    if (bad.length) flash(`Not read as chemistry: ${bad.map((c) => `“${plainText(c.runs).trim()}”`).join(', ')}. It is flagged in Warnings.`, 6000);
  }
  return true;
}

// ---------------------------------------------------------------- labels that clash

/** Captions whose compound label is also used for a different structure, with the warning to show. */
let labelWarnings = new Map<number, string>();
let labelWarnVersion = 0, labelCheckTimer = 0, labelCheckedAt = -1;

/** Look for one ID used under different structures (shortly after each change). */
function scheduleLabelCheck(): void {
  if (labelCheckedAt === doc.version) return;
  clearTimeout(labelCheckTimer);
  labelCheckTimer = window.setTimeout(() => void checkLabels(), 400);
}

async function checkLabels(): Promise<void> {
  const version = doc.version;
  refreshChemMarks();
  const items = schemeItems(doc, editor.measure());
  const labels = labelsOf(items, new Set(), doc, doc.style.bondLength);
  let found = new Map<number, string>();
  if (labels.size > 1) {
    const keys = await structureKeys();
    if (doc.version !== version) { scheduleLabelCheck(); return; }
    const list: { caption: number; text: string; key?: string }[] = [];
    for (const [it, caps] of labels) {
      for (const c of caps) {
        const cap = doc.captions.get(c.caption!);
        if (cap && !cap.ignoreWarnings) list.push({ caption: cap.id, text: plainText(cap.runs), key: keys.get(it.atoms[0]) });
      }
    }
    found = labelClashes(list);
  }
  labelCheckedAt = version;
  const same = found.size === labelWarnings.size && [...found].every(([k, v]) => labelWarnings.get(k) === v);
  if (!same) { labelWarnings = found; labelWarnVersion++; updateWarnings(); }
}

editor.askChainLength = async (last) => {
  const got = await ask('Chain', [{ name: 'n', label: 'Number of atoms', value: String(last), type: 'number' }],
    { ok: 'Draw', note: 'Clicked on an atom, the chain adds this many atoms to it. Alt+click draws the same number again without asking.' });
  const n = got ? Math.round(Number(got.n)) : NaN;
  return n >= 1 ? n : null;
};

// ---------------------------------------------------------------- your own templates and nicknames

/** Nicknames the person defined (kept in the settings file). */
let ownNicknames: Record<string, string> = {};

/** Put these templates in the My templates palette. */
function useOwnTemplates(list: Template[]): void {
  setOwnTemplates(list);
  for (const name of Object.keys(TOOLS)) if (name.startsWith('tpl-own-')) delete TOOLS[name];
  for (const t of ownTemplates()) TOOLS[`tpl-${t.id}`] = { kind: 'template', id: t.id };
  OWN_PALETTE.items = [OWN_PALETTE.items[0], ...ownTemplates().map((t) => ({ name: `tpl-${t.id}`, title: t.name }))];
  toolbar.refreshTitles();
}

/** Chemistry > Nicknames and Templates > Save as Template: the selected structure goes into My templates. */
async function saveTemplate(): Promise<void> {
  // a lone atom (one right-clicked) stands for its whole structure
  const ids = editor.sel.atoms.size === 1 && !editor.sel.bonds.size ? chosenStructures().flatMap((f) => [...f]) : [...editor.sel.atoms];
  if (!ids.length) { flash('Select a structure first, then save it as a template.'); return; }
  const got = await ask('Save as Template', [{ name: 'name', label: 'Name', value: '' }],
    { ok: 'Save', note: 'The selected structure goes into My templates on the tool bar (the last template palette). It is kept in your settings file, so it is there every time.' });
  const name = got?.name.trim();
  if (!name) return;
  const t = templateFromAtoms(doc, ids, name, `own-${Date.now().toString(36)}`);
  if (!t) { flash('Nothing to save: select atoms and bonds.'); return; }
  useOwnTemplates([...ownTemplates(), t]);
  storeSettings();
  editor.setTool(`tpl-${t.id}`);
  flash(`Saved “${name}” in My templates. Click to place it, a bond to fuse it, or an atom to join it.`, 6000);
}

/** Chemistry > Nicknames and Templates > Delete Template…: take one of your own templates away. */
async function deleteTemplate(): Promise<void> {
  const list = ownTemplates();
  if (!list.length) { flash('You have no templates of your own yet (Chemistry > Abbreviations and Templates > Save as Template).'); return; }
  const got = await ask('Delete Template', [{ name: 'id', label: 'Template', value: list[list.length - 1].id, options: list.map((t) => ({ value: t.id, label: t.name })) }], { ok: 'Delete' });
  if (!got) return;
  useOwnTemplates(list.filter((t) => t.id !== got.id));
  if (editor.toolName === `tpl-${got.id}`) editor.setTool('bond-single');
  storeSettings();
}

/** Chemistry > Nicknames and Templates > Define Nickname…: the selected group gets a name that can be typed as a label. */
async function defineNickname(): Promise<void> {
  const g = selectedGroup(doc, editor.sel.atoms);
  if ('error' in g) { flash(g.error, 6000); return; }
  const got = await ask('Define Abbreviation', [{ name: 'name', label: 'Abbreviation', value: '' }],
    { ok: 'Define', note: `Select a group attached to a structure by one bond. Its abbreviation can then be typed as an atom label (like Boc or TBS), with formula and mass calculated. The group is ${g.smiles}.` });
  const name = got?.name.trim();
  if (!name) return;
  if (isBuiltInNickname(name)) { flash(`“${name}” is already an abbreviation. Choose another name.`, 6000); return; }
  if (/\s/.test(name)) { flash('An abbreviation can\'t have spaces in it.'); return; }
  ownNicknames = { ...ownNicknames, [name]: g.smiles };
  addNicknames({ [name]: g.smiles });
  storeSettings();
  flash(`“${name}” can now be typed as a label.`, 5000);
}

/** Chemistry > Nicknames and Templates > Delete Nickname…: take one of your own nicknames away. */
async function deleteNickname(): Promise<void> {
  const names = Object.keys(ownNicknames);
  if (!names.length) { flash('You have no abbreviations of your own yet (Chemistry > Abbreviations and Templates > Define Abbreviation).'); return; }
  const got = await ask('Delete Abbreviation', [{ name: 'name', label: 'Abbreviation', value: names[0], options: names.map((n) => ({ value: n, label: `${n}  (${ownNicknames[n]})` })) }], { ok: 'Delete' });
  if (!got) return;
  const { [got.name]: _, ...rest } = ownNicknames;
  ownNicknames = rest;
  removeNickname(got.name);
  renderer.repaintAll();
  editor.requestScene();
  storeSettings();
}

/** Chemistry > Contract Label…: fold the selected group into one label (Undo opens it again). */
/**
 * Chemistry > Expand Label: the selected labels drawn out as atoms and bonds. Ligands on a
 * metal come from their templates (BINAP keeps its PPh2 groups as labels); other abbreviations
 * are laid out by the chemistry engine. Expand Label Fully (`full`) goes on drawing out the
 * labels that brings in (PPh2, P(t-Bu)2, CHPh2) until none are left, as one step to undo.
 */
async function expandLabel(full = false): Promise<void> {
  if (full) await loadFullLigands();
  let list = editor.expandableLabels();
  let made: number[] = [];
  if (!list.length && selectedSpecies().length) {
    made = await expandText(selectedSpecies(), full);
    if (!full || !made.length) return;
    editor.selectThese({ atoms: new Set(made), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });
    list = editor.expandableLabels();
    if (!list.length) return;
  } else if (!list.length) { flash('Select a label to expand: an abbreviation such as OMe, Boc or CO2Et, a ligand such as BINAP or dppf, or a ligand on a metal such as PPh3, dppe or Cp*.', 6000); return; }
  const failed: string[] = [];
  let n = 0;
  const all = new Set(made);
  // a text box drawn out is a step already: the rounds after it join that step
  let join = made.length > 0;
  for (let round = 0; round < (full ? 5 : 1) && list.length; round++) {
    const mbs = new Map<number, string>();
    for (const x of list) {
      if (x.template) continue;
      const mb = x.smiles ? await chem.smilesToMol((doc.degree(x.id) === 1 ? '*' : '') + x.smiles) : null;
      if (mb) mbs.set(x.id, mb);
      else failed.push(doc.atoms.get(x.id)?.label ?? '');
    }
    const got = editor.expandLabels(list, mbs, join, full);
    if (!got) break;
    n += got;
    join = true;
    for (const id of editor.sel.atoms) all.add(id);
    list = full ? editor.expandableLabels().filter((x) => !failed.includes(doc.atoms.get(x.id)?.label ?? '')) : [];
  }
  if (full && all.size) editor.selectThese({ atoms: new Set([...all].filter((id) => doc.atoms.has(id))), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });
  if (failed.length) flash(`Not expanded (not read as chemistry): ${[...new Set(failed)].map((f) => `“${f}”`).join(', ')}`, 6000);
  else if (!n && !made.length) flash('Nothing to expand.');
}

/**
 * Expand Label on text boxes read as chemistry (DMAP, BF4⁻): each drawn as its structure, where
 * the text was. A ligand's name (BINAP, dppf) is drawn the usual way, from the Ligand Library.
 * Returns the atoms drawn.
 */
async function expandText(caps: Caption[], full = false): Promise<number[]> {
  const m = editor.measure();
  const drawn: { id: number; mb?: string; lig?: Template; x: number; y: number }[] = [];
  const failed: string[] = [];
  for (const c of caps) {
    const b = m.captionBox(c);
    const at = { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
    const lig = freeLigandFor(plainText(c.runs).trim(), full);
    if (lig) { drawn.push({ id: c.id, lig, ...at }); continue; }
    if (!chem.ready) { failed.push(plainText(c.runs).trim()); continue; }
    const sp = captionSpecies(doc, c, m);
    const mb = sp ? await chem.smilesToMol(speciesSmiles(sp)).catch(() => null) : null;
    if (mb) drawn.push({ id: c.id, mb, ...at });
    else failed.push(plainText(c.runs).trim());
  }
  const made: number[] = [];
  if (drawn.length) {
    doc.edit('Expand text', () => {
      for (const d of drawn) {
        const grp = doc.captions.get(d.id)?.grp;
        doc.removeCaption(d.id);
        const ids = d.lig ? placeFreeLigand(doc, d.lig, d) : addMolfile(doc, d.mb!, d.x, d.y);
        // a salt's counterion stays in its group
        if (grp !== undefined) for (const id of ids) doc.updateAtom(id, { grp });
        made.push(...ids);
      }
    });
    editor.selectThese({ atoms: new Set(made), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });
    editor.changed();
  }
  if (failed.length) flash(chem.ready ? `Not expanded (not read as chemistry): ${failed.map((f) => `“${f}”`).join(', ')}` : 'The chemistry engine is still loading.', 6000);
  return made;
}

/** Canonical SMILES of each built-in nickname with its join point (worked out once). */
let nicknameKeys: Promise<Map<string, string[]>> | null = null;

async function groupKey(smiles: string): Promise<string | null> {
  const mb = await chem.smilesToMol('*' + smiles);
  return mb ? chem.molToSmiles(mb) : null;
}

/** The built-in nicknames that mean exactly this group (SMILES from where it joins). */
async function builtInNamesFor(smiles: string): Promise<string[]> {
  if (!chem.ready) return [];
  nicknameKeys ??= (async () => {
    const m = new Map<string, string[]>();
    for (const [name, smi] of builtInNicknames()) {
      if (smi.includes('*')) continue;
      const k = await groupKey(smi);
      if (k) m.set(k, [...(m.get(k) ?? []), name]);
    }
    return m;
  })();
  const k = await groupKey(smiles);
  return (k && (await nicknameKeys).get(k)) || [];
}

async function contractLabel(): Promise<void> {
  const g = selectedGroup(doc, editor.sel.atoms);
  if ('error' in g) { flash(g.error, 6000); return; }
  // when the selection is a group the program already has a name for (Ph, TBS, Boc), offer that name
  const same = await builtInNamesFor(g.smiles);
  const got = await ask('Contract Label', [{ name: 'name', label: 'Label', value: same[0] ?? '' }],
    { ok: 'Contract', note: `The selected group becomes one label with this name.${same.length > 1 ? ` It is also known as ${same.slice(1).join(', ')}.` : ''} The formula and mass still count the whole group, and ChemDraw sees the group inside the label.` });
  if (!got) return;
  const err = editor.contractLabel(got.name, same);
  if (err) flash(err, 6000);
}

const arrangeDialog = new ArrangeDialog({ apply: (o) => editor.arrangeScheme(o), undo: () => editor.undo() });
/** Animate Reaction: its code loads the first time it opens. */
let animateDialogLoading: Promise<AnimateDialog> | null = null;
const animateDialog = {
  open(opts: { arrow?: number } = {}): void {
    animateDialogLoading ??= import('./ui/animate-dialog').then(({ AnimateDialog }) => new AnimateDialog({
      doc: () => doc,
      renderer: () => renderer,
      selectedAtoms: () => new Set(editor.sel.atoms),
      setMorph: (arrow, m) => doc.edit('Animation Pairing', () => doc.updateArrow(arrow, { morph: m })),
      name: () => ws.active.name,
      flash: (msg) => flash(msg, 6000),
      onSlide: () => ws.active.mode === 'slides',
      putOnSlide: (v) => placeClip(v),
    }), (err: unknown) => {
      animateDialogLoading = null;
      throw err;
    });
    animateDialogLoading.then((d) => d.open(opts), (err: unknown) => void showError(`Animate Reaction could not be loaded: ${String(err)}`));
  },
};
/** The reaction arrow picked (for Animate This Step), if one is. */
/** Is a curved (mechanism) arrow among the selection? */
const pickedCurved = (): boolean => [...editor.sel.arrows].some((id) => { const r = doc.arrows.get(id); return !!r && isCurved(r); });
/** Whether the selection is in a Smart Scheme laid out as a cycle (Clean Up Cycle applies). */
const smartIsCycle = (): boolean => { const id = editor.selectedSmart(); const d = id === null ? undefined : doc.shapes.get(id)?.smart; return !!d && d.layout === 'cycle' && !d.free; };
const pickedReactionArrow = (): number | undefined => [...editor.sel.arrows].find((id) => { const r = doc.arrows.get(id); return !!r && isReactionArrow(r); });

const mapChoice: Record<string, string> = { numbers: 'true', colours: 'false', bonds: 'false' };
/**
 * Chemistry > Reactions and Schemes > Map Atoms: atom-atom map numbers across the selected reaction
 * step (or every step), shown as numbers, colours or both, with bonds made and broken marked.
 */
async function mapAtomsCommand(): Promise<void> {
  finishTyping();
  const arrow = pickedReactionArrow();
  const got = await ask('Map Atoms', [
    ...(arrow !== undefined ? [{ name: 'which', label: 'Map', value: 'step', options: [{ value: 'step', label: 'The selected reaction step' }, { value: 'all', label: 'Every step in the drawing' }] }] : []),
    { name: 'numbers', label: 'Show the map numbers beside the atoms', type: 'checkbox', value: mapChoice.numbers },
    { name: 'look', label: 'Map number boxes', value: docMapLook(doc.style).look, options: MAP_LOOKS.map((l) => ({ value: l.value, label: l.label })) },
    { name: 'colours', label: 'Color each atom and where it goes the same', type: 'checkbox', value: mapChoice.colours },
    { name: 'bonds', label: 'Mark bonds made (green) and broken (red)', type: 'checkbox', value: mapChoice.bonds },
  ], { ok: 'Map', note: 'Atoms are paired the way Animate Reaction pairs them. To change a pair, pair it by hand in Animate Reaction and map again. Map numbers go into copied reaction SMILES and RXN files.' });
  if (!got) return;
  Object.assign(mapChoice, { numbers: got.numbers, colours: got.colours, bonds: got.bonds });
  if (MAP_LOOKS.some((l) => l.value === got.look) && got.look !== docMapLook(doc.style).look) {
    setMapLook(got.look as MapLook);
    // your own format: set it now (it starts as light peach with a dark outline)
    if (got.look === 'custom') await mapFormatCommand(false);
  }
  const { mapAtoms, applyAtomMap } = await import('./morph/atom-map');
  const res = mapAtoms(doc, renderer, { arrow: got.which === 'step' ? arrow : undefined, measure: editor.measure() });
  if (!res.steps) { flash('No reaction step to map: draw the starting materials, a reaction arrow and the products.', 6000); return; }
  let kept = { keptNumbers: 0, keptColours: 0 };
  doc.edit('Map Atoms', () => { kept = applyAtomMap(doc, res, { numbers: got.numbers === 'true', colours: got.colours === 'true', bonds: got.bonds === 'true' }); });
  editor.changed();
  const top = Math.max(0, ...res.numbers.values());
  const notes = [
    `Mapped ${top} atom${top === 1 ? '' : 's'} across ${res.steps} step${res.steps === 1 ? '' : 's'}`,
    `${res.made.length} bond${res.made.length === 1 ? '' : 's'} made, ${res.broken.length} broken`,
    res.unmatched ? `${res.unmatched} product atom${res.unmatched === 1 ? ' has' : 's have'} no starting-material atom (from a reagent?)` : '',
    kept.keptNumbers ? `${kept.keptNumbers} atom number${kept.keptNumbers === 1 ? '' : 's'} you had put on kept` : '',
    kept.keptColours ? `${kept.keptColours} highlight${kept.keptColours === 1 ? '' : 's'} you had put on kept` : '',
    ...res.errors.map((e) => `Pairs saved in Animate Reaction left out: ${e}`),
  ].filter(Boolean);
  flash(notes.join('. ') + '.', 8000);
}

/**
 * The drawing's map-number look (and its own box format), saved with the file as one undoable
 * step; the last one chosen is also the default for drawings with none of their own.
 */
function setMapLook(look: MapLook, box?: MapBoxStyle): void {
  const own = { ...docMapLook(doc.style).custom, ...box };
  doc.edit('Map Number Format', () => doc.setStyle({ ...doc.style, mapLook: look, mapBox: own }));
  mapLookPrefs.look = look;
  mapLookPrefs.custom = { ...own };
  editor.changed();
  storeSettings();
}

/**
 * Chemistry > Reactions and Schemes > Map Number Format…: this drawing's own format for every
 * map-number box; choosing it also switches the boxes to that format.
 */
async function mapFormatCommand(switchLook = true): Promise<void> {
  finishTyping();
  const { askMapFormat } = await import('./ui/map-format');
  const now = docMapLook(doc.style);
  const got = await askMapFormat(now.custom);
  if (!got) return;
  setMapLook(switchLook ? 'custom' : now.look, got);
}

/** Chemistry > Reactions and Schemes > Clear Atom Map: on the selected structures, or everywhere. */
async function clearAtomMapCommand(): Promise<void> {
  finishTyping();
  const { clearAtomMap } = await import('./morph/atom-map');
  const scope = editor.sel.atoms.size ? new Set([...editor.sel.atoms].flatMap((id) => [...doc.fragmentOf(id)])) : undefined;
  if (![...(scope ?? doc.atoms.keys())].some((id) => doc.atoms.get(id)?.mapNo)) { flash('Nothing here has an atom map.'); return; }
  doc.edit('Clear Atom Map', () => { clearAtomMap(doc, scope); });
  editor.changed();
}
const nameDialog = new NameDialog(async (name) => {
  // a SMILES string (or molfile) is drawn as it is; anything else is read as a name
  const mb = chem.ready ? await molfileOrSmiles(name, (s) => chem.smilesToMol(s)) : null;
  const got = mb ? { mb, attach: [], warnings: [] } : await nameToMolfile(name);
  if ('error' in got) return got;
  const c = pasteCentre();
  try {
    let ids: number[] = [];
    doc.edit('Name to Structure', () => {
      ids = addNamed(got, c.x, c.y);
      editor.sel = { atoms: new Set(ids), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() };
      editor.placeClear(placingPage());
    });
    selectNewAtoms(ids);
  } catch (err) {
    return { error: String(err) };
  }
  if (got.warnings.length) flash('Note: ' + got.warnings.join(' '), 9000);
  return null;
}, () => !namesReady);

/** Insert > Structure from Sequence: a peptide drawn out in full, put in the middle of the view (or the slide). */
const sequenceDialog = new SequenceDialog((t) => {
  const c = pasteCentre();
  try {
    let ids: number[] = [];
    doc.edit('Structure from Sequence', () => {
      ids = placeTemplate(doc, t, freePlacement(c, doc.style.bondLength), { noMerge: true });
      editor.sel = { atoms: new Set(ids), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() };
      editor.placeClear(placingPage());
    });
    selectNewAtoms(ids);
  } catch (err) {
    return String(err);
  }
  return null;
});

/**
 * Chemistry > Name to Structure. Selected captions are read as names and replaced by their
 * structures (Undo puts them back); with no caption selected, a window asks for a name.
 */
async function nameToStructure(): Promise<void> {
  const caps = [...editor.sel.captions].map((id) => doc.captions.get(id)).filter((c): c is Caption => !!c);
  if (!caps.length) { nameDialog.open(); return; }
  if (!namesReady) flash('Starting the name reader (only the first time)…');
  const found: { cap: Caption; mb: string; attach: number[] }[] = [];
  const problems: { name: string; why: string }[] = [], notes: string[] = [];
  for (const cap of caps) {
    const name = captionName(cap.runs.map((r) => r.text).join(''));
    const got = await nameToMolfile(name);
    if ('error' in got) problems.push({ name, why: got.error });
    else { found.push({ cap, mb: got.mb, attach: got.attach }); notes.push(...got.warnings); }
  }
  if (found.length) {
    let ids: number[] = [];
    try {
      doc.edit('Name to Structure', () => {
        for (const f of found) {
          const box = renderer.captionBox(f.cap);
          ids = ids.concat(addNamed(f, (box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2));
          doc.removeCaption(f.cap.id);
        }
      });
    } catch (err) {
      flash(String(err));
      return;
    }
    selectNewAtoms(ids);
  }
  if (problems.length === 1 && !found.length) flash(problems[0].why, 9000);
  else if (problems.length) flash(`Not read as ${problems.length === 1 ? 'a name' : 'names'} (select one on its own to see why): ${problems.map((p) => `"${p.name}"`).join(', ')}`, 9000);
  else if (notes.length) flash('Note: ' + notes.join(' '), 9000);
}

/** Copy the selected structures (or everything) as SMILES text. */
async function copySmiles(): Promise<void> {
  if (!chem.ready) { flash('The chemistry engine is still loading.'); return; }
  const { atoms, species } = chemistryInSelection();
  const { molblock } = toMolfile(doc, atoms, '', { species });
  let smiles = await chem.molToSmiles(molblock);
  if (!smiles) {
    // most often an atom with too many bonds: say which, and offer the SMILES as drawn
    const ids = new Set(atoms);
    const bad = checks.list().find((w) => w.kind === 'atom' && ids.has(w.id));
    if (!bad) { flash('There is no structure to copy.'); return; }
    editor.reveal('atom', bad.id);
    const loose = await chem.molToSmiles(molblock, true);
    if (!loose) { flash(`Not copied: ${bad.text.join(' ')}`, 8000); return; }
    const go = await ask('Copy as SMILES', [], { ok: 'Copy Anyway', note: `The structure can't be read as drawn (the atom with the problem is now selected). ${bad.text.join(' ')} Copy the SMILES anyway? Other programs may refuse it.` });
    if (!go) return;
    smiles = loose;
  }
  await navigator.clipboard.writeText(smiles).then(() => flash('Copied SMILES: ' + smiles), () => flash('Could not use the clipboard.'));
}

/** Paste the clipboard's text as SMILES (or a molfile), even when a drawing is on it too. */
async function pasteSmiles(): Promise<void> {
  let text = '';
  try {
    text = (await readClipboardText()).trim();
  } catch (err) {
    flash('Could not read the clipboard: ' + String(err));
    return;
  }
  if (!text) { flash('The clipboard has no text on it.'); return; }
  await pasteChemistry(text);
}

function copyText(text: string, done: string): Promise<void> {
  return navigator.clipboard.writeText(text).then(() => flash(done), () => flash('Could not use the clipboard.'));
}

/** Copy the selected structures (or all of them) as molfile text. */
function copyMolfile(): Promise<void> {
  const atoms = loneAtomStructure() ?? (editor.sel.atoms.size ? editor.sel.atoms : doc.atoms.keys());
  const { molblock } = toMolfile(doc, atoms);
  return copyText(molblock, 'Copied as molfile text.');
}

/** Copy the selection (or the whole drawing) as CDXML text, for pasting into a text editor or script. */
function copyCdxmlText(): Promise<void> | void {
  const part = extractDrawing(doc, chemistrySelection(doc, editor.sel, editor.hasSelection()));
  if (isEmpty(part)) { flash('There is nothing to copy.'); return; }
  return copyText(writeCdxml(part, { name: 'Clipboard.cdxml', textMeasure: measureText }), 'Copied as CDXML text.');
}

/** Copy the selection (or the whole drawing) as an SVG picture: structures, shapes, diagrams and pictures alike. */
function copySvgOfSelection(): Promise<void> | void {
  const svg = drawingSvg(doc, editor.hasSelection() ? editor.sel : null);
  if (!svg) { flash('There is nothing to copy.'); return; }
  return copySvg(svg).then(flash, (err) => flash('Could not copy: ' + String(err)));
}

let lastTurn = { angle: '90', dir: 'cw' };
async function rotateDialog(): Promise<void> {
  if (!editor.hasSelection()) { flash('Select something to rotate.'); return; }
  const r = await ask('Rotate', [
    { name: 'angle', label: 'Angle', value: lastTurn.angle, unit: 'degrees', type: 'number' },
    { name: 'dir', label: 'Direction', value: lastTurn.dir, options: [{ value: 'cw', label: 'Clockwise' }, { value: 'ccw', label: 'Counterclockwise' }] },
  ], { ok: 'Rotate' });
  if (!r) return;
  const a = parseFloat(r.angle);
  if (!Number.isFinite(a)) { flash('Type the angle in degrees.'); return; }
  lastTurn = { angle: r.angle, dir: r.dir };
  editor.rotateBy(r.dir === 'ccw' ? -a : a);
}

async function scaleDialog(): Promise<void> {
  if (!editor.hasSelection()) { flash('Select something to scale.'); return; }
  const L = editor.selectionBondLength();
  const shown = L ? L.toFixed(1) : '';
  const r = await ask('Scale', [
    { name: 'pct', label: 'Size', value: '100', unit: '%', type: 'number' },
    ...(L ? [{ name: 'len', label: 'or bond length', value: shown, unit: 'pt', type: 'number' as const }] : []),
  ], {
    ok: 'Scale',
    note: L ? `The selected bonds are ${shown} pt long; the drawing's standard is ${doc.style.bondLength.toFixed(1)} pt. Change either box.` : undefined,
  });
  if (!r) return;
  let f = parseFloat(r.pct) / 100;
  if (L && r.len !== undefined && r.len.trim() !== shown) f = parseFloat(r.len) / L;
  if (!Number.isFinite(f) || f <= 0) { flash('Type a size above zero.'); return; }
  editor.scaleSelection(f);
}

function reactionStep(dir: 'right' | 'left' | 'down' | 'up'): void {
  if (!editor.reactionStep(dir)) flash('Select the starting material first: this adds a reaction arrow and a copy of it to turn into the product.');
}

const OPTION_TEXT = {
  fixedLength: ['Fixed bond lengths on: new bonds are the standard length (hold Alt to drag any length).', 'Fixed bond lengths off: new bonds are as long as you drag them.'],
  fixedAngles: ['Fixed angles on: new bonds point in 15° steps (hold Alt or Space for any angle).', 'Fixed angles off: new bonds point wherever you drag.'],
};
function toggleOption(key: 'fixedLength' | 'fixedAngles'): void {
  editor.options[key] = !editor.options[key];
  flash(OPTION_TEXT[key][editor.options[key] ? 0 : 1]);
  refreshKeys();
  storeSettings();
}

/** View > Developer Tools: the Speed panel and the stress test, hidden unless switched on. */
let devTools = false;
function showDevTools(on: boolean): void {
  devTools = on;
  for (const el of document.querySelectorAll<HTMLElement>('.dev-only')) el.hidden = !on;
  $('[data-cmd="dev-tools"]')?.setAttribute('aria-checked', String(on));
  if (on) { updatePanels(); renderErrorLog(); }
}

function align(how: Align): void {
  if (!editor.align(how)) flash('Select two or more structures, captions, arrows or shapes to line them up.');
}

let flashTimer = 0;
function flash(msg: string, ms = 3500, action?: { label: string; run: () => void }): void {
  const el = $('#flash');
  el.textContent = macKeys(msg);
  el.classList.toggle('has-action', !!action);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => { el.classList.remove('show'); action.run(); });
    el.append(' ', b);
  }
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- tabs: drawings and slide decks

let lastOpen = '';
let lastStats: ReadStats | null = null;

const tabsEl = $<HTMLDivElement>('#tabs');
const notesBox = $<HTMLTextAreaElement>('#notes');
const sizeSel = $<HTMLSelectElement>('#rb-size');

/** View > Window and Colours > Mode Colours: blue for drawings, orange for slides, green for sheets, or the person's own colours. */
let modeColours: ModeColours = { ...DEFAULT_MODE_COLOURS };
// Each mode keeps its own tool: drawings and slides start with Select (the marquee; on a slide,
// click a placeholder to type), structures drawn for sheet cells and documents with a bond.
const START_TOOL: Readonly<Record<Tab['mode'], string>> = { drawing: 'select', slides: 'select', sheet: 'bond-single', document: 'bond-single', design: 'select' };
const modeTool: Record<Tab['mode'], string> = { ...START_TOOL };

// ---------------------------------------------------------------- sheets

// Properties of the structures in sheets (formula, MW, HRMS…), worked out by the chemistry engine
const sheetChem = new SheetChem(chem, (c, o) => structureMolfile(c, ws.active.book?.drawingStyle ?? ACS_1996, o));

// Pictures of structures for Excel files, drawn in the workbook's drawing style
const filePictures = new WeakMap<DocStyle, StructurePictures>();
function picturesFor(style: DocStyle): StructurePictures {
  let p = filePictures.get(style);
  if (!p) { p = new StructurePictures(() => style); filePictures.set(style, p); }
  return p;
}

/** Twice the screen's pixels, so pictures stay sharp when Excel is zoomed in. */
const FILE_PICTURE_SCALE = 2;

const sheetFiles: SheetFileDeps = {
  settled: () => sheetChem.settled(),
  box: (s, style) => picturesFor(style).box(s),
  // the picture covers the cell as the grid shows it: its fill, and the structure where it sits
  picture: async (s, style, cell) => {
    const pics = picturesFor(style);
    const S = FILE_PICTURE_SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cell.w * S));
    canvas.height = Math.max(1, Math.round(cell.h * S));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = cell.fill ?? '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // the picture sits inside the gridlines: place the structure as in the whole cell
    const p = structurePlace(pics.box(s), { x: -1, y: -1, w: cell.w + 2, h: cell.h + 2 }, cell.align, cell.valign);
    if (p.k > 0) {
      const bmp = pics.bitmap(s, p.k * S, true);
      if (bmp) ctx.drawImage(bmp, p.x * S, p.y * S, p.w * S, p.h * S);
    }
    return new Uint8Array(await (await canvasPng(canvas)).arrayBuffer());
  },
  rowHeights: (s) => sheetMode?.view.autoHeights(s) ?? new Map(),
};

/** Pictures of a document's drawings for Word files (300 dots to the inch, as for PowerPoint). */
const docFiles: DocxDeps = {
  pages: (t) => paragraphPages.get(t),
  picture: async (contents, style, frame) => {
    const d = structureDoc(contents, style);
    const drawn = recordPicture(d, FIGURE_MARGIN);
    // a figure: a picture of its whole area (an empty one is clear), never cutting off what reaches past it
    const fb = frame && { x1: frame.x, y1: frame.y, x2: frame.x + frame.w, y2: frame.y + frame.h };
    const pic = fb ? { items: drawn?.items ?? [], box: drawn ? { x1: Math.min(fb.x1, drawn.box.x1), y1: Math.min(fb.y1, drawn.box.y1), x2: Math.max(fb.x2, drawn.box.x2), y2: Math.max(fb.y2, drawn.box.y2) } : fb } : drawn;
    if (!pic) return null;
    const png = new Uint8Array(await (await canvasPng(pictureCanvas(d, pic).canvas)).arrayBuffer());
    return { png, svg: pictureSvg(pic), w: pic.box.x2 - pic.box.x1, h: pic.box.y2 - pic.box.y1, x: pic.box.x1, y: pic.box.y1 };
  },
  svgToPng,
  bakePicture: (p) => fxPng(p, 'baked'),
  fonts: bundledFaces,
  smiles: (contents, style) => drawingSmiles(structureDoc(contents, style)),
  // structures as ChemDraw objects (Settings ▸ General)
  cdx: (contents, style) => cdxmlToCdx(writeCdxml(structureDoc(contents, style), { name: 'Document drawing.cdxml', textMeasure: measureText })),
  get chemdrawObjects() { return officeStructures.docx === 'chemdraw'; },
};

/** How structures are saved in Word and PowerPoint files (Settings ▸ General): pictures, or ChemDraw objects. */
let officeStructures: Settings['officeStructures'] = { docx: 'pictures', pptx: 'pictures' };

/** Opening Word files: ChemDraw objects in them become structures, kept at the size they had. */
const docRead: DocxReadDeps = {
  convertChemDraw: false,
  chemdraw: (cdx, style) => docRead.cdxml!(cdxToCdxml(cdx), style),
  cdxml: (text, style) => {
    const d = readCdxml(text).doc;
    fitPasted(d, style);
    return d.contents();
  },
  // a Chem4Word structure: its CML at the document's bond length
  cml: (text, style) => {
    const c = readCml(text);
    if (!c) return null;
    const d = structureDoc(c, style);
    fitPasted(d, style, style.bondLength);
    return d.contents();
  },
  drawingSize: (contents, style) => {
    const pic = recordPicture(structureDoc(contents, style), FIGURE_MARGIN);
    return pic ? { w: pic.box.x2 - pic.box.x1, h: pic.box.y2 - pic.box.y1 } : null;
  },
  tableDrawing,
  // a reference manager's bibliography: kept as Word had it, or worked out here (asked each time)
  keepBibliography: async (app) => {
    const name = app === 'endnote' ? 'EndNote' : app === 'zotero' ? 'Zotero' : 'Mendeley';
    const got = await askChoice(`Keep ${name} Bibliography?`,
      `Keep this document's citations and bibliography as ${name} formatted them, or restyle them in the document's citation style?`,
      [{ value: 'restyle', label: 'Restyle' }, { value: 'keep', label: 'Keep', primary: true }], 'keep',
      'Restyling renumbers the citations and rebuilds the bibliography here, which can change entries (DOIs, links, lettered numbers such as 2c). Kept, they stay exactly as they are until you change a citation; then they are restyled.');
    return got === 'keep';
  },
};

const ws: Workspace = new Workspace(doc, {
  remember: (path) => rememberFile(path),
  rememberHandle: (handle) => { if (canKeepHandles()) void keepHandle(handle, recentFiles).then(rememberFile, () => {}); },
  leave: (tab) => {
    // letters still being written with the pen go into this tab's drawing
    editor.sketcher.flush();
    finishTab();
    if (tab.mode === 'sheet') sheetMode?.leave();
    if (tab.mode === 'document') docMode?.leave();
    modeTool[tab.mode] = editor.toolName;
    editor.cropping = null;
    (ws.pane ?? tab).view = { ...renderer.view };
    (ws.pane ?? tab).fitted = editor.stillFitted;
    if (tab.deck) { tab.deck.onChange = () => {}; tab.deck.onSwitch = () => {}; tab.deck.onLeave = () => {}; tab.deck.onMotion = () => {}; }
  },
  enter: (tab, opened) => enterTab(tab, opened),
  // every way of closing a tab (×, middle-click, Delete, Ctrl+W) finishes a figure or cell structure first
  closing: () => finishTab(),
  changed: () => { renderTabs(); updateTitle(); layoutSplit(); tickAutoSave(); },
  flash,
  pptx: pptxOptions(),
  measure: measureText,
  sheets: {
    read: async (bytes, name) => (await import('./io/sheet-files')).readSheetFile(bytes, name, sheetFiles),
    write: async (book, name) => (await import('./io/sheet-files')).writeSheetFile(book, name, sheetFiles),
  },
  documents: {
    read: async (bytes, name) => (await import('./io/doc-files')).readDocumentFile(bytes, name, docRead),
    write: async (d, name) => (await import('./io/doc-files')).writeDocumentFile(d, name, docFiles),
  },
  newStyle: (mode) => { const n = modeStyleFor(mode); return n ? styleNamed(n, ownStyles) ?? null : null; },
  newPage: () => (defaultPage ? { ...defaultPage } : null),
  newMaster: (m) => { const t = themeById(slideTemplate); return t && t.id !== 'plain' ? applyTemplate(m, t) : null; },
  beforeWrite: (tab, ref, name, how) => keeper.beforeWrite(tab, ref, name, how),
  beforeSaveAs: (tab, name) => offerChemdrawToPictures(tab, name),
  saved: (tab, data, how, was) => { keeper.saved(tab, data, how, was); if (how !== 'autosaved') void noteFileCompounds(tab).catch(() => {}); },
  autoSaveFailed: (tab, msg) => keeper.autoSaveFailed(tab, msg),
  canvasEdited: async (name, n) => {
    const got = await ask('Canvas Slides Changed in PowerPoint', [{
      name: 'keep', label: 'Keep', value: 'canvas',
      options: [{ value: 'canvas', label: 'The canvas (as it was saved here)' }, { value: 'slides', label: 'PowerPoint\'s slides (as normal slides)' }],
    }], { ok: 'Open', note: `${n === 1 ? 'A canvas slide' : `${n} canvas slides`} in ${name} ${n === 1 ? 'was' : 'were'} saved as a slide for each keyframe, and ${n === 1 ? 'its slides were' : 'their slides were'} changed in PowerPoint since. Keep the canvas to go on editing it here (PowerPoint's changes to those slides are left out), or keep PowerPoint's slides as normal slides.` });
    return got?.keep === 'slides' ? 'slides' : 'canvas';
  },
  opened: (tab) => { keeper.opened(tab); void noteFileCompounds(tab).catch(() => {}); },
  styleSheet: (tab, style) => void offerStyleSheet(tab, style),
  dropped: (tab) => {
    keeper.dropped(tab);
    // a drawing being edited for Word: Word hears that the editing is over
    const id = embeddedTabs.get(tab);
    if (id !== undefined) { embeddedTabs.delete(tab); void invoke('ole_close', { id }).catch(() => {}); }
  },
});

// AutoSave, recovery copies, Version History and shared folders (File > Versions and Recovery > AutoSave and Recovery Options)
let keepPrefs: KeepPrefs = { ...DEFAULT_KEEP };
const keeper = new Keeper({
  ws,
  prefs: () => keepPrefs,
  setPrefs: (p) => { keepPrefs = p; tickAutoSave(); renderTabs(); storeSettings(); },
  flash,
  refresh: () => { renderTabs(); updateTitle(); tickAutoSave(); },
});
/** File > AutoSave shows whether the tab showing saves itself. */
function tickAutoSave(): void {
  const b = document.querySelector<HTMLElement>('[data-cmd="autosave"]');
  if (!b) return;
  const t = ws.active;
  b.setAttribute('aria-checked', String(keeper.autoSaveWanted(t) && ws.canAutoSave(t)));
}

/**
 * The resolution of the PNG saved beside each structure's SVG in a deck. PowerPoint 2016 and later
 * show the SVG; the PNG is for programs that can't, such as Google Slides and older PowerPoint, and
 * at 150 dots to the inch it is as sharp as a 1080p projector shows a 13.33-inch slide, at a quarter
 * of the size (and encoding time) of 300.
 */
const PPTX_FALLBACK_DPI = 150;

/** How slides are saved for PowerPoint: structures as pictures (PNG and SVG) or ChemDraw objects, the bundled fonts inside. */
function pptxOptions(): PptxOptions {
  return {
    picture: async (d) => {
      const pic = recordPicture(d, 1);
      if (!pic) return null;
      const png = new Uint8Array(await (await canvasPng(pictureCanvas(d, pic, PPTX_FALLBACK_DPI).canvas)).arrayBuffer());
      return { svg: pictureSvg(pic), png, box: pic.box };
    },
    svgToPng,
    bakePicture: (p) => fxPng(p, 'baked'),
    fonts: bundledFaces,
    smiles: drawingSmiles,
    chemdrawObjects: officeStructures.pptx === 'chemdraw',
  };
}

/** The structures in a drawing as SMILES (for alt text), or null when there are none or the chemistry engine isn't ready. */
async function drawingSmiles(d: Doc): Promise<string | null> {
  if (!chem.ready || !d.atoms.size) return null;
  const { molblock, unknownLabels } = toMolfile(d, d.atoms.keys(), '', { species: allSpecies(d) });
  return unknownLabels.length ? null : chem.molToSmiles(molblock);
}

/** The slide deck showing (in Slides mode), or null for a drawing. */
function deckNow(): Deck | null {
  return ws.active.deck ?? null;
}

/** Slides' Selection Pane is open (Home > Selection Pane, Alt+F10). */
let selectionPane = false;

/** Design's Layers panel, or Slides' Selection Pane when it is open, in the right-hand panel. */
function showLayers(tab = ws.active): void {
  const design = tab.mode === 'design', slides = !!tab.deck && !design;
  layers?.show(design || (slides && selectionPane) ? doc : null, slides);
  for (const b of document.querySelectorAll('[data-cmd="selection-pane"]')) b.setAttribute('aria-pressed', String(slides && selectionPane));
}

/** Finish typing in a caption or the notes (and drawing a structure for a cell), before the slide or tab changes. */
function finishTyping(): void {
  editor.closeCaption();
  flushNotes();
}

/**
 * Finish typing and a structure being drawn for a cell or a document's figure (put in place as
 * with Done), before the tab is left, saved or closed. Commands on the drawing itself only use
 * finishTyping: they work on the structure being drawn and leave it open.
 */
function finishTab(): void {
  // a figure's structures reaching past its edges: grown round them (Done would ask; here nothing can wait for an answer)
  if (cellEdit && place?.fitNow) {
    editor.closeCaption();
    if (doc.canUndo()) place.fitNow(doc.contents());
  }
  finishCellStructure(true);
  finishTyping();
}

/** Set the window up for a tab that has just come to the front. */
function enterTab(tab: Tab, opened: boolean): void {
  // a new or opened drawing starts on Select; going back to a tab keeps the tool last used
  if (opened && tab.mode === 'drawing') modeTool.drawing = START_TOOL.drawing;
  if (slideSplit && tab !== slideSplit.partner) slideSplit = null;
  splitDrawing = false;
  const deck = tab.deck;
  const design = tab.mode === 'design';
  const slides = !!deck && !design;
  const sheet = tab.mode === 'sheet';
  const words = tab.mode === 'document';
  document.body.classList.toggle('slides-mode', slides);
  document.body.classList.toggle('design-mode', design);
  editor.glueArrows = design;
  showLayers(tab);
  showGuides();
  if (deck) deck.onMotion = () => { animUi?.refresh(); ws.noteChange(); renderer.repaintAll(); editor.requestScene(); };
  if (deck) deck.onComments = () => { slideCmts?.update(); ws.noteChange(); };
  editor.textFirst = !!deck;
  editor.structuresLocked = slides && structuresLocked;
  for (const el of document.querySelectorAll<HTMLElement>('.design-only')) el.hidden = !design;
  if (design) designLib?.refresh();
  document.body.classList.toggle('sheet-mode', sheet);
  document.body.classList.toggle('doc-mode', words);
  placeSidePanel();
  if (toolboxesBuilt && wantOneColumn() !== toolsInOneColumn) toolboxes.render();
  tickToolboxes();
  applyModeColours(tab.mode, modeColours);
  for (const el of document.querySelectorAll<HTMLElement>('.slides-only')) el.hidden = !slides;
  canvasRibbon.show(!deck && !sheet && !words && !design);
  // another tab: back to Normal view
  if (sorterOn) {
    sorterOn = false;
    sorterEl.hidden = true;
    sorterList.show(null);
  }
  if (outlineView.shown) outlineView.show(false);
  if (notesView.shown) { notesView.show(false); $('#notes-pane').classList.remove('np-hidden'); }
  showSheetParts();
  editor.paused = sheet || words;
  // a sheet's or document's own code may still be loading: it shows the tab when it's ready
  if (sheet && !sheetMode) void loadSheetMode().catch(modeFailed);
  if (words && !docMode) void loadDocMode().catch(modeFailed);
  sheetMode?.show(sheet ? tab : null);
  if (words) fieldEnv.fileName = ws.mainOf(tab).name;
  docMode?.show(words ? tab : null);
  renderer.screen = !!deck;
  renderer.page = deck ? slidePage : drawingBackdrop;
  editor.slideKeys = slides;
  editor.cropping = null;
  editor.lastEdited = null;
  if (editor.toolName !== modeTool[tab.mode]) editor.setTool(modeTool[tab.mode]);
  onCanvas = !!deck?.current?.canvas && !design;
  showCanvasState();
  // Fit shows the slide; on a canvas slide, the keyframe picked
  editor.fitArea = deck ? () => (deck.current?.canvas ? keyRect(deck.current.canvas.keys[canvasKeys.picked(deck)], deck.size) : { x1: 0, y1: 0, x2: deck.size.w, y2: deck.size.h }) : null;
  if (deck) {
    deck.onChange = () => deckChanged(deck);
    deck.onSwitch = () => slideSwitched(deck);
    deck.onLeave = () => editor.sketcher.flush();
    listKey = slideListKey(deck);
    masterSeen = deck.master;
    slideList.show(design ? null : deck);
    if (design) showDesignState();
    notesBox.value = deck.current?.notes ?? '';
    showSlideState();
  } else { slideList.show(null); showRulers(); }
  animUi?.update();
  slideCmts?.slideChanged();
  layoutSplit();
  // the slide list and notes take room from the drawing area
  resize();
  const viewOf = ws.pane ?? tab;
  if (viewOf.view && (!opened || ws.pane) && !(viewOf.fitted && !ws.pane && !slideSplit)) renderer.view = { ...viewOf.view };
  else if (ws.pane || slideSplit) fitSplitDrawing();
  else editor.fit();
  renderer.repaintAll();
  // (fit leaves an empty drawing alone, so ask for the scene here: else the last tab's drawing stays on screen)
  editor.requestScene();
  editor.clearSelection();
  editor.frame(true);
  refreshKeys();
  analysisKey = '';
  scheduleAnalysis(true);
  // descriptors saved for a structure since changed (in ChemDraw) are worked out again
  void refreshDescriptors();
  if (sheet && !splitDrawing) setHint(SHEET_HINT);
  else if (words && !splitDrawing) setHint(DOC_HINT);
  else editor.onToolChange(editor.toolName);
}

/** The slide's background, logo, number and footer, drawn under its drawing. */
const slidePage = {
  draw(ctx: CanvasRenderingContext2D): void {
    const d = deckNow();
    if (!d?.current) return;
    // (a canvas slide: its background as the keyframe picked sees it, and the screen's title and footer there)
    drawSlidePage(ctx, d.page(d.index, d.current.canvas ? canvasKeys.picked(d) : 0), darkSurround ?? SURROUND);
    // a canvas slide: no edge, so no slide grid or guides; its keyframes instead
    if (d.current.canvas && ws.active.mode === 'slides') { canvasKeys.draw(ctx, d, renderer.view.scale); slideCmts?.place(); return; }
    if (ws.active.mode === 'design' && designGrid.on) drawGrid(ctx, d.size, designGrid.step);
    if (ws.active.mode === 'slides') {
      const v = d.settings.view;
      if (slideLook.grid) drawGrid(ctx, d.size, v?.grid ?? defaultView(d.size).grid);
      if (v?.showGuides) drawGuides(ctx, v, d.size, renderer.view.scale, guideDrag?.which);
    }
    if (ws.active.mode === 'slides') animUi?.drawMarkers(ctx, renderer.view.scale);
    // (the comment markers are over the drawing, and follow it as it moves)
    if (ws.active.mode === 'slides') slideCmts?.place();
  },
};

// Keyframes on a canvas slide: drawn over it, moved by their tabs and outlines, zoomed by their corners.
const canvasKeys = new CanvasKeys(renderer.overlay, {
  deck: () => {
    const d = deckNow();
    return d?.current?.canvas && ws.active.mode === 'slides' && !sorterOn && editor.toolName === 'select' ? d : null;
  },
  view: () => renderer.view,
  pointAt: (e) => editor.pointAt(e),
  repaint: () => { renderer.repaintAll(); editor.requestScene(); },
  begin: () => finishTyping(),
  picked: () => slideList.markKeyframe(),
});

/** The canvas slide being edited and its keyframe picked, for the keyframe commands (null, said, on another slide). */
function canvasNow(): { d: Deck; c: NonNullable<Deck['slides'][number]['canvas']>; i: number } | null {
  const d = deckNow();
  const c = d?.current?.canvas;
  if (!d || !c || ws.active.mode !== 'slides') { flash('Keyframes are on canvas slides: Insert > Canvas Slide makes one.'); return null; }
  finishTyping();
  return { d, c, i: canvasKeys.picked(d) };
}

/** Show keyframe i of the canvas slide being edited, picked, filling the window. */
function goKeyframe(i: number): void {
  const d = deckNow();
  const c = d?.current?.canvas;
  if (!d || !c?.keys[i]) return;
  canvasKeys.setPicked(d, i);
  editor.fit();
}

/** Keyframe commands that change the keyframes: the new list, which keyframe to pick, and the step's name. */
function setKeyframes(d: Deck, keys: NonNullable<Deck['slides'][number]['canvas']>, pick: number, label: string): void {
  d.setCanvas(keys, label);
  goKeyframe(pick);
}

const keyframeCommands = {
  addKeyframe(): void {
    const k = canvasNow();
    if (!k) return;
    const got = addKeyframe(k.c, k.d.size, k.i);
    setKeyframes(k.d, got.canvas, got.index, 'Add keyframe');
  },
  /** A keyframe showing what is in the window now (as near as the zoom limits allow). */
  keyframeHere(): void {
    const k = canvasNow();
    if (!k) return;
    const got = insertKeyframe(k.c, keyframeAround(renderer.visibleRect(0), k.d.size, 0, 1), k.i);
    setKeyframes(k.d, got.canvas, got.index, 'Keyframe from window');
  },
  fitToSelection(): void {
    const k = canvasNow();
    if (!k) return;
    const box = editor.hasSelection() ? editor.selBox() : null;
    if (!box) { flash('Select what the keyframe should show, then Fit Keyframe to Selection.'); return; }
    const key = { ...keyframeAround(box, k.d.size), id: k.c.keys[k.i].id };
    if (key.zoom <= 1 / ZOOM_IN_MAX + 1e-9 && Math.max((box.x2 - box.x1) / k.d.size.w, (box.y2 - box.y1) / k.d.size.h) < 1 / ZOOM_IN_MAX) flash(`Keyframes zoom in at most ${ZOOM_IN_MAX}×, so this one shows a little more than the selection.`);
    setKeyframes(k.d, { keys: k.c.keys.map((x, j) => (j === k.i ? key : x)) }, k.i, 'Fit keyframe to selection');
  },
  remove(i?: number): void {
    const k = canvasNow();
    if (!k) return;
    const next = removeKeyframe(k.c, i ?? k.i);
    if (!next) { flash('A canvas slide needs at least one keyframe.'); return; }
    setKeyframes(k.d, next, Math.min(i ?? k.i, next.keys.length - 1), 'Delete keyframe');
  },
  move(from: number, to: number): void {
    const k = canvasNow();
    if (!k) return;
    setKeyframes(k.d, moveKeyframe(k.c, from, to), to, 'Move keyframe');
  },
  /** The title shown fixed to the screen while the show is at keyframe i (the one picked by default). */
  async title(i?: number): Promise<void> {
    const k = canvasNow();
    if (!k) return;
    const at = i ?? k.i, key = k.c.keys[at];
    if (!key) return;
    const got = await ask(`Keyframe ${at + 1} Title`, [
      { name: 'title', label: 'Title', value: key.title ?? '', placeholder: 'Shown where a slide\'s title goes, fixed to the screen' },
    ], { ok: 'Set Title', note: 'The next keyframes you add take this title too. When the title changes from one keyframe to the next, the show cross-fades it; when it stays the same, it stays still. Leave it empty for no title.' });
    if (got === null) return;
    const title = got.title.trim();
    setKeyframes(k.d, { keys: k.c.keys.map((x, j) => (j === at ? (({ title: _, ...rest }) => (title ? { ...rest, title } : rest))(x) : x)) }, at, title ? 'Keyframe title' : 'Remove keyframe title');
  },
  /** A soft tint in the background round keyframe i: a zone (keyframes next to each other with one tint make one zone). */
  async zone(i?: number): Promise<void> {
    const k = canvasNow();
    if (!k) return;
    const at = i ?? k.i, key = k.c.keys[at];
    if (!key) return;
    const got = await ask(`Keyframe ${at + 1} Zone`, [
      { name: 'on', label: 'Tint the background round this keyframe', value: String(!!key.tint), type: 'checkbox' },
      { name: 'tint', label: 'Color', value: key.tint ?? k.d.master.accent, type: 'color' },
    ], { ok: 'Set Zone', note: 'A zone fades out softly over about half a slide, so it never shows an edge. Give the keyframes of one part of the route (a fragment, a campaign) the same color to make one zone.' });
    if (got === null) return;
    const tint = got.on === 'true' && /^#[0-9a-f]{6}$/i.test(got.tint) ? got.tint.toLowerCase() : '';
    setKeyframes(k.d, { keys: k.c.keys.map((x, j) => (j === at ? (({ tint: _, ...rest }) => (tint ? { ...rest, tint } : rest))(x) : x)) }, at, tint ? 'Keyframe zone' : 'Remove keyframe zone');
  },
  /** How the canvas's endless background looks: the route gradient, a pattern, and parallax. */
  async background(): Promise<void> {
    const k = canvasNow();
    if (!k) return;
    const look = k.c.look ?? {};
    const m = k.d.master;
    const route = look.route ?? [mix(m.background, m.accent, 0.1), mix(m.background, m.accent2, 0.3)];
    const got = await ask('Canvas Background', [
      {
        name: 'route', label: 'Background', value: look.route ? (look.route.length > 2 ? '3' : '2') : '0',
        options: [{ value: '0', label: 'Plain (the slide master\'s color)' }, { value: '2', label: 'Route gradient: two colors' }, { value: '3', label: 'Route gradient: three colors' }],
        help: 'A wide, slow gradient from the first keyframe to the last, so the color shifts as the talk moves along the route.',
      },
      { name: 'c1', label: 'Start color', value: route[0], type: 'color' },
      { name: 'c2', label: route.length > 2 ? 'Middle color' : 'End color', value: route[1], type: 'color' },
      { name: 'c3', label: 'End color (three colors)', value: route[2] ?? route[1], type: 'color' },
      { name: 'texture', label: 'Pattern', value: look.texture ?? '', options: [{ value: '', label: 'None' }, ...TEXTURES.map((t) => ({ value: t.id, label: t.name }))], help: 'Faint, and it moves with the canvas, so a pan across empty space still feels like moving.' },
      { name: 'parallax', label: 'Parallax', value: String(Math.round((look.parallax ?? 0) * 100)), type: 'number', unit: '%', help: `How much slower the background moves than the drawing, for a sense of depth (0 to ${PARALLAX_MAX * 100}; 50 is half as fast).` },
    ], { ok: 'Apply', note: 'Zones: right-click a keyframe for Zone Color. The background has no edges, so nothing sharp scrolls past in the show.' });
    if (got === null) return;
    const next: CanvasLook = {};
    const colours = [got.c1, got.c2, got.c3].filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map((c) => c.toLowerCase());
    if (got.route === '2' && colours.length >= 2) next.route = colours.slice(0, 2);
    if (got.route === '3' && colours.length >= 3) next.route = colours;
    if (TEXTURES.some((t) => t.id === got.texture)) next.texture = got.texture as Texture;
    const p = Number(got.parallax) / 100;
    if (Number.isFinite(p) && p > 0) next.parallax = Math.min(PARALLAX_MAX, p);
    k.d.setCanvas({ keys: k.c.keys, look: Object.keys(next).length ? next : undefined }, 'Canvas background');
    renderer.repaintAll();
    editor.requestScene();
  },
  /** A spotlight on keyframe i: what is selected stays bright in the show and the rest dims. Nothing selected: the spotlight goes. */
  spotlight(i?: number): void {
    const k = canvasNow();
    if (!k) return;
    const at = i ?? k.i, key = k.c.keys[at];
    if (!key) return;
    const box = editor.hasSelection() ? editor.selBox() : null;
    if (!box) {
      if (key.spot) keyframeCommands.unspot(at);
      else flash('Select what should stay bright at this keyframe, then Spotlight Selection.');
      return;
    }
    const m = 6;
    const spot = { x1: box.x1 - m, y1: box.y1 - m, x2: box.x2 + m, y2: box.y2 + m };
    setKeyframes(k.d, { keys: k.c.keys.map((x, j) => (j === at ? { ...x, spot } : x)) }, at, 'Spotlight selection');
    flash('Spotlight: in the show, the rest of this keyframe dims. Right-click the keyframe for Remove Spotlight.');
  },
  unspot(i?: number): void {
    const k = canvasNow();
    if (!k) return;
    const at = i ?? k.i;
    if (!k.c.keys[at]?.spot) return;
    setKeyframes(k.d, { keys: k.c.keys.map((x, j) => (j === at ? (({ spot: _, ...rest }) => rest)(x) : x)) }, at, 'Remove spotlight');
  },
  /** Keyframe i a detour off the route, or back on it: after a run of detours the show glides back to where the run left the route. */
  detour(i?: number): void {
    const k = canvasNow();
    if (!k) return;
    const at = i ?? k.i, key = k.c.keys[at];
    if (!key) return;
    if (at === 0 && !key.detour) { flash('The first keyframe is where the route starts, so it can\'t be a detour.'); return; }
    const on = !key.detour;
    setKeyframes(k.d, { keys: k.c.keys.map((x, j) => (j === at ? (({ detour: _, ...rest }) => (on ? { ...rest, detour: true } : rest))(x) : x)) }, at, on ? 'Mark keyframe as detour' : 'Put keyframe back on the route');
    flash(on ? 'Detour: after this keyframe (and any detours straight after it) the show glides back to the keyframe before. The return is a move in the Animation pane.' : 'Back on the route: the show no longer glides back after it.');
  },
  /** How the canvas slide's show behaves: dimming, the mini-map, and compound numbers as links. */
  async showOptions(): Promise<void> {
    const k = canvasNow();
    if (!k) return;
    const show = k.c.show ?? {};
    const got = await ask('Canvas Show Options', [
      { name: 'dim', label: 'Dim what is outside the keyframe', value: String(!!show.dim), type: 'checkbox', help: 'As the show moves, what is off the route fades back, so the eye follows the move. A keyframe\'s own spotlight (Spotlight Selection) dims even with this off.' },
      { name: 'minimap', label: 'Mini-map', value: show.minimap ?? '', options: [{ value: '', label: 'None' }, { value: 'show', label: 'In the show\'s corner' }, { value: 'presenter', label: 'In Presenter View only' }], help: 'A small map of the whole canvas with where the show is. A click on a keyframe in it flies the show there.' },
      { name: 'links', label: 'Compound numbers fly to where the compound was made', value: String(!show.noLinks), type: 'checkbox', help: 'A click on a compound number (2, 7a, (±)-12) flies to the first keyframe that has it; the next click flies back. In PowerPoint the numbers link to that keyframe\'s slide.' },
    ], { ok: 'Apply', note: 'Presenter View also lists the keyframes: a click flies the show to one.' });
    if (got === null) return;
    const next: CanvasShow = {};
    if (got.dim === 'true') next.dim = true;
    if (got.minimap === 'show' || got.minimap === 'presenter') next.minimap = got.minimap;
    if (got.links !== 'true') next.noLinks = true;
    k.d.setCanvas({ keys: k.c.keys, show: Object.keys(next).length ? next : undefined }, 'Canvas show options');
  },
  /** A Canvas Heading: a large, faint label marking a part of the route ("Fragment A", "Endgame"), in the middle of the window. */
  heading(): void {
    const k = canvasNow();
    if (!k) return;
    const m = k.d.master;
    const r = renderer.visibleRect(0);
    const size = Math.round(m.titleSize * 2.4);
    let id = 0;
    doc.edit('Canvas heading', () => {
      id = doc.addCaption({
        x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2, justify: 'center',
        runs: [{ text: 'Heading', font: m.titleFont, size, bold: true, color: mix(m.titleColor, m.background, 0.6) }],
      }).id;
    });
    editor.selectThese({ atoms: new Set(), bonds: new Set(), captions: new Set([id]), arrows: new Set(), shapes: new Set() });
    flash('Canvas Heading: type over it. It is ordinary text, faint and large, for marking a part of the route.');
  },
};

/**
 * The contextual tabs, as in PowerPoint: Shape Format while a shape is selected and Picture
 * Format while a picture is, in Presentation and Design; a hidden tab that was open gives way to Home.
 */
let geoHintOn = false;
function showContextTabs(): void {
  const picked = [...editor.sel.shapes].map((id) => doc.shapes.get(id)).filter((x) => !!x);
  const shape = picked.some((x) => x.kind !== 'picture');
  const picture = picked.some((x) => x.kind === 'picture');
  const mode = ws.active.mode;
  // a shape picked: the status bar says how to type in it (back to the tool's hint after)
  const geo = picked.some((x) => x.kind === 'geo') && !editor.typingCaption;
  if (geo !== geoHintOn) {
    geoHintOn = geo;
    if (geo) setHint('Double-click the shape to type in it.');
    else editor.onToolChange(editor.toolName);
  }
  const want: [string, string, boolean][] = [
    ['#ribbon [data-sl-tab="format"]', 'slides', shape], ['#ribbon [data-sl-tab="picture"]', 'slides', picture],
    ['#design-ribbon [data-dz-tab="format"]', 'design', shape], ['#design-ribbon [data-dz-tab="picture"]', 'design', picture],
  ];
  for (const [sel, m, on] of want) {
    const tab = document.querySelector<HTMLElement>(sel);
    const hide = !(on && mode === m);
    if (!tab || tab.hidden === hide) continue;
    tab.hidden = hide;
    if (!hide || tab.getAttribute('aria-selected') !== 'true') continue;
    if (m === 'slides') animUi?.showTab('home');
    else document.querySelector<HTMLElement>('#design-ribbon [data-dz-tab="home"]')?.click();
  }
}

/** The keyframe ribbon group shows on canvas slides only; the menus' keyframe items are greyed elsewhere (menus keep their shape). */
function showCanvasState(): void {
  const on = !!deckNow()?.current?.canvas && ws.active.mode === 'slides';
  for (const el of document.querySelectorAll<HTMLElement>('.keyframes-only')) {
    if (el instanceof HTMLButtonElement && el.getAttribute('role') === 'menuitem') el.disabled = !on;
    else el.hidden = !on;
  }
}

// The slide list is rebuilt when slides come, go or move; otherwise only the slide being
// edited gets a new picture.
let listKey = '';
let masterSeen: unknown = null;
let indexSeen = -1;
const slideListKey = (d: Deck) => `${d.slides.map((s, i) => s.id + (s.notes.trim() ? 'n' : '') + (s.hidden ? 'h' : '') + (s.section !== undefined ? `s${s.section}` : '') + (s.canvas ? `k${s.canvas.keys.map((k) => k.id).join('.')}` : '') + (s.transition?.advanceAfter !== undefined ? `t${s.transition.advanceAfter}` : '') + (d.narrated(i) ? 'v' : '')).join(',')}|${d.sections.map((x) => `${x.id}:${x.name}`).join('/')}|${d.size.w}x${d.size.h}|${d.looks}`;

/** Told of every change to a deck (the Compare pane, which follows Undo). */
const deckWatchers: ((deck: Deck) => void)[] = [];

function deckChanged(deck: Deck): void {
  for (const f of deckWatchers) f(deck);
  const key = slideListKey(deck);
  if (key !== listKey || masterSeen !== deck.master) {
    listKey = key;
    masterSeen = deck.master;
    indexSeen = deck.index;
    slideList.rebuild();
    if (sorterOn) sorterList.rebuild();
    outlineView.rebuild();
    notesView.rebuild();
  } else if (deck.index !== indexSeen) {
    // going to another slide moves the highlight; no picture needs drawing again
    indexSeen = deck.index;
    slideList.switched();
    if (sorterOn) sorterList.switched();
    outlineView.mark(deck.index);
  } else {
    slideList.refresh();
    if (sorterOn) sorterList.refresh();
  }
  showSlideState();
  if (ws.active.mode === 'design') showDesignState();
  ws.noteChange();
}

/** The slide last switched to was a canvas slide (going to or from one fits the window again). */
let onCanvas = false;

function slideSwitched(deck: Deck): void {
  editor.cropping = null;
  editor.lastEdited = null;
  const canvas = !!deck.current?.canvas;
  if (canvas !== onCanvas) showRulers();
  if (canvas || onCanvas) editor.fit();
  onCanvas = canvas;
  showCanvasState();
  notesBox.value = deck.current?.notes ?? '';
  renderer.repaintAll();
  editor.requestScene();
  editor.clearSelection();
  animUi?.slideChanged();
  slideCmts?.slideChanged();
}

/** The outline of each built-in layout's boxes, on an 80 × 45 picture, for New Slide's list. */
const LAYOUT_PICS: Record<string, [number, number, number, number][]> = {
  title: [[10, 8, 60, 14], [18, 26, 44, 8]], 'title-content': [[6, 4, 68, 8], [6, 15, 68, 26]],
  'two-content': [[6, 4, 68, 8], [6, 15, 32, 26], [42, 15, 32, 26]], 'title-only': [[6, 4, 68, 8]], blank: [],
};
/** A layout in New Slide's list: a small picture of its boxes over its name. */
function layoutButton(id: string, name: string, prefix: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.cmd = prefix + id;
  b.title = name;
  const pic = document.createElement('span');
  pic.className = 'rb-layout-pic';
  for (const [x, y, w, h] of LAYOUT_PICS[id] ?? [[6, 4, 68, 8]]) {
    const i = document.createElement('i');
    i.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    pic.append(i);
  }
  b.append(pic, name);
  return b;
}

/** The layouts last put in New Slide's list and the Format menu (they change with the slide master). */
let layoutsShown = '';

/** The Layout box and Format > Slides > Slide Layout list the deck's layouts: the five built in, as edited, then the ones made here. */
function showLayoutMenus(deck: Deck): void {
  const list = deckLayouts(deck.master);
  const key = JSON.stringify(list.map((l) => [l.id, l.name]));
  if (key === layoutsShown) return;
  layoutsShown = key;
  const gallery = document.querySelector<HTMLElement>('#new-slide-menu .rb-layouts');
  gallery?.replaceChildren(...list.map((l) => layoutButton(l.id, l.name, 'new-slide-layout-')));
  const sub = document.querySelector<HTMLElement>('#layout-menu');
  if (sub) {
    const items: HTMLElement[] = list.map((l) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', 'false');
      b.dataset.cmd = `layout-${l.id}`;
      const span = document.createElement('span');
      span.textContent = l.name;
      b.append(span);
      return b;
    });
    const hr = document.createElement('hr');
    const edit = document.createElement('button');
    edit.setAttribute('role', 'menuitem');
    edit.dataset.cmd = 'edit-layouts';
    edit.textContent = 'Edit Layouts…';
    sub.replaceChildren(...items, hr, edit);
  }
}

/** The layout and size boxes and the Format menu show the slide being edited. */
function showSlideState(): void {
  const deck = deckNow();
  showRulers();
  if (!deck?.current) return;
  showLayoutMenus(deck);
  const named = deck.size.w === WIDE.w && deck.size.h === WIDE.h ? 'wide' : deck.size.w === STANDARD.w && deck.size.h === STANDARD.h ? 'standard' : 'custom';
  let custom = sizeSel.querySelector<HTMLOptionElement>('option[value="custom"]');
  if (named === 'custom') {
    if (!custom) { custom = new Option('', 'custom'); sizeSel.add(custom); }
    custom.text = sizeName(deck.size);
  } else custom?.remove();
  sizeSel.value = named;
  for (const b of document.querySelectorAll<HTMLElement>('[data-cmd^="layout-"]')) b.setAttribute('aria-checked', String(b.dataset.cmd === `layout-${deck.current.layout}`));
  for (const b of document.querySelectorAll<HTMLElement>('[data-cmd="view-normal"], [data-cmd="view-sorter"]')) {
    const on = b.dataset.cmd === 'view-sorter' ? slideViewNow() === 'sorter' : slideViewNow() === 'normal';
    b.setAttribute(b.getAttribute('role') === 'menuitemradio' ? 'aria-checked' : 'aria-pressed', String(on));
  }
  $('[data-cmd="size-wide"]')?.setAttribute('aria-checked', String(named === 'wide'));
  $('[data-cmd="size-standard"]')?.setAttribute('aria-checked', String(named === 'standard'));
  const hidden = String(!!deck.current.hidden);
  for (const b of document.querySelectorAll('[data-cmd="hide-slide"]')) b.setAttribute(b.getAttribute('role') === 'menuitemcheckbox' ? 'aria-checked' : 'aria-pressed', hidden);
  // Set Up Show's two the ribbon shows as ticks
  const show = deck.settings.show;
  for (const b of document.querySelectorAll<HTMLInputElement>('[data-cmd="use-timings"]')) b.checked = !show?.manual;
  for (const b of document.querySelectorAll<HTMLInputElement>('[data-cmd="play-narrations"]')) b.checked = !show?.noNarration;
}

// ---------------------------------------------------------------- transitions and animations (Slides mode)

animUi = new AnimationUI($('#ribbon'), $('#anim-section'), {
  deck: () => (ws.active.mode === 'slides' ? deckNow() : null),
  doc: () => doc,
  selection: () => {
    const s = editor.sel;
    const typing = renderer.hiddenCaption;
    return typing === null ? s : { ...s, captions: new Set([...s.captions, typing]) };
  },
  select: (sel) => editor.selectThese(sel),
  finishTyping,
  flash,
  repaint: () => { renderer.repaintAll(); editor.requestScene(); },
  host: () => $('#canvas-host'),
  view: () => renderer.view,
  // a keyframe move picked in the pane shows the keyframe it goes to
  keyframe: (id) => {
    const i = deckNow()?.current?.canvas?.keys.findIndex((k) => k.id === id) ?? -1;
    if (i >= 0) goKeyframe(i);
  },
  keyViews: async (atom, views, dur) => {
    const here = doc;
    if (!here.atoms.has(atom)) return null;
    // the structure alone, to turn in the window
    const alone = (from: Doc) => {
      const ids = from.fragmentOf(atom);
      const c = from.contents();
      const d = new Doc();
      d.style = from.style;
      d.restoreContents({ atoms: c.atoms.filter((a) => ids.has(a.id)), bonds: c.bonds.filter((b) => ids.has(b.a1) && ids.has(b.a2)), captions: [], arrows: [], shapes: [] });
      return d;
    };
    const base = alone(here);
    const got = await askKeyViews({
      base, views, dur,
      ...(editor.perspectiveHost ? {
        real: async () => {
          const copy = alone(here);
          const why = await editor.realShape(atom, copy);
          return why ? { note: `${why} It turns as a flat sheet.` } : { doc: copy };
        },
      } : {}),
    });
    if (!got) return null;
    if (got.real && doc === here) {
      const why = await editor.realShape(atom);
      if (why) flash(`${why} It turns as a flat sheet.`, 6000);
    }
    return { views: got.views, dur: got.dur };
  },
});

slideCmts = new SlideComments($('#cmt-section'), $('#canvas-host'), {
  deck: () => (ws.active.mode === 'slides' ? deckNow() : null),
  anchor: () => {
    const s = editor.sel;
    const b = s.atoms.size + s.captions.size + s.arrows.size + s.shapes.size ? selectionBox(doc, s, POINTS) : null;
    return b ? { x: b.x2 + 4, y: b.y1 } : null;
  },
  view: () => renderer.view,
  askName: () => askReviewName(() => storeSettings()),
  flash,
  focus: () => $('#overlay').focus(),
  // the Comments pane is in the side panel: a new comment's card needs it unfolded
  reveal: () => { if (sideIsFolded()) command('fold-side'); },
});

// ---------------------------------------------------------------- Design mode

layers = new LayersPanel($('#layers-section'), {
  select: (ids) => editor.selectShapes(ids),
  selected: () => editor.selectedShapes(),
  edit: (label, f) => { finishTyping(); doc.edit(label, f); editor.changed(); },
  pick: (w) => { finishTyping(); editor.selectThese({ atoms: new Set(w.atoms), bonds: new Set(), captions: new Set(w.captions), arrows: new Set(w.arrows), shapes: new Set(w.shapes) }); },
  picked: () => ({ shapes: [...editor.sel.shapes], captions: [...editor.sel.captions], atoms: [...editor.sel.atoms], arrows: [...editor.sel.arrows] }),
});
layers.onClose = () => { selectionPane = false; showLayers(); };
const lib = (designLib = new DesignLibrary($('#design-lib'), (id) => { finishTyping(); editor.setTool(`geo:${id}`); }));
// Design mode's shapes and icons fold away to a thin strip (remembered on this computer)
{
  const el = $('#design-lib');
  const fold = document.createElement('button');
  fold.type = 'button';
  fold.className = 'dl-fold';
  const KEY = 'chem-illustrator.design-lib-folded';
  const show = (folded: boolean) => {
    el.classList.toggle('folded', folded);
    fold.textContent = folded ? '›' : '‹';
    fold.title = folded ? 'Open the shapes and icons' : 'Fold the shapes and icons away, for more room for the page';
    fold.setAttribute('aria-label', fold.title);
    fold.setAttribute('aria-expanded', String(!folded));
  };
  let folded = false;
  try { folded = localStorage.getItem(KEY) === '1'; } catch { /* no storage: start open */ }
  show(folded);
  fold.addEventListener('click', () => {
    folded = !el.classList.contains('folded');
    show(folded);
    try { localStorage.setItem(KEY, folded ? '1' : '0'); } catch { /* not remembered */ }
  });
  el.querySelector('.dl-tabs')?.append(fold);
}
const designGrid = { on: false, step: 18 };
const dzBg = $<HTMLInputElement>('#dz-bg');
const dzGrid = $<HTMLInputElement>('#dz-grid');
const dzStep = $<HTMLSelectElement>('#dz-grid-step');
dzGrid.addEventListener('change', () => { designGrid.on = dzGrid.checked; renderer.repaintAll(); editor.requestScene(); });
dzStep.addEventListener('change', () => { designGrid.step = Number(dzStep.value) || 18; dzGrid.checked = designGrid.on = true; renderer.repaintAll(); editor.requestScene(); });
dzStep.value = String(designGrid.step);
const dzGuides = $<HTMLInputElement>('#dz-guides');
dzGuides.checked = guidesOn.design;
dzGuides.addEventListener('change', () => { guidesOn.design = dzGuides.checked; showGuides(); storeSettings(); });
dzBg.addEventListener('change', () => {
  const d = deckNow();
  if (!d || (!d.master.fill && !d.current?.background && d.master.background.toLowerCase() === dzBg.value.toLowerCase())) return;
  finishTyping();
  // a colour here takes the place of a gradient or picture set with Format Background
  d.setAllBackgrounds(solid(dzBg.value));
});

/** The Design ribbon shows the page's size and background. */
function showDesignState(): void {
  const d = deckNow();
  if (!d) return;
  $('#dz-size').textContent = sizeLabel(d.size);
  if (/^#[0-9a-f]{6}$/i.test(d.master.background)) dzBg.value = d.master.background;
}

// ---------------------------------------------------------------- Slides' rulers, gridlines and guides

const guideTip = new GuideTip(host);
const rulers = new SlideRulers(host, {
  view: () => renderer.view,
  size: () => deckNow()?.size ?? null,
  prefs: () => rulerPrefs,
  selection: () => (editor.hasSelection() ? editor.selBox() : null),
  newGuide: (axis, e) => {
    const d = deckNow();
    if (!d) return;
    const view = slideViewOf(d);
    // a new guide, shown, dragged from the ruler
    const next = { ...view, showGuides: true, guides: { x: [...view.guides.x], y: [...view.guides.y] } };
    next.guides[axis].push(axis === 'x' ? -1e6 : -1e6);
    startGuideDrag(d, next, { axis, i: next.guides[axis].length - 1 }, e, 'Add guide', view);
  },
});

/** The deck's guides and grid (PowerPoint's first ones when it has none). */
function slideViewOf(d: Deck): SlideView {
  return d.settings.view ?? defaultView(d.size);
}


/** Drag a guide (or a copy of it): its place shown by the pointer; let go off the slide to take it away. One undo step. */
function startGuideDrag(d: Deck, view: SlideView, which: { axis: 'x' | 'y'; i: number }, e: PointerEvent, label: string, before = slideViewOf(d)): void {
  finishTyping();
  guideDrag = { which, view };
  const el = renderer.overlay;
  el.style.cursor = which.axis === 'x' ? 'col-resize' : 'row-resize';
  const hostBox = host.getBoundingClientRect();
  const move = (ev: PointerEvent) => {
    const p = { x: (ev.clientX - hostBox.left - renderer.view.ox) / renderer.view.scale, y: (ev.clientY - hostBox.top - renderer.view.oy) / renderer.view.scale };
    let v = which.axis === 'x' ? p.x : p.y;
    // to a sixteenth of an inch (or a millimetre), Alt: anywhere
    if (!ev.altKey) { const step = rulerPrefs.units === 'in' ? 4.5 : 72 / 25.4; const zero = rulerPrefs.from === 'centre' ? (which.axis === 'x' ? d.size.w : d.size.h) / 2 : 0; v = zero + Math.round((v - zero) / step) * step; }
    view.guides[which.axis][which.i] = v;
    const off = v < 0 || v > (which.axis === 'x' ? d.size.w : d.size.h);
    guideTip.show(off ? 'Let go to take the guide away' : rulerText(v, d.size, which.axis, rulerPrefs), ev.clientX - hostBox.left, ev.clientY - hostBox.top);
    renderer.repaintAll();
    editor.requestScene();
  };
  const up = () => {
    removeEventListener('pointermove', move, true);
    removeEventListener('pointerup', up, true);
    el.style.cursor = '';
    guideTip.hide();
    guideDrag = null;
    const v = view.guides[which.axis][which.i];
    const off = v < 0 || v > (which.axis === 'x' ? d.size.w : d.size.h);
    if (off) view.guides[which.axis].splice(which.i, 1);
    d.settings.view = before;
    d.setSettings({ ...d.settings, view }, off ? 'Remove guide' : label);
    renderer.repaintAll();
    editor.requestScene();
  };
  addEventListener('pointermove', move, true);
  addEventListener('pointerup', up, true);
  move(e);
}

// on the slide, a guide is picked up where nothing else is: a drag moves it, Ctrl+drag copies it
renderer.overlay.addEventListener('pointerdown', (e) => {
  const d = deckNow();
  if (e.button !== 0 || !d || ws.active.mode !== 'slides' || sorterOn || !d.settings.view?.showGuides || d.current?.canvas || editor.toolName !== 'select') return;
  const { p, taken } = editor.pointAt(e);
  if (taken) return;
  const view = d.settings.view;
  const near = guideNear(view, p, 4 / renderer.view.scale);
  if (!near) return;
  e.preventDefault();
  e.stopPropagation();
  const next: SlideView = { ...view, guides: { x: [...view.guides.x], y: [...view.guides.y] } };
  let which = near;
  if (e.ctrlKey || e.metaKey) { next.guides[near.axis].push(next.guides[near.axis][near.i]); which = { axis: near.axis, i: next.guides[near.axis].length - 1 }; }
  startGuideDrag(d, next, which, e, e.ctrlKey || e.metaKey ? 'Copy guide' : 'Move guide');
}, true);
// over a guide, the pointer says it can be dragged
renderer.overlay.addEventListener('pointermove', (e) => {
  const d = deckNow();
  if (guideDrag || e.buttons || !d || ws.active.mode !== 'slides' || !d.settings.view?.showGuides || d.current?.canvas || editor.toolName !== 'select') return;
  const { p, taken } = editor.pointAt(e);
  const near = taken ? null : guideNear(d.settings.view, p, 4 / renderer.view.scale);
  if (near) renderer.overlay.style.cursor = near.axis === 'x' ? 'col-resize' : 'row-resize';
});

editor.moveSnap = (box, raw, tol) => {
  const d = deckNow();
  return d && ws.active.mode === 'slides' && !d.current?.canvas ? snapMove(box, raw, d.settings.view ?? null, tol) : raw;
};

/** The rulers show in Normal view of slides when View > Ruler is ticked. */
function showRulers(): void {
  // (a canvas slide has no edge to measure from)
  rulers.show(slideLook.ruler && ws.active.mode === 'slides' && !sorterOn && !!deckNow() && !deckNow()?.current?.canvas);
  for (const b of document.querySelectorAll<HTMLInputElement>('[data-cmd="view-slide-ruler"]')) b.checked = slideLook.ruler;
  for (const b of document.querySelectorAll<HTMLInputElement>('[data-cmd="view-gridlines"]')) b.checked = slideLook.grid;
  const g = !!deckNow()?.settings.view?.showGuides;
  for (const b of document.querySelectorAll<HTMLInputElement>('[data-cmd="view-guides"]')) b.checked = g;
}

/** View > Guides on or off (saved with the file, as PowerPoint does). */
function toggleGuides(): void {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  const v = slideViewOf(d);
  d.setSettings({ ...d.settings, view: { ...v, guides: { x: [...v.guides.x], y: [...v.guides.y] }, showGuides: !v.showGuides } }, v.showGuides ? 'Hide guides' : 'Show guides');
  showRulers();
  renderer.repaintAll();
  editor.requestScene();
}

/** View > Grid Settings: snapping, the grid, the guides, the rulers' units. */
async function gridSettings(): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  const got = await gridAndGuides(slideViewOf(d), { grid: slideLook.grid, smart: guidesOn.slides }, rulerPrefs, d.size);
  if (!got) return;
  slideLook.grid = got.grid;
  guidesOn.slides = got.smart;
  Object.assign(rulerPrefs, got.prefs);
  d.setSettings({ ...d.settings, view: got.view }, 'Grid and guides');
  showGuides();
  showRulers();
  storeSettings();
  renderer.repaintAll();
  editor.requestScene();
}

/** Add a guide down (or across) the middle of the slide, shown. */
function addGuide(axis: 'x' | 'y'): void {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  const v = slideViewOf(d);
  const next = { ...v, showGuides: true, guides: { x: [...v.guides.x], y: [...v.guides.y] } };
  // not a second guide where one is already (the deck's first ones are down the middle, hidden): it shows
  const mid = (axis === 'x' ? d.size.w : d.size.h) / 2;
  if (!next.guides[axis].some((g) => Math.abs(g - mid) < 0.01)) next.guides[axis].push(mid);
  d.setSettings({ ...d.settings, view: next }, 'Add guide');
  showRulers();
  renderer.repaintAll();
  editor.requestScene();
}

/** Light lines across the page to line things up by (on screen only). */
function drawGrid(ctx: CanvasRenderingContext2D, size: SlideSize, step: number): void {
  const k = renderer.view.scale;
  // too close together to see: every second (fourth…) line instead
  let s = step;
  while (s * k < 6) s *= 2;
  ctx.save();
  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = 'rgba(80, 110, 170, 0.22)';
  ctx.beginPath();
  for (let x = s; x < size.w - 1e-6; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, size.h); }
  for (let y = s; y < size.h - 1e-6; y += s) { ctx.moveTo(0, y); ctx.lineTo(size.w, y); }
  ctx.stroke();
  ctx.restore();
}

async function newDesign(): Promise<void> {
  finishTyping();
  const t = await pickTemplate();
  if (t === 'blank') {
    const size = await pickDesignSize('New Design: page size');
    if (size) ws.newDesign(size);
  } else if (t) {
    ws.newDesign(templateSize(t), (d) => fillTemplate(d, t));
    editor.fit();
  }
}

async function designSize(): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'design') { flash('Page Size is for designs: use File > New > New Design.'); return; }
  finishTyping();
  const size = await pickDesignSize('Page size', d.size);
  if (size && deckNow() === d) {
    d.setSize(size);
    editor.fit();
  }
}

// a shape dragged from the library onto the page
host.addEventListener('dragover', (e) => {
  if (!e.dataTransfer?.types.includes(GEO_DRAG_TYPE)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
host.addEventListener('drop', (e) => {
  const id = e.dataTransfer?.getData(GEO_DRAG_TYPE);
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();
  const r = host.getBoundingClientRect();
  editor.placeGeo(id, renderer.toDoc(e.clientX - r.left, e.clientY - r.top));
  overlay.focus();
});

const slideListHooks = {
  go: (i: number) => goSlide(i),
  remove: (ix: number[]) => removeSlides(ix),
  duplicate: (ix: number[]) => { const d = deckNow(); if (d) { finishTyping(); d.duplicate(ix); } },
  add: () => newSlide(),
  copy: (ix: number[]) => copySlides(ix, false),
  cut: (ix: number[]) => copySlides(ix, true),
  paste: () => pasteSlides(),
  menu: (x: number, y: number) => showContextMenu(x, y, slideListMenu(), { run: (cmd) => void command(cmd), key: commandKey }),
  sectionMenu: (x: number, y: number, id: number) => {
    showContextMenu(x, y, [...sectionItems(), null, { cmd: 'add-section' }], {
      run: (cmd) => { sectionPicked = id; void command(cmd); },
      key: commandKey,
    });
  },
  renameSection: (id: number) => void renameSection(id),
  keyframe: {
    picked: () => { const d = deckNow(); return d ? canvasKeys.picked(d) : 0; },
    go: (i: number) => goKeyframe(i),
    move: (from: number, to: number) => keyframeCommands.move(from, to),
    remove: (i: number) => keyframeCommands.remove(i),
    menu: (x: number, y: number) => showContextMenu(x, y, keyframeMenu(), { run: (cmd) => void command(cmd), key: commandKey }),
  },
};
const slideList = new SlideList($('#slide-list'), slideListHooks);

/** Right-click on a keyframe (on the canvas or in the slide list). */
function keyframeMenu(): MenuItem[] {
  const k = canvasNow(), key = k?.c.keys[k.i];
  return [
    { cmd: 'add-keyframe' }, { cmd: 'keyframe-here' }, { cmd: 'fit-keyframe' }, null,
    { cmd: 'keyframe-title' }, { cmd: 'keyframe-zone' }, { cmd: 'canvas-background' }, null,
    { cmd: 'keyframe-spotlight' }, ...(key?.spot ? [{ cmd: 'keyframe-unspot' }] : []), { cmd: 'keyframe-detour', ...(key?.detour ? { label: 'Put Back on Route' } : {}) }, { cmd: 'canvas-show-options' }, null,
    { cmd: 'delete-keyframe' },
  ];
}

// View > Slides > Slide Sorter: every slide in rows of larger pictures, over the slide being edited.
// Double-click a slide (or press Enter) to go back to Normal view on it.
let sorterOn = false;
const sorterEl = $('#slide-sorter');
const sorterList = new SlideList(sorterEl, { ...slideListHooks, open: (i) => { goSlide(i); setSorter(false); } }, { grid: true, thumbW: 220 });

/** Slide Sorter on or off (Normal view). */
function setSorter(on: boolean): void {
  const d = deckNow();
  if (on && (!d || ws.active.mode !== 'slides')) { flash('Slide Sorter is for slides: use File > New > Presentation, or open a PowerPoint file.'); return; }
  if (on === sorterOn) { if (on) sorterList.focus(); return; }
  finishTyping();
  sorterOn = on;
  sorterEl.hidden = !on;
  $('#slide-list').hidden = on || ws.active.mode !== 'slides';
  sorterList.show(on ? d : null);
  if (on) {
    sorterList.picked = new Set(slideList.pickedList());
    sorterList.rebuild();
    sorterList.focus();
  } else {
    if (d) slideList.show(d);
    overlay.focus();
  }
  editor.paused = on;
  resize();
  showSlideState();
}

// View > Outline View: the outline in place of the slide list; View > Notes Page: the notes pages over the slide
const outlineView = new OutlineView($('#slide-list').parentElement!, {
  deck: () => (ws.active.mode === 'slides' ? deckNow() : null),
  go: (i) => goSlide(i),
  focusSlide: () => overlay.focus(),
});
const notesView = new NotesPageView(host, {
  deck: () => (ws.active.mode === 'slides' ? deckNow() : null),
  open: (i) => { setSlideView('normal'); goSlide(i); },
});

/** Which of Normal, Outline, Slide Sorter and Notes Page shows. */
function slideViewNow(): 'normal' | 'outline' | 'sorter' | 'notes' {
  return sorterOn ? 'sorter' : notesView.shown ? 'notes' : outlineView.shown ? 'outline' : 'normal';
}

/** Change the slides' view (Normal, Outline, Slide Sorter or Notes Page). */
function setSlideView(v: 'normal' | 'outline' | 'sorter' | 'notes'): void {
  const d = deckNow();
  if (v !== 'normal' && (!d || ws.active.mode !== 'slides')) { flash('That view is for slides: use File > New > Presentation, or open a PowerPoint file.'); return; }
  finishTyping();
  if (v !== 'sorter' && sorterOn) setSorter(false);
  if (v !== 'notes' && notesView.shown) { notesView.show(false); $('#notes-pane').classList.remove('np-hidden'); editor.paused = false; }
  if (v !== 'outline' && outlineView.shown) { outlineView.show(false); $('#slide-list').hidden = ws.active.mode !== 'slides'; if (d) slideList.show(d); }
  if (v === 'sorter') setSorter(true);
  if (v === 'outline' && !outlineView.shown) { $('#slide-list').hidden = true; outlineView.show(true); }
  if (v === 'notes' && !notesView.shown) {
    $('#notes-pane').classList.add('np-hidden');
    editor.paused = true;
    notesView.show(true);
    notesView.reveal(d!.index);
  }
  resize();
  showSlideState();
  for (const b of document.querySelectorAll<HTMLElement>('[data-cmd="view-outline"], [data-cmd="view-notes-page"]')) {
    const on = b.dataset.cmd === 'view-outline' ? outlineView.shown : notesView.shown;
    if (b.getAttribute('role') !== 'menuitem') b.setAttribute('aria-pressed', String(on));
  }
  if (v === 'normal') overlay.focus();
}

/** View > Notes Master and Handout Master: their settings, as one step of the history. */
async function editPageMaster(which: 'notes' | 'handout'): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') { flash('Notes pages and handouts are for slides.'); return; }
  finishTyping();
  const next = which === 'notes' ? await editNotesMaster(d.master) : await editHandoutMaster(d.master);
  if (!next || deckNow() !== d) return;
  d.setMaster(next);
  if (notesView.shown) notesView.rebuild();
}

/** The slides picked in the list showing: Slide Sorter's, or the slide list's. */
function pickedSlides(): number[] {
  return (sorterOn ? sorterList : slideList).pickedList();
}

/** Right-click in the slide list: what PowerPoint offers there. */
function slideListMenu(): MenuItem[] {
  return [
    { cmd: 'cut-slides', label: 'Cut' }, { cmd: 'copy-slides', label: 'Copy' }, { cmd: 'paste-slides', label: 'Paste' },
    { cmd: 'paste-slides-keep', label: 'Paste (Keep Source Formatting)' },
    null,
    { cmd: 'new-slide' }, { cmd: 'new-canvas-slide' }, { cmd: 'duplicate-slide' }, { cmd: 'delete-slide' },
    null,
    { label: 'Layout', items: deckLayouts(deckNow()?.master).map((l) => ({ cmd: `layout-${l.id}`, label: l.name })) },
    { cmd: 'format-background' },
    { cmd: 'slide-references', label: 'References on Slide…' },
    { cmd: 'hide-slide' },
    null,
    { cmd: 'add-section' },
    ...(deckNow()?.sections.length ? [{ label: 'Section', items: sectionItems() }] : []),
    null,
    { cmd: 'reuse-slides' },
    ...(sorterOn ? [null, { cmd: 'view-normal', label: 'Open in Normal View' }] : []),
  ];
}

/** The section commands, as in PowerPoint's right-click on a section. */
function sectionItems(): MenuItem[] {
  return [
    { cmd: 'rename-section' }, { cmd: 'remove-section' }, { cmd: 'remove-section-slides' }, { cmd: 'remove-all-sections' },
    null,
    { cmd: 'section-up' }, { cmd: 'section-down' },
    null,
    { cmd: 'collapse-sections' }, { cmd: 'expand-sections' },
  ];
}

/** The section a section command works on: the one whose heading was right-clicked, else the slide being edited's. */
let sectionPicked: number | null = null;
function pickedSection(d: Deck): number | null {
  const id = sectionPicked;
  sectionPicked = null;
  if (id !== null && d.sections.some((x) => x.id === id)) return id;
  return d.current?.section ?? null;
}

async function renameSection(id?: number): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  const sid = id ?? pickedSection(d);
  const sec = d.sections.find((x) => x.id === sid);
  if (!sec) { flash('This deck has no sections yet: use Add Section.'); return; }
  const got = await ask('Rename Section', [{ name: 'name', label: 'Section name', value: sec.name }], { ok: 'Rename' });
  if (got && deckNow() === d) d.renameSection(sec.id, got.name);
}

/** The section commands, by name. */
function sectionCommand(cmd: string): void {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  if (cmd === 'add-section') {
    const first = (sorterOn ? sorterList : slideList).pickedList()[0] ?? d.index;
    const id = d.addSection(first);
    void renameSection(id);
    return;
  }
  if (cmd === 'collapse-sections' || cmd === 'expand-sections') { d.foldAll(cmd === 'collapse-sections'); return; }
  if (cmd === 'remove-all-sections') { d.removeAllSections(); return; }
  const id = pickedSection(d);
  if (id === null) { flash('This deck has no sections yet: use Add Section.'); return; }
  if (cmd === 'rename-section') { void renameSection(id); return; }
  if (cmd === 'remove-section') d.removeSection(id);
  else if (cmd === 'remove-section-slides') { if (!d.removeSection(id, true)) flash('A presentation needs at least one slide, so this section\'s slides were kept.'); }
  else if (cmd === 'section-up' || cmd === 'section-down') {
    const k = d.sections.findIndex((x) => x.id === id);
    d.moveSection(id, k + (cmd === 'section-up' ? -1 : 1));
  }
}

/**
 * Slides copied or cut (in the slide list, or Edit > Slides > Copy Slides), with the deck they came from,
 * for pasting into any deck that is open.
 */
let slideClip: SlideSource | null = null;

function copySlides(ix: number[], cut: boolean): void {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  slideClip = d.copySlides(ix);
  const n = slideClip.slides.length;
  const what = `${n} slide${n === 1 ? '' : 's'}`;
  if (cut && !d.remove(ix)) { flash(`Copied ${what}: a presentation needs at least one slide, so nothing was cut.`); return; }
  flash(`${cut ? 'Cut' : 'Copied'} ${what}. Click in the slide list of this deck or another and press Ctrl+V to paste.`);
}

/**
 * Paste the slides copied after the last slide picked, in this deck's look; `keep` keeps each
 * slide's own background, fonts and colours. When the look would change, a button offers the
 * other way, as PowerPoint's Paste Options do.
 */
function pasteSlides(keep?: boolean): void {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  if (!slideClip) { flash('Copy slides first: pick them in the slide list and press Ctrl+C (or Edit > Presentation > Copy Slides).'); return; }
  finishTyping();
  const src = slideClip;
  const after = pickedSlides().at(-1) ?? d.index;
  const n = d.pasteSlides(src, !!keep, after);
  const what = `${n} slide${n === 1 ? '' : 's'}`;
  const sameLook = JSON.stringify(src.master) === JSON.stringify(d.master);
  if (keep !== undefined || sameLook) { flash(`Pasted ${what}.`); return; }
  const edits = d.edits;
  flash(`Pasted ${what} in this deck's look.`, 8000, {
    label: 'Keep source formatting',
    run: () => {
      // put them in again their own way, in place of the ones just pasted (if nothing has changed since)
      if (deckNow() !== d || d.edits !== edits) { flash('Use Edit > Presentation > Paste Slides (Keep Source Formatting) to paste them with their own look.'); return; }
      d.undo();
      d.pasteSlides(src, true, after);
      flash(`Pasted ${what} with their own look.`);
    },
  });
}

/** Keep Source Formatting, as last chosen in Reuse Slides. */
let reuseKeep = false;

/** Reuse Slides: pick slides from another PowerPoint file to put in after this one. */
async function reuseSlides(): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  const f = await openBytesDialog('PowerPoint presentations', [PPTX], SLIDES_OPEN_ONLY).catch(async (e) => { await showError(String(e)); return null; });
  if (!f) return;
  let got: ReturnType<typeof import('./io/pptx-read').readPptx>;
  try {
    got = (await import('./io/pptx-read')).readPptx(f.bytes);
  } catch (e) {
    flash(`Could not read ${f.name}: ${e instanceof Error ? e.message : String(e)}`, 8000);
    return;
  }
  if (!got.slides.length) { flash(`${f.name} has no slides.`); return; }
  // the file's slides in a deck of their own, to show and copy from
  const from = new Deck(new Doc());
  from.load(got.slides.map((s) => from.makeSlide(s.layout, s.contents, s.notes, s)), got.size, got.master);
  const pick = await pickReuseSlides(f.name, from, reuseKeep);
  if (!pick || deckNow() !== d) return;
  reuseKeep = pick.keep;
  const n = d.pasteSlides(from.copySlides(pick.indices), pick.keep, pickedSlides().at(-1) ?? d.index);
  flash(`Inserted ${n} slide${n === 1 ? '' : 's'} from ${f.name}.${got.warnings.length ? ' ' + got.warnings.join(' ') : ''}`, got.warnings.length ? 12000 : 3500);
}

function hideSlides(): void {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  const ix = pickedSlides();
  // as in PowerPoint: hide them all unless they are all hidden already
  const hide = !ix.every((i) => d.slides[i]?.hidden);
  d.setHidden(hide, ix);
  const n = ix.length;
  flash(hide ? `${n > 1 ? `${n} slides are` : 'The slide is'} hidden: the slide show skips ${n > 1 ? 'them' : 'it'}, and PowerPoint will too.` : `${n > 1 ? `${n} slides` : 'The slide'} will show in the slide show again.`);
}

function goSlide(i: number): void {
  const d = deckNow();
  if (!d || i < 0 || i >= d.slides.length) return;
  finishTyping();
  d.go(i);
}

function newSlide(layout?: LayoutId): void {
  const d = deckNow();
  if (!d) { flash('Slides are for presentations: use File > New > Presentation, or open a PowerPoint file.'); return; }
  finishTyping();
  d.addSlide(layout);
}

function removeSlides(ix: number[]): void {
  const d = deckNow();
  if (!d) return;
  finishTyping();
  if (!d.remove(ix)) flash('A presentation needs at least one slide.');
}

function setLayout(l: LayoutId): void {
  const d = deckNow();
  if (!d) return;
  finishTyping();
  d.setLayout(l);
}

function setSlideSize(size: { w: number; h: number }, fit: SizeFit = 'centre'): void {
  const d = deckNow();
  if (!d) return;
  finishTyping();
  d.setSize(size, fit);
  editor.fit();
}

sizeSel.addEventListener('change', () => {
  if (sizeSel.value === 'wide') setSlideSize(WIDE);
  else if (sizeSel.value === 'standard') setSlideSize(STANDARD);
  else if (sizeSel.value === 'pick') { showSlideState(); void customSlideSize(); }
  sizeSel.blur();
});

// Speaker notes are saved with the slide a moment after typing stops (and when the box is left).
let notesTimer = 0;
let notesFor: { deck: Deck; slide: unknown } | null = null;
notesBox.addEventListener('input', () => {
  const deck = deckNow();
  if (!deck) return;
  if (!notesFor) notesFor = { deck, slide: deck.current };
  clearTimeout(notesTimer);
  notesTimer = window.setTimeout(flushNotes, 500);
});
notesBox.addEventListener('blur', () => flushNotes());

function flushNotes(): void {
  clearTimeout(notesTimer);
  const f = notesFor;
  notesFor = null;
  if (!f) return;
  const i = f.deck.slides.indexOf(f.slide as Deck['slides'][number]);
  if (i >= 0) f.deck.setNotes(notesBox.value, i);
}

/**
 * Chemistry > Orient Like First: each selected structure (or, with `scheme`, each structure in
 * the drawing) is turned, and turned over if need be, so the part it shares with the first
 * structure (top left, as a scheme is read) lies the same way round. Configuration is kept.
 * Returns how many structures were turned, or null when there was nothing to compare.
 */
async function orientLikeFirst(scheme = false): Promise<number | null> {
  if (!chem.ready) { flash('The chemistry engine is still loading; try again in a moment.'); return null; }
  const picked = editor.sel.atoms;
  const frags = doc.fragments().filter((f) => [...f].some((id) => !doc.atoms.get(id)?.multi) && (scheme || !picked.size ? true : [...f].some((id) => picked.has(id))));
  if (!scheme && !picked.size) return null;
  if (frags.length < 2) return null;
  const box = (f: Set<number>) => {
    let x1 = Infinity, y1 = Infinity;
    for (const id of f) { const a = doc.atoms.get(id)!; x1 = Math.min(x1, a.x); y1 = Math.min(y1, a.y); }
    return { x1, y1 };
  };
  // the first structure in reading order: the top row, then the leftmost in it
  const top = Math.min(...frags.map((f) => box(f).y1));
  const row = frags.filter((f) => box(f).y1 <= top + doc.style.bondLength * 2);
  const ref = row.reduce((p, q) => (box(q).x1 < box(p).x1 ? q : p));
  const others = frags.filter((f) => f !== ref);
  const refEx = toMolfile(doc, ref);
  const exs = others.map((f) => toMolfile(doc, f));
  const pairs = await chem.common(refEx.molblock, exs.map((e) => e.molblock)).catch(() => null);
  if (!pairs) { flash('Could not compare the structures.'); return 0; }
  const moves: { atoms: Set<number>; f: (p: Vec) => Vec; mirror: boolean }[] = [];
  others.forEach((f, i) => {
    const pr = pairs[i];
    if (!pr) return;
    const from: Vec[] = [], to: Vec[] = [];
    for (const [r, m] of pr) {
      const ra = doc.atoms.get(refEx.map[r] ?? -1), ma = doc.atoms.get(exs[i].map[m] ?? -1);
      if (ra && ma) { to.push(ra); from.push(ma); }
    }
    // only a real shared part: three atoms or more, and a good share of the structure
    if (from.length < 3 || from.length < 0.3 * f.size) return;
    const fit = bestFit(from, to);
    if (!fit || !fitMatters(fit)) return;
    let cx = 0, cy = 0;
    for (const id of f) { const a = doc.atoms.get(id)!; cx += a.x; cy += a.y; }
    moves.push({ atoms: f, f: fitMove(fit, { x: cx / f.size, y: cy / f.size }), mirror: fit.mirror });
  });
  if (moves.length) editor.reorient(moves);
  return moves.length;
}

/** After a flip: nothing selected, or a plain flip that made the mirror image of a structure with wedges. */
function flipped(r: boolean | 'stereo'): void {
  if (!r) flash('Select something to flip.');
  else if (r === 'stereo') flash('Flipped: the wedged centers are now the mirror image (the enantiomer). To keep the configuration, undo and use Flip, Preserve Stereochemistry.', 7000, { label: 'Undo', run: () => undo() });
}

/** Undo and Redo: in Slides mode the deck's history covers every slide and the slide list; a sheet has its own. */
function undo(): void {
  if (sheetActive()) { sheetMode.undo(); return; }
  if (docActive()) { docMode.run('undo'); return; }
  const d = deckNow();
  if (!d) { editor.undo(); return; }
  finishTyping();
  if (d.undo()) editor.afterUndo();
  refreshHistory();
}

function redo(): void {
  if (sheetActive()) { sheetMode.redo(); return; }
  if (docActive()) { docMode.run('redo'); return; }
  const d = deckNow();
  if (!d) { editor.redo(); return; }
  finishTyping();
  if (d.redo()) editor.afterUndo();
  refreshHistory();
}

/** The name of the step Undo (or Redo) would take back in the tab in front: null with nothing to take back, '' when it has no name. */
function historyStep(redo: boolean): string | null {
  if (sheetActive()) return sheetMode.history(redo);
  if (docActive()) return docMode.canUndo(redo) ? '' : null;
  const h = deckNow() ?? doc;
  if (!(redo ? h.canRedo() : h.canUndo())) return null;
  return redo ? h.redoLabel : h.undoLabel;
}

/**
 * Undo and Redo greyed out with nothing to take back, and named after the step they would
 * (Undo Add Ring), on the toolbar and in the Edit menu. Checked after each click and key press.
 */
let historyQueued = false;
function refreshHistory(): void {
  if (historyQueued) return;
  historyQueued = true;
  requestAnimationFrame(() => {
    historyQueued = false;
    for (const [cmd, verb] of [['undo', 'Undo'], ['redo', 'Redo']] as const) {
      const step = historyStep(cmd === 'redo');
      const name = step ? `${verb} ${step}` : verb;
      for (const item of document.querySelectorAll<HTMLButtonElement>(`header .menu [data-cmd="${cmd}"]`)) {
        item.disabled = step === null;
        const label = item.firstChild;
        if (label?.nodeType === Node.TEXT_NODE) label.textContent = name;
      }
    }
    quickBar?.refresh();
  });
}
for (const ev of ['pointerup', 'keyup'] as const) document.addEventListener(ev, refreshHistory, true);

// ---------------------------------------------------------------- the tab strip

/** Each kind of tab's picture (white on its mode's colour), so they tell apart at a glance. */
const tabSvg = (body: string) => `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;
const TAB_ICONS: Record<Tab['mode'], [string, string]> = {
  // a hexagon (a ring), a page of lines, a screen, a grid, and a pen nib over shapes
  drawing: [tabSvg('<polygon points="8,2 13.2,5 13.2,11 8,14 2.8,11 2.8,5"/>'), 'Canvas'],
  document: [tabSvg('<path d="M4 2.5h6l2.5 2.5v8.5h-8.5z"/><path d="M6 7.5h4.5M6 10h4.5"/>'), 'Document'],
  slides: [tabSvg('<rect x="2" y="3" width="12" height="8.5" rx="1"/><path d="M8 11.5V14M5.5 14h5"/>'), 'Presentation'],
  sheet: [tabSvg('<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M2.5 6.5h11M2.5 10h11M6.5 2.5v11"/>'), 'Spreadsheet'],
  design: [tabSvg('<circle cx="5" cy="11" r="2.6"/><rect x="8.3" y="2.5" width="5.2" height="5.2" rx="0.6"/><path d="M3 4.5l3-2.2 1.5 3.4z"/>'), 'Design'],
};

function renderTabs(): void {
  refreshHistory();
  fitRibbons();
  const items = ws.tabs.map((t) => {
    const el = document.createElement('div');
    el.className = `tab tab-${t.mode}${t === ws.active ? ' active' : ''}${t.dirty ? ' dirty' : ''}`;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', String(t === ws.active));
    // the keys reach the tab showing; the arrow keys go along to the others
    el.tabIndex = t === ws.active ? 0 : -1;
    el.addEventListener('keydown', (e) => {
      if (e.target !== el) return;
      const i = ws.tabs.indexOf(t);
      const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ws.tabs.length - 1 : null;
      if (to !== null) {
        e.preventDefault();
        const n = ws.tabs[(to + ws.tabs.length) % ws.tabs.length];
        if (n !== ws.active) ws.activate(n);
        $('#tabs').querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
      } else if (e.key === 'Delete') { e.preventDefault(); void ws.close(t); }
    });
    // the file's name first: a tab squeezed to its icon shows it only here
    el.title = `${ws.label(t)} (${TAB_ICONS[t.mode][1]})` + (t.ref.kind === 'path' ? `\n${t.ref.path}` : '') + (t.dirty ? '\nNot saved' : '')
      + (t.savedAt ? `\n${t.savedHow === 'autosaved' ? 'AutoSaved' : 'Saved'} ${new Date(t.savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '')
      + (keeper.autoSaveWanted(t) && ws.canAutoSave(t) ? ' (AutoSave on)' : '');
    const icon = document.createElement('span');
    icon.className = 'tab-icon';
    icon.innerHTML = TAB_ICONS[t.mode][0];
    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = ws.label(t);
    const close = document.createElement('button');
    close.className = 'tab-close';
    close.type = 'button';
    close.title = 'Close';
    close.setAttribute('aria-label', `Close ${t.name}`);
    close.textContent = '×';
    close.addEventListener('click', (e) => { e.stopPropagation(); void ws.close(t); });
    el.addEventListener('click', () => { if (!tabDragged) ws.activate(t); });
    el.addEventListener('pointerdown', (e) => dragTab(e, el, t));
    // the middle mouse button closes a tab, as in browsers
    el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); void ws.close(t); } });
    el.append(icon, name, close);
    return el;
  });
  tabStrip.replaceChildren(...items);
  fitTabs();
  tabStrip.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  showTabArrows();
}

// The tab strip scrolls when the tabs don't fit; arrows at its ends, a list of every open file,
// and one + button for a new file of any kind stay pinned at the right.
const tabStrip = document.createElement('div');
tabStrip.className = 'tab-strip';
const tabButton = (cls: string, text: string, title: string) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `tab-ctl ${cls}`;
  b.textContent = text;
  b.title = title;
  b.setAttribute('aria-label', title);
  return b;
};
const tabLeft = tabButton('tab-left', '‹', 'Scroll the tabs left');
const tabRight = tabButton('tab-right', '›', 'Scroll the tabs right');
const tabList = tabButton('tab-list', '▾', 'List of open files');
const tabAdd = tabButton('tab-add', '+', 'New file: canvas, presentation, spreadsheet, document or design');
tabLeft.addEventListener('click', () => tabStrip.scrollBy({ left: -tabStrip.clientWidth * 0.7, behavior: 'smooth' }));
tabRight.addEventListener('click', () => tabStrip.scrollBy({ left: tabStrip.clientWidth * 0.7, behavior: 'smooth' }));
tabStrip.addEventListener('scroll', () => showTabArrows(), { passive: true });
tabStrip.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tabStrip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
new ResizeObserver(() => showTabArrows()).observe(tabStrip);
const menuAt = (b: HTMLElement) => { const r = b.getBoundingClientRect(); return [Math.max(4, r.right - 220), r.bottom + 2] as const; };
tabList.addEventListener('click', () => {
  const [x, y] = menuAt(tabList);
  showContextMenu(x, y, ws.tabs.map((t) => ({ cmd: `tab-show:${t.id}`, label: `${t === ws.active ? '✓ ' : ''}${ws.label(t)}${t.dirty ? ' •' : ''}` })), {
    run: (cmd) => { const t = ws.tabs.find((x) => `tab-show:${x.id}` === cmd); if (t) ws.activate(t); },
    key: () => undefined,
  });
});
tabAdd.addEventListener('click', () => {
  const [x, y] = menuAt(tabAdd);
  showContextMenu(x, y, [
    { cmd: 'new', label: 'Canvas (Chemistry)' }, { cmd: 'new-slides', label: 'Presentation (Slideshow)' },
    { cmd: 'new-sheet', label: 'Spreadsheet (Tables, Charts, and Dashboards)' }, { cmd: 'new-document', label: 'Document (Text document)' }, { cmd: 'new-design', label: 'Design (Posters, Graphical abstracts, Figures)' },
    { cmd: 'new-from-template', label: 'Document or Spreadsheet from Template…' },
  ], { run: (cmd) => void command(cmd), key: commandKey });
});
tabsEl.replaceChildren(tabLeft, tabStrip, tabRight, tabList, tabAdd);
new ResizeObserver(() => fitTabs()).observe(tabsEl);

/** The file tabs sit in the menu bar beside the menus (to start with), or on a row of their own (View > Window and Colours). */
let tabsInMenu = true;
function placeTabs(inMenu: boolean): void {
  tabsInMenu = inMenu;
  if (inMenu) $('header').insertBefore(tabsEl, $('#btn-search'));
  else $('header').after(tabsEl);
  document.body.classList.toggle('tabs-in-menu', inMenu);
  $('[data-cmd="tabs-in-menu"]')?.setAttribute('aria-checked', String(inMenu));
  fitTabs();
}

/** A tab's own room besides its name: its padding and border, its icon, its × and the gaps between them (app.css, header .tab), and the gap to the next tab. */
const TAB_CHROME = 68;
let nameRoom = { font: '', px: 0 };
/** How wide eight characters of a tab's name are (an average mix of letters), measured in the tabs' own font. */
function eightChars(): number {
  const el = tabStrip.querySelector('.tab-name');
  const font = el ? getComputedStyle(el).font : '';
  if (font && font !== nameRoom.font) {
    const g = document.createElement('canvas').getContext('2d');
    if (g) { g.font = font; nameRoom = { font, px: g.measureText('Presenta').width }; }
  }
  return nameRoom.px || 56;
}

/**
 * When the tabs would be squeezed so far that their names show fewer than about eight characters
 * ("Ca…" says nothing), they show only their icons (the name is in each one's tooltip); the active
 * one keeps its name.
 */
function fitTabs(): void {
  const ctl = [tabList, tabAdd].reduce((w, b) => w + b.offsetWidth + 2, 0);
  const room = tabsEl.clientWidth - ctl - 12;
  tabsEl.classList.toggle('tabs-narrow', room > 0 && room / Math.max(1, ws.tabs.length) - TAB_CHROME < eightChars());
  showTabArrows();
}

function showTabArrows(): void {
  const over = tabStrip.scrollWidth > tabStrip.clientWidth + 1;
  tabLeft.hidden = tabRight.hidden = !over;
  tabLeft.disabled = tabStrip.scrollLeft <= 0;
  tabRight.disabled = tabStrip.scrollLeft + tabStrip.clientWidth >= tabStrip.scrollWidth - 1;
}

// Tabs are dragged along the strip to put them in another order (as in browsers).
let tabDragged = false;
function dragTab(e: PointerEvent, el: HTMLElement, t: Tab): void {
  if (e.button !== 0 || (e.target as HTMLElement).closest('.tab-close')) return;
  tabDragged = false;
  const startX = e.clientX;
  const tabs = [...tabStrip.querySelectorAll<HTMLElement>('.tab')];
  const from = tabs.indexOf(el);
  let to = from;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    if (!tabDragged) {
      if (Math.abs(dx) < 6) return;
      tabDragged = true;
      el.setPointerCapture(ev.pointerId);
      el.classList.add('tab-dragging');
    }
    el.style.transform = `translateX(${dx}px)`;
    // the place it would go: past every tab whose middle it has crossed
    const mid = el.getBoundingClientRect().left + el.offsetWidth / 2;
    to = from;
    tabs.forEach((o, i) => {
      if (o === el) return;
      const r = o.getBoundingClientRect(), m = r.left + r.width / 2;
      if (i < from && mid < m) to = Math.min(to, i);
      if (i > from && mid > m) to = Math.max(to, i);
    });
    tabs.forEach((o, i) => {
      if (o === el) return;
      const shift = from < to && i > from && i <= to ? -el.offsetWidth : from > to && i >= to && i < from ? el.offsetWidth : 0;
      o.style.transform = shift ? `translateX(${shift}px)` : '';
    });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (!tabDragged) return;
    for (const o of tabs) { o.style.transform = ''; o.classList.remove('tab-dragging'); }
    if (to !== from) ws.moveTab(t, to);
    // the click that ends a drag doesn't switch tabs
    setTimeout(() => { tabDragged = false; }, 0);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

let lastTitle = '';
function updateTitle(): void {
  const t = `${ws.active.dirty ? '• ' : ''}${ws.active.name} – Chem Illustrator`;
  if (t === lastTitle) return;
  lastTitle = t;
  document.title = t;
  if (isTauri()) getCurrentWindow().setTitle(t).catch(() => {});
}

// ---------------------------------------------------------------- pictures

/** Ask for a picture file. */
async function pickPicture(): Promise<{ bytes: Uint8Array; mime: string; name: string } | null> {
  let f;
  try {
    f = await openBytesDialog('Pictures', [], PICTURE_EXTENSIONS);
  } catch (e) {
    await showError('Could not open the picture: ' + String(e));
    return null;
  }
  if (!f) return null;
  const mime = pictureMime(f.name, f.bytes);
  if (!mime) { flash(`${f.name} isn't a picture this can show.`); return null; }
  return { bytes: f.bytes, mime, name: f.name };
}

// ---------------------------------------------------------------- embedded objects (Insert > Document > Object)

/** Ask for a file of any kind, to put in a document as an object. */
async function pickObjectFile(): Promise<{ name: string; bytes: Uint8Array } | null> {
  try {
    return await openAnyBytesDialog();
  } catch (e) {
    await showError('Could not open the file: ' + String(e));
    return null;
  }
}

/** The picture an object shows: a workbook's cells, a PDF's first page, a picture, or an icon. */
function objectPictureOf(name: string, bytes: Uint8Array, icon: boolean): Promise<ObjectPicture> {
  return objectPicture(name, bytes, icon, {
    readBook: async (b) => (await (await import('./io/sheet-files')).readSheetFile(b, name, sheetFiles)).book,
    pdfPage: (b) => import('./render/pdf-page').then((m) => m.pdfFirstPage(b)),
  });
}

/** Embedded files that open in a viewer or an Office program, not as a program of their own. */
const SAFE_OBJECT_FILE = /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf|pdf|txt|csv|cdx|cdxml|mol|sdf|jdx|png|jpe?g|gif|bmp|tiff?|svg|emf|wmf)$/i;

/**
 * Open an object's file in its own program: written to a folder of its own in the temporary
 * folder and opened as a double-click in Explorer would. While it is open (up to a working day)
 * the file is checked every couple of seconds, and each save there is handed to `changed` once
 * the file has stopped changing. In a browser the file is downloaded instead.
 */
async function openObjectFile(file: { name: string; bytes: Uint8Array }, changed: (bytes: Uint8Array) => void): Promise<string | null> {
  const ext = /\.([^.\\/]+)$/.exec(file.name)?.[1] ?? 'bin';
  if (!isTauri()) {
    await writeFile({ kind: 'none' }, file.name, file.bytes, { description: file.name, extension: ext, mime: 'application/octet-stream' });
    return `${file.name} was downloaded: in a browser it can't open in its program or bring changes back here (the desktop app does both).`;
  }
  // an object in a document someone sent could be a program in disguise: anything but a
  // document or picture is opened only after the person says yes, as Word asks
  if (!SAFE_OBJECT_FILE.test(file.name)
    && !window.confirm(`This object is a file called "${file.name}". Files like this can be programs that run on your computer.\n\nOpen it only if you trust where the document came from. Open it?`)) return null;
  let path: string;
  try {
    const dir = await invoke<string>('ole_object_folder');
    path = `${dir}${/Windows/i.test(navigator.userAgent) ? '\\' : '/'}${file.name.replace(/[\\/:*?"<>|]/g, '_')}`;
    await writeFile({ kind: 'path', path }, file.name, file.bytes, { description: file.name, extension: ext, mime: 'application/octet-stream' });
    const { openPath } = await import('@tauri-apps/plugin-opener');
    await openPath(path);
  } catch (e) {
    return `Could not open ${file.name}: ${String(e)}`;
  }
  const stamp = async () => { const s = await stampOf({ kind: 'path', path }); return s ? `${s.modified}:${s.size}` : ''; };
  let seen = await stamp(), pending = '';
  const until = Date.now() + 10 * 3600e3;
  const timer = window.setInterval(() => {
    if (Date.now() > until) { window.clearInterval(timer); return; }
    void stamp().then(async (now) => {
      if (!now || now === seen) { pending = ''; return; }
      // wait for one more look at the same stamp: the program may still be writing
      if (now !== pending) { pending = now; return; }
      const bytes = await readRef({ kind: 'path', path });
      if (!bytes?.length) return;
      seen = now;
      pending = '';
      changed(bytes);
    });
  }, 1500);
  return null;
}

/** Another program's object on the Windows clipboard (Excel's cells, for one), with the picture it came with. */
async function clipboardObject(): Promise<{ embed: Embedded; picture: { bytes: Uint8Array; mime: string } | null } | null> {
  const got = await nativeFirst(['Embedded Object']).catch(() => null);
  const embed = got ? fromEmbedSource(got[1]) : null;
  if (!embed) return null;
  const pic = await nativeFirst(['PNG', 'CF_ENHMETAFILE']).catch(() => null);
  return { embed, picture: pic ? { bytes: pic[1], mime: pic[0] === 'PNG' ? 'image/png' : 'image/x-emf' } : null };
}

/** Ask for a BibTeX or RIS file of references, and read its text. */
async function pickReferenceFile(): Promise<{ name: string; text: string } | null> {
  const f = await openBytesDialog('BibTeX or RIS references', [], ['bib', 'ris', 'txt']);
  if (!f) return null;
  return { name: f.name, text: new TextDecoder().decode(f.bytes).replace(/^\uFEFF/, '') };
}

// ---------------------------------------------------------------- your library (compounds and references)

/** The desktop app on a computer (not the iPad app, which can't look through folders). */
const desktopFolders = isTauri() && !iPadApp;

/** Your own library of references and compounds, kept between sessions (src/library). Read the first time it is needed. */
const library = new Library(storePlace(keepStore()));
let libraryReady: Promise<Library> | null = null;
function useLibrary(): Promise<Library> {
  return (libraryReady ??= (async () => {
    // this computer may keep it in a folder of its own choosing (OneDrive, a lab drive)
    const choice = isTauri() ? await readPlaceChoice(keepStore()).catch(() => ({ folder: null })) : { folder: null };
    if (choice.folder) library.place = folderPlace(choice.folder);
    await library.load();
    return library;
  })());
}
library.onChange(() => { referencesWindow.fill(); });
window.addEventListener('beforeunload', () => { void library.flush(); });

/** A web address's text: the desktop app reads it itself, a browser where the site allows it (PubMed and Zotero do). */
async function webText(url: string): Promise<string> {
  if (isTauri()) return new TextDecoder().decode(new Uint8Array(await invoke<ArrayBuffer>('web_get', { url })));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`answered with an error (${res.status}).`);
  return res.text();
}

/** Open a file the library keeps (a PDF) in its own program. */
async function openLibraryFile(name: string, bytes: Uint8Array, path: string | null): Promise<void> {
  if (path && isTauri()) {
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(path);
      return;
    } catch (e) {
      flash(`Could not open ${name}: ${String(e)}`, 8000);
      return;
    }
  }
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Pick a folder (desktop app). */
async function pickFolder(start = ''): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const got = await open({ directory: true, multiple: false, ...(start ? { defaultPath: start } : {}) });
  return typeof got === 'string' ? got : null;
}

/** Chemistry > Compound Library > Library Location: on this computer, or in a folder (to use it on other computers, or share it). */
async function libraryLocation(): Promise<void> {
  const lib = await useLibrary();
  const where = await lib.place.where().catch(() => '');
  if (!isTauri()) {
    await ask('Library Location', [], { ok: 'OK', noCancel: true, note: `Your library is kept in this browser's storage for the page (${where}). In the desktop app it can be kept in a folder instead, such as one in OneDrive, to use it on other computers or share it with your group.` });
    return;
  }
  const choice = await readPlaceChoice(keepStore());
  const got = await ask('Library Location', [{
    name: 'place', label: 'Keep it', value: choice.folder ? 'folder' : 'here',
    options: [{ value: 'here', label: 'On this computer (the app\'s own folder)' }, { value: 'folder', label: 'In a folder I choose (OneDrive, a lab drive)…' }],
  }], { ok: 'Continue', note: `Now: ${where}. In a folder, the library is one file (${LIBRARY_FILE}) with its PDFs in a folder beside it; every computer that keeps it there shares it, and changes made on two at once are merged. What is in the library now goes with it.` });
  if (!got) return;
  if (got.place === 'here') {
    if (!choice.folder) return;
    await lib.moveTo(storePlace(keepStore()));
    await writePlaceChoice(keepStore(), { folder: null });
    flash('Your library is kept on this computer now (what was in the folder came with it).', 6000);
    return;
  }
  const folder = await pickFolder(choice.folder ?? '');
  if (!folder) return;
  await lib.moveTo(folderPlace(folder));
  await writePlaceChoice(keepStore(), { folder });
  flash(`Your library is kept in ${folder} now. Choose the same folder on your other computers to share it.`, 8000);
  referencesWindow.fill();
  compoundWindow.now()?.fill();
}

const ZOTERO_KEY = 'library/zotero.json';

/** The library as the References window's first group. */
const libraryRefs = libraryHolder(library, {
  files: () => fileRefHolders(),
  pickPdf: async () => { const f = await openBytesDialog('PDF', [PDF]); return f ? { name: f.name, bytes: f.bytes } : null; },
  openFile: (name, bytes, path) => openLibraryFile(name, bytes, path),
  get: webText,
  zotero: {
    read: async () => { try { return JSON.parse((await getText(keepStore(), ZOTERO_KEY)) ?? 'null') as ZoteroLink | null; } catch { return null; } },
    write: (link) => (link ? putText(keepStore(), ZOTERO_KEY, JSON.stringify(link)) : keepStore().remove(ZOTERO_KEY)),
  },
  styleChanged: () => storeSettings(),
  location: () => libraryLocation(),
  flash,
});

/** SMILES, formula and weight for molfiles (null where the chemistry engine can't read one). */
async function weighMolfiles(mbs: string[]): Promise<(FragmentResult | null)[]> {
  if (!mbs.length) return [];
  const res = await chem.analyze(mbs.map((molblock) => ({ molblock, map: [] }))).catch(() => null);
  return mbs.map((_, i) => { const r = res?.results[i]; return r && !r.error && r.smiles ? r : null; });
}

/** Structures of a drawing (each fragment's atoms, with its number) ready for the library. */
async function structuresFor(d: Doc, parts: { atoms: number[]; label?: string }[]): Promise<StructureIn[]> {
  const mbs = parts.map((p) => toMolfile(d, p.atoms).molblock);
  const w = await weighMolfiles(mbs);
  const out: StructureIn[] = [];
  parts.forEach((p, i) => {
    const r = w[i];
    if (!r) return;
    const atoms = new Set(p.atoms);
    const bonds = new Set([...d.bonds.values()].filter((b) => atoms.has(b.a1) && atoms.has(b.a2)).map((b) => b.id));
    const part = extractDrawing(d, { atoms, bonds, captions: new Set(), arrows: new Set(), shapes: new Set() });
    out.push({ molfile: mbs[i], smiles: r.smiles, formula: r.formula, mw: r.mw, drawing: part.contents(), ...(p.label ? { label: p.label } : {}) });
  });
  return out;
}

/** The structures of a drawing, a figure or a cell, as structuresIn finds them, keeping only those whose atoms are in `only`. */
function partsOf(d: Doc, only?: Set<number>): { atoms: number[]; label?: string }[] {
  return structuresIn(d).filter((p) => !only || p.atoms.some((a) => only.has(a)));
}

/** The drawing picked where the tab showing keeps structures: a document's figure, a cell's structure. */
function pickedDrawing(): Doc | null {
  if (docActive()) {
    const id = docMode.pickedObject();
    const o = id !== null ? docMode.file?.t.objects[id] : undefined;
    return o?.kind === 'drawing' ? structureDoc(o.contents, docStyle()) : null;
  }
  if (sheetActive()) {
    const c = sheetMode.activeStructure();
    return c ? structureDoc(c, ws.active.book?.drawingStyle ?? ACS_1996) : null;
  }
  return null;
}

/** The structures selected in the tab showing; a string says why there are none. */
async function selectedForLibrary(): Promise<StructureIn[] | string> {
  if (!chem.ready) return 'The chemistry engine is still loading; try again in a moment.';
  if (docActive() || sheetActive()) {
    const d = pickedDrawing();
    if (!d?.atoms.size) return docActive() ? 'Click a structure in the document first.' : 'Click a cell with a structure in it first.';
    const got = await structuresFor(d, partsOf(d));
    return got.length ? got : 'The structure couldn\'t be read (check its valences).';
  }
  const frags = chosenStructures();
  if (!frags.length) return 'Select one or more structures in the drawing first.';
  const atoms = new Set(frags.flatMap((f) => [...f]));
  const got = await structuresFor(doc, partsOf(doc, atoms));
  return got.length ? got : 'The structure couldn\'t be read (check its valences).';
}

/** Every structure with a compound number in the tab showing. */
async function numberedForLibrary(): Promise<StructureIn[] | string> {
  if (!chem.ready) return 'The chemistry engine is still loading; try again in a moment.';
  const t = ws.mainOf(ws.active);
  const out: StructureIn[] = [];
  const docs: Doc[] = [];
  if (t.deck) t.deck.slides.forEach((_, i) => docs.push(t.deck!.docOf(i)));
  else if (t.document) for (const id of usedObjects(t.document.t)) { const o = t.document.t.objects[id]; if (o?.kind === 'drawing') docs.push(structureDoc(o.contents, t.document.t.drawingStyle)); }
  else if (t.book) return 'Add Numbered works on drawings, slides and documents: in a spreadsheet, pick a cell and use Add Selected.';
  else docs.push(ws.docOf(t));
  for (const d of docs) out.push(...await structuresFor(d, partsOf(d).filter((p) => p.label)));
  return out.length ? out : 'No structure in this file has a compound number under it (Chemistry > Number Compounds adds them).';
}

/** A library compound as a drawing in `style`, with its number under it. */
function compoundDrawing(c: LibCompound, style: DocStyle, withLabel: boolean): Doc {
  const d = c.drawing?.atoms.length ? structureDoc(c.drawing, style) : (() => { const x = new Doc(); x.style = { ...style }; x.bulk(() => { addMolfile(x, c.molfile, 0, 0); }); return x; })();
  fitPasted(d, style);
  if (withLabel && c.label && d.atoms.size) {
    d.bulk(() => {
      const cap = d.addCaption({ x: 0, y: 0, runs: [{ text: c.label, bold: numbering.bold ? true : undefined }], justify: 'center', attach: { atoms: [...d.atoms.keys()], side: 'below', gap: defaultGap(d), shift: 0, role: 'label' } });
      placeAttached(d, cap, plainMeasure(d));
    });
  }
  return d;
}

/** What Insert in the Compound Library puts a compound into. */
function compoundInsertsInto(): string | null {
  if (docActive()) return 'the document, at the caret';
  if (sheetActive()) return 'the cell picked';
  if (cellEdit) return null;
  return deckNow() ? (ws.active.mode === 'design' ? 'the design' : 'the slide') : 'the drawing';
}

function insertCompound(c: LibCompound): string {
  if (docActive()) { docMode.insertDrawing(compoundDrawing(c, docStyle(), true).contents()); return ''; }
  if (sheetActive()) { sheetMode.putStructure(compoundDrawing(c, ws.active.book?.drawingStyle ?? ACS_1996, false).contents()); return ''; }
  if (cellEdit) return 'Finish the structure being drawn first.';
  const d = compoundDrawing(c, doc.style, true);
  if (!d.atoms.size) return 'This compound\'s structure couldn\'t be drawn.';
  void pasteFrom(() => ({ kind: 'drawing', doc: d }));
  return '';
}

/** A picture of a compound for the library's list. */
function compoundPicture(c: LibCompound): string | null {
  try {
    const d = compoundDrawing(c, ACS_1996, false);
    const pic = recordPicture(d, 2);
    return pic ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pictureSvg(pic)) : null;
  } catch {
    return null;
  }
}

/** Open a file and go to a place in it (a structure found in it). */
async function openAt(path: string, spot: Spot | null, atoms: number[] = []): Promise<void> {
  await openRecent(path);
  const t = ws.mainOf(ws.active);
  if (t.ref.kind !== 'path' || t.ref.path !== path || !spot) return;
  if (t.mode === 'document') await loadDocMode();
  if (t.mode === 'sheet') await loadSheetMode();
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  if (spot.kind === 'figure') goToIssue({ kind: 'doc-object', id: spot.object });
  else if (spot.kind === 'cell') goToIssue({ kind: 'cell', sheet: spot.sheet, row: spot.row, col: spot.col });
  else goToIssue({ kind: 'drawing', ...(spot.kind === 'slide' ? { slide: spot.slide } : {}), atoms: atoms.filter((a) => doc.atoms.has(a)) });
}

/** The structures in an open tab, as they are now (not as saved). */
function foundInTab(t: Tab): Found[] {
  if (t.deck) return t.deck.slides.flatMap((_, i) => foundInContents(t.deck!.docOf(i).contents(), { kind: 'slide', slide: i }, t.deck!.docOf(i).style));
  if (t.document) return foundInDocument(t.document.t);
  if (t.book) return foundInWorkbook(t.book);
  const d = ws.docOf(t);
  return structuresIn(d).map((s) => ({ spot: { kind: 'drawing' as const }, atoms: s.atoms, ...(s.label ? { label: s.label } : {}), molblock: toMolfile(d, s.atoms).molblock }));
}

/** A file was saved or opened: the library's compounds in it remember it. */
async function noteFileCompounds(tab: Tab): Promise<void> {
  const t = ws.mainOf(tab);
  if (t.ref.kind !== 'path' || !chem.ready) return;
  const path = t.ref.path;
  const lib = await useLibrary();
  if (!lib.now.compounds.length) return;
  const found = foundInTab(t);
  if (!found.length) return;
  const w = await weighMolfiles(found.map((f) => f.molblock));
  lib.change((l) => noteMentions(l, path, found.map((f, i) => ({ smiles: w[i]?.smiles ?? '', ...(f.label ? { label: f.label } : {}) }))));
}

// (the window is loaded when first opened)
const compoundHost = {
  flash,
  selected: () => selectedForLibrary(),
  numbered: () => numberedForLibrary(),
  fromText: async (text) => {
    const r = await textToStructure(text, ACS_1996);
    if ('error' in r) return r;
    const d = structureDoc(r.contents, ACS_1996);
    const [s] = await structuresFor(d, [{ atoms: [...d.atoms.keys()] }]);
    if (!s) return { error: 'The structure couldn\'t be read.' };
    // a name typed is kept as its name, a CAS RN as its CAS RN; SMILES isn't either
    const cas = readCas(text);
    if (cas?.kind === 'cas') return { ...s, cas: cas.cas, name: casMemory.byCas(cas.cas)?.name ?? '' };
    const smiles = chem.ready ? await molfileOrSmiles(text.trim(), (x) => chem.smilesToMol(x)).catch(() => null) : null;
    return smiles ? s : { ...s, name: text.trim() };
  },
  fromMolfiles: async (mbs) => {
    const w = await weighMolfiles(mbs);
    return mbs.map((mb, i) => {
      const r = w[i];
      if (!r) return null;
      const d = new Doc();
      try { d.bulk(() => { addMolfile(d, mb, 0, 0); }); } catch { return null; }
      return { molfile: mb, smiles: r.smiles, formula: r.formula, mw: r.mw, drawing: d.contents() };
    });
  },
  insert: (c) => insertCompound(c),
  insertsInto: () => compoundInsertsInto(),
  picture: (c) => compoundPicture(c),
  contains: async (q, smiles) => (await chem.substructure(q, smiles)).results,
  openFile: async (path, c) => {
    if (!isTauri()) { flash('Files can be opened from here in the desktop app (File > Open finds it in a browser).'); return; }
    await openRecent(path);
    // the compound picked, if it is in the file
    const t = ws.mainOf(ws.active);
    if (t.ref.kind !== 'path' || t.ref.path !== path) return;
    const found = foundInTab(t);
    const w = await weighMolfiles(found.map((f) => f.molblock));
    const i = w.findIndex((r) => r?.smiles === c.smiles);
    if (i >= 0) await openAt(path, found[i].spot, found[i].atoms);
  },
  findInFiles: desktopFolders ? (c) => void openFindWindow({ smiles: c.smiles, label: c.label }) : undefined,
  pickSdf: async () => { const f = await openBytesDialog('SD file', [SDF], ['sd']); return f ? { name: f.name, text: new TextDecoder().decode(f.bytes) } : null; },
  saveSdf: async (name, text) => {
    const target = await saveFileDialog(name, SDF).catch(() => null);
    if (!target) return;
    await writeFile(target.ref, target.name, text, SDF);
    flash(`Saved ${target.name}.`);
  },
  fileName: () => { const t = ws.mainOf(ws.active); return t.ref.kind === 'path' ? t.ref.path : ''; },
  location: () => libraryLocation(),
} satisfies CompoundLibraryHost;
const compoundWindow = madeLater(async (): Promise<CompoundLibraryWindow> => new (await import('./ui/compound-library')).CompoundLibraryWindow(library, compoundHost));

/** Chemistry > Compound Library > Add Selected to Compound Library. */
async function addToCompoundLibrary(): Promise<void> {
  finishTyping();
  const lib = await useLibrary();
  const got = await selectedForLibrary();
  if (typeof got === 'string') { flash(got, 6000); return; }
  const t = ws.mainOf(ws.active);
  const { addStructures } = await import('./ui/compound-library');
  let res: ReturnType<typeof addStructures> | null = null;
  lib.change((l) => (res = addStructures(l, got, t.ref.kind === 'path' ? t.ref.path : '')).lib);
  const r = res as ReturnType<typeof addStructures> | null;
  if (!r) return;
  const names = [...r.added, ...r.known].map((c) => c.label || c.name || c.formula).filter(Boolean).slice(0, 4).join(', ');
  flash(r.added.length ? `Added ${r.added.length} compound${r.added.length === 1 ? '' : 's'} to your library${names ? ` (${names})` : ''}.` : `Already in your library${names ? ` (${names})` : ''}.`, 5000,
    { label: 'Show', run: () => void openCompoundLibrary([...r.added, ...r.known].map((c) => c.id)) });
}

async function openCompoundLibrary(select: string[] = []): Promise<void> {
  finishTyping();
  await useLibrary();
  await (await compoundWindow.get()).open(select);
}

// ---------------------------------------------------------------- Chemistry > Look Up > Knowledge Base

/** Where the tables the user imported (from their own copies of published tables) are kept: this computer only. */
const KB_IMPORTED_KEY = 'kb/imported-tables.json';

// (loaded when first opened: its tables are big, and most sessions never open it)
const knowledgeBaseHost = {
  flash,
  canonical: async (smiles) => (chem.ready ? chem.canonical(smiles).catch(() => null) : null),
  readImported: () => getText(keepStore(), KB_IMPORTED_KEY).catch(() => null),
  writeImported: (json) => putText(keepStore(), KB_IMPORTED_KEY, json),
  pickTable: async () => {
    const f = await openBytesDialog('Tables (CSV or tab-separated)', [CSV], ['tsv', 'txt']).catch(async (e) => { await showError(String(e)); return null; });
    return f ? { name: f.name, text: new TextDecoder().decode(f.bytes) } : null;
  },
  copyText: (text) => copyText(text, 'Copied the table: paste it into a sheet, a Word table or Excel.'),
  openUrl: (url) => openWebPage(url),
  cidForCas: (cas: string) => pubchemCidForCas(cas),
  lookUpSafety: (q: string) => {
    const t = q.trim();
    return pubchemSafetyRecord(isCasNumber(t) ? { cas: t } : looksLikeSmiles(t) ? { smiles: t } : { name: t });
  },
  contains: async (q: string, smiles: string[]) => (chem.ready ? (await chem.substructureIn('knowledge-base', smiles, q)).results : null),
  selected: async () => {
    const got = await selectedForLibrary();
    return typeof got === 'string' ? got : { smiles: got[0].smiles };
  },
  drawing: {
    start: (c, area, done) => editCellStructure(c, 'Search Structure', done, sheetStyle(), undefined, area),
    finish: (keep) => { if (!kbArea) return; if (keep) void doneCellStructure(); else finishCellStructure(false); },
    tool: (t) => { if (typeof t === 'number') editor.pickElement(t); else pickTool(t); overlay.focus(); },
    current: () => (editor.toolName === 'element' ? editor.element : editor.toolName),
    selection: () => selectionContents(),
    smiles: async (c, on) => {
      if (!chem.ready) return 'The chemistry engine is still loading; try again in a moment.';
      const d = structureDoc(c, sheetStyle());
      const points = [...d.atoms.values()].filter((a) => a.attach).length;
      if (on && points > 1) return `Draw the group out from one attachment point (this drawing has ${points}).`;
      const got = await structuresFor(d, partsOf(d));
      if (!got.length) return 'The structure couldn\'t be read (check its valences).';
      const smiles = got.map((g) => g.smiles).join('.');
      if (!on || !points) return { smiles };
      // a group: its attachment point joined to the structure it sits on (a benzene ring)
      const joined = joinAttachment(smiles, on);
      const mb = joined ? await chem.smilesToMol(joined).catch(() => null) : null;
      const canon = mb ? await chem.molToSmiles(mb).catch(() => null) : null;
      return canon ? { smiles: canon } : 'The group couldn\'t be read (check its valences).';
    },
    group: () => {
      const d = structureDoc({ atoms: [], bonds: [], captions: [], arrows: [], shapes: [] }, sheetStyle());
      d.bulk(() => {
        const point = d.addAtom(0, 0, 0, { attach: 'Wavy' });
        const first = d.addAtom(d.style.bondLength, 0);
        d.addBond(point.id, first.id);
      });
      return d.contents();
    },
  },
} satisfies KnowledgeBaseHost;
const knowledgeBase = madeLater(async (): Promise<KnowledgeBaseWindow> => new (await import('./ui/knowledge-base')).KnowledgeBaseWindow(knowledgeBaseHost));

/** Chemistry > Look Up > Knowledge Base: reference tables searched by name, CAS number, SMILES or a shift. */
function openKnowledgeBase(): void {
  finishTyping();
  void (async () => {
    await (await knowledgeBase.get()).open();
  })().catch((e) => flash(`The Knowledge Base could not open: ${String(e)}`));
}

// ---------------------------------------------------------------- Chemistry > Metals > Ligand Library

// (loaded when first opened, as the other windows below are)
const ligandLibrary = madeLater(async (): Promise<LigandLibraryWindow> => new (await import('./ui/ligand-library')).LigandLibraryWindow({
  useTemplate: (id) => pickTool(`tpl-${id}`),
  openUrl: (url) => openWebPage(url),
  copyText: (text, done) => void copyText(text, done),
}));

/** Chemistry > Metals > Ligand Library, and the first button on the Ligands palette. */
function openLigandLibrary(): void {
  finishTyping();
  void ligandLibrary.get().then((w) => w.open(), (e) => flash(`The Ligand Library could not open: ${String(e)}`));
}

// ---------------------------------------------------------------- File > Find Structure in Files (desktop app)

const INDEX_KEY = 'library/file-index.json';

/** How files found in a folder are read: with the app's own readers, ChemDraw objects in Word files read as structures. */
const folderReaders: FileReaders = {
  document: async (bytes, name) => (await (await import('./io/doc-files')).readDocumentFile(bytes, name, { ...docRead, convertChemDraw: true, keepBibliography: undefined })).doc,
  sheet: async (bytes, name) => (await (await import('./io/sheet-files')).readSheetFile(bytes, name, sheetFiles)).book,
  slides: async (bytes) => (await import('./io/pptx-read')).readPptx(bytes).slides.map((s) => s.contents),
};

const findHost = {
  flash,
  pickFolder: (start) => pickFolder(start),
  listFolder: (path, extensions, sub) => invoke<{ files: ListedFile[]; complete: boolean }>('list_folder', { path, extensions, sub }),
  selected: async () => {
    const got = await selectedForLibrary();
    if (typeof got === 'string') return got;
    return { smiles: got[0].smiles, ...(got[0].label ? { label: got[0].label } : {}) };
  },
  toSmiles: async (text) => {
    if (!chem.ready) return { error: 'The chemistry engine is still loading; try again in a moment.' };
    const r = await textToStructure(text, ACS_1996);
    if ('error' in r) return r;
    const d = structureDoc(r.contents, ACS_1996);
    const [w] = await weighMolfiles([toMolfile(d, d.atoms.keys()).molblock]);
    return w?.smiles ?? { error: 'The structure couldn\'t be read.' };
  },
  deps: {
    read: (path) => readPath(path),
    found: (bytes, path) => foundInFile(bytes, path, folderReaders),
    smiles: async (mbs) => (await weighMolfiles(mbs)).map((r) => r?.smiles ?? null),
    contains: async (q, smiles) => (await chem.substructure(q, smiles)).results,
  },
  index: {
    read: async () => parseIndex(await getText(keepStore(), INDEX_KEY)),
    write: (ix) => putText(keepStore(), INDEX_KEY, indexText(ix)),
  },
  open: (h) => openAt(h.path, h.structure.spot, h.structure.atoms),
  lastFolder: {
    get: () => { try { return localStorage.getItem('ci-find-folder') ?? ''; } catch { return ''; } },
    set: (p) => { try { localStorage.setItem('ci-find-folder', p); } catch { /* not kept */ } },
  },
} satisfies FindInFilesHost;

/** The Find Structure in Files window, loaded the first time it opens. */
const findWindow = madeLater(async (): Promise<FindInFilesWindow> => new (await import('./ui/find-in-files')).FindInFilesWindow(findHost));
async function openFindWindow(start?: Parameters<FindInFilesWindow['open']>[0]): Promise<void> {
  await (await findWindow.get()).open(start);
}

function findStructureInFiles(): void {
  finishTyping();
  if (!desktopFolders) { flash('Find Structure in Files looks through a folder, which the desktop app (Windows, Mac or Linux) can do and a browser can\'t.', 7000); return; }
  if (!chem.ready) { flash('The chemistry engine is still loading; try again in a moment.'); return; }
  void openFindWindow().catch((e) => flash(String(e)));
}

// ---------------------------------------------------------------- references (every open file's)

/** Your library, then the open files that keep references (documents, presentations, designs), the one showing first. */
function refHolders(): RefHolder[] {
  return [libraryRefs, ...fileRefHolders()];
}

/** The open files that keep references, the one showing first. */
function fileRefHolders(): RefHolder[] {
  const here = ws.mainOf(ws.active);
  const out: RefHolder[] = [];
  for (const t of [here, ...ws.fileTabs.filter((x) => x !== here)]) {
    const changed = () => ws.noteChange(t);
    if (t.document) out.push(docHolder(String(t.id), t.name, t.document, changed));
    else if (t.deck) out.push(deckHolder(String(t.id), t.name, t.deck, t.mode === 'design', changed));
  }
  return out;
}

/** The References window: every open file's references, grouped by file (Insert > References…, References > Manage References). */
const referencesWindow = new ReferencesDialog({
  holders: refHolders,
  current: () => { const t = ws.mainOf(ws.active); return t.document || t.deck ? String(t.id) : null; },
  currentKind: () => (ws.active.mode === 'sheet' ? 'A spreadsheet' : 'A canvas'),
  flash,
  pickFile: () => pickReferenceFile(),
  pubmed: (ids) => fetchPubmed(ids, webText),
  preferredChanged: () => storeSettings(),
});

function openReferences(): Promise<void> {
  finishTyping();
  void useLibrary();
  return referencesWindow.open();
}

/** Insert > Presentation > References on Slide: which of the presentation's references the slides picked show at their foot, and how. */
async function slideReferences(): Promise<void> {
  const d = deckNow();
  if (!d?.current) return;
  finishTyping();
  const ix = ws.active.mode === 'design' ? [d.index] : pickedSlides();
  const cur = d.current;
  if (cur.refList) { void referencesSlideOptions(); return; }
  const got = await editSlideRefs({
    refs: () => d.references,
    format: () => deckFormat(d.settings.refs),
    chosen: cur.refs ?? [],
    look: refLook(d.settings.refs, cur.refLook),
    footerColor: d.master.footerColor,
    picked: ix.length,
    manage: () => referencesWindow.open(),
    labels: (ids, l) => {
      const slides = d.slides.map((s, k) => (ix.includes(k) ? { ...s, refs: ids, refLook: l, refList: undefined } : s));
      return slideRefBlock(d.settings.refs, slides, d.index)?.entries.map((e) => e.label) ?? [];
    },
  });
  if (!got || deckNow() !== d) return;
  const look = lookChanges(got.look);
  if (got.scope === 'all') d.setSlideRefs(ix, got.ids, null, look);
  else {
    // a look of its own only where it differs from the presentation's
    const deckLook = refLook(d.settings.refs);
    const own = Object.fromEntries(Object.entries(got.look).filter(([k, v]) => (deckLook as unknown as Record<string, unknown>)[k] !== v));
    if (!got.look.color && deckLook.color) Object.assign(own, { color: undefined });
    d.setSlideRefs(ix, got.ids, Object.keys(own).length ? own : null);
  }
}

/** Each open presentation's id for Zotero. */
const zoteroDeckIds = new WeakMap<Deck, string>();
let zoteroDeckBusy = false;

/**
 * Insert > Zotero (presentations): Zotero's commands on the presentation (zotero-deck.ts). Add/Edit
 * Citation picks the references the slide shows in Zotero's window; Add/Edit Bibliography makes
 * (or edits) the References slide in Zotero's style. Desktop app only: Zotero turns away web pages.
 */
async function zoteroSlides(command: ZoteroCommand): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  if (!isTauri() || iPadApp) { flash('Citing with Zotero works in the desktop app with Zotero running on the same computer (a browser can\'t reach it). Here, use References on Slide.', 8000); return; }
  if (zoteroDeckBusy) { flash('Zotero is still working on this presentation (finish in Zotero\'s window first).'); return; }
  zoteroDeckBusy = true;
  let docId = zoteroDeckIds.get(d);
  if (!docId) { docId = `chem-illustrator-${Math.random().toString(36).slice(2, 12)}`; zoteroDeckIds.set(d, docId); }
  let join = false;
  const host: DeckZoteroHost = {
    docId,
    state: () => ({ refs: d.settings.refs, slides: d.slides.map((s) => ({ id: s.id, hidden: s.hidden, refs: s.refs, refLook: s.refLook, refList: s.refList, zotero: s.zotero })), current: d.index }),
    change: (refs, slides) => { d.setRefState(refs, slides, 'Zotero', join); join = true; },
    addRefsSlide: () => { const s = d.insertRefsSlide(d.slides.length, { which: 'shown' }); join = false; return s.id; },
    removeSlide: (id) => { const i = d.slides.findIndex((s) => s.id === id); if (i >= 0) d.remove([i]); join = false; },
    goTo: (id) => { const i = d.slides.findIndex((s) => s.id === id); if (i >= 0 && deckNow() === d) d.go(i); },
    choose: (text, labels) => chooseButtons('Zotero', text, labels, 0),
    activate: () => { void invoke('zotero_activate').catch(() => {}); },
  };
  try {
    const got = await runZoteroOn(command, new DeckStore(host, command), async (endpoint, body) => {
      const r = await invoke<{ status: number; body: string }>('zotero_post', { endpoint, body });
      return { status: r.status, text: r.body };
    });
    if (got === 'offline') flash('Zotero isn\'t running. Start the Zotero app (version 7 or later) on this computer, then try again.', 7000);
    else if (got === 'busy') flash('Zotero is busy with a citation in another file. Finish there, then try again.', 6000);
  } catch (e) {
    flash(`Zotero: ${e instanceof Error ? e.message : String(e)}`, 8000);
  } finally {
    zoteroDeckBusy = false;
  }
}

/** Insert > Zotero ▾ on a presentation: Zotero's commands in a menu under the button. */
function zoteroSlidesMenu(): void {
  const b = document.querySelector<HTMLElement>('[data-cmd="zotero-menu"]');
  const r = b?.getBoundingClientRect();
  showContextMenu(r ? r.left : 200, r ? r.bottom : 120, [{ cmd: 'zotero-cite' }, { cmd: 'zotero-bib' }, { cmd: 'zotero-refresh' }, null, { cmd: 'zotero-prefs' }, { cmd: 'zotero-unlink' }], { run: (cmd) => void command(cmd), key: commandKey });
}

/** Insert > Presentation > References Slide: a slide after the last one listing the references the slides show (or all of them), kept up to date. */
async function referencesSlide(): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  const existing = d.slides.findIndex((s) => s.refList);
  if (existing >= 0) { d.go(existing); void referencesSlideOptions(); return; }
  const got = await ask('References Slide', [{ name: 'which', label: 'List', value: 'shown', options: [{ value: 'shown', label: 'The references shown on slides, in the order they appear' }, { value: 'all', label: 'Every reference in the presentation' }] }], {
    ok: 'Insert', note: 'Adds a References slide at the end, listing all references in the presentation\'s citation style and updating as you add them. Use References on Slide > Numbers to match the numbering on slides.',
  });
  if (!got || deckNow() !== d) return;
  d.insertRefsSlide(d.slides.length, { which: got.which === 'all' ? 'all' : 'shown' });
  if (!d.references.length) flash('The References slide lists the presentation\'s references: add them with Insert > References…, then check them on slides with References on Slide.', 8000);
}

/** The References slide being edited: what it lists, or a normal slide again. */
async function referencesSlideOptions(): Promise<void> {
  const d = deckNow();
  const s = d?.current;
  if (!d || !s?.refList) return;
  const got = await ask('References Slide', [{ name: 'which', label: 'List', value: s.refList.which, options: [{ value: 'shown', label: 'The references shown on slides, in the order they appear' }, { value: 'all', label: 'Every reference in the presentation' }, { value: 'none', label: 'Nothing (a normal slide again)' }] }], {
    ok: 'Apply', note: 'This slide lists the presentation\'s references and keeps the list up to date. Its title is ordinary text.',
  });
  if (!got || deckNow() !== d) return;
  d.setRefList(got.which === 'none' ? undefined : { which: got.which === 'all' ? 'all' : 'shown' });
}

/** Insert > Reference…: references from any open file put on the canvas or slide as formatted text. */
async function insertReference(): Promise<void> {
  if (docActive() || sheetActive()) { void openReferences(); return; }
  finishTyping();
  const groups = (): RefGroup[] => refHolders().map((h) => ({ name: h.name, refs: h.refs(), style: h.citeStyle() }));
  const got = await chooseRefsToInsert(groups(), async () => {
    const asked = await ask('Reference by DOI', [{ name: 'doi', label: 'DOI', value: '' }], { ok: 'Look Up', note: 'Paste a DOI (10.1021/om100106e) or a doi.org link. The details are filled in from Crossref, which needs the internet.' });
    if (!asked?.doi.trim()) return null;
    let found: Reference;
    try { found = await fetchDoi(asked.doi); } catch (e) { flash(e instanceof Error ? e.message : String(e), 8000); return null; }
    return editReference(found, 'Check the Reference', citeFormatOf(preferredCiteStyle().style, preferredCiteStyle().options), (x) => fetchDoi(x));
  }, async () => { await referencesWindow.open(); return groups(); });
  if (!got) return;
  const f = citeFormatOf(got.style, got.style === preferredCiteStyle().style ? preferredCiteStyle().options : undefined);
  const runs = referenceRuns(got.refs, got.form, f, got.numbered);
  const size = doc.style.captionSize;
  const c = pasteCentre();
  const area = slideContentArea();
  const w = area ? (area.x2 - area.x1) * 0.8 : doc.style.bondLength * 24;
  let id = -1;
  doc.edit(got.refs.length === 1 ? 'Insert reference' : 'Insert references', () => {
    id = doc.addCaption({ x: c.x - w / 2, y: c.y, runs: runs.map((r) => ({ ...r, ...(r.text === '\n' ? {} : { size }) })), justify: 'left', wrap: w }).id;
  });
  editor.changed();
  if (id >= 0) editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set([id]), arrows: new Set(), shapes: new Set() };
  flash('Inserted as text: move it, or double-click it to edit.');
}

async function insertPicture(): Promise<void> {
  const p = await pickPicture();
  if (p) placePicture(p.bytes, p.mime, null);
}

/**
 * Put a picture on the drawing or slide, centred at `at` (the middle of the slide or window
 * when null), at its own size (96 pixels to the inch) or smaller to fit.
 */
function placePicture(bytes: Uint8Array, mime: string, at: { x: number; y: number } | null): void {
  // WebP goes in as PNG, so it can be saved in Word and PowerPoint files
  if (mime === 'image/webp') {
    void webpToPng(bytes).then((png) => (png ? placePicture(png, 'image/png', at) : flash('Could not read this WebP picture.')));
    return;
  }
  finishTyping();
  const px = imageSize(bytes, mime) ?? { w: 400, h: 300 };
  const deck = deckNow();
  const room = deck ? { w: deck.size.w * 0.8, h: deck.size.h * 0.8 } : { w: (renderer.width * 0.8) / renderer.view.scale, h: (renderer.height * 0.8) / renderer.view.scale };
  const k = Math.min(0.75, room.w / px.w, room.h / px.h);
  const w = px.w * k, h = px.h * k;
  const c = at ?? pasteCentre();
  let made: Shape | null = null;
  doc.edit('Insert picture', () => {
    made = doc.addShape({ kind: 'picture', x1: c.x - w / 2, y1: c.y - h / 2, x2: c.x + w / 2, y2: c.y + h / 2, src: dataUrl(bytes, mime), px });
  });
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set([made!.id]) };
  editor.changed();
  if (mime === 'image/tiff' || mime === 'image/x-wmf' || !showableSrc(made!.src ?? '')) flash('This kind of picture shows as a gray box here for now; it is kept, and saved with the file.', 8000);
}

/**
 * An animation from Chemistry > Animate > Animate Reaction on the slide: a video (its first frame shown while
 * editing) or an animated GIF, in the middle of the slide, at most 80% of it.
 */
function placeClip(v: { mp4?: Uint8Array; still: Uint8Array; gif?: Uint8Array; w: number; h: number }): void {
  finishTyping();
  const deck = deckNow();
  const room = deck ? { w: deck.size.w * 0.8, h: deck.size.h * 0.8 } : { w: (renderer.width * 0.8) / renderer.view.scale, h: (renderer.height * 0.8) / renderer.view.scale };
  const k = Math.min(0.75, room.w / v.w, room.h / v.h);
  const w = v.w * k, h = v.h * k;
  const c = deck ? { x: deck.size.w / 2, y: deck.size.h / 2 } : pasteCentre();
  let made: Shape | null = null;
  doc.edit('Insert Animation on Slide', () => {
    made = doc.addShape({
      kind: 'picture', x1: c.x - w / 2, y1: c.y - h / 2, x2: c.x + w / 2, y2: c.y + h / 2, px: { w: v.w, h: v.h },
      ...(v.mp4 ? { src: dataUrl(v.still, 'image/png'), video: { src: dataUrl(v.mp4, 'video/mp4') } } : { src: dataUrl(v.gif!, 'image/gif') }),
    });
  });
  editor.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set([made!.id]) };
  editor.changed();
}

// ------------------------------------------------------------------ structures from pictures

const importHost: ImportHost = {
  style: () => doc.style,
  chem,
  ai: () => aiPrefs,
  flash,
  // side by side, two bond lengths apart, in rows no wider than the window, in the free space
  // nearest the middle of the window (clear of what is drawn already), selected
  place(chosen) {
    finishTyping();
    const L = doc.style.bondLength, gap = L * 2;
    const sizes = chosen.map(({ checked }) => {
      const at = [...checked.doc.atoms.values()];
      if (!at.length) return { w: 0, h: 0 };
      const xs = at.map((a) => a.x), ys = at.map((a) => a.y);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    });
    const area = slideContentArea();
    const tl = renderer.toDoc(0, 0), br = renderer.toDoc(renderer.width, renderer.height);
    const room = Math.max(...sizes.map((z) => z.w), 0.9 * (area ? area.x2 - area.x1 : br.x - tl.x));
    const rows: { items: number[]; w: number; h: number }[] = [];
    sizes.forEach((z, i) => {
      const row = rows.at(-1);
      if (row && row.w + gap + z.w <= room) { row.items.push(i); row.w += gap + z.w; row.h = Math.max(row.h, z.h); }
      else rows.push({ items: [i], w: z.w, h: z.h });
    });
    const blockW = Math.max(...rows.map((r) => r.w)), blockH = rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1);
    const c = freeSpace(doc, blockW, blockH, pasteCentre(), gap);
    const ids: number[] = [];
    doc.edit(chosen.length === 1 ? 'Import Structure' : 'Import Structures', () => {
      let y = c.y - blockH / 2;
      for (const row of rows) {
        let x = c.x - row.w / 2;
        for (const i of row.items) {
          ids.push(...placeRead(doc, chosen[i].result, chosen[i].checked.molblock, x + sizes[i].w / 2, y + row.h / 2));
          x += sizes[i].w + gap;
        }
        y += row.h + gap;
      }
    });
    selectNewAtoms(ids);
    flash(chosen.length === 1 ? 'Placed the structure. Check it against the picture.' : `Placed ${chosen.length} structures. Check them against the pictures.`, 5000);
  },
};

/** File > Import > Import Structures from Picture: the selected picture, or one chosen from a file. */
async function importPicture(): Promise<void> {
  finishTyping();
  const sel = [...editor.sel.shapes].map((id) => doc.shapes.get(id)).filter((s): s is Shape => s?.kind === 'picture' && !!s.src);
  const pics: { name: string; bytes: Uint8Array; mime: string }[] = sel.length
    ? sel.map((s, i) => ({ name: sel.length > 1 ? `Picture ${i + 1}` : 'Selected picture', ...fromDataUrl(s.src!) }))
    : await pickPicture().then((p) => (p ? [p] : []));
  await readPictures(pics);
}

/** File > Import > Paste Picture as Structure: a picture on the clipboard (a screenshot, or copied from a paper). */
async function importPastedPicture(): Promise<void> {
  finishTyping();
  let got: { bytes: Uint8Array; mime: string } | null = null;
  try {
    const p = nativeClipboard ? await readNativeClipboard() : await readWebClipboard();
    if (p.kind === 'picture') got = { bytes: p.bytes, mime: p.mime };
  } catch { /* nothing readable */ }
  if (!got) { flash('Copy a picture of a structure first (a screenshot works), then use this again.'); return; }
  await readPictures([{ name: 'Pasted picture', ...got }]);
}

/** File > Import > Import Structures from PDF: every drawing on the pages, read and offered on the review screen. */
async function importPdf(): Promise<void> {
  finishTyping();
  if (!await canReadStructures(importHost)) return;
  const f = await openBytesDialog('PDF files', [], ['pdf']).catch(async (e) => { await showError(String(e)); return null; });
  if (!f) return;
  // the pages are read with only a progress line showing, so another tab may show by the time Place
  // is pressed: the structures go to the tab the import started in, kept even if it is an empty new drawing
  const from = ws.active;
  const release = ws.hold(from);
  try {
    await readPdf(f, from);
  } finally {
    release();
  }
}

async function readPdf(f: { name: string; bytes: Uint8Array }, from: Tab): Promise<void> {
  let found;
  try {
    found = await pdfDrawings(f.bytes, async (pages) => {
      const r = await ask('Import Structures from PDF', [
        { name: 'from', label: 'From page', type: 'number', value: '1' },
        { name: 'to', label: 'To page', type: 'number', value: String(Math.min(pages, MOST_PAGES)) },
      ], { ok: 'Find Structures', note: `${f.name} has ${pages} pages. Which shall be searched for structures? (${MOST_PAGES} or fewer at a time.) They are found on this computer; you then choose which to read.` });
      if (!r) return null;
      const a = Math.max(1, Math.min(pages, Math.round(Number(r.from) || 1)));
      return [a, Math.max(a, Math.min(pages, a + MOST_PAGES - 1, Math.round(Number(r.to) || a)))];
    }, (msg) => flash(msg, 20000));
  } catch (e) {
    await showError(`Could not read ${f.name}: ${String(e)}`);
    return;
  }
  if (!found) return;
  const { found: drawings, pages } = found;
  if (!drawings.length) { flash('No drawings were found in this PDF. If its pages are scans, try Import Structures from Picture on a screenshot.', 8000); return; }
  flash(`Found ${drawings.length} drawings.`);
  const place: ImportHost['place'] = (chosen) => {
    const gone = !ws.tabs.includes(from);
    if (gone) ws.newDrawing();
    else ws.activate(from);
    importHost.place(chosen);
    if (gone) flash(`${from.name} was closed while the pages were read, so the structures were placed in a new canvas. Check them against the pictures.`, 8000);
  };
  await importPdfDrawings({ ...importHost, place }, drawings, pages, {
    file: f.name,
    title: 'Import Structures from PDF',
    note: `${f.name}: each drawing found, beside the structure read from it. Ones the reader is sure of are checked; check each against its picture, fix a SMILES or check more, then place them.`,
    tickDoubtful: false,
    photo: false,
    hideJunk: true,
  });
}

async function readPictures(pics: { name: string; bytes: Uint8Array; mime: string }[]): Promise<void> {
  await importPictureFiles(importHost, pics);
}

/** Insert > Picture Tools > Crop Picture: the selected picture's handles cut its edges off until Esc or a click elsewhere. */
function cropPicture(): void {
  const pics = [...editor.sel.shapes].filter((id) => doc.shapes.get(id)?.kind === 'picture');
  if (pics.length !== 1) { flash('Select one picture to crop.'); return; }
  editor.cropping = editor.cropping === pics[0] ? null : pics[0];
  editor.requestOverlay();
  stylePanel.refresh();
  if (editor.cropping !== null) flash('Drag the black handles to cut the edges off. Press Esc or click elsewhere when you are done.', 6000);
}

/**
 * Picture Format…: the selected pictures' corrections, colours, see-through, Remove Background
 * and shape; the first one's crop too (cropping to proportions keeps its width).
 */
async function formatPicture(): Promise<void> {
  const pics = [...editor.sel.shapes].map((id) => doc.shapes.get(id)).filter((x): x is Shape => x?.kind === 'picture' && !!x.src && !x.chart && !x.math && !x.video);
  if (!pics.length) { flash('Select a picture first.'); return; }
  const p = pics[0];
  const got = await pictureFormat({ src: p.src!, fx: p.fx, crop: p.crop, w: Math.abs(p.x2 - p.x1), h: Math.abs(p.y2 - p.y1), count: pics.length });
  if (!got) return;
  doc.edit('Picture format', () => {
    for (const x of pics) doc.updateShape(x.id, { fx: got.fx && structuredClone(got.fx) });
    if (got.crop) {
      const c = got.crop;
      const x1 = Math.min(p.x1, p.x2), y1 = Math.min(p.y1, p.y2), w = Math.abs(p.x2 - p.x1);
      doc.updateShape(p.id, { crop: c.l || c.t || c.r || c.b ? c : undefined, ...(got.aspect ? { x1, y1, x2: x1 + w, y2: y1 + w / got.aspect } : {}) });
    }
  });
  editor.requestScene();
  stylePanel.refresh();
}

/** Picture > Remove white: near-white pixels become see-through (the picture becomes a PNG). */
async function removeWhite(ids: number[]): Promise<void> {
  const v = await ask('Remove White Background', [
    { name: 'which', label: 'Remove', value: 'edges', options: [
      { value: 'edges', label: 'White joined to the edges (keeps white inside the picture)' },
      { value: 'all', label: 'All white, everywhere' },
    ] },
    { name: 'tol', label: 'How near white counts', value: '24', type: 'number', unit: 'of 255' },
  ], { ok: 'Remove', note: 'Raise the number if a gray haze is left around the picture; lower it if pale parts of the picture disappear. Undo puts it back.' });
  if (!v) return;
  const tol = Math.max(0, Math.min(200, Number(v.tol) || 0));
  const done: { id: number; src: string }[] = [];
  for (const id of ids) {
    const s = doc.shapes.get(id);
    if (!s?.src) continue;
    try {
      const img = await loadImage(s.src);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height);
      whiteToClear(data.data, c.width, c.height, tol, v.which !== 'all');
      g.putImageData(data, 0, 0);
      done.push({ id, src: dataUrl(new Uint8Array(await (await canvasPng(c)).arrayBuffer()), 'image/png') });
    } catch (e) {
      await showError(`Could not change the picture: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  }
  if (!done.length) return;
  doc.edit('Remove white', () => { for (const d of done) doc.updateShape(d.id, { src: d.src }); });
  editor.requestScene();
}

/** A PNG of an SVG picture, for programs that can't show SVG (w × h pixels, kept to a sensible size). */
async function svgToPng(svg: string, w: number, h: number): Promise<Uint8Array> {
  const k = Math.min(1, 8000 / w, 8000 / h, Math.sqrt(12e6 / (w * h)));
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Uint8Array(await (await canvasPng(c)).arrayBuffer());
}

// a picture that has just loaded is drawn, on the slide and in the slide list
onImageReady(() => {
  renderer.repaintAll();
  editor.requestScene();
  slideList.refreshAll();
});

// ---------------------------------------------------------------- slide master and the slide show

// ---------------------------------------------------------------- File > Drawing Style

const STYLE_KINDS: Record<StyleMode, { plural: string; where: string }> = {
  drawing: { plural: 'canvases', where: 'this canvas' },
  slides: { plural: 'presentations', where: 'every slide of this presentation' },
  design: { plural: 'designs', where: 'this design' },
  document: { plural: 'documents', where: 'this document' },
  sheet: { plural: 'spreadsheets', where: 'this spreadsheet\'s structure cells' },
};

/** Pick or change how structures are drawn in the tab showing (a journal's style, or your own). */
async function drawingStyleDialog(): Promise<void> {
  const tab = ws.active, mode = tab.mode as StyleMode;
  finishTyping();
  const deck = tab.deck, book = tab.book, file = tab.document;
  const current = deck ? deck.master.drawing : book ? book.drawingStyle : file ? file.t.drawingStyle : doc.style;
  const hasStructures = deck ? deck.slides.some((_, i) => deck.docOf(i).atoms.size > 0)
    : file ? Object.values(file.t.objects).some((o) => o.kind === 'drawing' && o.contents.atoms.length > 0)
    : book ? book.sheets.some((s) => [...s.cells.values()].some((c) => !!c.structure)) : doc.atoms.size > 0 || doc.captions.size > 0;
  const got = await editDrawingStyle({
    current, own: ownStyles, kindPlural: STYLE_KINDS[mode].plural, where: STYLE_KINDS[mode].where,
    isDefault: modeStyleFor(mode) === current.name, hasStructures,
    preview: (st, focus) => stylePreview(st, undefined, undefined, focus),
  });
  if (!got || ws.active !== tab) return;
  ownStyles = got.own;
  // Set as Default: new files start in it too
  if (settingsWindow.mode === 'default') got.forNew = true;
  if (got.forNew) modeStyles[mode] = got.style.name;
  else if (modeStyleFor(mode) === current.name || modeStyleFor(mode) === got.style.name) {
    // no longer the default for new tabs: back to the standard one (or, where that is this style, plain ACS)
    delete modeStyles[mode];
    if (modeStyleFor(mode) === got.style.name) modeStyles[mode] = 'ACS Document 1996';
  }
  if (modeStyles[mode] && !styleNamed(modeStyles[mode]!, ownStyles)) {
    // a default that isn't a built-in style is kept as one of your own, so new tabs can find it
    ownStyles = [...ownStyles, { ...got.style }];
  }
  storeSettings();
  const next = got.style;
  if (deck) deck.setDrawingStyle(next, got.how);
  else if (book) {
    book.setDrawingStyle(next, (c, old) => restyleContents(c, old, next, got.how));
    sheetMode?.styleChanged();
  } else if (file) {
    const t = file.t, old = t.drawingStyle;
    const objects = { ...t.objects };
    for (const [k, o] of Object.entries(objects)) if (o.kind === 'drawing') objects[Number(k)] = { ...o, contents: restyleContents(o.contents, old, next, got.how) };
    const changed: DocText = { ...t, objects, drawingStyle: { ...next } };
    file.ed.update(changed, 'Drawing style');
    docMode?.fontsChanged();
  } else {
    doc.edit(`Drawing style: ${next.name}`, () => applyStyle(doc, next, got.how));
    editor.changed();
  }
  flash(`Structures are now drawn in ${next.name}${got.forNew ? `, and new ${STYLE_KINDS[mode].plural} will start in it` : ''}.`, 4000);
}

/**
 * A ChemDraw style sheet (.cds) was opened: its contents show in their tab, and its settings can
 * be kept as one of your own drawing styles (and made the style new drawings start in).
 */
async function offerStyleSheet(tab: Tab, style: DocStyle): Promise<void> {
  const known = [...STYLE_PRESETS.map((p) => p.style), ...ownStyles].find((s) => sameLook(s, style));
  if (known) {
    flash(`${tab.name} has the same settings as ${known.name}, which is already in Drawing Style.`, 5000);
    return;
  }
  const base = tab.name.replace(/\.cds$/i, '');
  const got = await ask('Use this style sheet?', [
    { name: 'name', label: 'Name', value: base },
    { name: 'forNew', label: 'Start new canvases in it', value: 'false', type: 'checkbox' },
  ], {
    ok: 'Add to My Styles',
    note: `${tab.name} is a ChemDraw style sheet: bond length ${style.bondLength} pt, line width ${style.lineWidth} pt, bold width ${style.boldWidth} pt, `
      + `${style.labelFont} ${style.labelSize} pt labels. Keep these settings as one of your own drawing styles, to pick in Drawing Style in any mode? `
      + 'Its contents are open in a tab either way.',
  });
  if (!got) return;
  const st: DocStyle = { ...style, name: got.name.trim() || base };
  const had = ownStyles.findIndex((s) => s.name === st.name);
  ownStyles = had >= 0 ? ownStyles.map((s, i) => (i === had ? st : s)) : [...ownStyles, st];
  if (got.forNew === 'true') modeStyles.drawing = st.name;
  storeSettings();
  flash(`${st.name} is now one of your drawing styles${got.forNew === 'true' ? ', and new canvases will start in it' : ''}.`, 4000);
}

async function slideMaster(): Promise<void> {
  const d = deckNow();
  if (!d) return;
  finishTyping();
  const m = await editMaster(d.master, {
    pickPicture: async (): Promise<SlideImage | null> => {
      const p = await pickPicture();
      return p ? { src: dataUrl(p.bytes, p.mime), px: imageSize(p.bytes, p.mime) ?? { w: 200, h: 200 } } : null;
    },
  });
  // the deck may have gone (its tab closed) while the window was open
  if (m && deckNow() === d) d.setMaster(m);
}

/**
 * Design > Format Background: the background of the slides picked in the slide list (the one
 * being edited when nothing else is picked), or of every slide; a design's page in Design mode.
 */
async function backgroundDialog(): Promise<void> {
  const d = deckNow();
  if (!d?.current) return;
  finishTyping();
  const design = ws.active.mode === 'design';
  const picked = design ? [d.index] : pickedSlides();
  const first = d.slides[picked[0]] ?? d.current;
  const page = d.page(d.slides.indexOf(first));
  const got = await formatBackground({
    current: slideBackground(page.master, page.layout, page.own),
    own: picked.some((i) => !!d.slides[i]?.background),
    hideGraphics: !!first.hideGraphics,
    count: picked.length,
    design,
    textColour: d.master.textColor,
    aspect: d.size.w / d.size.h,
    preview: (canvas, w, h, bg, hideGraphics) => {
      const i = d.slides.indexOf(first);
      if (i >= 0) paintSlide(canvas, w, h, window.devicePixelRatio || 1, { ...d.page(i), own: bg, hideGraphics }, d.docOf(i));
    },
    pickPicture: async (): Promise<SlideImage | null> => {
      const p = await pickPicture();
      return p ? { src: dataUrl(p.bytes, p.mime), px: imageSize(p.bytes, p.mime) ?? { w: 200, h: 200 } } : null;
    },
  });
  // the deck may have gone (its tab closed) while the window was open
  if (!got || deckNow() !== d) return;
  if (got.action === 'reset') d.setBackground(undefined, picked, got.hideGraphics);
  else if (got.action === 'all' || design) d.setAllBackgrounds(got.bg, got.hideGraphics);
  else d.setBackground(got.bg, picked, got.hideGraphics);
}

/** Design > Templates: a ready-made look for every slide, and optionally for new decks too. */
let slideTemplate: string | null = null;
/** Your own slide themes (made in Design > Templates), kept in the settings. */
let slideThemes: SlideTemplate[] = [];
const themeById = (id: string | null) => [...SLIDE_TEMPLATES, ...slideThemes].find((x) => x.id === id);
async function slideTemplates(): Promise<void> {
  const d = deckNow();
  if (!d) return;
  finishTyping();
  const got = await pickSlideTemplate(d.master, d.size, slideTemplate, slideThemes);
  if (!got) return;
  if (JSON.stringify(got.mine) !== JSON.stringify(slideThemes)) {
    slideThemes = got.mine;
    // a theme for new decks that has been deleted: back to the plain look
    if (slideTemplate && !themeById(slideTemplate)) slideTemplate = null;
    storeSettings();
  }
  const t = got.template;
  if (!t) return;
  if (deckNow() === d) d.setMaster(applyTemplate(d.master, t));
  if (got.forNew) {
    slideTemplate = t.id;
    storeSettings();
    flash(`New presentations will start with ${t.name}. Pick Plain to go back.`);
  }
}

/** Slide Master > Edit Layouts: the deck's layouts and their placeholders. */
async function editSlideLayouts(): Promise<void> {
  const d = deckNow();
  if (!d?.current || ws.active.mode !== 'slides') { flash('Layouts are for slides: use File > New > Presentation, or open a PowerPoint file.'); return; }
  finishTyping();
  const used = new Map<LayoutId, number>();
  for (const s of d.slides) used.set(s.layout, (used.get(s.layout) ?? 0) + 1);
  const got = await editLayouts({ master: d.master, size: d.size, current: d.current.layout, used });
  if (got && deckNow() === d) d.setLayouts(got);
}

/** Design > Slide Size > Custom Slide Size: any size, with what is on the slides scaled to fit or kept as it is. */
async function customSlideSize(): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  const got = await pickSlideSize(d.size);
  if (got && deckNow() === d) setSlideSize(got.size, got.fit);
}

/** How Auto-Animate Steps was last set (the next starts the same way). */
let autoSteps: AutoStepsOptions = { ...AUTO_STEPS_DEFAULTS };
/** Camera Follow on a canvas slide with a route of its own: in a copy of the slide (the original hidden), or replacing its keyframes. */
let autoStepsRoute: 'copy' | 'replace' = 'copy';

/** Animations ▸ Auto-Animate Steps…: the selected scheme (every scheme on the slide when nothing is selected) built a step at a time. */
async function autoAnimateSteps(): Promise<void> {
  const d = deckNow();
  if (!d) { flash('Auto-Animate Steps builds a scheme up on a slide: use it in a presentation.'); return; }
  finishTyping();
  const i = d.index, slide = d.slides[i], sdoc = d.docOf(i);
  const m = editor.fullMeasure();
  const smart = editor.selectedSmart();
  const f = smart !== null ? sdoc.shapes.get(smart)?.frame : undefined;
  const s = editor.sel;
  const scope = f
    ? { atoms: new Set(f.atoms), captions: new Set(f.captions), arrows: new Set(f.arrows), shapes: new Set(f.shapes) }
    : { atoms: new Set(s.atoms), captions: new Set(s.captions), arrows: new Set(s.arrows), shapes: new Set(s.shapes) };
  const pieces = stepPieces(sdoc, m, scope);
  if (!pieces) { flash('Select a scheme with reaction arrows first (or nothing, to build every scheme on the slide).'); return; }
  const steps = Math.max(...pieces.map((p) => p.step));
  const canvas = !!slide.canvas;
  // a route built by hand (more than the one keyframe a canvas slide starts with) can be kept
  const route = (slide.canvas?.keys.length ?? 0) > 1;
  const cameraNow = !autoSteps.camera ? 'off' : route ? autoStepsRoute : 'on';
  const cameraOptions = route
    ? [{ value: 'copy', label: 'On, in a copy of this slide (this one is hidden)' }, { value: 'replace', label: 'On, replacing this slide\'s keyframes' }, { value: 'off', label: 'Off' }]
    : [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }];
  const got = await ask('Auto-Animate Steps', [
    { name: 'effect', label: 'Effect', value: autoSteps.effect, options: [{ value: 'wipe', label: 'Wipe, along each arrow' }, { value: 'fade', label: 'Fade' }, { value: 'appear', label: 'Appear' }] },
    { name: 'product', label: 'Each product', value: autoSteps.product, options: [{ value: 'after', label: 'Right after its arrow' }, { value: 'with', label: 'With its arrow' }, { value: 'click', label: 'On a click of its own' }] },
    { name: 'first', label: 'The first species comes in on the first click too', value: String(autoSteps.first), type: 'checkbox' },
    ...(canvas ? [{ name: 'camera', label: 'Camera Follow', value: cameraNow, options: cameraOptions, help: route
      ? 'A keyframe for each step, the view moving along the route as it is built. This slide already has keyframes: a copy keeps them, as this slide (hidden from the show, so you can go back to it); replacing them puts the steps\' keyframes in their place.'
      : 'One keyframe per step, with the view following the route as it is built.' }] : []),
  ], { ok: 'Animate', note: `${steps} step${steps > 1 ? 's' : ''} found. Each click brings the next arrow with its conditions, then what it makes. The animations are ordinary ones: change them in the Animation Pane.`, preview: { title: 'Preview: the first clicks', draw: (v) => stepPreview(sdoc, pieces, v) } });
  if (!got || deckNow() !== d || d.index !== i) return;
  const camera = got.camera ?? (autoSteps.camera ? 'on' : 'off');
  autoSteps = { effect: got.effect as AutoStepsOptions['effect'], product: got.product as AutoStepsOptions['product'], first: got.first === 'true', camera: camera !== 'off' };
  if (camera === 'copy' || camera === 'replace') autoStepsRoute = camera;
  if (canvas && route && camera === 'copy') {
    // the steps go on a copy of the slide (one undo step); this slide keeps its route, hidden from the show
    const copy = new Doc();
    copy.style = { ...sdoc.style };
    copy.restoreContents(sdoc.contents());
    copy.edit('Auto-Animate Steps', () => markPieces(copy, pieces));
    const out = stepAnims(copy, pieces, autoSteps, slide.anims ?? [], { data: slide.canvas!, size: d.size });
    d.copyHidingOriginal(i, copy.contents(), { anims: out.anims, ...(out.canvas ? { canvas: out.canvas } : {}) }, 'Auto-Animate Steps');
    if (animUi && !animUi.paneShown) animUi.showPane(true);
    buildHint.refresh();
    flash(`Animated ${steps} step${steps > 1 ? 's' : ''} on a copy of the slide, with ${out.canvas?.keys.length ?? 0} keyframes. The original, with its own keyframes, is hidden from the show.`);
    return;
  }
  // the pieces, animations and keyframes: one undo step
  let out: ReturnType<typeof stepAnims> = { anims: [] };
  d.rebuildSlide(i, 'Auto-Animate Steps', (doc) => {
    markPieces(doc, pieces);
    out = stepAnims(doc, pieces, autoSteps, slide.anims ?? [], canvas && autoSteps.camera ? { data: slide.canvas!, size: d.size } : undefined);
    return out;
  });
  if (animUi && !animUi.paneShown) animUi.showPane(true);
  buildHint.refresh();
  flash(`Animated ${steps} step${steps > 1 ? 's' : ''}${out.canvas ? `, with ${out.canvas.keys.length} keyframes` : ''}. Preview plays them.`);
}

/**
 * The Auto-Animate Steps window's preview: the scheme as it stands before the first click and
 * after each of the first few, played over and over (Play Again starts it from the top).
 */
function stepPreview(sdoc: Doc, pieces: StepPiece[], v: Record<string, string>): Node {
  const { clicks } = stepClicks(pieces, { product: v.product as AutoStepsOptions['product'], first: v.first === 'true' });
  const shown = Math.min(clicks.length, 4);
  const wrap = document.createElement('div');
  wrap.className = 'auto-steps-preview';
  const canvas = document.createElement('canvas');
  const W = 340, H = 190;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const label = document.createElement('div');
  label.className = 'asp-label';
  const again = document.createElement('button');
  again.type = 'button';
  again.textContent = '▶ Play Again';
  const foot = document.createElement('div');
  foot.className = 'asp-foot';
  foot.append(label, again);
  wrap.append(canvas, foot);
  const all = sdoc.contents();
  const L = sdoc.style.bondLength;
  const box = pieces.reduce((b, p) => ({ x1: Math.min(b.x1, p.box.x1), y1: Math.min(b.y1, p.box.y1), x2: Math.max(b.x2, p.box.x2), y2: Math.max(b.y2, p.box.y2) }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
  const frame = (k: number) => {
    const gone = clicks.slice(k).flat();
    const sets = { atoms: new Set(gone.flatMap((p) => [...p.sel.atoms])), bonds: new Set(gone.flatMap((p) => [...p.sel.bonds])), captions: new Set(gone.flatMap((p) => [...p.sel.captions])), arrows: new Set(gone.flatMap((p) => [...p.sel.arrows])), shapes: new Set(gone.flatMap((p) => [...p.sel.shapes])) };
    const atoms = all.atoms.filter((a) => !sets.atoms.has(a.id));
    const kept = new Set(atoms.map((a) => a.id));
    const c: Contents = {
      atoms, bonds: all.bonds.filter((b) => !sets.bonds.has(b.id) && kept.has(b.a1) && kept.has(b.a2)),
      captions: all.captions.filter((t) => !sets.captions.has(t.id)), arrows: all.arrows.filter((r) => !sets.arrows.has(r.id)), shapes: all.shapes.filter((x) => !sets.shapes.has(x.id)),
    };
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const pad = L, bw = box.x2 - box.x1 + 2 * pad, bh = box.y2 - box.y1 + 2 * pad;
    const z = Math.min((W - 8) / Math.max(1, bw), (H - 8) / Math.max(1, bh), 2);
    ctx.setTransform(z * dpr, 0, 0, z * dpr, (W / 2 - ((box.x1 + box.x2) / 2) * z) * dpr, (H / 2 - ((box.y1 + box.y2) / 2) * z) * dpr);
    drawDrawing(ctx, structureDoc(c, sdoc.style));
    label.textContent = k === 0 ? 'Before the first click' : `After click ${k} of ${clicks.length}${k === shown && shown < clicks.length ? ' (the rest go on the same way)' : ''}`;
  };
  let timer = 0;
  const play = (k = 0) => {
    clearTimeout(timer);
    if (!canvas.isConnected && k > 0) return;
    frame(k);
    timer = window.setTimeout(() => { if (canvas.isConnected) play(k >= shown ? 0 : k + 1); }, k >= shown ? 1800 : 1000);
  };
  again.addEventListener('click', () => play(0));
  play(0);
  return wrap;
}

function present(fromHere: boolean, notes = false, how: { custom?: number; windowed?: boolean; rehearse?: boolean; record?: boolean } = {}): void {
  const d = deckNow();
  if (!d) { flash('Present shows slides: use File > New > Presentation, or open a PowerPoint file.'); return; }
  if (shows?.presenter.running || shows?.presenterView.running) return;
  finishTyping();
  // Set Up Show: the slides it plays, how it goes on, and the rest
  const setup = d.settings.show ?? defaultShow();
  const order = showOrder(d.slides, setup, d.settings.customShows ?? [], how.custom ?? setup.custom);
  if (order && !order.length) { flash('The show has no slides to play: every slide it names is hidden or gone (Slide Show > Set Up Show).'); return; }
  const kiosk = setup.type === 'kiosk' && !how.rehearse && !how.windowed;
  if (kiosk && !d.slides.some((s) => s.transition?.advanceAfter)) flash('In kiosk mode, slides advance only by their timings. Set them with Rehearse Timings (or Transitions > After). Esc ends the show.', 9000);
  const opts: ShowOptions = {
    order, noAnimation: setup.noAnimation, noNarration: setup.noNarration, manual: setup.manual, loop: setup.loop, kiosk,
    windowed: how.windowed || (setup.type === 'window' && !notes && !how.rehearse), rehearse: how.rehearse, record: how.record,
  };
  editor.paused = true;
  refreshZooms(d);
  // from the start: the first slide that isn't hidden; from here: this slide even when hidden, as in PowerPoint
  const from = fromHere ? d.index : order ? order[0] : d.firstShown();
  void loadShows().then((s) => (notes ? s.presenterView.start(d, from, opts) : s.presenter.start(d, from, opts)), (err: unknown) => {
    editor.paused = false;
    void showError(`The slide show could not be loaded: ${String(err)}`);
  });
}

/** The slides Clear works on: the ones picked in the slide list (the one showing), or all. */
function clearTargets(d: Deck, which: 'slide' | 'all'): number[] {
  if (which === 'all') return d.slides.map((_s, i) => i);
  const picked = [...slideList.picked].filter((i) => i >= 0 && i < d.slides.length).sort((a, b) => a - b);
  return picked.length ? picked : [d.index];
}

/** Slide Show > Clear > Timings: the slides go on with a click again, as before Rehearse Timings. */
function clearShowTimings(which: 'slide' | 'all'): void {
  const d = deckNow();
  if (!d) return;
  const ix = clearTargets(d, which);
  if (!d.clearTimings(ix, which === 'all' ? 'Clear timings on all slides' : 'Clear timings')) { flash(which === 'all' ? 'No slide has a time to clear.' : 'This slide has no time to clear.'); return; }
  flash(which === 'all' ? 'Timings cleared: all slides advance on click.' : 'Timing cleared: the slide advances on click.');
}

/** Slide Show > Clear > Narration: the recorded sounds come off the slides (their times stay). */
function clearNarration(which: 'slide' | 'all'): void {
  const d = deckNow();
  if (!d) return;
  const ix = clearTargets(d, which).filter((i) => d.narrated(i));
  if (!ix.length) { flash(which === 'all' ? 'No slide has narration to clear.' : 'This slide has no narration to clear.'); return; }
  d.editSlides(which === 'all' ? 'Clear narration on all slides' : 'Clear narration', ix, (sd) => {
    for (const sh of [...sd.shapes.values()]) if (sh.video?.narration) sd.removeShape(sh.id);
  });
  flash(`Narration cleared from ${ix.length} slide${ix.length > 1 ? 's' : ''}. Their times stay (Clear > Timings takes those off).`);
}

/** The slide show and Presenter View: their code loads the first time a show starts. */
let shows: { presenter: Presenter; presenterView: PresenterView } | null = null;
let showsLoading: Promise<{ presenter: Presenter; presenterView: PresenterView }> | null = null;

function loadShows(): Promise<{ presenter: Presenter; presenterView: PresenterView }> {
  showsLoading ??= Promise.all([import('./ui/present'), import('./ui/presenter-view'), import('./ui/show-ink')]).then(([a, b, ink]) => {
    const presenter = new a.Presenter(), presenterView = new b.PresenterView();
    wireShows(presenter, presenterView, ink.inkShape);
    shows = { presenter, presenterView };
    return shows;
  }, (err: unknown) => {
    showsLoading = null;
    throw err;
  });
  return showsLoading;
}

/** What happens when a show ends: timings, narration and ink are kept, and editing carries on. */
function wireShows(presenter: Presenter, presenterView: PresenterView, inkShape: typeof import('./ui/show-ink').inkShape): void {

  /** Rehearse Timings and Record, kept: each slide's time, and its narration as a sound on it. */
  presenter.onRehearsed = (r) => {
    const d = deckNow();
    if (!d) return;
    void (async () => {
      if (r.recordings.size) {
        const sounds = new Map<number, { src: string; seconds: number }>();
        for (const [i, blob] of r.recordings) {
          try {
            const w = await recordingToWav(blob);
            if (w.seconds > 0.2) sounds.set(i, { src: dataUrl(w.bytes, 'audio/wav'), seconds: w.seconds });
          } catch { /* a recording this computer can't read is left out */ }
        }
        const ix = [...sounds.keys()].filter((i) => i >= 0 && i < d.slides.length);
        if (ix.length) {
          const poster = speakerPng(), s = 24;
          d.editSlides('Record narration', ix, (sd, i) => {
            // a new recording takes the place of the slide's old one
            for (const sh of [...sd.shapes.values()]) if (sh.video?.narration) sd.removeShape(sh.id);
            const n = sounds.get(i)!;
            sd.addShape({
              kind: 'picture', x1: d.size.w - s - 12, y1: d.size.h - s - 12, x2: d.size.w - 12, y2: d.size.h - 12, px: { w: 128, h: 128 }, src: poster, name: NARRATION_NAME,
              video: { src: n.src, audio: true, start: 'auto', once: true, hide: true, narration: true, length: +n.seconds.toFixed(3) },
            });
          });
        } else flash('Nothing was recorded (the microphone gave no sound).');
      }
      d.setTimings(r.times, r.recordings.size ? 'Record slide show timings' : 'Rehearse timings');
      // the whole show, with the times of slides not played this time (rehearsing from one slide)
      const whole = d.slides.reduce((n, s) => n + (s.hidden ? 0 : s.transition?.advanceAfter ?? 0), 0);
      flash(`Kept: the show takes ${clockText(Math.max(whole, r.total))}${r.recordings.size ? ', with narration on the slides' : ''}. Set Up Show > Advance slides can turn the times off.`, 8000);
    })();
  };

  /** Ink drawn in the slide show, kept: shapes on its slides, as one step to undo. */
  presenter.onKeepInk = presenterView.onKeepInk = (ink) => {
    const d = deckNow();
    if (!d) return;
    const indices = [...ink.keys()].filter((i) => i >= 0 && i < d.slides.length);
    if (!indices.length) return;
    d.editSlides('Keep ink', indices, (sd, i) => {
      for (const st of ink.get(i) ?? []) { const sh = inkShape(st); if (sh) sd.addShape(sh); }
    });
    editor.requestScene();
    flash(`Ink kept on ${indices.length} slide${indices.length === 1 ? '' : 's'}. Each line is a shape: move it, recolor it or delete it.`, 6000);
  };

  presenter.onEnd = presenterView.onEnd = (i) => {
    editor.paused = false;
    // carry on editing the slide the show ended on
    goSlide(i);
    editor.requestScene();
  };
}

/** Insert > Slides > Header & Footer (Date & Time, Slide Number): the slides', notes pages' and handouts' header and footer. */
async function headerFooter(tab: 'slide' | 'notes' = 'slide'): Promise<void> {
  const d = deckNow();
  if (!d?.current || ws.active.mode !== 'slides') return;
  finishTyping();
  const ix = pickedSlides();
  const got = await editHeaderFooter(d.master, d.current, ix.length, tab);
  if (!got || deckNow() !== d) return;
  d.setHeaderFooter(got.master, got.show, got.scope === 'picked' ? ix : undefined);
}

/** Slide Show > Set Up Show. */
async function setUpShowCmd(): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  const got = await setUpShow(d.settings.show, d.settings.customShows ?? [], d.slides.length);
  if (got && deckNow() === d) d.setSettings({ ...d.settings, show: got }, 'Set up show');
  showSlideState();
}

/** Custom Slide Show > Custom Shows: make and change them (and play one). */
async function customShowsCmd(): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  const names = d.slides.map((s, i) => {
    const t = [...d.docOf(i).captions.values()].find((c) => c.ph === 'title');
    const words = t ? t.runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim() : '';
    return { id: s.id, name: `${i + 1}. ${words || 'Slide ' + (i + 1)}${s.hidden ? ' (hidden)' : ''}` };
  });
  const got = await editCustomShows(d.settings.customShows ?? [], names);
  if (!got || deckNow() !== d) return;
  const show = d.settings.show && d.settings.show.custom !== undefined && !got.shows.some((c) => c.id === d.settings.show!.custom) ? { ...d.settings.show, custom: undefined } : d.settings.show;
  if (show && show.custom === undefined) delete show.custom;
  d.setSettings({ ...d.settings, customShows: got.shows, ...(show ? { show } : {}) }, 'Custom shows');
  if (got.play !== undefined) present(false, false, { custom: got.play });
}

/** Custom Slide Show: the deck's custom shows to play, and Custom Shows… */
function customShowMenu(anchor: HTMLElement): void {
  const d = deckNow();
  if (!d) return;
  const r = anchor.getBoundingClientRect();
  const shows = d.settings.customShows ?? [];
  showContextMenu(r.left, r.bottom, [
    ...shows.map((c) => ({ cmd: `custom-show:${c.id}`, label: c.name })),
    ...(shows.length ? [null] : []),
    { cmd: 'custom-shows', label: 'Custom Shows…' },
  ], { run: (cmd) => (cmd.startsWith('custom-show:') ? present(false, false, { custom: Number(cmd.slice(12)) }) : void command(cmd)), key: commandKey });
}

// ---------------------------------------------------------------- export

/** File > Export > Batch Convert: many structure files to one format, in a zip or a folder. */
async function batchConvert(): Promise<void> {
  const files = await openManyBytesDialog('Drawings and structure files', BATCH_INPUTS).catch(async (e) => { await showError(String(e)); return []; });
  if (!files.length) return;
  const desktopApp = isTauri() && !iPadApp;
  const v = await ask(`Batch Convert ${files.length} File${files.length > 1 ? 's' : ''}`, [
    { name: 'format', label: 'Convert to', value: batchChoices.format, options: BATCH_FORMATS },
    { name: 'dpi', label: 'Resolution (PNG)', value: batchChoices.dpi, type: 'number', unit: 'dpi' },
    ...(desktopApp ? [{ name: 'to', label: 'Save in', value: batchChoices.to, options: [{ value: 'folder', label: 'A folder (one file each)' }, { value: 'zip', label: 'One zip file' }] }] : []),
  ], { ok: 'Convert…', note: 'Each record of an SD file and each line of a SMILES file becomes a file of its own. Molfiles and SMILES are drawn in this drawing\'s style.' });
  if (!v) return;
  Object.assign(batchChoices, v);
  const format = v.format as BatchFormat;
  if (format === 'smi' && !chem.ready) { flash('The chemistry engine is still loading.'); return; }
  const deps: BatchDeps = { style: { ...doc.style }, smilesToMol: (smi) => chem.smilesToMol(smi), molToSmiles: (mb) => chem.molToSmiles(mb) };
  const needsChem = files.some((f) => /\.(smi|smiles)$/i.test(f.name));
  if (needsChem && !chem.ready) { flash('The chemistry engine is still loading; try again in a moment.'); return; }
  const toFolder = desktopApp && v.to === 'folder';
  const folder = toFolder ? await pickFolder() : null;
  if (toFolder && !folder) return;
  const ZIP_TYPE: FileType = { description: 'Converted files (zip)', extension: 'zip', mime: 'application/zip' };
  const zipTarget = toFolder ? null : await saveFileDialog(files.length === 1 ? withExtension(files[0].name, 'zip') : 'converted.zip', format === 'smi' ? { description: 'SMILES list', extension: 'smi', mime: 'text/plain' } : ZIP_TYPE).catch(async (e) => { await showError(String(e)); return null; });
  if (!toFolder && !zipTarget) return;
  const used = new Set<string>();
  const out: Record<string, Uint8Array> = {};
  const lines: string[] = [];
  let failed = 0, empty = 0, done = 0;
  const enc = new TextEncoder();
  flash('Converting…');
  for (const f of files) {
    let got: Awaited<ReturnType<typeof readBatchFile>>;
    try { got = await readBatchFile(f.name, f.bytes, deps); } catch { failed++; continue; }
    failed += got.failed;
    for (const it of got.items) {
      if (format === 'smi') {
        const line = await smilesLine(it, deps);
        if (line) { lines.push(line); done++; } else empty++;
        continue;
      }
      let data: Uint8Array | string | null;
      try { data = await writeBatchItem(it, format, Math.max(30, Math.min(2400, Number(v.dpi) || 300))); } catch { failed++; continue; }
      if (data === null) { empty++; continue; }
      out[uniqueName(it.name, format, used)] = typeof data === 'string' ? enc.encode(data) : data;
      done++;
    }
  }
  try {
    if (format === 'smi') {
      const text = lines.join('\n') + '\n';
      if (folder) await writeFile({ kind: 'path', path: `${folder}/converted.smi` }, 'converted.smi', text, { description: 'SMILES list', extension: 'smi', mime: 'text/plain' });
      else await writeFile(zipTarget!.ref, zipTarget!.name, text, { description: 'SMILES list', extension: 'smi', mime: 'text/plain' });
    } else if (folder) {
      const sep = folder.includes('\\') ? '\\' : '/';
      for (const [name, bytes] of Object.entries(out)) await writeFile({ kind: 'path', path: folder.replace(/[\\/]$/, '') + sep + name }, name, bytes, ZIP_TYPE);
    } else await writeFile(zipTarget!.ref, zipTarget!.name, zipSync(out), ZIP_TYPE);
  } catch (e) {
    await showError(`Could not save the converted files: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const where = format === 'smi' ? (folder ? 'converted.smi' : zipTarget!.name) : folder ? baseName(folder) : zipTarget!.name;
  const notes = [failed ? `${failed} could not be read` : '', empty ? `${empty} had no structure${format === 'smi' ? ' SMILES can show' : ''}` : ''].filter(Boolean).join('; ');
  flash(`Converted ${done} structure${done === 1 ? '' : 's'} into ${where}${notes ? ` (${notes})` : ''}.`, notes ? 8000 : 4000);
}
const batchChoices = { format: 'cdxml', dpi: '300', to: 'folder' };

/** Chemistry > Lab Calculator: the selected structure's molecular weight filled in. */
function labCalculator(): void {
  const r = lastAnalysis?.results.find((x) => !x.error && x.mw > 0);
  void showLabCalculator(r ? { mw: r.mw, label: r.formula } : {});
}

async function exportMolfile(): Promise<void> {
  const { atoms: ids, species } = chemistryInSelection();
  if (!ids.length && !species.length) { flash('There is no structure to export.'); return; }
  const { molblock, unknownLabels } = toMolfile(doc, ids, '', { species });
  const target = await saveFileDialog(withExtension(ws.active.name, MOL.extension), MOL).catch(async (e) => { await showError(String(e)); return null; });
  if (!target) return;
  try {
    await writeFile(target.ref, target.name, molblock, MOL);
  } catch (e) {
    await showError(`Could not save ${target.name}: ${String(e)}`);
    return;
  }
  const left = unknownLabels.length ? ` (left out, not understood: ${unknownLabels.join(', ')})` : '';
  flash(`Saved ${target.name}${left}`);
}

/**
 * A slide as pages: a canvas slide's keyframes each as a slide of its own, as PowerPoint gets them
 * (canvas-export.ts), any other slide as it is.
 */
function slidePages(deck: Deck, i: number): { page: SlidePage; doc: Doc }[] {
  const s = deck.slides[i];
  if (!s?.canvas) return [{ page: deck.page(i), doc: deck.docOf(i) }];
  const split = splitCanvas<SplitSlide>({ id: s.id, layout: s.layout, doc: deck.docOf(i), notes: s.notes, transition: s.transition, anims: s.anims, background: s.background, hideGraphics: s.hideGraphics, hidden: s.hidden, hf: s.hf, canvas: s.canvas }, deck.master, deck.size, i);
  return split.filter((x) => !x.part?.via).map((x) => ({ page: { size: deck.size, master: deck.master, layout: x.layout, index: i, own: x.background, hideGraphics: x.hideGraphics, hf: s.hf }, doc: x.doc }));
}

/** File > Export > Export PDF: every slide as a page (a canvas slide's keyframes a page each), or the drawing on a page of its own size. */
async function exportPdf(): Promise<void> {
  const tab = ws.active, deck = tab.deck;
  let pages: PdfPage[];
  const docFile = docActive() ? tab.document : null;
  if (docFile) {
    // the pages as laid out on screen, figures as shapes and text so they stay sharp
    pages = recordPages(docFile.t, docFile.printLayout(), (c, style) => figures.record(c, style).pic);
  } else if (deck) {
    pages = deck.slides.flatMap((_s, i) => slidePages(deck, i).map((p) => ({
      w: deck.size.w, h: deck.size.h,
      items: recordSlide(p.page, p.doc),
    })));
  } else {
    const pic = recordPicture(doc, 18);
    if (!pic) { flash('There is nothing to put in a PDF yet.'); return; }
    const b = pic.box;
    pages = [{ w: b.x2 - b.x1, h: b.y2 - b.y1, items: pic.items, origin: { x: b.x1, y: b.y1 } }];
  }
  const target = await saveFileDialog(withExtension(tab.name, PDF.extension), PDF).catch(async (e) => { await showError(String(e)); return null; });
  if (!target) return;
  try {
    const bytes = await writePdf(pages, { title: tab.name.replace(/\.[^.]+$/, ''), image: pdfImage, fonts: pdfFonts });
    await writeFile(target.ref, target.name, bytes, PDF);
  } catch (e) {
    await showError(`Could not save ${target.name}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  flash(`Saved ${target.name}${pages.length > 1 ? ` (${pages.length} pages)` : ''}`);
}

// ---------------------------------------------------------------- printing

/** The choices made in the Print window, kept while the app is open. */
const printChoices = { paper: defaultPaper(navigator.language) as string, orient: 'auto', size: 'actual', handout: '1', frame: 'true', sheet: 'all', layout: 'pages', skip: 'true' };
const PAPER_OPTIONS = Object.entries(PAPERS).map(([value, p]) => ({ value, label: p.name }));

const pageSvgOf = (p: PdfPage) => {
  const x = p.origin?.x ?? 0, y = p.origin?.y ?? 0;
  return itemsToSvg(p.items, { x1: x, y1: y, x2: x + p.w, y2: y + p.h });
};

/** File > Print (Ctrl+P): asks how, for drawings, slides and sheets, then opens the system's Print dialog. */
async function printNow(): Promise<void> {
  finishTyping();
  const tab = ws.active, deck = tab.deck;
  if (sheetActive()) {
    const area = !!sheetMode.view.sheet?.pageSetup?.printArea?.length;
    const v = await ask('Print', [
      { name: 'sheet', label: 'Print', value: printChoices.sheet, options: [
        { value: 'all', label: area ? 'The print area' : 'The whole sheet' },
        ...(area ? [{ value: 'used', label: 'The whole sheet (ignore the print area)' }] : []),
        { value: 'sel', label: 'The selected cells' },
      ] },
    ], { ok: 'Print…', note: 'Paper, orientation, margins, scaling, titles, headers and footers are in File > Print (Page Setup… has them all). Copies and the printer are chosen in the next window: set its paper to match.' });
    if (!v) return;
    Object.assign(printChoices, v);
    const got = sheetMode.printedSheet({ selection: v.sheet === 'sel', ignoreArea: v.sheet === 'used', file: tab.name });
    if (!got) { flash('There is nothing in this sheet to print.'); return; }
    printPages({ pages: got.pages, w: got.w, h: got.h });
    return;
  }
  const docFile = docActive() ? tab.document : null;
  if (docFile) {
    // the pages as laid out on screen
    const pages = recordPages(docFile.t, docFile.printLayout(), (c, style) => figures.record(c, style).pic);
    if (!pages.length) return;
    printPages({ pages: pages.map(pageSvgOf), w: pages[0].w, h: pages[0].h });
    return;
  }
  if (deck) {
    // (a canvas slide as its first keyframe; full-page slides print each keyframe)
    const slide = (i: number, k = 0) => { const p = slidePages(deck, i)[k]; return itemsToSvg(recordSlide(p.page, p.doc), { x1: 0, y1: 0, x2: deck.size.w, y2: deck.size.h }); };
    if (tab.mode === 'design') { printPages({ pages: [slide(deck.index)], w: deck.size.w, h: deck.size.h }); return; }
    const m = deck.master;
    const v = await ask('Print', [
      { name: 'handout', label: 'Layout', value: printChoices.handout, options: [
        { value: '1', label: 'Full page slides' }, { value: 'notes', label: 'Notes Pages (as the Notes Master sets them)' },
        { value: 'master', label: `Handouts as the Handout Master sets them (${(m.handout ?? defaultHandout()).perPage} a page)` },
        { value: '2', label: 'Handouts: 2 slides a page' }, { value: '3', label: 'Handouts: 3 slides a page, with lines for notes' },
        { value: '4', label: 'Handouts: 4 slides a page' }, { value: '6', label: 'Handouts: 6 slides a page' }, { value: '9', label: 'Handouts: 9 slides a page' },
      ] },
      { name: 'paper', label: 'Paper (handouts)', value: printChoices.paper, options: PAPER_OPTIONS },
      { name: 'frame', label: 'Frame the slides (handouts)', value: printChoices.frame, type: 'checkbox' },
    ], { ok: 'Print…', note: 'Full page slides print at the slide\'s own shape, notes pages at 7.5 × 10 in; the next window fits them to the paper. Handouts and notes pages carry the header and footer from Insert > Presentation > Header & Footer > Notes and Handouts. Copies and which pages are chosen in the next window.' });
    if (!v) return;
    Object.assign(printChoices, v);
    if (v.handout === '1') { printPages({ pages: deck.slides.flatMap((_, i) => slidePages(deck, i).map((_p, k) => slide(i, k))), w: deck.size.w, h: deck.size.h }); return; }
    if (v.handout === 'notes') {
      const size = notesPageSize(m.notesPage);
      const pages = deck.slides.map((s, i) => notesPageSvg(m, deck.size, slide(i), s.notes, i + 1, (t, k) => measureText(t, k, m.notesPage?.font || m.bodyFont || 'Arial'), placeSvg));
      printPages({ pages, w: size.w, h: size.h });
      return;
    }
    const setup: HandoutSetup = v.handout === 'master' ? { ...(m.handout ?? defaultHandout()) } : { ...(m.handout ?? defaultHandout()), perPage: Number(v.handout) as HandoutSetup['perPage'] };
    setup.frame = v.frame === 'true';
    const paper = PAPERS[v.paper] ?? PAPERS.letter;
    const pages: string[] = [];
    for (let first = 0, page = 1; first < deck.slides.length; first += setup.perPage, page++) {
      const svgs = deck.slides.slice(first, first + setup.perPage).map((_, k) => slide(first + k));
      pages.push(handoutPageSvg(m, deck.size, setup, svgs, page, placeSvg, paper));
    }
    const L = handoutLayout(deck.size, setup, paper);
    printPages({ pages, w: L.page.w, h: L.page.h });
    return;
  }
  const pic = recordPicture(doc, 4);
  if (!pic) { flash('There is nothing to print yet.'); return; }
  // a drawing on pages: one sheet for each page of its grid, as ChemDraw prints
  const pg = !deckNow() ? doc.page : null;
  if (pg) {
    const v = await ask('Print', [
      { name: 'layout', label: 'Print', value: printChoices.layout, options: [{ value: 'pages', label: 'One sheet for each page, at actual size' }, { value: 'one', label: 'The whole drawing on one sheet' }] },
      { name: 'skip', label: 'Skip blank pages', type: 'checkbox', value: String(printChoices.skip !== 'false') },
    ], { ok: 'Next', note: 'The paper and its size are in File > Page Setup.' });
    if (!v) return;
    Object.assign(printChoices, v);
    if (v.layout === 'pages') {
      const e = pageExtent(pg, doc.bounds());
      const list = pagesToPrint(e, pagesInUse(pg), v.skip === 'true');
      if (!list.length) { flash('There is nothing on the pages to print.'); return; }
      // the paper: the page with its half-inch margins (a named paper at its true size)
      const sheet = pg.name ? SHEETS[pg.name] : undefined;
      const [W, H] = sheet ? (pg.w > pg.h ? [sheet.h, sheet.w] : [sheet.w, sheet.h]) : [pg.w + 72, pg.h + 72];
      const mx = (W - pg.w) / 2, my = (H - pg.h) / 2;
      const pages = list.map(({ c, r }) => pageSvg(W, H, [placeSvg(itemsToSvg(pic.items, { x1: c * pg.w, y1: r * pg.h, x2: (c + 1) * pg.w, y2: (r + 1) * pg.h }), { x: mx, y: my, w: pg.w, h: pg.h })]));
      printPages({ pages, w: W, h: H });
      return;
    }
  }
  const v = await ask('Print', [
    { name: 'paper', label: 'Paper', value: printChoices.paper, options: PAPER_OPTIONS },
    { name: 'orient', label: 'Orientation', value: printChoices.orient, options: [{ value: 'auto', label: 'To suit the drawing' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] },
    { name: 'size', label: 'Size', value: printChoices.size, options: [{ value: 'actual', label: 'Actual size (smaller only if it would not fit)' }, { value: 'fit', label: 'As large as fits the page' }] },
  ], { ok: 'Print…', note: 'The drawing is centered on the page with half-inch margins. Copies and the printer are chosen in the next window.' });
  if (!v) return;
  Object.assign(printChoices, v);
  const b = pic.box, w = b.x2 - b.x1, h = b.y2 - b.y1;
  const page = orient(PAPERS[v.paper] ?? PAPERS.letter, v.orient as 'auto', w, h);
  const at = placeIn(w, h, inside(page, 36), v.size as 'actual');
  printPages({ pages: [pageSvg(page.w, page.h, [placeSvg(itemsToSvg(pic.items, b), at)])], w: page.w, h: page.h });
}

/**
 * File > Export > Export Picture: the page (a design or the current slide) or the drawing as a PNG or
 * TIFF at the resolution picked, or as an SVG, EMF or EPS, on its background colour or see-through.
 */
async function exportPicture(preset: { format?: string; dpi?: number; note?: string } = {}): Promise<void> {
  const tab = ws.active, deck = tab.deck;
  const what = deck ? (tab.mode === 'design' ? 'the page' : 'this slide') : 'the drawing';
  // the figure check's journal sets the resolution it asks for
  const checked = preflightPane.now()?.open ? preflightPane.now()!.last : null;
  const dpiNow = preset.dpi ?? checked?.dpi ?? 300;
  const v = await ask('Export Picture', [
    { name: 'format', label: 'Format', value: preset.format ?? 'png', options: [
      { value: 'png', label: 'PNG (a picture of dots: journals, Word, web)' },
      { value: 'tiff', label: 'TIFF (a picture of dots, LZW-compressed: what many journals ask for)' },
      { value: 'svg', label: 'SVG (shapes that stay sharp: Illustrator, Inkscape, web)' },
      { value: 'emf', label: 'EMF (shapes that stay sharp: Word, PowerPoint on Windows)' },
      { value: 'eps', label: 'EPS (shapes that stay sharp: older journal systems, Illustrator)' },
    ] },
    { name: 'dpi', label: 'Resolution (PNG, TIFF)', value: String(dpiNow), type: 'number', unit: 'dpi' },
    { name: 'bg', label: 'Background', value: deck ? 'page' : 'clear', options: [
      { value: deck ? 'page' : 'white', label: deck ? 'The page color' : 'White' },
      { value: 'clear', label: 'Transparent' },
    ] },
  ], { ok: 'Export…', note: preset.note ?? (checked ? `Saves ${what}. The ${checked.journal.name.replace(/ \(.*/, '')} guidelines ask for ${checked.dpi} dpi for this figure (File > Check Figure for Journal).` : `Saves ${what}. Journals usually ask for 300 dpi for color pictures and 600 to 1200 dpi for line drawings.`) });
  if (!v) return;
  const dpi = Math.max(30, Math.min(2400, Number(v.dpi) || 300));
  const clear = v.bg === 'clear';
  const CLEAR = 'rgba(0,0,0,0)';
  let w: number, h: number;
  let items: () => { items: Item[]; box: EmfBox };
  let svg: () => string;
  let png: (k: number) => HTMLCanvasElement;
  if (deck) {
    const i = deck.index;
    // a canvas slide: the keyframe picked, as a slide of its own
    const at = slidePages(deck, i)[deck.current?.canvas ? canvasKeys.picked(deck) : 0];
    const page = clear ? { ...at.page, own: solid(CLEAR) } : at.page;
    ({ w, h } = deck.size);
    items = () => ({ items: recordSlide(page, at.doc).filter((it) => !(it.kind === 'path' && it.fill === CLEAR)), box: { x1: 0, y1: 0, x2: w, y2: h } });
    svg = () => { const p = items(); return itemsToSvg(p.items, p.box); };
    png = (k) => {
      const c = document.createElement('canvas');
      paintSlide(c, w, h, k, page, at.doc);
      return c;
    };
  } else {
    const pic = recordPicture(doc, 4);
    if (!pic) { flash('There is nothing to export yet.'); return; }
    const b = pic.box;
    w = b.x2 - b.x1; h = b.y2 - b.y1;
    const back = clear ? [] : [{ kind: 'path' as const, segs: [{ k: 'M' as const, x: b.x1, y: b.y1 }, { k: 'L' as const, x: b.x2, y: b.y1 }, { k: 'L' as const, x: b.x2, y: b.y2 }, { k: 'L' as const, x: b.x1, y: b.y2 }, { k: 'Z' as const }], fill: '#ffffff' }];
    items = () => ({ items: [...back, ...pic.items], box: b });
    svg = () => itemsToSvg([...back, ...pic.items], b);
    png = (k) => {
      const { canvas } = pictureCanvas(doc, pic, k * 72);
      if (clear) return canvas;
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      const g = c.getContext('2d')!;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(canvas, 0, 0);
      return c;
    };
  }
  const type = ({ svg: SVG, tiff: TIFF, emf: EMF, eps: EPS } as Record<string, FileType>)[v.format] ?? PICTURE;
  const target = await saveFileDialog(withExtension(tab.name, type.extension), type).catch(async (e) => { await showError(String(e)); return null; });
  if (!target) return;
  let note = '';
  try {
    if (type === SVG) await writeFile(target.ref, target.name, svg(), SVG);
    else if (type === EMF) { const p = items(); await writeFile(target.ref, target.name, itemsToEmf(p.items, p.box), EMF); }
    else if (type === EPS) { const p = items(); await writeFile(target.ref, target.name, await itemsToEps(p.items, p.box, pdfImage, tab.name.replace(/\.[^.]+$/, '')), EPS); }
    else {
      const k = bitmapScale(w, h, dpi, EXPORT_MAX_SIDE, EXPORT_MAX_PIXELS);
      const c = png(k);
      const got = Math.round((c.width / w) * 72);
      if (got < dpi - 1) note = ` at ${got} dpi (the most for a page this big)`;
      if (type === TIFF) {
        const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        await writeFile(target.ref, target.name, writeTiff(px, c.width, c.height, (c.width / w) * 72, clear), TIFF);
      } else {
        const bytes = new Uint8Array(await (await canvasPng(c)).arrayBuffer());
        await writeFile(target.ref, target.name, pngWithDpi(bytes, (c.width / w) * 72), PICTURE);
      }
      note = `, ${c.width} × ${c.height} pixels` + note;
    }
  } catch (e) {
    await showError(`Could not save ${target.name}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  flash(`Saved ${target.name}${note}`);
}

/** A picture's pixels for a PDF: JPEGs go in as they are; others are read through the browser. */
async function pdfImage(src: string): Promise<PdfImage | null> {
  const { mime, bytes } = fromDataUrl(src);
  if (mime === 'image/jpeg') {
    const info = jpegInfo(bytes);
    if (info) return { kind: 'jpeg', bytes, ...info };
  }
  if (mime === 'image/x-wmf' || mime === 'image/tiff') return null;
  let img: HTMLImageElement;
  try {
    img = await loadImage(src);
  } catch {
    return null;
  }
  let w = img.naturalWidth || 300, h = img.naturalHeight || 150;
  // a drawing in SVG (or a Windows metafile, shown as SVG) has no pixels of its own: make plenty so it prints sharply
  if (mime === 'image/svg+xml' || mime === 'image/x-emf') { const k = 3000 / Math.max(w, h); w *= k; h *= k; }
  const k = Math.min(1, Math.sqrt(16e6 / (w * h)));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const rgb = new Uint8Array(w * h * 3), alpha = new Uint8Array(w * h);
  let clear = false;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    rgb[i * 3] = px[j]; rgb[i * 3 + 1] = px[j + 1]; rgb[i * 3 + 2] = px[j + 2];
    alpha[i] = px[j + 3];
    if (px[j + 3] < 255) clear = true;
  }
  return { kind: 'raw', w, h, rgb, alpha: clear ? alpha : null };
}

// ---------------------------------------------------------------- sheets: the grid, and structures drawn for cells

const SHEET_HINT = 'Type in a cell; double-click to edit. Insert > Structure in Cell adds a structure.';

/** True when a sheet is showing (and no structure is being drawn for one of its cells). */
function sheetActive(): boolean {
  return ws.active.mode === 'sheet' && !!sheetMode && !drawingOnTop();
}

/** True when a structure is being drawn for a cell or figure, or the drawing in split view has the keys. */
function drawingOnTop(): boolean {
  return !!cellEdit || (splitDrawing && !!ws.pane);
}

let sheetMode!: SheetMode;
let sheetModeLoading: Promise<SheetMode> | null = null;

/** Sheet mode's code loads the first time a sheet shows (or in idle time after start-up), not at start-up. */
function loadSheetMode(): Promise<SheetMode> {
  sheetModeLoading ??= import('./ui/sheet-mode').then(({ SheetMode }) => {
    sheetMode = new SheetMode({
      flash,
      editStructure: (contents, title, done) => editCellStructure(contents, title, done),
      key: (e) => sheetKey(e),
      command: (name) => command(name),
      changed: (book) => ws.noteChange(book && ws.tabs.find((t) => t.book === book)),
      isOpen: (book) => ws.tabs.some((t) => t.book === book),
      toStructure: (text, style) => textToStructure(text, style),
      writeCells: (own, text, html) => writeCells(own, text, html),
      copyStructure: async (contents, style) => (await copyDrawing(structureDoc(contents, style), null)).replace(/^Copied the whole drawing/, 'Copied the structure'),
      readCells: (e) => readCells(e),
      askName: () => askReviewName(() => storeSettings()),
      pickPicture: () => pickPicture(),
      print: () => void printNow(),
    }, sheetChem);
    modeLoaded('sheet');
    return sheetMode;
  }, (err: unknown) => {
    sheetModeLoading = null;
    throw err;
  });
  return sheetModeLoading;
}

/** The style structures in the sheet showing are drawn in. */
const sheetStyle = (): DocStyle => ws.active.book?.drawingStyle ?? ACS_1996;

/**
 * The sheet's and document's ribbons, menus and panes show with a sheet or a document; the
 * drawing menus only while drawing a structure for a cell or a document.
 */
function showSheetParts(): void {
  const sheet = ws.active.mode === 'sheet';
  const words = ws.active.mode === 'document';
  for (const el of document.querySelectorAll<HTMLElement>('.sheet-only, .no-sheet, .doc-only, .no-doc')) {
    const c = el.classList;
    el.hidden = (c.contains('sheet-only') && !sheet) || (c.contains('no-sheet') && sheet) || (c.contains('doc-only') && !words)
      || (c.contains('no-doc') && words);
  }
  tickMenuModes();
}

/** A key pressed in a sheet: Excel's keys first, then the menu keys that use Ctrl, Alt or a function key. */
function sheetKey(e: KeyboardEvent): boolean {
  const chord = chordOf(e);
  if (!chord) return false;
  // Alt+← and Alt+→ would go back and forward in a browser, leaving the page
  if (chord === 'Alt+ArrowLeft' || chord === 'Alt+ArrowRight') return true;
  for (const ctx of ['sheet', 'command'] as KeyContext[]) {
    const action = keymap.lookup(ctx, chord);
    if (!action) continue;
    // plain keys type in cells and arrows move between them, so the drawing's plain keys don't apply
    if (ctx === 'command' && !/^(Ctrl|Alt)\+|^(Shift\+)?F\d+$/.test(chord)) continue;
    const { verb, arg } = parseAction(action);
    if (verb !== 'command') continue;
    if ((arg === 'copy' || arg === 'cut') && textSelected()) return false;
    // in a browser, Ctrl+V goes on to the paste event, which can read the clipboard
    if (arg === 'paste' && !nativeClipboard) return false;
    if (command(arg)) return true;
  }
  return false;
}

/** A SMILES string, molfile or name as a drawing, for a cell. */
async function textToStructure(text: string, style: DocStyle): Promise<{ contents: Contents; notes: string[] } | { error: string }> {
  const t = text.trim();
  if (!t) return { error: 'Type a name or SMILES.' };
  if (!chem.ready) return { error: 'The chemistry engine is still loading; try again in a moment.' };
  let got: { mb: string; attach: number[]; warnings: string[] } | null = null;
  const mb = await molfileOrSmiles(text, (s) => chem.smilesToMol(s));
  if (mb) got = { mb, attach: [], warnings: [] };
  else {
    const named = await nameToMolfile(t);
    if ('error' in named) return { error: named.bad !== undefined || named.details ? `"${t}" isn't SMILES or a name that could be read. Check the spelling, or try a CAS number or a simpler name.` : named.error };
    got = named;
  }
  const d = new Doc();
  d.style = { ...style };
  try {
    d.bulk(() => { addNamed(got!, 0, 0, d); });
  } catch (err) {
    return { error: String(err) };
  }
  return { contents: d.contents(), notes: got.warnings };
}

/**
 * Cells to the clipboard: our own copy (formulas, structures and formats), an HTML table (Excel
 * and Word keep bold, colours and borders) and tab-separated text.
 */
async function writeCells(own: string, text: string, html: string): Promise<void> {
  forgetCopy();
  if (nativeClipboard) {
    const enc = new TextEncoder();
    await writeNativeFormats([[CELLS_FORMAT, enc.encode(own)], ['HTML Format', cfHtml(html)], ['CF_UNICODETEXT', enc.encode(text)]]);
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

/** What's on the clipboard for a paste into a sheet. Drawings (from here or ChemDraw) stay structures. */
async function readCells(e: ClipboardEvent | null): Promise<ClipboardCells> {
  const dec = (b: Uint8Array) => new TextDecoder().decode(b).replace(/\0+$/, '');
  const drawingOf = (d: Doc): Contents => { fitPasted(d, sheetStyle()); return d.contents(); };
  if (nativeClipboard) {
    const t = await nativeFirst(['CF_UNICODETEXT']);
    const text = t ? dec(t[1]) : undefined;
    const own = await nativeFirst([CELLS_FORMAT]);
    if (own) return { own: dec(own[1]), text };
    const drawing = await nativeFirst([OWN_FORMAT, CDX_FORMAT]);
    if (drawing) {
      const [name, data] = drawing;
      return { drawing: drawingOf(readCdxml(name === CDX_FORMAT ? cdxToCdxml(data) : dec(data)).doc), text };
    }
    if (text && looksLikeCdxml(text)) return { drawing: drawingOf(readCdxml(text).doc) };
    if (text) return { text };
    return { picture: !!(await nativeFirst(['PNG', 'CF_ENHMETAFILE', 'CF_DIB'])) };
  }
  const text = e ? e.clipboardData?.getData('text/plain') ?? '' : await navigator.clipboard.readText().catch(() => '');
  if (looksLikeCdxml(text)) return { drawing: drawingOf(readCdxml(text).doc) };
  if (text) return { text };
  if (!e) return {};
  // a drawing copied here goes on the clipboard as a picture; the drawing itself is kept for pasting back
  const p = await readPasteEvent(e);
  if (p.kind === 'drawing') return { drawing: drawingOf(p.doc) };
  return { picture: p.kind === 'picture' };
}

/** The structure in the selected cell as a drawing (for Copy as Molfile and CDXML text). */
function activeStructureDoc(): Doc | null {
  const c = sheetMode.activeStructure();
  return c ? structureDoc(c, sheetStyle()) : null;
}

// Drawing a structure for a cell: the drawing area floats over the sheet, with Done and Cancel.
// The cell's drawing is swapped into the editor's document while it's drawn (the sheet's tab
// leaves that document empty), so every drawing tool, key and check works on it as usual.
let cellEdit: { done: (c: Contents | null) => void; saved: Doc; view: typeof renderer.view } | null = null;

// A document's structure drawn in place on its page (see ui/in-place.ts): the drawing area is a
// clear layer over the pages, which show the structure as it is drawn and follow its zoom and scrolling.
let place: InPlace | null = null;
let placeSeen: PlaceView | null = null;
let placeVersion = -1;

/** Line the drawing tools up with the structure on its page. */
function pullPlace(): void {
  const v = place?.view();
  if (!v) return;
  renderer.view = { ...renderer.view, ...v };
  placeSeen = { ...v };
  editor.requestScene();
}

/** The drawing layer over the pages, and the bar over them. */
function placeHost(): void {
  const r = place?.rect();
  if (!r) return;
  Object.assign(host.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const bar = $('#structure-bar');
  Object.assign(bar.style, { left: `${r.left + r.width / 2}px`, top: `${r.top + 10}px` });
  resize();
  pullPlace();
}
window.addEventListener('resize', () => { if (place) requestAnimationFrame(placeHost); });

// The Knowledge Base's Draw window (ui/knowledge-base.ts): the drawing tools work in the window's
// own box, which the drawing area is placed exactly over; the window has its own buttons, not the bar.
let kbArea: (() => DOMRect | null) | null = null;
/** The tab the drawing was lent from, as it was (unsaved or not), and the slide's edit hooks, set aside meanwhile. */
let kbLent: { tab: Tab; dirty: boolean; changes: number; commit: Doc['onCommit']; amend: Doc['onAmend'] } | null = null;

/** The drawing area over the Draw window's box. */
function placeKbArea(): void {
  const r = kbArea?.();
  if (!r) return;
  Object.assign(host.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  resize();
}
window.addEventListener('resize', () => { if (kbArea) requestAnimationFrame(placeKbArea); });

/** What was selected in the drawing, as a drawing of its own (Draw window's Use Selected), or a sentence saying why there is none. */
function selectionContents(): Contents | string {
  if (docActive() || sheetActive()) {
    const d = pickedDrawing();
    return d?.atoms.size ? d.contents() : docActive() ? 'Click a structure in the document before opening Draw.' : 'Click a cell with a structure in it before opening Draw.';
  }
  const frags = chosenStructures();
  if (!frags.length) return 'Select a structure in the drawing before opening Draw.';
  const atoms = new Set(frags.flatMap((f) => [...f]));
  const bonds = new Set([...doc.bonds.values()].filter((b) => atoms.has(b.a1) && atoms.has(b.a2)).map((b) => b.id));
  return extractDrawing(doc, { atoms, bonds, captions: new Set(), arrows: new Set(), shapes: new Set() }).contents();
}

/** Done: a figure first checks its structures still fit it (or the user goes back to drawing). */
async function doneCellStructure(): Promise<void> {
  const p = place;
  if (p?.beforeDone && cellEdit && doc.canUndo()) {
    if (!(await p.beforeDone(doc.contents()))) { overlay.focus(); return; }
    if (place !== p || !cellEdit) return;
  }
  finishCellStructure(true);
}

function editCellStructure(contents: Contents | null, title: string, done: (c: Contents | null) => void, style: DocStyle = sheetStyle(), inPlace?: InPlace, area?: () => DOMRect | null): void {
  finishCellStructure(true);
  const blank: Contents = { atoms: [], bonds: [], captions: [], arrows: [], shapes: [] };
  const drawing = structureDoc(contents ?? blank, style);
  // in a mode whose page is the drawing area itself (Canvas, Presentation, Design), the structure
  // is drawn in a box over a faded picture of the page, as a spreadsheet cell's is (or, for the
  // Knowledge Base's Draw window, in the window's box, the page left as a picture behind it)
  const pageIsDrawing = ws.active.mode !== 'sheet' && ws.active.mode !== 'document';
  const boxed = !inPlace && !area && pageIsDrawing;
  if (boxed || (area && pageIsDrawing)) {
    const back = $<HTMLDivElement>('#drawing-backdrop');
    const scene = host.querySelector<HTMLCanvasElement>('#scene');
    try { back.style.backgroundImage = scene ? `url(${scene.toDataURL('image/png')})` : ''; } catch { back.style.backgroundImage = ''; }
    back.hidden = false;
    if (boxed) document.body.classList.add('boxed-drawing');
  }
  editor.clearSelection();
  // (no keyboard highlight left from the last structure: its atom ids mean nothing in this one)
  editor.setKeyHot(null);
  doc.swap(drawing);
  // the drawing beside (split view) waits in `drawing`, its zoom kept for after
  cellEdit = { done, saved: drawing, view: { ...renderer.view } };
  ws.aside = ws.pane ? drawing : null;
  document.body.classList.add('floating-drawing');
  layoutSplit();
  $('#structure-title').textContent = title;
  $('#structure-bar').hidden = false;
  if (ws.active.mode === 'sheet' || boxed) setStructureSize(0);
  showSheetParts();
  editor.paused = false;
  editor.lastEdited = null;
  editor.cropping = null;
  const mode = ws.active.mode;
  if (editor.toolName !== modeTool[mode]) editor.setTool(modeTool[mode]);
  editor.onToolChange(editor.toolName);
  if (area) {
    kbArea = area;
    // (the search structure is no change to the tab, nor a step in a slide's undo list)
    const t = ws.active;
    kbLent = { tab: t, dirty: t.dirty, changes: t.changes, commit: doc.onCommit, amend: doc.onAmend };
    doc.onCommit = doc.onAmend = null;
    document.body.classList.add('kb-drawing');
    placeKbArea();
  }
  resize();
  if (inPlace) {
    // in place: over the pages, lined up with the structure where it is on its page
    place = inPlace;
    placeVersion = -1;
    document.body.classList.add('drawing-in-place');
    inPlace.moved = () => pullPlace();
    inPlace.show((ctx) => drawDrawing(ctx, doc));
    placeHost();
  } else {
    // the structure in the middle, at a comfortable size (a new one starts at the middle)
    const b = doc.bounds();
    const w = renderer.width, h = renderer.height;
    const k = b ? Math.min(2.5, 0.8 * Math.min(w / Math.max(20, b.x2 - b.x1), h / Math.max(20, b.y2 - b.y1))) : 2;
    renderer.view = { ...renderer.view, scale: k, ox: w / 2 - (b ? (b.x1 + b.x2) / 2 : 0) * k, oy: h / 2 - (b ? (b.y1 + b.y2) / 2 : 0) * k };
  }
  renderer.repaintAll();
  // paint the structure now: the drawing area still shows the last one edited until the scene is asked for
  editor.requestScene();
  editor.frame(true);
  refreshKeys();
  analysisKey = '';
  scheduleAnalysis(true);
  overlay.focus();
  // a new, empty table on its own (Insert > Table in a document): start typing in its first cell
  const shapes = [...doc.shapes.values()];
  const table = shapes.length === 1 && !doc.atoms.size ? shapes[0] : null;
  if (table?.table && table.table.rows.every((r) => r.every((c) => !c.runs.length))) editor.editTable(table.id, { r: 0, c: 0 });
}

/** Done (keep the drawing) or Cancel. The cell only changes when something was drawn. */
function finishCellStructure(keep: boolean): void {
  const e = cellEdit;
  if (!e) return;
  editor.closeCaption();
  cellEdit = null;
  // (the Draw window's drawing counts whether or not it changed: it may have opened with the one searched for last)
  const result = keep && (doc.canUndo() || !!kbArea) ? doc.contents() : null;
  modeTool[ws.active.mode] = editor.toolName;
  editor.clearSelection();
  editor.setKeyHot(null);
  editor.lastEdited = null;
  editor.cropping = null;
  doc.swap(e.saved);
  ws.aside = null;
  if (place) {
    place.show(null);
    place.moved = () => {};
    place = placeSeen = null;
    document.body.classList.remove('drawing-in-place');
    for (const k of ['left', 'top', 'width', 'height'] as const) { host.style[k] = ''; $('#structure-bar').style[k] = ''; }
  }
  if (kbArea) {
    kbArea = null;
    document.body.classList.remove('kb-drawing');
    for (const k of ['left', 'top', 'width', 'height'] as const) host.style[k] = '';
    if (kbLent) {
      doc.onCommit = kbLent.commit;
      doc.onAmend = kbLent.amend;
      ws.forgetLentChanges(kbLent.tab, kbLent);
      kbLent = null;
    }
  }
  // the drawing beside is back as it was: not changed, at its own zoom
  if (ws.pane) ws.pane.seen = doc.version;
  renderer.view = e.view;
  document.body.classList.remove('floating-drawing', 'boxed-drawing');
  $('#drawing-backdrop').hidden = true;
  $<HTMLDivElement>('#drawing-backdrop').style.backgroundImage = '';
  $('#structure-bar').hidden = true;
  const sheet = ws.active.mode === 'sheet';
  const words = ws.active.mode === 'document';
  editor.paused = sheet || words;
  splitDrawing = false;
  layoutSplit();
  if (ws.pane) { resize(); renderer.repaintAll(); }
  showSheetParts();
  refreshKeys();
  if (sheet) setHint(SHEET_HINT);
  if (words) setHint(DOC_HINT);
  e.done(result);
  if (!result && sheet) sheetMode?.focus();
  if (!result && words) docMode?.focus();
}

/** A cell's drawing area: 6 × 4 in, then 9 × 6 in, then the whole window (Bigger steps through them, then back). */
const STRUCTURE_SIZES = [{ w: '6in', h: '4in' }, { w: '9in', h: '6in' }, null] as const;
let structureSize = 0;
function setStructureSize(i: number): void {
  structureSize = i % STRUCTURE_SIZES.length;
  const sz = STRUCTURE_SIZES[structureSize];
  const body = document.body;
  if (sz) { body.style.setProperty('--structure-w', sz.w); body.style.setProperty('--structure-h', sz.h); delete body.dataset.structureSize; }
  else body.dataset.structureSize = 'fill';
  const last = structureSize === STRUCTURE_SIZES.length - 1;
  const b = $('#structure-bigger');
  b.textContent = last ? 'Smaller' : 'Bigger';
  b.title = last ? 'Back to the 6 × 4 in drawing area' : 'Make the drawing area bigger';
  if (cellEdit) { const before = { w: renderer.width, h: renderer.height }; resize(); renderer.view = { ...renderer.view, ox: renderer.view.ox + (renderer.width - before.w) / 2, oy: renderer.view.oy + (renderer.height - before.h) / 2 }; renderer.repaintAll(); editor.requestScene(); }
}
$('#structure-bigger').addEventListener('click', () => setStructureSize(structureSize + 1));
$('#structure-done').addEventListener('click', () => void doneCellStructure());
$('#structure-cancel').addEventListener('click', () => finishCellStructure(false));
// clicking the sheet or pages behind the drawing finishes it (as Done)
for (const pane of ['#sheet-pane', '#doc-pane']) {
  $(pane).addEventListener('pointerdown', (e) => {
    if (!cellEdit) return;
    e.preventDefault();
    e.stopPropagation();
    void doneCellStructure();
  }, true);
}
// in place: a click on the page away from the structure (or outside its figure) is Done, as in Word
host.addEventListener('pointerdown', (e) => {
  if (!place || !cellEdit || e.button !== 0) return;
  const r = overlay.getBoundingClientRect(), v = renderer.view;
  const x = (e.clientX - r.left - v.ox) / v.scale, y = (e.clientY - r.top - v.oy) / v.scale;
  const a = place.area(doc.bounds());
  if (x >= a.x1 && x <= a.x2 && y >= a.y1 && y <= a.y2) return;
  e.preventDefault();
  e.stopPropagation();
  void doneCellStructure();
}, true);
// Esc: the drawing tools let go of what they hold first (a selection, the highlight on the atom
// last drawn, text being typed); then Cancel, asking first when something was drawn (ui/in-place.ts)
let askingDiscard = false;
window.addEventListener('keydown', (e) => {
  if (!cellEdit || e.key !== 'Escape' || e.defaultPrevented || isTyping(e.target) || (e.target as HTMLElement | null)?.closest?.('dialog, .menu')) return;
  const act = escapeAction({ toolsBusy: editor.escapeHasWork(), changed: doc.canUndo() });
  if (act === 'tools') return;
  e.preventDefault();
  e.stopPropagation();
  if (act === 'cancel') { finishCellStructure(false); return; }
  if (askingDiscard) return;
  askingDiscard = true;
  const e0 = cellEdit;
  void ask('Discard Changes?', [], { ok: 'Discard', note: 'Esc cancels the structure: what was drawn since it opened will be lost. Done keeps it.' }).then((ok) => {
    askingDiscard = false;
    if (cellEdit !== e0) return;
    if (ok) finishCellStructure(false);
    else overlay.focus();
  });
}, true);
window.addEventListener('keydown', (e) => {
  // Ctrl+Enter: Done
  if (cellEdit && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isTyping(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    void doneCellStructure();
  }
}, true);
// keys while a sheet shows but the grid doesn't have the focus (after clicking a tab or a menu)
window.addEventListener('keydown', (e) => {
  if (!sheetActive() || e.defaultPrevented) return;
  const t = e.target as HTMLElement | null;
  if (isTyping(t) || t?.closest?.('dialog, .menu, .menu-wrap, #sheet-pane, select')) return;
  if (sheetKey(e)) { e.preventDefault(); return; }
  if (!t || t === document.body) sheetMode.focus();
});

/** Menu commands that work differently while a sheet shows. */
const SHEET_COMMANDS: Record<string, () => unknown> = {
  'sheet-new-window': () => { sheetMode.view.commitEdit(); ws.newWindow(); },
  // (through the sheet's own command, which copies a selected chart rather than the cells under it)
  cut: () => sheetMode.run('cut'),
  copy: () => sheetMode.run('copy'),
  paste: () => sheetMode.paste(null),
  'select-all': () => sheetMode.selectAll(),
  'copy-smiles': async () => {
    if (!chem.ready) { flash('The chemistry engine is still loading.'); return; }
    const smiles = await sheetMode.copySmiles();
    if (!smiles) { flash('Select cells with structures in them to copy their SMILES.'); return; }
    const n = smiles.split('\n').length;
    await copyText(smiles, n > 1 ? `Copied ${n} SMILES, one per line.` : 'Copied SMILES: ' + smiles);
  },
  'paste-smiles': async () => {
    let text = '';
    try {
      text = (await readClipboardText()).trim();
    } catch (err) {
      flash('Could not read the clipboard: ' + String(err));
      return;
    }
    if (!text) { flash('The clipboard has no text on it.'); return; }
    await sheetMode.structureFromText(text);
  },
  'copy-mol': () => {
    const d = activeStructureDoc();
    if (!d) { flash('Select a cell with a structure in it.'); return; }
    return copyText(toMolfile(d, d.atoms.keys(), '', { species: allSpecies(d) }).molblock, 'Copied as molfile text.');
  },
  'copy-cdxml': () => {
    const d = activeStructureDoc();
    if (!d) { flash('Select a cell with a structure in it.'); return; }
    return copyText(writeCdxml(d, { name: 'Clipboard.cdxml', textMeasure: measureText }), 'Copied as CDXML text.');
  },
  'copy-svg': () => {
    const d = activeStructureDoc();
    const svg = d && drawingSvg(d, null);
    if (!svg) { flash('Select a cell with a structure in it, or right-click a chart for Copy as SVG.'); return; }
    return copySvg(svg).then(flash);
  },
  'name-to-structure': () => sheetMode.run('structure-from-name'),
  'zoom-in': () => sheetMode.view.setZoom(sheetMode.view.zoom * 1.25),
  'zoom-out': () => sheetMode.view.setZoom(sheetMode.view.zoom * 0.8),
  'zoom-fit': () => sheetMode.view.setZoom(1),
  'zoom-actual': () => sheetMode.view.setZoom(1),
};

// ---------------------------------------------------------------- documents: pages of text with structures in them

const DOC_HINT = 'Type on the page. Insert > Structure adds a structure; double-click it to edit.';

/** True when a document is showing (and no structure is being drawn for it). */
function docActive(): boolean {
  return ws.active.mode === 'document' && !!docMode && !drawingOnTop();
}

/** The style structures in the document showing are drawn in. */
/** Insert > Quick Parts: saved pieces of text (kept with the settings). */
let docQuickParts: QuickPart[] = [];

const docStyle = (): DocStyle => ws.active.document?.t.drawingStyle ?? ACS_1996;

let docMode!: DocumentMode;
let docModeLoading: Promise<DocumentMode> | null = null;

/** Document mode's code loads the first time a document shows (or in idle time after start-up), not at start-up. */
function loadDocMode(): Promise<DocumentMode> {
  docModeLoading ??= import('./ui/doc-mode').then(({ DocumentMode }) => {
    docMode = new DocumentMode({
      flash,
      key: (e) => docKey(e),
      command: (name) => command(name),
      changed: () => ws.noteChange(),
      offerFigures: () => offerFigures,
      editDrawing: (contents, title, done) => editCellStructure(contents, title, done, docStyle()),
      editInPlace: (contents, p, done) => editCellStructure(contents, p.title, done, docStyle(), p),
      editDiagram: (contents) => documentDiagram(contents),
      copyDrawing: async (contents, style) => (await copyDrawing(structureDoc(contents, style), null)).replace(/^Copied the whole drawing/, 'Copied the structure'),
      copiedOther: () => forgetCopy(),
      copyPicture: (src) => copyImage(src),
      readPaste: (e) => readDocPaste(e),
      toStructure: (text, style) => textToStructure(text, style),
      pickPicture: () => pickPicture(),
      pickObjectFile: () => pickObjectFile(),
      objectPicture: (name, bytes, icon) => objectPictureOf(name, bytes, icon),
      openObjectFile: (file, changed) => openObjectFile(file, changed),
      chemdrawDrawing: (cdx, style) => {
        const contents = docRead.chemdraw!(cdx, style);
        const size = contents && docRead.drawingSize!(contents, style);
        return contents && size ? { contents, w: size.w } : null;
      },
      clipboardObject: nativeClipboard ? () => clipboardObject() : undefined,
      pickReferenceFile: () => pickReferenceFile(),
      openReferences: () => referencesWindow.open(),
      // Zotero on this computer (the desktop app: Zotero turns away requests from a web page)
      zoteroPost: isTauri() && !iPadApp ? async (endpoint, body) => {
        const got = await invoke<{ status: number; body: string }>('zotero_post', { endpoint, body });
        return { status: got.status, text: got.body };
      } : undefined,
      activateWindow: isTauri() ? () => { void invoke('zotero_activate').catch(() => {}); } : undefined,
      preferredChanged: () => storeSettings(),
      reviewNameChanged: () => storeSettings(),
      quickParts: () => docQuickParts,
      setQuickParts: (list) => { docQuickParts = list; storeSettings(); },
      setNewDesign: (d) => { setNewDocDesign(d); storeSettings(); },
      openDocuments: () => {
        const seen = new Set<unknown>();
        return ws.tabs.filter((t) => t.mode === 'document' && t.document && !seen.has(t.document) && seen.add(t.document)).map((t) => ({ name: ws.label(t), t: t.document!.t }));
      },
      pickDocument: async () => {
        const f = await openBytesDialog('Word documents', [DOCX]).catch(async (e) => { await showError(String(e)); return null; });
        if (!f) return null;
        try {
          const { doc, warnings } = await (await import('./io/docx-read')).readDocx(f.bytes, docRead);
          if (warnings.length) flash(`${f.name}: ${warnings.join(' ')}`, 8000);
          return { name: f.name, t: doc };
        } catch (e) {
          await showError(`Could not open ${f.name}: ${String(e)}`);
          return null;
        }
      },
      showDocument: (t, name) => { ws.showDocument(t, name); },
      newTable: (rows, cols, style) => tableDrawing(emptyTable(rows, cols, style.captionSize), style),
      measure: measureText,
    });
    modeLoaded('document');
    return docMode;
  }, (err: unknown) => {
    docModeLoading = null;
    throw err;
  });
  return docModeLoading;
}

/** Sheet or document mode's code just loaded: bring it up to date with the settings, the brush and the tab showing. */
function modeLoaded(mode: 'sheet' | 'document'): void {
  if (mode === 'sheet') sheetMode.showFormulaBar();
  else {
    docMode.showRuler();
    docMode.boxesChanged();
  }
  brush.onChange();
  if (ws.active.mode !== mode) return;
  if (mode === 'sheet') sheetMode.show(ws.active);
  else docMode.show(ws.active);
}

/** Sheet or document mode's code didn't load (a broken install, or the web version gone offline). */
function modeFailed(err: unknown): void {
  void showError(`This part of Chem Illustrator could not be loaded: ${String(err)}. Restart it and try again.`);
}

// both load in idle time soon after start-up, so the first sheet or document opens at once
setTimeout(() => {
  const load = () => { void loadSheetMode().catch(() => {}); void loadDocMode().catch(() => {}); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 5000 });
  else load();
}, 2500);
docBoxPrefs.changed = () => storeSettings();
docRulerPrefs.changed = () => storeSettings();
formulaBarPrefs.changed = () => storeSettings();
// documents measure fonts they have no published widths for on the screen
setScreenMeasure(measureText);
void document.fonts?.ready.then(() => docMode?.fontsChanged());

/** A table as a drawing (for a document): one table shape at its laid-out size. */
function tableDrawing(t: TableData, style: DocStyle): Contents {
  const lay = layoutTable(t, style.captionSize, textMeasure);
  return { atoms: [], bonds: [], captions: [], arrows: [], shapes: [{ id: 1, kind: 'table', x1: 0, y1: 0, x2: lay.width, y2: lay.height, table: t }] };
}

/** A key the document's text doesn't use: the menu keys that use Ctrl, Alt or a function key. */
function docKey(e: KeyboardEvent): boolean {
  const chord = chordOf(e);
  if (!chord) return false;
  // Alt+← and Alt+→ would go back and forward in a browser, leaving the page
  if (chord === 'Alt+ArrowLeft' || chord === 'Alt+ArrowRight') return true;
  if (!/^(Ctrl|Alt)\+|^(Shift\+)?F\d+$/.test(chord)) return false;
  for (const ctx of ['document', 'command'] as KeyContext[]) {
    const action = keymap.lookup(ctx, chord);
    if (!action) continue;
    const { verb, arg } = parseAction(action);
    if (verb !== 'command') continue;
    // the text field copies, cuts and pastes itself
    if (arg === 'copy' || arg === 'cut' || arg === 'paste') return false;
    if (command(arg)) return true;
  }
  return false;
}

/** What's on the clipboard for a paste into a document: a drawing (from here or ChemDraw), text, or a picture. */
async function readDocPaste(e: ClipboardEvent | null): Promise<DocPaste> {
  const dec = (b: Uint8Array) => new TextDecoder().decode(b).replace(/\0+$/, '');
  const drawingOf = (d: Doc): Contents => { fitPasted(d, docStyle()); return d.contents(); };
  if (nativeClipboard) {
    const drawing = await nativeFirst([OWN_FORMAT, CDX_FORMAT]);
    if (drawing) {
      const [name, data] = drawing;
      return { drawing: drawingOf(readCdxml(name === CDX_FORMAT ? cdxToCdxml(data) : dec(data)).doc) };
    }
    const t = await nativeFirst(['CF_UNICODETEXT']);
    const text = t ? dec(t[1]) : '';
    if (looksLikeCdxml(text)) return { drawing: drawingOf(readCdxml(text).doc) };
    const h = await nativeFirst(['HTML Format']);
    const html = h ? fromCfHtml(h[1]) : undefined;
    if (text || html) return { text, html };
    const p = await readNativeClipboard();
    return p.kind === 'picture' ? { picture: { bytes: p.bytes, mime: p.mime } } : {};
  }
  const text = e ? e.clipboardData?.getData('text/plain') ?? '' : await navigator.clipboard.readText().catch(() => '');
  if (looksLikeCdxml(text)) return { drawing: drawingOf(readCdxml(text).doc) };
  if (text) return { text };
  const p = e ? await readPasteEvent(e) : await readWebClipboard();
  if (p.kind === 'drawing') return { drawing: drawingOf(p.doc) };
  if (p.kind === 'picture') return { picture: { bytes: p.bytes, mime: p.mime } };
  return {};
}

/** The structure picked in the document, as a drawing (for Copy as SMILES, Molfile and CDXML). */
function pickedFigureDoc(): Doc | null {
  const f = ws.active.document;
  const id = docMode?.pickedObject();
  const o = f && id !== null ? f.t.objects[id] : null;
  return o?.kind === 'drawing' ? structureDoc(o.contents, f!.t.drawingStyle) : null;
}

/** The structure, diagram or picture picked in the document, as SVG (a picture that isn't SVG goes inside one). */
function pickedFigureSvg(): string | null {
  const d = pickedFigureDoc();
  if (d) return drawingSvg(d, null);
  const f = ws.active.document;
  const id = docMode?.pickedObject();
  const o = f && id !== null ? f.t.objects[id] : null;
  if (o?.kind !== 'picture' || o.crop || o.rot) return null;
  const k = o.scale ?? 1, w = +(o.w * k).toFixed(2), h = +(o.h * k).toFixed(2);
  if (/^data:image\/svg\+xml/.test(o.src)) {
    try {
      return new TextDecoder().decode(fromDataUrl(o.src).bytes);
    } catch { /* goes inside an SVG below */ }
  }
  const esc = o.src.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" preserveAspectRatio="none" href="${esc}"/></svg>`;
}

/** Menu commands that work differently while a document shows. */
const DOC_COMMANDS: Record<string, () => unknown> = {
  'insert-shapes': () => {
    const b = document.querySelector<HTMLElement>('#doc-ribbon [data-doc="insert-shapes"]');
    const anchor = b && b.offsetParent ? b : document.querySelector<HTMLElement>('#doc-ribbon .rb-tabs')!;
    shapeMenu.show(anchor, 'Click a shape to put it in the text at the caret. Double-click it there to change its size, color or text.', (id) => docMode.insertShape(id));
  },
  'insert-diagram': () => void docMode.insertDiagram(),
  'insert-icons': () => {
    const b = document.querySelector<HTMLElement>('#doc-ribbon [data-doc="insert-icons"]');
    const anchor = b && b.offsetParent ? b : document.querySelector<HTMLElement>('#doc-ribbon .rb-tabs')!;
    shapeMenu.show(anchor, 'Click an icon to put it in the text at the caret. Double-click it there to change its size or color.', (id) => docMode.insertShape(id), 'icons');
  },
  'copy-smiles': async () => {
    const d = pickedFigureDoc();
    if (!d) { flash('Click a structure first (it gets a blue frame), then Copy as SMILES.'); return; }
    if (!chem.ready) { flash('The chemistry engine is still loading.'); return; }
    const { molblock } = toMolfile(d, d.atoms.keys(), '', { species: allSpecies(d) });
    const smiles = await chem.molToSmiles(molblock).catch(() => '');
    if (!smiles) { flash('Could not make SMILES for this drawing.'); return; }
    await copyText(smiles, 'Copied SMILES: ' + smiles);
  },
  'copy-mol': () => {
    const d = pickedFigureDoc();
    if (!d) { flash('Click a structure first, then Copy as Molfile Text.'); return; }
    return copyText(toMolfile(d, d.atoms.keys(), '', { species: allSpecies(d) }).molblock, 'Copied as molfile text.');
  },
  'copy-cdxml': () => {
    const d = pickedFigureDoc();
    if (!d) { flash('Click a structure first, then Copy as CDXML Text.'); return; }
    return copyText(writeCdxml(d, { name: 'Clipboard.cdxml', textMeasure: measureText }), 'Copied as CDXML text.');
  },
  'copy-svg': () => {
    const svg = pickedFigureSvg();
    if (!svg) { flash('Click a structure, diagram or picture first, then Copy as SVG.'); return; }
    return copySvg(svg).then(flash);
  },
  'paste-smiles': async () => {
    let text = '';
    try {
      text = (await readClipboardText()).trim();
    } catch (err) {
      flash('Could not read the clipboard: ' + String(err));
      return;
    }
    if (!text) { flash('The clipboard has no text on it.'); return; }
    const r = await textToStructure(text, docStyle());
    if ('error' in r) { flash(r.error, 8000); return; }
    docMode.insertObject({ kind: 'drawing', contents: r.contents }, 'Paste SMILES');
  },
  'name-to-structure': () => docMode.run('structure-from-name-doc'),
  // View > Document > New Window: the document in another tab too, with its own view and place
  'doc-new-window': () => { ws.newWindow(); },
};

/** Menu commands from the drawing's list that also work while a document shows. */
const DOC_ANY = new Set(['export-pdf', 'print']);

// keys while a document shows but its text doesn't have the focus (after clicking a tab or a menu)
window.addEventListener('keydown', (e) => {
  if (!docActive() || e.defaultPrevented) return;
  const t = e.target as HTMLElement | null;
  if (isTyping(t) || t?.closest?.('dialog, .menu, .menu-wrap, select, aside, .ribbon')) return;
  if (docKey(e)) { e.preventDefault(); return; }
  if (!t || t === document.body) docMode.focus();
});

/** Menu commands that work the same whatever shows. */
const ANY_TAB = new Set(['references', 'compound-library', 'knowledge-base', 'ligand-library', 'toolbox-text', 'toolbox-guides', 'insert-compound', 'add-to-compound-library', 'library-location', 'find-structure-files', 'new-from-template', 'check-accessibility', 'format-painter', 'insert-symbol', 'edit-palettes', 'preferences', 'export-settings', 'import-settings', 'customize-ribbon', 'toolbox-main', 'toolbox-structure', 'toolbox-arrange', 'toolbox-templates', 'toolbox-colours', 'toolbox-highlight', 'toolbox-custom', 'toolbox-schemes', 'toolbox-diagrams', 'toolbox-tables', 'toolbox-biopolymers', 'toolbox-perspective', 'fold-side', 'customize-toolbox', 'customize-quick-bar', 'lock-toolboxes', 'reset-toolboxes', 'new', 'new-slides', 'new-design', 'new-sheet', 'new-document', 'open', 'save', 'save-as', 'autosave', 'version-history', 'recover-work', 'keep-options', 'close-tab', 'next-tab', 'prev-tab', 'undo', 'redo',
  'drawing-style', 'navigation-settings', 'dark-page', 'dark-colours', 'hotkeys', 'typing-spelling', 'mode-colours', 'dev-tools', ...STRESS_SIZES.map((n) => `stress-${n}`), 'scroll-bars', 'title-bar-in-menu', 'collapse-ribbon', 'ui-scale-in', 'ui-scale-out', 'ui-scale-reset', ...UI_SCALES.map((v) => `ui-scale-${Math.round(v * 100)}`), 'text-bar-docked', 'text-bar-floating', 'text-bar-hidden', 'theme-system', 'theme-light', 'theme-dark', 'theme-darkgray', 'density-snug', 'density-cozy', 'density-normal', 'density-standard', 'density-large', 'shadows-light', 'shadows-strong', 'shadows-off', 'icons-mode', 'icons-kind', 'shape-ink-accent', 'focus-view', 'one-column-tools', 'group-tips', 'tool-tips', 'touch-mode-auto', 'touch-mode-on', 'touch-mode-off', 'atom-keypad', 'pen-sketch', 'show-stereo', 'clipboard-formats', 'split-view', 'command-search', 'next-region', 'prev-region', 'print',
  'assistant', 'help', 'about', 'user-guide', 'help-here', 'send-feedback', 'report-problem', 'copy-diagnostics', 'open-log-folder', 'open-inspector', 'check-updates']);

// ---------------------------------------------------------------- accessibility (Review > Check Accessibility, Alt Text…)

/** What makes the file showing hard to use with a screen reader or to read. */
function accessibilityIssues(): Issue[] {
  if (sheetActive()) return ws.active.book ? checkWorkbook(ws.active.book) : [];
  if (docActive()) { const t = docMode.file?.t; return t ? checkDocument(t) : []; }
  const deck = deckNow();
  if (deck && ws.active.mode === 'slides') {
    const out: Issue[] = [];
    const titles: (string | null)[] = [];
    deck.slides.forEach((_, i) => {
      const d = deck.docOf(i);
      out.push(...checkDrawing(d, { slide: i, slideTitle: true, ...(d === doc ? { captionBox: (c: Caption) => renderer.captionBox(c) } : {}) }));
      const t = [...d.captions.values()].find((c) => c.ph === 'title');
      titles.push(t ? t.runs.map((r) => r.text).join('') : null);
    });
    return [...out, ...repeatedTitles(titles)];
  }
  return checkDrawing(doc, { captionBox: (c) => renderer.captionBox(c) });
}

/** Go to what an accessibility issue is about, and select it. */
function goToIssue(p: IssuePlace): void {
  if (sheetActive()) { sheetMode.goToIssue(p); return; }
  if (docActive()) {
    if (p.kind === 'doc-object') docMode.goToObject(p.id);
    else if (p.kind === 'doc-para') docMode.revealPara(p.para);
    return;
  }
  if (p.kind !== 'drawing') return;
  const deck = deckNow();
  if (deck && p.slide !== undefined) deck.go(p.slide);
  // brought into view (zoomed in to it), then picked whole
  if (p.atoms?.length) editor.reveal('atom', p.atoms[0]);
  else if (p.captions?.length) editor.reveal('caption', p.captions[0]);
  editor.selectThese({ atoms: new Set(p.atoms ?? []), bonds: new Set(), captions: new Set(p.captions ?? []), arrows: new Set(), shapes: new Set(p.shapes ?? []) });
}

/** Alt Text… in a drawing, on a slide or in a design: for the picture or chart picked, or else the structure picked. */
async function drawingAltText(): Promise<boolean> {
  const pics = [...editor.sel.shapes].map((id) => doc.shapes.get(id)).filter((x): x is Shape => x?.kind === 'picture');
  if (pics.length === 1) {
    const p = pics[0];
    const got = await askAltText(p.chart ? 'chart' : p.math ? 'equation' : p.video ? (p.video.audio ? 'sound' : 'video') : 'picture', p.alt);
    if (got === null || !doc.shapes.has(p.id)) return false;
    doc.edit('Alt text', () => doc.updateShape(p.id, { alt: got || undefined }));
    return true;
  }
  const atom = [...editor.sel.atoms].find((id) => doc.atoms.has(id));
  if (pics.length === 0 && atom !== undefined) {
    const frag = [...doc.fragmentOf(atom)].map((id) => doc.atoms.get(id)).filter((a): a is Atom => !!a);
    const got = await askAltText('structure', structureAlt(frag), 'Screen readers read this out in place of the structure, and PowerPoint and Word keep it as the picture\'s alt text. Left empty, the structure is described by its SMILES.');
    if (got === null || !doc.atoms.has(atom)) return false;
    setStructureAlt(doc, atom, got);
    return true;
  }
  flash(pics.length > 1 ? 'Select one picture at a time for Alt Text.' : 'Click a picture, chart or structure first, then Alt Text.');
  return false;
}

const accessibility = new AccessibilityPane({
  check: accessibilityIssues,
  goTo: goToIssue,
  fixAlt: async (p) => {
    if (sheetActive()) return sheetMode.altText();
    if (docActive()) return p.kind === 'doc-object' ? docMode.altText(p.id) : false;
    return drawingAltText();
  },
});

/** The journal drawing style for each journal the figure check knows (drawing-styles.ts). */
const JOURNAL_STYLES: Record<string, string> = {
  acs: 'ACS Document 1996', rsc: 'RSC', nature: 'Nature journals', wiley: 'Wiley (Angewandte, Chemistry Europe)', elsevier: 'Elsevier (Tetrahedron and others)',
};

/** File > Check Figure for Journal: the figure showing, as it draws (a drawing, a design page or a slide). */
/** The pane, loaded the first time it is used. */
const preflightPane = madeLater(async (): Promise<PreflightPane> => {
  const [m, { preflight }, { enlargeText, thickenLines, useArial, fixUntilDone }] = await Promise.all([import('./ui/preflight-pane'), import('./preflight'), import('./preflight-fix')]);
  const pane: PreflightPane = new m.PreflightPane({
    figure: () => {
      if (sheetActive() || docActive()) return null;
      const deck = deckNow();
      if (deck) {
        const i = deck.index;
        const at = slidePages(deck, i)[deck.current?.canvas ? canvasKeys.picked(deck) : 0];
        if (!at) return null;
        return { items: recordSlide(at.page, at.doc), box: { x1: 0, y1: 0, x2: deck.size.w, y2: deck.size.h }, page: true };
      }
      const pic = recordPicture(doc, 0);
      return pic ? { items: pic.items, box: pic.box } : null;
    },
    select: (where) => {
      const sel = editor.touching(where);
      editor.selectThese(sel);
      const first = [...sel.atoms][0];
      if (first !== undefined) editor.reveal('atom', first);
      else if (sel.captions.size) editor.reveal('caption', [...sel.captions][0]);
      else if (!sel.shapes.size && !sel.arrows.size) flash('That is part of a picture, chart or table: change it there.');
    },
    fix: (issue, r) => {
      finishTyping();
      // measured afresh for each step (text made bigger has a bigger box)
      const fixCtx = () => { const m = editor.measure(); return { captionBox: (id: number) => m.captionBox(doc.captions.get(id)!), shapeBox: (id: number) => shapeBox(doc.shapes.get(id)!) }; };
      let scaled = 1;
      const apply = (i: typeof issue): boolean => {
        if (i.fix === 'fit' && i.want) {
          editor.selectAll();
          const ok = editor.scaleSelection(i.want);
          if (ok) scaled *= i.want;
          return ok;
        }
        if (i.fix === 'text') return enlargeText(doc, i, fixCtx());
        if (i.fix === 'lines') return thickenLines(doc, i, fixCtx());
        if (i.fix === 'fonts') return useArial(doc, i.fonts ?? []);
        return false;
      };
      // checked again after each step: one fix can undo another's work by a hair
      const again = () => {
        const fig = pane.figureNow();
        return fig ? preflight(fig.items, fig.box, r.journal, r.size.id, r.how) : null;
      };
      // all the steps are one undo
      const label = { fit: 'Make it fit', text: 'Enlarge small text', lines: 'Thicken thin lines', fonts: 'Change fonts to Arial', style: 'Drawing style' }[issue.fix ?? 'style'];
      const done = doc.edit(label, () => fixUntilDone(issue, apply, again));
      if (done && issue.fix === 'fit') flash(`Scaled to ${Math.round(scaled * 100)} % to fit ${r.size.name.replace(/ \(.*/, '').toLowerCase()}. Text in captions keeps its size.`, 6000);
      if (done) editor.changed();
      else if (issue.fix !== 'fit') flash('This is in a picture, chart or table: change it there.');
      return done;
    },
    styleFor: (id) => (JOURNAL_STYLES[id] && presetNamed(JOURNAL_STYLES[id]) ? JOURNAL_STYLES[id] : undefined),
    useStyle: (name) => {
      const next = presetNamed(name)?.style;
      if (!next) return;
      finishTyping();
      const deck = deckNow();
      if (deck) deck.setDrawingStyle({ ...next }, 'restyle');
      else { doc.edit(`Drawing style: ${next.name}`, () => applyStyle(doc, { ...next }, 'restyle')); editor.changed(); }
      flash(`Structures are now drawn in ${next.name}.`, 4000);
    },
    exportFor: (r) => {
      finishTab();
      const name = r.journal.name.replace(/ \(.*/, '');
      if (r.journal.vectorPreferred) { void exportPdf(); return; }
      const raster = r.journal.formats?.find((f) => f === 'tiff' || f === 'png') ?? 'tiff';
      void exportPicture({ format: raster, dpi: r.dpi, note: `The ${name} guidelines ask for ${r.dpi} dpi for this figure${r.journal.formats ? `, as ${r.journal.formats.map((f) => f.toUpperCase()).join(', ')}` : ''}.` });
    },
    open: (url) => openWebPage(url),
  });
  return pane;
});

const slideCompare = new SlideComparePane({
  deck: () => (ws.active.mode === 'slides' ? deckNow() : null),
  flash: (m, ms) => flash(m, ms),
  changed: () => { const d = deckNow(); if (d) deckChanged(d); },
});
deckWatchers.push((d) => slideCompare.deckChanged(d));

/** File > New > New from Template: a document or sheet started from one of our templates. */
async function newFromTemplate(): Promise<void> {
  finishTab();
  const got = await pickFileTemplate(sheetActive() ? 'sheet' : 'document');
  if (!got) return;
  if (got.kind === 'sheet') {
    ws.newSheet(got.template?.make());
  } else ws.newDocument(got.template?.make());
  if (got.template) flash(`New ${got.template.name.toLowerCase()}: type over the text in [brackets].`);
}

/** Review > Compare (slides): another version of this deck, from an open tab or a PowerPoint file, to review slide by slide. */
async function compareSlides(): Promise<void> {
  const d = deckNow();
  if (!d || ws.active.mode !== 'slides') return;
  finishTyping();
  const others = ws.tabs.filter((t) => t !== ws.active && t.mode === 'slides' && t.deck);
  let pick = 'file';
  if (others.length) {
    const got = await ask('Compare Presentations', [{
      name: 'with', label: 'Compare with', value: 'file',
      options: [{ value: 'file', label: 'A PowerPoint file…' }, ...others.map((t, i) => ({ value: String(i), label: t.name }))],
    }], { ok: 'Compare', note: 'Each slide that differs in the other version is listed, to accept into this deck or reject.' });
    if (!got) return;
    pick = got.with;
  }
  const theirs = new Deck(new Doc());
  let name: string;
  if (pick === 'file') {
    const f = await openBytesDialog('PowerPoint presentations', [PPTX]).catch(async (e) => { await showError(String(e)); return null; });
    if (!f) return;
    try {
      const got = (await import('./io/pptx-read')).readPptx(f.bytes);
      theirs.load(got.slides.map((s) => theirs.makeSlide(s.layout, s.contents, s.notes, s, got.master)), got.size, got.master);
    } catch (e) {
      flash(`Could not read ${f.name}: ${e instanceof Error ? e.message : String(e)}`, 8000);
      return;
    }
    name = f.name;
  } else {
    const t = others[Number(pick)];
    const src = t.deck!.copySlides(t.deck!.slides.map((_, i) => i));
    theirs.load(src.slides.map((s) => theirs.makeSlide(s.layout, s.contents, s.notes, s.motion, src.master)), src.size, src.master);
    name = t.name;
  }
  if (deckNow() !== d) return;
  // at the right of the window, clear of the slide list
  const n = slideCompare.start(d, theirs, name);
  flash(n ? `${n} change${n === 1 ? '' : 's'} from ${name} to review.` : `${name} has the same slides as this deck.`);
}

/** Run a menu command in the way that suits the tab showing. False when it doesn't apply there. */
function command(name: string): boolean {
  // View > Toolboxes: one of your own
  if (name.startsWith('toolbox-own-')) { toolboxes.toggle(name.slice('toolbox-'.length)); return true; }
  if (sheetActive()) {
    const own = SHEET_COMMANDS[name];
    if (own) return own() !== false;
    if (sheetMode.run(name)) return true;
    if (!ANY_TAB.has(name)) return false;
  }
  if (docActive()) {
    const own = DOC_COMMANDS[name];
    if (own) return own() !== false;
    if (!ANY_TAB.has(name) && docMode.run(name)) return true;
    if (!ANY_TAB.has(name) && !DOC_ANY.has(name)) return false;
  }
  if (ws.active.mode === 'design' && (SLIDE_ONLY.has(name) || name.startsWith('layout-'))) {
    flash('A design is one page: use Page Size and Background on the Design ribbon. For several pages, use File > New > Presentation.');
    return true;
  }
  if (name.startsWith('shape-fx:')) { void shapeEffect(name); return true; }
  if (name.startsWith('page-edge:')) return togglePageEdge(name.slice('page-edge:'.length) as Side);
  if (name.startsWith('caption-chem:')) return setCaptionChem(name.slice('caption-chem:'.length) as 'auto' | 'on' | 'off');
  if (name.startsWith('add-ligand:')) {
    if (editor.addLigand(name.slice('add-ligand:'.length))) return true;
    flash('Select one metal first, then add the ligand to it.');
    return false;
  }
  if (name === 'repeat-label:here') return repeatLabel(contextAtom);
  if (name.startsWith('atom-label:') || name.startsWith('atom-key:')) return atomFromMenu(name);
  if (name.startsWith('arrow-as:')) return arrowFromMenu(name);
  if (name.startsWith('bond-as:') || name.startsWith('bond-line2:') || name.startsWith('bond-pos:')) return bondFromMenu(name);
  if (name.startsWith('fuse-ring:')) {
    const [, id, index] = name.split(':');
    return contextBond !== null && editor.fuseRing(contextBond, id, Number(index));
  }
  if (name.startsWith('layout-') && ws.active.mode === 'slides') { setLayout(name.slice('layout-'.length)); return true; }
  if (name.startsWith('new-slide-layout-') && ws.active.mode === 'slides') { newSlide(name.slice('new-slide-layout-'.length)); return true; }
  const run = COMMANDS[name];
  return !!run && run() !== false;
}

/** Where the last right-click menu on the page opened (a gallery picked from it opens there). */
let rightClickAt = { left: 0, bottom: 0 };

/** The design shapes picked (the ones Shape Styles and Shape Effects change). */
function pickedGeo(): Shape[] {
  return [...editor.sel.shapes].map((id) => doc.shapes.get(id)).filter((x): x is Shape => x?.kind === 'geo' && !x.diagram);
}

/** Where a ribbon button's drop-down goes: under the button showing, or under the tabs. */
function dropAnchor(cmd: string): HTMLElement {
  const b = [...document.querySelectorAll<HTMLElement>(`[data-cmd="${cmd}"]`)].find((x) => x.offsetParent);
  return b ?? document.querySelector<HTMLElement>('#ribbon .rb-tabs')!;
}

/** Shape Styles: the gallery of ready-made looks for the shapes picked, in the deck's colours. */
function shapeStyles(at?: { left: number; bottom: number }): void {
  if (!pickedGeo().length) { flash('Select a shape first (Insert > Shapes).'); return; }
  const m = deckNow()?.master;
  const colours = styleColours(m?.textColor ?? '#333333', m?.accent ?? '#2f6fb0', m?.accent2 ?? '#c0504d');
  showStyleGallery(at ?? dropAnchor('shape-styles'), colours, (look, c) => {
    const shapes = pickedGeo();
    finishTyping();
    const { textColor, ...patch } = stylePatch(look, c);
    doc.edit('Shape style', () => {
      for (const s of shapes) {
        const text = s.text && { ...s.text, runs: s.text.runs.map((r) => ({ ...r, color: textColor })) };
        doc.updateShape(s.id, { ...patch, ...(text ? { text } : {}) });
      }
    });
    editor.changed();
  });
}

/** Shape Effects: shadow, reflection, glow, soft edges and bevel, from a menu under the button (or at the pointer). */
function shapeEffects(at?: { x: number; y: number }): void {
  if (!pickedGeo().length) { flash('Select a shape first (Insert > Shapes).'); return; }
  const r = dropAnchor('shape-effects').getBoundingClientRect();
  showContextMenu(at?.x ?? r.left, at?.y ?? r.bottom, effectsMenu(), { run: (cmd) => void command(cmd), key: () => undefined });
}

/** One of the Shape Effects menu's choices, for every shape picked. */
async function shapeEffect(cmd: string): Promise<boolean> {
  const shapes = pickedGeo();
  if (!shapes.length) { flash('Select a shape first (Insert > Shapes).'); return false; }
  finishTyping();
  if (cmd === 'shape-fx:glow:options') {
    const g = shapes[0].glow ?? { color: shapes[0].fillColor ?? shapes[0].color ?? '#ffc000', size: 8, transparency: 0.4 };
    const v = await ask('Glow', [
      { name: 'color', label: 'Color', value: g.color, type: 'color' },
      { name: 'size', label: 'Size (pt)', value: String(g.size), type: 'number' },
      { name: 'clear', label: 'Transparency (%)', value: String(Math.round(g.transparency * 100)), type: 'number' },
    ], { ok: 'Apply' });
    if (!v) return false;
    const size = Math.max(0, Math.min(150, Number(v.size) || 0));
    const glow = size > 0 ? { color: v.color, size, transparency: Math.max(0, Math.min(1, (Number(v.clear) || 0) / 100)) } : undefined;
    doc.edit('Glow', () => { for (const s of shapes) doc.updateShape(s.id, { glow }); });
    editor.changed();
    return true;
  }
  const label = { shadow: 'Shadow', reflection: 'Reflection', glow: 'Glow', soft: 'Soft edges', bevel: 'Bevel' }[cmd.split(':')[1]] ?? 'Shape effect';
  doc.edit(label, () => { for (const s of shapes) { const p = effectPatch(cmd, s); if (p) doc.updateShape(s.id, p); } });
  editor.changed();
  return true;
}

/** Shape Fill > Picture: a picture from a file fills the shapes picked, stretched to each. */
async function shapePictureFill(): Promise<void> {
  const shapes = pickedGeo();
  if (!shapes.length) { flash('Select a shape first (Insert > Shapes).'); return; }
  const p = await pickPicture();
  if (!p) return;
  if (!/^image\/(png|jpeg|gif)$/.test(p.mime)) { flash('A shape can be filled with a PNG, JPEG or GIF picture.'); return; }
  finishTyping();
  const picFill = { src: dataUrl(p.bytes, p.mime), px: imageSize(p.bytes, p.mime) ?? { w: 100, h: 100 } };
  doc.edit('Picture fill', () => { for (const s of shapes) doc.updateShape(s.id, { picFill, filled: true }); });
  editor.changed();
}

/** Shape Fill > No Picture: back to the shapes' own fill colour. */
function shapeNoPictureFill(): void {
  const shapes = pickedGeo().filter((s) => s.picFill);
  if (!shapes.length) { flash('None of the selected shapes has a picture fill.'); return; }
  doc.edit('Picture fill', () => { for (const s of shapes) doc.updateShape(s.id, { picFill: undefined }); });
  editor.changed();
}

/** Picture Style (right-click on a picture): a ready-made frame, corners and shadow for the pictures picked. */
function setPictureStyle(look: PictureLook | undefined): boolean {
  const pics = [...editor.sel.shapes].map((id) => doc.shapes.get(id)).filter((x): x is Shape => x?.kind === 'picture');
  if (!pics.length) { flash('Select a picture first.'); return false; }
  doc.edit('Picture style', () => { for (const p of pics) doc.updateShape(p.id, { look: look && { ...look } }); });
  return true;
}

/** Slide commands that don't apply to a design's single page. */
const SLIDE_ONLY = new Set(['references-slide', 'zotero-menu', 'zotero-cite', 'zotero-bib', 'zotero-refresh', 'zotero-prefs', 'zotero-unlink', 'compare-slides', 'section-menu', 'new-slide', 'new-canvas-slide', 'add-keyframe', 'keyframe-here', 'fit-keyframe', 'delete-keyframe', 'keyframe-title', 'keyframe-zone', 'canvas-background', 'canvas-heading', 'keyframe-spotlight', 'keyframe-unspot', 'keyframe-detour', 'canvas-show-options', 'duplicate-slide', 'delete-slide', 'cut-slides', 'copy-slides', 'paste-slides', 'paste-slides-keep', 'hide-slide', 'reuse-slides', 'size-wide', 'size-standard', 'size-custom', 'slide-master', 'slide-templates',
  'edit-layouts', 'view-sorter', 'add-section', 'rename-section', 'remove-section', 'remove-section-slides', 'remove-all-sections', 'section-up', 'section-down', 'collapse-sections', 'expand-sections',
  'slide-transitions', 'slide-animations', 'animation-pane', 'auto-animate-steps', 'preview-slide', 'remove-animation', 'insert-slide-zoom', 'insert-summary-zoom', 'action-settings', 'insert-action-button', 'insert-video', 'insert-audio',
  'reading-view', 'rehearse-timings', 'record-show', 'rehearse-here', 'record-show-here', 'clear-timings-slide', 'clear-timings-all', 'clear-narration-slide', 'clear-narration-all', 'clear-show-menu', 'set-up-show', 'custom-shows', 'custom-show-menu', 'use-timings', 'play-narrations', 'header-footer', 'insert-date-time', 'insert-slide-number', 'view-slide-ruler', 'view-gridlines', 'view-guides', 'grid-settings', 'add-vertical-guide', 'add-horizontal-guide', 'view-outline', 'view-notes-page', 'notes-master', 'handout-master']);

/** The animation commands: an effect for the selected objects (the right-click menu's Animation). */
const ANIM_COMMANDS: { cmd: string; label: string }[] = [false, true].flatMap((exit) => EFFECTS.filter((e) => !(exit && e.emph)).map((e) => ({
  cmd: `animate-${e.id}${exit ? '-out' : ''}`, label: animName(newAnim({ kind: 'shape', id: 0 }, e.id, exit)),
})));

/**
 * Bring to Front, Send to Back, Bring Forward, Send Backward: the selected shapes among the
 * shapes, and the selected bonds among the bonds they cross (the bond behind gets a gap).
 */
function restack(how: 'front' | 'back' | 'forward' | 'backward'): void {
  const label = { front: 'Bring to Front', back: 'Send to Back', forward: 'Bring Forward', backward: 'Send Backward' }[how];
  // one undo step for both
  const [objects, bonds] = editor.doc.edit(label, () => [editor.setObjectLayer(how), editor.setBondLayer(how)] as const);
  if (objects || bonds === true) return;
  const verb = { front: 'bring to the front', back: 'send to the back', forward: 'bring forward', backward: 'send backward' }[how];
  flash(bonds === 'none' ? 'That bond doesn\'t cross another bond. Where bonds cross, the one behind has a gap.' : `Select the objects or bonds to ${verb}.`);
}

const COMMANDS: Record<string, () => unknown> = {
  new: () => { finishTab(); ws.newDrawing(); },
  'preflight': () => {
    finishTyping();
    void preflightPane.get().then((p) => { if (p.open) p.refresh(); else p.show(document.querySelector<HTMLElement>('[data-cmd="preflight"]:not([hidden])')); })
      .catch((e) => flash(`Check Figure for Journal could not open: ${String(e)}`));
  },
  'check-accessibility': () => { finishTyping(); if (accessibility.open) accessibility.refresh(); else accessibility.show(document.querySelector<HTMLElement>('[data-cmd="check-accessibility"]:not([hidden])')); },
  'alt-text': () => { finishTyping(); void drawingAltText(); },
  'new-slides': () => { finishTab(); ws.newSlides(); },
  'new-design': () => newDesign(),
  'design-size': () => designSize(),
  'connector-tool': () => { finishTyping(); editor.setTool('connector'); },
  'connector-elbow-tool': () => { finishTyping(); editor.setTool('connector-elbow'); },
  'shape-styles': () => shapeStyles(),
  'view-notes': () => { slidePanes.notes = !slidePanes.notes; applySlidePanes(); storeSettings(); mainResized(); },
  'view-slide-ruler': () => { slideLook.ruler = !slideLook.ruler; showRulers(); storeSettings(); },
  'view-warnings-pane': () => { chemPanes.warnings = !chemPanes.warnings; showChemPanes(); storeSettings(); if (chemPanes.warnings && sideIsFolded()) command('fold-side'); },
  'view-analysis-pane': () => { chemPanes.analysis = !chemPanes.analysis; showChemPanes(); storeSettings(); if (chemPanes.analysis && sideIsFolded()) command('fold-side'); },
  'view-gridlines': () => { slideLook.grid = !slideLook.grid; showRulers(); storeSettings(); renderer.repaintAll(); editor.requestScene(); },
  'view-guides': () => toggleGuides(),
  'grid-settings': () => void gridSettings(),
  'add-vertical-guide': () => addGuide('x'),
  'add-horizontal-guide': () => addGuide('y'),
  'shape-styles-here': () => shapeStyles(rightClickAt),
  'shape-effects': () => shapeEffects(),
  'shape-picture-fill': () => void shapePictureFill(),
  'shape-no-picture-fill': () => shapeNoPictureFill(),
  'slide-shapes': () => {
    shapeMenu.show(dropAnchor('slide-shapes'), 'Click a shape, then click or drag on the slide. Type in it once placed.', (id) => { finishTyping(); editor.setTool(`geo:${id}`); });
  },
  'slide-icons': () => {
    const b = document.querySelector<HTMLElement>('#ribbon [data-cmd="slide-icons"]:not([hidden])');
    const anchor = b && b.offsetParent ? b : document.querySelector<HTMLElement>('#ribbon .rb-tabs')!;
    shapeMenu.show(anchor, 'Click an icon, then click or drag on the slide. Change its color in the Style panel.', (id) => { finishTyping(); editor.setTool(`geo:${id}`); }, 'icons');
  },
  'design-shapes': () => { if (ws.active.mode === 'design') { lib.showTab('shapes'); lib.focusSearch(); } else flash('Shapes are in Design mode: use File > New > Design.'); },
  'design-icons': () => { if (ws.active.mode === 'design') { lib.showTab('icons'); lib.focusSearch(); } else flash('Icons are in Design, Presentation and Document modes.'); },
  // the Insert menu's Shapes and Icons, in whichever mode is showing (Documents have their own)
  'insert-shapes': () => (ws.active.mode === 'design' ? COMMANDS['design-shapes']() : ws.active.mode === 'slides' ? COMMANDS['slide-shapes']() : flash('Shapes go on slides, designs and documents.')),
  'insert-icons': () => (ws.active.mode === 'design' ? COMMANDS['design-icons']() : ws.active.mode === 'slides' ? COMMANDS['slide-icons']() : flash('Icons go on slides, designs and documents.')),
  'shape-front': () => restack('front'),
  'shape-back': () => restack('back'),
  'shape-forward': () => restack('forward'),
  'shape-backward': () => restack('backward'),
  'new-sheet': () => { finishTab(); ws.newSheet(); },
  'new-document': () => { finishTab(); ws.newDocument(); },
  'new-from-template': () => { void newFromTemplate(); },
  open: () => ws.open(),
  save: () => { finishTab(); return ws.save(focusTab()); },
  'save-as': () => { finishTab(); return ws.saveAs(focusTab()); },
  autosave: () => { finishTab(); return keeper.toggleAutoSave(focusTab()); },
  'version-history': () => { finishTab(); return keeper.historyCommand(focusTab()); },
  'recover-work': () => keeper.recoverCommand(),
  'keep-options': () => settingsWindow.open('autosave'),
  'save-workspace': () => saveWorkspace(false),
  'save-workspace-as': () => saveWorkspace(true),
  'open-workspace': () => openWorkspace(),
  'close-tab': () => { finishTab(); return ws.close(); },
  'next-tab': () => ws.cycle(1),
  'prev-tab': () => ws.cycle(-1),
  'export-mol': () => exportMolfile(),
  'batch-convert': () => { finishTab(); return batchConvert(); },
  'export-pdf': () => { finishTab(); return exportPdf(); },
  print: () => void printNow(),
  'export-picture': () => { finishTab(); return exportPicture(); },
  undo: () => undo(),
  redo: () => redo(),
  'insert-picture': () => insertPicture(),
  'import-picture': () => importPicture(),
  'import-paste': () => importPastedPicture(),
  'import-pdf': () => importPdf(),
  'insert-video': () => void insertMedia(false),
  'insert-slide-zoom': () => void insertZoom(false),
  'insert-summary-zoom': () => void insertZoom(true),
  'action-settings': () => void actionSettings(),
  'insert-action-button': () => void insertActionButton(),
  'insert-audio': () => void insertMedia(true),
  'media-playback': () => { const id = [...editor.sel.shapes].find((x) => doc.shapes.get(x)?.video); if (id === undefined) { flash('Click a video or sound first.'); return; } void editMediaShape(id); },
  'insert-table': () => { void insertTable(); },
  'insert-chart': () => { void insertChart(); },
  'edit-chart': () => { const id = [...editor.sel.shapes].find((x) => doc.shapes.get(x)?.chart); if (id === undefined) { flash('Click a chart first.'); return; } void editChartShape(id); },
  crop: () => cropPicture(),
  'picture-format': () => { void formatPicture(); },
  'text-box': () => { editor.setTool('text'); flash('Click to type, or drag across to make a text box that wraps.'); },
  'format-painter': () => formatPainter(),
  'save-format-favorite': () => void saveFavorite(),
  'format-favorites': () => favoritesMenu(),
  'insert-symbol': () => symbolWindow.open(),
  'new-slide': () => newSlide(),
  'new-canvas-slide': () => { const d = deckNow(); if (!d) { newSlide(); return; } finishTyping(); d.addCanvasSlide(); },
  'add-keyframe': () => keyframeCommands.addKeyframe(),
  'keyframe-here': () => keyframeCommands.keyframeHere(),
  'fit-keyframe': () => keyframeCommands.fitToSelection(),
  'delete-keyframe': () => keyframeCommands.remove(),
  'keyframe-title': () => void keyframeCommands.title(),
  'keyframe-zone': () => void keyframeCommands.zone(),
  'canvas-background': () => void keyframeCommands.background(),
  'canvas-heading': () => keyframeCommands.heading(),
  'keyframe-spotlight': () => keyframeCommands.spotlight(),
  'keyframe-unspot': () => keyframeCommands.unspot(),
  'keyframe-detour': () => keyframeCommands.detour(),
  'canvas-show-options': () => void keyframeCommands.showOptions(),
  'duplicate-slide': () => { const d = deckNow(); if (d) { finishTyping(); d.duplicate(pickedSlides()); } },
  'delete-slide': () => removeSlides(pickedSlides()),
  'cut-slides': () => copySlides(pickedSlides(), true),
  'copy-slides': () => copySlides(pickedSlides(), false),
  'paste-slides': () => pasteSlides(),
  'paste-slides-keep': () => pasteSlides(true),
  'hide-slide': () => hideSlides(),
  'selection-pane': () => {
    selectionPane = !selectionPane;
    showLayers();
    // the pane is in the side panel, under Style: unfolded and brought into view, as PowerPoint's opens beside the slide
    if (selectionPane && deckNow()) {
      if (sideIsFolded()) command('fold-side');
      const pane = $('#layers-section');
      if (!pane.hidden) requestAnimationFrame(() => { pane.scrollIntoView({ block: 'start' }); (pane.querySelector<HTMLElement>('[role="listbox"]') ?? pane).focus({ preventScroll: true }); });
    }
  },
  'reuse-slides': () => reuseSlides(),
  'compare-slides': () => compareSlides(),
  'insert-equation': () => insertEquation(),
  'insert-link': () => insertLink(),
  'remove-link': () => removeLinks(),
  'open-link': () => openLink(),
  'insert-bookmark': () => { flash('Bookmarks are for documents: they name a place in the text for links to go to.'); return false; },
  'edit-equation': () => { const id = [...editor.sel.shapes].find((x) => doc.shapes.get(x)?.math); if (id === undefined) { flash('Click an equation first (or double-click it).'); return; } void editEquationShape(id); },
  'next-slide': () => { const d = deckNow(); if (!d) return false; goSlide(d.index + 1); return undefined; },
  'prev-slide': () => { const d = deckNow(); if (!d) return false; goSlide(d.index - 1); return undefined; },
  'size-wide': () => setSlideSize(WIDE),
  'size-standard': () => setSlideSize(STANDARD),
  'size-custom': () => customSlideSize(),
  'edit-layouts': () => editSlideLayouts(),
  'shape-fill-menu': () => {
    const b = [...document.querySelectorAll<HTMLElement>('.ribbon [data-cmd="shape-fill-menu"]')].find((x) => x.offsetParent);
    const r = b?.getBoundingClientRect();
    showContextMenu(r ? r.left : 200, r ? r.bottom + 2 : 120, [{ cmd: 'shape-picture-fill', label: 'Picture…' }, { cmd: 'shape-no-picture-fill', label: 'No Picture' }], { run: (cmd) => void command(cmd), key: commandKey });
  },
  'section-menu': () => {
    const b = document.querySelector<HTMLElement>('#ribbon [data-cmd="section-menu"]');
    const r = b?.getBoundingClientRect();
    const d = deckNow();
    const items: MenuItem[] = d?.sections.length ? [{ cmd: 'add-section' }, null, ...sectionItems()] : [{ cmd: 'add-section' }];
    showContextMenu(r ? r.left : 200, r ? r.bottom + 2 : 120, items, { run: (cmd) => void command(cmd), key: commandKey });
  },
  'view-normal': () => setSlideView('normal'),
  'view-outline': () => setSlideView(outlineView.shown ? 'normal' : 'outline'),
  'view-notes-page': () => setSlideView(notesView.shown ? 'normal' : 'notes'),
  'notes-master': () => void editPageMaster('notes'),
  'handout-master': () => void editPageMaster('handout'),
  'view-sorter': () => setSlideView('sorter'),
  ...Object.fromEntries(['add-section', 'rename-section', 'remove-section', 'remove-section-slides', 'remove-all-sections', 'section-up', 'section-down', 'collapse-sections', 'expand-sections'].map((c) => [c, () => sectionCommand(c)])),
  'slide-master': () => slideMaster(),
  'format-background': () => backgroundDialog(),
  'slide-templates': () => slideTemplates(),
  'slide-transitions': () => animUi?.showTab('transitions'),
  'slide-animations': () => animUi?.showTab('animations'),
  'animation-pane': () => animUi?.showPane(!animUi.paneShown),
  'auto-animate-steps': () => void autoAnimateSteps(),
  'preview-slide': () => animUi?.preview(),
  'remove-animation': () => animUi?.removePicked(),
  // comments on slides (in documents, the document's own commands run first)
  'new-comment': () => { if (ws.active.mode !== 'slides' || !slideCmts) return false; finishTyping(); void slideCmts.add(); return undefined; },
  'prev-comment': () => { if (ws.active.mode !== 'slides') return false; slideCmts?.step(false); return undefined; },
  'next-comment': () => { if (ws.active.mode !== 'slides') return false; slideCmts?.step(true); return undefined; },
  'resolve-comment': () => { if (ws.active.mode !== 'slides') return false; slideCmts?.toggleResolved(); return undefined; },
  'delete-comment': () => { if (ws.active.mode !== 'slides') return false; slideCmts?.remove(); return undefined; },
  'delete-all-comments': () => { if (ws.active.mode !== 'slides') return false; slideCmts?.removeAll(); return undefined; },
  'show-comments': () => { if (ws.active.mode !== 'slides' || !slideCmts) return false; slideCmts.show(!slideCmts.shown); return undefined; },
  'drawing-style': () => settingsWindow.open('style'),
  present: () => present(false),
  'present-current': () => present(true),
  'presenter-view': () => present(false, true),
  'reading-view': () => present(true, false, { windowed: true }),
  'rehearse-timings': () => present(false, false, { rehearse: true }),
  'record-show': () => present(false, false, { rehearse: true, record: true }),
  'rehearse-here': () => present(true, false, { rehearse: true }),
  'record-show-here': () => present(true, false, { rehearse: true, record: true }),
  'clear-timings-slide': () => clearShowTimings('slide'),
  'clear-timings-all': () => clearShowTimings('all'),
  'clear-narration-slide': () => clearNarration('slide'),
  'clear-narration-all': () => clearNarration('all'),
  'set-up-show': () => void setUpShowCmd(),
  'custom-shows': () => void customShowsCmd(),
  'clear-show-menu': () => {
    const b = document.querySelector<HTMLElement>('#ribbon [data-cmd="clear-show-menu"]');
    const at = (b && b.offsetParent ? b : document.querySelector<HTMLElement>('#ribbon .rb-tabs')!).getBoundingClientRect();
    showContextMenu(at.left, at.bottom, [
      { cmd: 'rehearse-here', label: 'Rehearse from This Slide' }, { cmd: 'record-show-here', label: 'Record from This Slide…' }, null,
      { cmd: 'clear-timings-slide', label: 'Clear Timing on This Slide' }, { cmd: 'clear-timings-all', label: 'Clear Timings on All Slides' }, null,
      { cmd: 'clear-narration-slide', label: 'Clear Narration on This Slide' }, { cmd: 'clear-narration-all', label: 'Clear Narration on All Slides' },
    ], { run: (cmd) => void command(cmd), key: commandKey });
  },
  'custom-show-menu': () => {
    const b = document.querySelector<HTMLElement>('#ribbon [data-cmd="custom-show-menu"]');
    customShowMenu(b && b.offsetParent ? b : document.querySelector<HTMLElement>('#ribbon .rb-tabs')!);
  },
  'use-timings': () => {
    const d = deckNow();
    if (!d) return;
    const s = d.settings.show ?? defaultShow();
    d.setSettings({ ...d.settings, show: { ...s, manual: s.manual ? undefined : true } }, s.manual ? 'Use timings' : 'Advance manually');
    showSlideState();
  },
  'play-narrations': () => {
    const d = deckNow();
    if (!d) return;
    const s = d.settings.show ?? defaultShow();
    d.setSettings({ ...d.settings, show: { ...s, noNarration: s.noNarration ? undefined : true } }, s.noNarration ? 'Play narrations' : 'Show without narration');
    showSlideState();
  },
  'header-footer': () => void headerFooter(),
  references: () => void openReferences(),
  'manage-references': () => void openReferences(),
  'slide-references': () => void slideReferences(),
  'zotero-menu': () => zoteroSlidesMenu(),
  'zotero-cite': () => void zoteroSlides('addEditCitation'),
  'zotero-bib': () => void zoteroSlides('addEditBibliography'),
  'zotero-refresh': () => void zoteroSlides('refresh'),
  'zotero-prefs': () => void zoteroSlides('setDocPrefs'),
  'zotero-unlink': () => void zoteroSlides('removeCodes'),
  'references-slide': () => void referencesSlide(),
  'insert-reference': () => void insertReference(),
  'compound-library': () => void openCompoundLibrary(),
  'knowledge-base': () => openKnowledgeBase(),
  'ligand-library': () => openLigandLibrary(),
  'insert-compound': () => void openCompoundLibrary(),
  'add-to-compound-library': () => void addToCompoundLibrary(),
  'library-location': () => void libraryLocation(),
  'find-structure-files': () => findStructureInFiles(),
  'insert-date-time': () => void headerFooter(),
  'insert-slide-number': () => void headerFooter(),
  cut: () => cut(),
  copy: () => copy(),
  paste: () => paste(),
  'copy-smiles': () => copySmiles(),
  'copy-reaction-smiles': () => copyReaction('smiles'),
  'copy-rxn': () => copyReaction('rxn'),
  'paste-smiles': () => pasteSmiles(),
  'copy-mol': () => copyMolfile(),
  'copy-cdxml': () => copyCdxmlText(),
  'copy-svg': () => copySvgOfSelection(),
  'select-all': () => editor.selectAll(),
  delete: () => { finishTyping(); editor.deleteSelection(); },
  'next-structure': () => editor.selectNextStructure(1),
  'prev-structure': () => editor.selectNextStructure(-1),
  // arrow keys move the selection; with nothing selected they do nothing here
  'nudge-left': () => editor.nudge(-1, 0),
  'nudge-right': () => editor.nudge(1, 0),
  'nudge-up': () => editor.nudge(0, -1),
  'nudge-down': () => editor.nudge(0, 1),
  'nudge-far-left': () => editor.nudge(-10, 0),
  'nudge-far-right': () => editor.nudge(10, 0),
  'nudge-far-up': () => editor.nudge(0, -10),
  'nudge-far-down': () => editor.nudge(0, 10),
  'align-left': () => align('left'),
  'align-hcenter': () => align('hcenter'),
  'align-right': () => align('right'),
  'align-top': () => align('top'),
  'align-vcenter': () => align('vcenter'),
  'align-bottom': () => align('bottom'),
  'distribute-h': () => editor.distribute('h') || flash('Select three or more structures, captions, arrows or shapes to space them evenly.'),
  'distribute-v': () => editor.distribute('v') || flash('Select three or more structures, captions, arrows or shapes to space them evenly.'),
  'arrange-row': () => editor.arrangeGrid({ kind: 'row', gap: gridGap() }) || flash('Select two or more structures or objects to put in a row (or they already are, evenly spaced).'),
  'arrange-column': () => editor.arrangeGrid({ kind: 'column', gap: gridGap() }) || flash('Select two or more structures or objects to put in a column (or they already are, evenly spaced).'),
  'arrange-grid': () => void arrangeInGrid(),
  'flip-h': () => flipped(editor.flip('h')),
  'flip-v': () => flipped(editor.flip('v')),
  'flip-h-keep': () => flipped(editor.flip('h', true)),
  'flip-v-keep': () => flipped(editor.flip('v', true)),
  'rotate-cw': () => editor.rotateBy(90) || flash('Select something to rotate.'),
  'rotate-ccw': () => editor.rotateBy(-90) || flash('Select something to rotate.'),
  'rotate-180': () => editor.rotateBy(180) || flash('Select something to rotate.'),
  // Alt+arrows turn the selection (and must never reach the browser, where Alt+← goes back)
  'turn-ccw-1': () => { editor.rotateBy(-1); },
  'turn-cw-1': () => { editor.rotateBy(1); },
  'turn-ccw-15': () => { editor.rotateBy(-15); },
  'turn-cw-15': () => { editor.rotateBy(15); },
  'rotate-dialog': () => rotateDialog(),
  scale: () => scaleDialog(),
  'reaction-right': () => reactionStep('right'),
  'reaction-left': () => reactionStep('left'),
  'reaction-down': () => reactionStep('down'),
  'reaction-up': () => reactionStep('up'),
  join: () => editor.join() || flash('Select two atoms, or two bonds, to join them into one.'),
  'fixed-length': () => toggleOption('fixedLength'),
  'fixed-angles': () => toggleOption('fixedAngles'),
  'dev-tools': () => { showDevTools(!devTools); storeSettings(); },
  'show-stereo': () => previewStereo(!renderer.previewStereo),
  'scroll-bars': () => { showScrollBars(!scrollbars.shown); storeSettings(); },
  'collapse-ribbon': () => { ribbonChosen = !ribbonCollapsed(); setRibbonCollapsed(ribbonChosen); storeSettings(); },
  'ribbon-auto-fold': () => { ribbonAutoFold = !ribbonAutoFold; autoFoldRibbon(true); storeSettings(); },
  'tabs-in-menu': () => { placeTabs(!tabsInMenu); storeSettings(); },
  'ui-scale-in': () => sizeInterface(stepUiScale(uiScale(), 1)),
  'ui-scale-out': () => sizeInterface(stepUiScale(uiScale(), -1)),
  'ui-scale-reset': () => sizeInterface(1),
  ...Object.fromEntries(UI_SCALES.map((v) => [`ui-scale-${Math.round(v * 100)}`, () => sizeInterface(v)])),
  'title-bar-in-menu': () => { void placeTitleBar(titleBarPlace() === 'app' ? 'system' : 'app'); storeSettings(); },
  'page-setup': () => void pageSetup(),
  'text-bar-docked': () => { placeTextBar('docked'); storeSettings(); },
  'theme-system': () => { setAppTheme('system'); storeSettings(); },
  'theme-light': () => { setAppTheme('light'); storeSettings(); },
  'theme-dark': () => { setAppTheme('dark'); storeSettings(); },
  'theme-darkgray': () => { setAppTheme('darkgray'); storeSettings(); },
  'density-snug': () => { setDensity('snug'); storeSettings(); },
  'density-cozy': () => { setDensity('cozy'); storeSettings(); },
  'density-normal': () => { setDensity('normal'); storeSettings(); },
  'density-standard': () => { setDensity('standard'); storeSettings(); },
  'density-large': () => { setDensity('large'); storeSettings(); },
  'shadows-light': () => { setShadows('light'); storeSettings(); },
  'shadows-strong': () => { setShadows('strong'); storeSettings(); },
  'shadows-off': () => { setShadows('off'); storeSettings(); },
  'icons-mode': () => { setIconLook('mode'); storeSettings(); },
  'icons-kind': () => { setIconLook('kind'); storeSettings(); },
  'shape-ink-accent': () => { setShapesInk(shapeInkNow === 'accent' ? 'neutral' : 'accent'); storeSettings(); },
  'focus-view': () => setFocusView(!focusView),
  'one-column-tools': () => { setOneColumnTools(!oneColumnTools); storeSettings(); },
  'text-bar-floating': () => { placeTextBar('floating'); storeSettings(); },
  'text-bar-hidden': () => { placeTextBar('hidden'); storeSettings(); },
  'group-tips': () => { showGroupTips(!labelTips.enabled); storeSettings(); },
  'tool-tips': () => { showToolTips(!toolTip.enabled); storeSettings(); },
  'touch-mode-auto': () => { setTouchMode('auto'); storeSettings(); },
  'touch-mode-on': () => { setTouchMode('on'); storeSettings(); },
  'touch-mode-off': () => { setTouchMode('off'); storeSettings(); },
  'atom-keypad': () => {
    if (!touchOn()) { flash('The atom keypad is part of Touch Mode: View > Window and Colors > Touch Mode > On.'); return; }
    showKeypad(!keypadShowing());
    $('[data-cmd="atom-keypad"]')?.setAttribute('aria-checked', String(keypadShowing()));
  },
  'tool-sketch': () => { editor.setTool(editor.toolName === 'sketch' ? 'bond-single' : 'sketch'); },
  'pen-sketch': () => { editor.options.penSketch = !editor.options.penSketch; $('[data-cmd="pen-sketch"]')?.setAttribute('aria-checked', String(editor.options.penSketch)); storeSettings(); },
  'dark-page': () => { showDark(!dark.on); storeSettings(); },
  'dark-colours': () => settingsWindow.open('dark'),
  'zoom-in': () => editor.zoomBy(1.25),
  'zoom-out': () => editor.zoomBy(0.8),
  'zoom-fit': () => editor.fit(),
  'zoom-selection': () => { if (!editor.goToSelection()) flash('Select something first, then Go to Selection brings it into view.'); },
  navigator: () => setOrient({ ...orientPrefs, navigator: !orientPrefs.navigator }),
  'edge-arrows': () => setOrient({ ...orientPrefs, edgeArrows: !orientPrefs.edgeArrows }),
  'dot-grid': () => setOrient({ ...orientPrefs, dotGrid: !orientPrefs.dotGrid }),
  'outside-tint': () => setOrient({ ...orientPrefs, tint: !orientPrefs.tint }),
  'navigation-settings': () => settingsWindow.open('navigation'),
  'page-grid': () => setPageLook({ ...pageLook, grid: !pageLook.grid }),
  'page-grid-settings': () => settingsWindow.open('page-grid'),
  // 100%: a point on the page is a point on the screen (96 pixels to the inch)
  'zoom-actual': () => editor.zoomTo(96 / 72),
  hotkeys: () => settingsWindow.open('hotkeys'),
  'typing-spelling': () => settingsWindow.open('typing'),
  'mode-colours': () => settingsWindow.open('mode-colours'),
  'edit-palettes': () => settingsWindow.open('palettes'),
  preferences: () => settingsWindow.open('general'),
  'check-updates': () => void updates.check(),
  help: () => openHelp(),
  'user-guide': () => void guide.open(),
  'help-here': () => { const at = guideSpot(menuMode(), editor.tool.kind); void guide.open(at.page, at.anchor); },
  'send-feedback': () => feedback.open(),
  about: () => void appVersion().then((v) => ask('About Chem Illustrator', [], {
    noCancel: true,
    note: `${STAGE_NOTE} Version ${v === 'web' ? 'for the browser' : v} (${STAGE.toLowerCase()}). Free software under the GNU General Public License, version 3: `
      + 'see the license and the source on GitHub (github.com/nathanohare/Chem-Illustrator). ChemDraw is a trademark of Revvity Signals; '
      + 'Chem Illustrator is not made by or affiliated with Revvity Signals.',
  })),
  'report-problem': () => feedback.open('problem'),
  'copy-diagnostics': () => copyText(diagnosticsText(), 'Copied the diagnostics: paste them into a bug report or message.'),
  'open-log-folder': () => openLogFolder(),
  'open-inspector': () => { invoke('open_inspector').catch((e) => flash(String(e))); },
  'command-search': () => commandSearch.open(),
  assistant: () => {
    if (aiPrefs.provider === 'none') { flash('Link an AI model in Edit > Settings > AI Model to use the Assistant.', 6000, { label: 'AI Model…', run: () => void aiSettings() }); return; }
    void assistantBar.get().then((b) => b.toggle(), (e) => flash(`The Assistant could not open: ${String(e)}`));
  },
  'next-region': () => cycleRegion(1),
  'prev-region': () => cycleRegion(-1),
  'toolbox-main': () => toolboxes.toggle('main'),
  'toolbox-structure': () => toolboxes.toggle('structure'),
  'toolbox-arrange': () => toolboxes.toggle('arrange'),
  'toolbox-templates': () => toolboxes.toggle('templates'),
  'toolbox-colours': () => toolboxes.toggle('colours'),
  'toolbox-highlight': () => toolboxes.toggle('highlight'),
  'toolbox-text': () => toolboxes.toggle('text'),
  'toolbox-guides': () => toolboxes.toggle('guides'),
  'toolbox-custom': () => toolboxes.toggle('custom'),
  'toolbox-schemes': () => { contextBoxes.byHand('schemes'); },
  'toolbox-diagrams': () => { contextBoxes.byHand('diagrams'); },
  'toolbox-tables': () => { contextBoxes.byHand('tables'); },
  'toolbox-biopolymers': () => { contextBoxes.byHand('biopolymers'); },
  'toolbox-perspective': () => { contextBoxes.byHand('perspective'); },
  // the panel taken out as a toolbox folds up to its title bar; at the right it folds to a strip
  'fold-side': () => foldSide(!sideIsFolded()),
  'customize-toolbox': () => openCustomToolbox(),
  'customize-quick-bar': () => quickBar?.edit(),
  'customize-ribbon': () => ribbonEditor.open(RIBBON_OF_MODE[ws.active.mode]),
  'export-settings': () => void exportSettings(),
  'import-settings': () => void importSettingsFile(),
  'reset-toolboxes': () => { toolboxes.reset(); flash('Toolboxes reset: Drawing Tools docked at the left, the others hidden, all open and locked.', 6000); },
  'lock-toolboxes': () => { toolboxes.setLocked(!toolboxState.locked); flash(toolboxState.locked ? 'Toolboxes locked.' : 'Toolboxes unlocked: drag one by its title to an edge of the drawing to dock it, or anywhere else to float.', 6000); },
  'add-frame': () => editor.addFrame() || flash('Select what to frame: structures, text, arrows or shapes.'),
  'fill-rings': () => {
    const msg = editor.fillRings();
    flash(msg, 6000);
    // the message points at the Style panel, so it has to be showing (it starts folded on slides)
    if (ringsWereFilled(msg)) revealStylePanel();
  },
  'show-style': () => revealStylePanel(true),
  'ring-shadow': () => {
    const r = editor.ringShadow();
    flash(!r ? 'Select filled rings (or their structure) first: Fill Rings fills them.' : r === 'on' ? 'Ring fills have a drop shadow. Change its size in the Style panel.' : 'Ring fill shadows off.', 5000);
  },
  'highlight': () => editor.highlight(highlightColour, highlightStyle) ? flash('Highlighted. Change the color with Highlight in the Style panel.', 5000) : flash('Select the atoms and bonds to highlight.'),
  'remove-highlight': () => editor.highlight(undefined) || flash('Select the atoms and bonds to take the highlight off.'),
  'smooth-highlight': () => toggleHighlight('smooth', 'Round highlights smoothed: one even band, with no disc at each atom. Straight highlights are always one band.', 'Round highlights back to a disc at each atom.'),
  'centre-highlight': () => toggleHighlight('centre', 'Highlight centered between the lines of the double bonds (and inside rings drawn with their double bonds inside).', 'Highlight back on the bonds.'),
  'soft-highlight': () => toggleHighlight('soft', 'Soft edges on. Choose how much fades, and which way, under Soft edges in the Style panel.', 'Sharp edges.'),
  'shadow-highlight': () => toggleHighlight('shadow', 'Highlight shadow on. Change its color, direction and blur under Shadow in the Style panel.', 'No highlight shadow.'),
  'glow-highlight': () => toggleHighlight('glow', 'Glow on. Change its color and size under Glow in the Style panel.', 'No glow.'),
  'outline-highlight': () => toggleHighlight('outline', 'Outline only: no fill, a line around the highlight. Change the line under Outline in the Style panel.', 'Filled highlight.'),
  'highlight-look': () => void chooseHighlightLook(),
  'select-highlight': () => {
    // the highlight under the right-click, else those of the selection
    const all: Selection = { atoms: new Set(doc.atoms.keys()), bonds: new Set(doc.bonds.keys()), captions: new Set(), arrows: new Set(), shapes: new Set() };
    const parts = highlightParts(doc, all);
    const hit = parts.filter((p) => (contextBond !== null && p.sel.bonds.has(contextBond)) || [...editor.sel.atoms].some((id) => p.sel.atoms.has(id)) || [...editor.sel.bonds].some((id) => p.sel.bonds.has(id)));
    if (!hit.length) { flash('Right-click a highlight (or select part of one) first.'); return; }
    const sel: Selection = { atoms: new Set(hit.flatMap((p) => [...p.sel.atoms])), bonds: new Set(hit.flatMap((p) => [...p.sel.bonds])), captions: new Set(), arrows: new Set(), shapes: new Set() };
    if (animUi) animUi.selectHighlight(sel); else editor.selectThese(sel);
    if (ws.active.mode === 'slides') flash('Highlight selected: pick an effect in the Animations tab to animate it on its own.', 5000);
  },
  'save-highlight-look': () => void saveHighlightLook(),
  'delete-highlight-look': () => void deleteHighlightLook(),
  'clean-up': () => void cleanUpStructures(),
  'clean-up-options': () => void cleanUpChoices(),
  'clean-up-arrow': () => {
    if (!pickedCurved()) { flash('Select one or more curved (mechanism) arrows first.'); return; }
    const n = editor.cleanUpArrows();
    flash(n ? `Tidied ${n} arrow${n === 1 ? '' : 's'}.` : 'The arrows are already as tidy as they can be.');
  },
  'arrow-s-shape': () => {
    if (!pickedCurved()) { flash('Select one or more curved (mechanism) arrows first.'); return; }
    if (!editor.setArrowS(true)) flash('The selected arrows are S-shaped already.');
  },
  'arrow-single-curve': () => {
    if (!pickedCurved()) { flash('Select one or more curved (mechanism) arrows first.'); return; }
    if (!editor.setArrowS(false)) flash('The selected arrows are single curves already.');
  },
  'arrow-add-bend': () => {
    if (!pickedCurved()) { flash('Select one curved (mechanism) arrow first.'); return; }
    if (!editor.addBendHere()) flash('Right-click the arrow\'s line where the bend should go (or double-click it).');
  },
  'arrow-remove-bend': () => {
    const j = editor.pickedJoin();
    if (!j || !editor.removeBend(j.id, j.join)) flash('Right-click a round join handle on a selected arrow first (or double-click it).');
  },
  'arrow-smooth-join': () => { const j = editor.pickedJoin(); if (!j || !editor.setJoinKind(j.id, j.join, 'smooth')) flash('Right-click a round join handle on a selected arrow first.'); },
  'arrow-symmetric-join': () => { const j = editor.pickedJoin(); if (!j || !editor.setJoinKind(j.id, j.join, 'symmetric')) flash('Right-click a round join handle on a selected arrow first.'); },
  'arrow-shape-u': () => { if (!pickedCurved()) flash('Select one or more curved (mechanism) arrows first.'); else if (!editor.setArrowShape('u')) flash('The selected arrows are U-turns already.'); },
  'arrow-shape-loop': () => { if (!pickedCurved()) flash('Select one or more curved (mechanism) arrows first.'); else if (!editor.setArrowShape('loop')) flash('The selected arrows are loops already.'); },
  'arrow-reverse': () => { if (!editor.reverseArrows()) flash('Select one or more curved (mechanism) arrows first.'); },
  'arrow-smooth-path': () => { if (!pickedCurved()) flash('Select one or more curved (mechanism) arrows first.'); else if (!editor.tidyPaths('smooth')) flash('The selected arrows have no sharp corners.'); },
  'arrow-simplify-path': () => { if (!pickedCurved()) flash('Select one or more curved (mechanism) arrows first.'); else if (!editor.tidyPaths('simplify')) flash('The selected arrows can\'t be drawn with fewer bends.'); },
  'flip-arrow-bend': () => { if (!editor.flipArrowBend()) flash('Select one or more curved (mechanism) arrows first.'); },
  'homolysis-arrows': () => {
    const n = editor.sel.bonds.size;
    if (!n) flash('Select the bond that breaks first (click it with the selection tool).');
    else if (n > 4) flash('Select just the bond (or bonds) that break: click one with the selection tool, Shift+click for more.', 5000);
    else editor.addHomolysisArrows();
  },
  'draw-from-arrows': () => {
    if (!editor.options.arrowProducts) { flash('Draw Next Intermediate is turned off in Edit ▸ Settings ▸ Drawing.'); return; }
    const r = editor.drawFromArrows();
    if (r === 'many') { flash('The arrows are on more than one step: select an arrow or the structure of the step to draw.', 5000); return; }
    if (r === 'none') { flash('Draw curved (mechanism) arrows on a structure first, each from a lone pair or bond to where its electrons go.', 5000); return; }
    const errors = r.issues.filter((i) => i.level === 'error'), warnings = r.issues.filter((i) => i.level === 'warning');
    if (!r.drawn) flash(`Not drawn: ${errors[0]?.text ?? 'the arrows can\'t be read.'}${errors.length > 1 ? ` (${errors.length - 1} more: Check Arrows goes through them)` : ''}`, 9000);
    else flash(warnings.length ? `Drawn. ${warnings[0].text}` : 'Next intermediate drawn from the arrows.', warnings.length ? 7000 : 3000);
  },
  'check-arrows': () => checkArrows(),
  'attach-arrow': () => {
    const n = editor.attachArrows();
    flash(n ? `${n === 1 ? 'It follows' : `${n} things follow`} the structure now.` : 'Select curved arrows whose ends sit on atoms, bonds or lone pairs (or lone pairs and charges) first.');
  },
  'detach-arrow': () => {
    const n = editor.detachSelection();
    flash(n ? `${n === 1 ? 'It stays' : `${n} things stay`} put when the structure moves now.` : 'Nothing selected is stuck to a structure.');
  },
  'orient-like': async () => {
    const n = await orientLikeFirst();
    if (n === null) flash('Select two or more structures. Each is turned to match the first one (top left), keeping its configuration.', 6000);
    else if (n === 0) flash('Nothing to turn: the structures already match the first one, or share too little with it.');
  },
  'clean-up-reaction-orient': async () => {
    await orientLikeFirst(true);
    if (!editor.cleanUpReaction()) flash('No reaction to tidy: draw starting materials, an arrow and products (the arrow pointing from one to the other), or the scheme is already tidy.', 6000);
  },
  'clean-up-reaction': () => {
    const r = editor.cleanUpReaction();
    if (!r) flash('No reaction to tidy: draw starting materials, an arrow and products (the arrow pointing from one to the other), or the scheme is already tidy. Press it again to fit each arrow to its own text.', 6000);
    else if (r === 'fitted') flash('Each arrow fitted to its own text. Clean Up Reaction again to make them all the same length.', 4000);
  },
  'arrange-scheme': () => arrangeDialog.open(),
  'stoichiometry-table': () => void stoichiometryTable(),
  'check-balance': () => void checkStepBalance(),
  'lab-calculator': () => labCalculator(),
  'catalytic-cycle': () => void insertCycle(),
  'ts-brackets': () => { if (!editor.tsBrackets()) flash('Select the transition state first (draw it with partial bonds: P over a bond).'); },
  'energy-diagram': () => void energyDiagram(null),
  'tlc-plate': () => void plateFigure('tlc', null),
  'mo-diagram': () => void plateFigure('mo', null),
  'p-orbitals': () => void insertOrbital(true),
  orbital: () => void insertOrbital(false),
  gel: () => void plateFigure('gel', null),
  'crystal-structure': () => void plateFigure('crystal', null),
  'edit-orbital': () => void editOrbital(),
  'edit-plate': () => { const id = editor.selectedPlate(); if (id === null) flash('Select a lab figure (TLC plate, gel, MO diagram or crystal structure) first.'); else void plateFigure(null, id); },
  'insert-diagram': () => void smartDiagram(null),
  'edit-diagram': () => { const id = editor.selectedDiagram(); if (id === null) flash('Select a diagram first.'); else void smartDiagram(id); },
  'diagram-to-shapes': () => editor.ungroupSelectedDiagram() || flash('Select a diagram first.'),
  'edit-energy': () => { const id = editor.selectedEnergy(); if (id === null) flash('Select an energy diagram first.'); else void energyDiagram(id); },
  'animate-reaction': () => animateDialog.open(),
  'nmr-menu': () => nmrMenu(),
  'predict-nmr': () => nmrRibbon('predict'),
  'nmr-1h': () => nmrRibbon('1H'),
  'nmr-13c': () => nmrRibbon('13C'),
  'nmr-solvent': () => nmrSolventMenu(),
  'nmr-window': () => nmrRibbon('window'),
  'nmr-marks': () => nmrRibbon('marks'),
  'nmr-check': () => nmrRibbon('check'),
  'nmr-settings': () => (nmrHere ? settingsWindow.open('nmr') : flash('Predicted NMR spectra are in the desktop app.')),
  'animate-step': () => {
    const arrow = pickedReactionArrow();
    if (arrow === undefined) { flash('Select a reaction arrow first, or use Animate Reaction for the whole scheme.'); return; }
    animateDialog.open({ arrow });
  },
  'map-atoms': () => void mapAtomsCommand(),
  'clear-atom-map': () => void clearAtomMapCommand(),
  'map-format': () => void mapFormatCommand(),
  'number-compounds': () => void numberCompounds(),
  'scheme-settings': () => settingsWindow.open('schemes'),
  'attach-descriptors': () => void attachDescriptors(),
  'pubchem-lookup': () => void lookUpChosen(),
  'find-cas': () => void findCasChosen(),
  'attach-wavy': () => attachPointCommand('Wavy'),
  'attach-star': () => attachPointCommand('Star'),
  'attach-numbered': () => attachPointCommand('Numbered'),
  'attach-remove': () => attachPointCommand(null),
  'model-3d': () => void show3dModel(),
  'newman-projection': () => {
    const b = contextBond ?? (editor.sel.bonds.size === 1 ? [...editor.sel.bonds][0] : null);
    void newmanProjection(b, null);
  },
  'torsion-chart': () => {
    const b = contextBond ?? (editor.sel.bonds.size === 1 ? [...editor.sel.bonds][0] : null);
    void newmanProjection(b, null, undefined, true);
  },
  'edit-torsion': () => { const id = editor.selectedTorsion(); if (id === null) flash('Select a torsional energy chart first.'); else void editTorsion(id); },
  'copy-torsion-data': () => { const d = editor.selectedTorsion() !== null ? doc.shapes.get(editor.selectedTorsion()!)?.torsion : undefined; if (d) void copyText(torsionCsv(d), 'Copied the angles and energies: paste them into a spreadsheet.'); },
  'edit-newman': () => { const id = editor.selectedNewman(); if (id === null) flash('Select a Newman projection first.'); else void newmanProjection(null, null, id); },
  'unlink-newman': () => { const id = editor.selectedNewman(); if (id !== null) { editor.unlinkNewman(id); flash('Unlinked: the projection stays as it is when the structure changes.'); } },
  'turn-3d': () => void turn3dDialog(),
  'flatten-3d': () => editor.flattenSelection() || flash('Select a structure to flatten.'),
  'depth-shading': () => toggleDepthShading(),
  'depth-shading-settings': () => void depthShadingDialog(),
  'structure-to-name': () => void structureToName(),
  'add-id-label': () => void addTiedText('label'),
  'lock-structures': () => toggleStructureLock(),
  'add-caption': () => void addTiedText('caption'),
  'link-text': () => linkText() || flash('Select the text to link (and the structure to link it to; else it goes to the nearest).'),
  'unlink-text': () => unlinkText() || flash('Select linked text, or a structure with text linked to it.'),
  group: () => editor.group() || flash('Select two or more things to group: structures, text, arrows or shapes.'),
  ungroup: () => editor.ungroupSmart() || editor.ungroup() || flash('Select a group to take apart.'),
  'smart-scheme': () => { finishTyping(); editor.insertSmartScheme(pasteCentre(), deckNow()?.size); },
  'convert-smart-scheme': () => editor.convertToSmart() || flash(editor.selectedSmart() !== null ? 'That is a Smart Scheme already.' : 'Select a reaction scheme (structures and the arrows between them) to make into a Smart Scheme.'),
  'ungroup-smart-scheme': () => editor.ungroupSmart() || flash('Select a Smart Scheme first.'),
  'clean-up-cycle': () => editor.smartCleanUpCycle() || flash('Select a catalytic cycle drawn as a Smart Scheme, with three or more species in one loop.', 5000),
  'bring-front': () => restack('front'),
  'send-back': () => restack('back'),
  'save-template': () => void saveTemplate(),
  'delete-template': () => void deleteTemplate(),
  'define-nickname': () => void defineNickname(),
  'delete-nickname': () => void deleteNickname(),
  'contract-label': () => void contractLabel(),
  'expand-label': () => void expandLabel(),
  'expand-label-full': () => void expandLabel(true),
  'repeat-label': () => repeatLabel(null),
  'hapto-bond': () => flash(editor.bondMetalToRing(), 5000),
  'split-hapto': () => flash(editor.splitHaptoBonds()),
  'hapto-kekule': () => flash(editor.toggleHaptoKekule(contextBond)),
  'ring-flat': () => flash(editor.ringStep('flat')),
  'ring-chair': () => flash(editor.ringStep('chair')),
  'ring-chair-flip': () => flash(editor.ringStep('chair-flip')),
  'ring-boat': () => flash(editor.ringStep('boat')),
  'ring-flip': () => flash(editor.ringStep('flip')),
  'ring-walk-cw': () => flash(editor.ringStep('cw')),
  'ring-walk-ccw': () => flash(editor.ringStep('ccw')),
  'chain-ends': () => void toggleTerminalMethyls(),
  'methyls-ch3': () => chooseMethylStyle('CH3'),
  'methyls-me': () => chooseMethylStyle('Me'),
  'explicit-h': () => flash(editor.toggleHydrogens(), 6000),
  'periodic-table': () => { editor.setTool('element'); periodicTable.open(); },
  'aromatic-circles': () => flash(editor.toggleAromaticCircles() ?? 'No aromatic rings here: select a ring with alternating double bonds, or one drawn with a circle.', 5000),
  'show-roles': () => { editor.showRoles = !editor.showRoles; $('[data-cmd="show-roles"]')?.setAttribute('aria-checked', String(editor.showRoles)); editor.requestScene(); storeSettings(); },
  'check-structure': () => checkStructure(),
  'stereo-labels': () => toggleStereoLabels(),
  'enhanced-stereo': () => { void setStereoGroup(); },
  'chiral-flag': () => { void setChiralFlag(); },
  'rgroup-table': () => { void rGroupTable(); },
  'split-view': () => toggleSplit(),
  'repeat-group': () => { void setRepeatGroup(); },
  'name-to-structure': () => nameToStructure(),
  'sequence-to-structure': () => sequenceDialog.open(),
  'clipboard-formats': async () => {
    const names = await clipboardFormats().catch((err) => [String(err)]);
    flash(names.length ? 'On the clipboard: ' + names.join(', ') : 'The clipboard is empty.', 15000);
  },
};
for (const p of PICTURE_STYLES) COMMANDS[`picture-style-${p.id}`] = () => setPictureStyle(p.look);
// the right-click menu's Format Favorites (the first twenty)
for (let i = 0; i < 20; i++) COMMANDS[`format-favorite-${i}`] = () => { const f = favorites[i]; if (f) applyFavorite(f); };
// Developer > Stress Test (shown with View > Developer Tools)
for (const n of STRESS_SIZES) COMMANDS[`stress-${n}`] = () => { void stressTest(n); };
for (const [i, a] of ANIM_COMMANDS.entries()) {
  const e = EFFECTS[i % EFFECTS.length].id, exit = i >= EFFECTS.length;
  COMMANDS[a.cmd] = () => { if (ws.active.mode !== 'slides') return false; animUi?.applyEffect(e, exit); return true; };
  SLIDE_ONLY.add(a.cmd);
}

// The menus: click a name to open its menu; with one open, pointing at another name opens that.
// A submenu opens when pointed at, clicked or entered with the right arrow key, and sits on the
// screen beside its item (fixed, so a menu that scrolls doesn't cut it off).
const menus = [...document.querySelectorAll<HTMLDivElement>('header > .menu-wrap')].map((w) => ({
  btn: w.querySelector<HTMLButtonElement>(':scope > button')!,
  list: w.querySelector<HTMLDivElement>(':scope > .menu')!,
}));
type Menu = (typeof menus)[number];
/** The menus on the bar now (Developer only while Developer Tools are on). */
const shownMenus = () => menus.filter((m) => !(m.btn.parentElement as HTMLElement).hidden);
let openMenu: Menu | null = null;
/** The items arrow keys move through in one menu or submenu: not hidden, not greyed out. */
const menuItems = (list: HTMLElement) =>
  [...list.querySelectorAll<HTMLButtonElement>(':scope > button, :scope > .submenu > button, :scope > .recent-files > button')]
    .filter((b) => !b.hidden && !b.disabled && b.getClientRects().length > 0);
function closeSubs(inside: HTMLElement): void {
  for (const sub of inside.querySelectorAll<HTMLElement>('.menu.sub')) {
    sub.hidden = true;
    sub.parentElement!.querySelector(':scope > button')!.setAttribute('aria-expanded', 'false');
  }
}
function openSub(item: HTMLButtonElement, focus: boolean): void {
  const list = item.parentElement!.parentElement as HTMLElement;
  closeSubs(list);
  const sub = item.nextElementSibling as HTMLElement;
  sub.hidden = false;
  item.setAttribute('aria-expanded', 'true');
  const r = item.getBoundingClientRect(), w = sub.offsetWidth, h = sub.offsetHeight;
  const left = r.right + w + 4 <= innerWidth ? r.right + 2 : Math.max(4, r.left - w - 2);
  sub.style.left = `${left}px`;
  sub.style.top = `${Math.max(4, Math.min(r.top - 5, innerHeight - h - 4))}px`;
  if (focus) menuItems(sub)[0]?.focus();
}
/** Keep an open menu inside the window: one taller than the room below its button stays one
 * column and scrolls (app.css caps its height; Nate's rule: menus are never laid out in columns),
 * and one that would run past the right edge is moved left. */
function fitMenu(list: HTMLElement): void {
  list.style.removeProperty('translate');
  list.scrollTop = 0;
  const r = list.getBoundingClientRect();
  if (r.right > innerWidth - 4 || r.left < 4) list.style.translate = `${Math.max(4, innerWidth - 4 - r.width) - r.left}px 0`;
}
function showMenu(m: Menu | null, focus = true): void {
  openMenu = m;
  for (const x of menus) {
    if (x !== m) closeSubs(x.list);
    x.list.hidden = x !== m;
    x.btn.setAttribute('aria-expanded', String(x === m));
  }
  if (!m) return;
  refreshHistory();
  m.list.style.setProperty('--menu-top', `${m.btn.getBoundingClientRect().bottom}px`);
  fitMenu(m.list);
  if (focus) menuItems(m.list)[0]?.focus();
}
for (const m of menus) {
  m.btn.addEventListener('click', () => showMenu(openMenu === m ? null : m));
  // sliding along the menu bar opens each menu in turn (a mouse only: a tap's pointerenter would
  // open the menu and its click shut it again)
  m.btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && openMenu && openMenu !== m) showMenu(m, false); });
  m.list.addEventListener('scroll', () => closeSubs(m.list));
  m.list.addEventListener('pointerover', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!item || item.disabled) return;
    if (item.classList.contains('has-sub')) { if (item.getAttribute('aria-expanded') !== 'true') openSub(item, false); }
    else closeSubs(item.parentElement!.closest('.menu')!);
  });
  m.list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    if (b.classList.contains('has-sub')) { openSub(b, false); return; }
    const recent = b.dataset.recent;
    if (recent !== undefined) { showMenu(null); void openRecent(recent); return; }
    const cmd = b.dataset.cmd;
    if (!cmd) return;
    showMenu(null);
    command(cmd);
  });
  m.list.addEventListener('keydown', (e) => {
    const here = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.menu') ?? m.list;
    const items = menuItems(here);
    const now = document.activeElement as HTMLButtonElement;
    const i = items.indexOf(now);
    const bar = shownMenus();
    const j = bar.indexOf(m);
    const parentItem = here === m.list ? null : here.parentElement!.querySelector<HTMLButtonElement>(':scope > button');
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (parentItem) { closeSubs(parentItem.parentElement!.parentElement as HTMLElement); parentItem.focus(); }
      else { showMenu(null); m.btn.focus(); }
    }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'ArrowRight' && now.classList.contains('has-sub')) { e.preventDefault(); openSub(now, true); }
    else if (e.key === 'ArrowLeft' && parentItem) {
      e.preventDefault();
      closeSubs(parentItem.parentElement!.parentElement as HTMLElement);
      parentItem.focus();
    }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      showMenu(bar[(j + (e.key === 'ArrowRight' ? 1 : -1) + bar.length) % bar.length]);
    }
  });
}
addEventListener('resize', () => { if (openMenu) showMenu(null); });

// ---------------------------------------------------------------- the keyboard round the window

// F10, or Alt pressed and let go on its own, goes to the menu bar (and back); there the arrow
// keys move along it and Down opens a menu. Alt with a menu's underlined letter opens that menu,
// as in Office. Ctrl+F6 moves on round the window's parts (the keys can be changed).
const MNEMONICS = new Map<string, Menu>();
for (const m of menus) {
  const letter = m.btn.getAttribute('aria-keyshortcuts')?.match(/^Alt\+(\w)$/)?.[1];
  if (letter) MNEMONICS.set(letter.toUpperCase(), m);
  m.btn.addEventListener('keydown', (e) => {
    const bar = shownMenus();
    const j = bar.indexOf(m);
    const go = (k: number) => { e.preventDefault(); const n = bar[(k + bar.length) % bar.length]; if (openMenu) showMenu(n); else n.btn.focus(); };
    if (e.key === 'ArrowRight') go(j + 1);
    else if (e.key === 'ArrowLeft') go(j - 1);
    else if (e.key === 'ArrowDown') { e.preventDefault(); showMenu(m); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(bar.length - 1);
    else if (e.key === 'Escape' && !openMenu) { e.preventDefault(); leaveMenuBar(); }
  });
}
/** Where the keys were before going to the menu bar, to go back to. */
let beforeMenus: HTMLElement | null = null;
function enterMenuBar(): void {
  const a = document.activeElement as HTMLElement | null;
  if (!a?.closest('header')) beforeMenus = a;
  menus[0].btn.focus();
}
function leaveMenuBar(): void {
  showMenu(null);
  document.body.classList.remove('show-mnemonics');
  if (beforeMenus?.isConnected && beforeMenus !== document.body) beforeMenus.focus();
  else focusWork();
  beforeMenus = null;
}
const inMenuBar = () => !!(document.activeElement as HTMLElement | null)?.closest('header > .menu-wrap');

/** The keys to the drawing, sheet or document showing. */
function focusWork(): void {
  if (sheetActive()) sheetMode.focus();
  else if (docActive()) docMode.focus();
  else $('#overlay').focus();
}

/**
 * The parts of the window that Ctrl+F6 goes round, in order: each finds what takes the keys in
 * it (null when that part isn't showing).
 */
const REGIONS: { inside: string; first: () => HTMLElement | null }[] = [
  { inside: 'header', first: () => menus[0].btn },
  { inside: '#tabs', first: () => $('#tabs').querySelector<HTMLElement>('[aria-selected="true"]') ?? $('#tabs').querySelector<HTMLElement>('[role="tab"], button') },
  { inside: '.ribbon', first: () => [...document.querySelectorAll<HTMLElement>('.ribbon')].find(onScreenEl)?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"], button:not([disabled])') ?? null },
  { inside: '#tools', first: () => onScreenEl($('#tools')) ? $('#tools').querySelector<HTMLElement>('button.tool.active') ?? $('#tools').querySelector<HTMLElement>('button.tool') : null },
  { inside: '#work', first: () => { focusWork(); return document.activeElement as HTMLElement; } },
  { inside: '#side-content', first: () => onScreenEl($('#side-content')) ? [...$('#side-content').querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex="0"]')].find(onScreenEl) ?? null : null },
];
function onScreenEl(el: Element): boolean { return el.getClientRects().length > 0; }

/** Move the keys to the next (or previous) part of the window. */
function cycleRegion(step: 1 | -1): void {
  showMenu(null);
  const a = document.activeElement as HTMLElement | null;
  let at = a ? REGIONS.findIndex((r) => a.closest(r.inside)) : -1;
  if (at < 0) at = step > 0 ? -1 : REGIONS.length;
  for (let k = 1; k <= REGIONS.length; k++) {
    const r = REGIONS[(at + step * k + REGIONS.length * 2) % REGIONS.length];
    const el = r.first();
    if (!el || !onScreenEl(el)) continue;
    if (document.activeElement !== el) el.focus();
    if (document.activeElement === el || el.contains(document.activeElement)) return;
  }
}

let altAlone = false;
/** A mouse button or pen is down: Alt then frees a bond's or an arrow's angle, so letting it go doesn't open the menus. */
let pointerHeld = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'Alt') { altAlone = !e.repeat && !e.ctrlKey && !e.metaKey && !e.shiftKey && !pointerHeld; if (altAlone) document.body.classList.add('show-mnemonics'); return; }
  altAlone = false;
  // Ctrl+F6 works from anywhere, a text box too
  const chord = chordOf(e);
  const step = chord && !(e.target as HTMLElement | null)?.closest?.('dialog')
    ? keymap.keysFor('command', 'command next-region').includes(chord) ? 1 : keymap.keysFor('command', 'command prev-region').includes(chord) ? -1 : 0 : 0;
  if (step) { e.preventDefault(); e.stopImmediatePropagation(); cycleRegion(step); return; }
  // Escape shuts an open menu wherever the keys are (one with every item greyed out never takes them)
  if (e.key === 'Escape' && openMenu && !openMenu.list.contains(e.target as Node | null)) {
    e.preventDefault(); e.stopImmediatePropagation();
    showMenu(null);
    return;
  }
  if (isTyping(e.target) || (e.target as HTMLElement | null)?.closest?.('dialog')) return;
  if (e.key === 'F10' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
    e.preventDefault();
    if (inMenuBar() || openMenu) leaveMenuBar();
    else { document.body.classList.add('show-mnemonics'); enterMenuBar(); }
    return;
  }
  // Alt and a menu's letter (by the key's place, so it works whatever the keyboard writes)
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^Key[A-Z]$/.test(e.code)) {
    const m = MNEMONICS.get(e.code.slice(3));
    if (m) { e.preventDefault(); e.stopImmediatePropagation(); if (!inMenuBar()) beforeMenus = document.activeElement as HTMLElement | null; showMenu(m); }
  }
}, true);
window.addEventListener('keyup', (e) => {
  if (e.key !== 'Alt') return;
  const alone = altAlone;
  altAlone = false;
  if (!alone || pointerHeld) { if (!inMenuBar()) document.body.classList.remove('show-mnemonics'); return; }
  if (isTyping(e.target) || (e.target as HTMLElement | null)?.closest?.('dialog')) { document.body.classList.remove('show-mnemonics'); return; }
  e.preventDefault();
  if (inMenuBar() || openMenu) leaveMenuBar();
  else enterMenuBar();
});
window.addEventListener('pointerdown', () => { altAlone = false; pointerHeld = true; }, true);
for (const type of ['pointerup', 'pointercancel'] as const) window.addEventListener(type, () => { pointerHeld = false; }, true);
window.addEventListener('blur', () => { altAlone = false; pointerHeld = false; document.body.classList.remove('show-mnemonics'); });
document.addEventListener('focusin', () => { if (!inMenuBar() && !openMenu) document.body.classList.remove('show-mnemonics'); });

/** The mode the menus serve: drawing a structure for a cell or a document counts as Drawing. */
function menuMode(): string { return drawingOnTop() ? 'drawing' : ws.active.mode; }

/**
 * Every mode has the same menus; an item that only works in some modes (data-modes, or the
 * data-item-modes of its menu) is greyed out in the others, so the menus never change shape.
 */
function tickMenuModes(): void {
  const mode = menuMode();
  // what belongs to another mode is left out of the menus (marked, so what is hidden for other reasons stays hidden)
  for (const el of document.querySelectorAll<HTMLElement>('header .menu > button, header .menu > .submenu, header .menu.sub > button')) {
    const modes = el.dataset.modes ?? el.closest<HTMLElement>('[data-item-modes]')?.dataset.itemModes;
    if (!modes) continue;
    const on = modes.split(' ').includes(mode);
    const b = el instanceof HTMLButtonElement ? el : el.querySelector<HTMLButtonElement>(':scope > button');
    if (b) b.disabled = false;
    if (on && el.dataset.modeHid) { el.hidden = false; delete el.dataset.modeHid; }
    else if (!on && !el.hidden) { el.hidden = true; el.dataset.modeHid = '1'; }
  }
  for (const menu of document.querySelectorAll<HTMLElement>('header .menu')) {
    const items = [...menu.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.tagName !== 'HR');
    // a menu with nothing for this mode (Chemistry beside a sheet) shows its commands greyed out, so it is never empty
    if (items.length && items.every((c) => c.hidden)) {
      for (const c of items) if (c.dataset.modeHid) {
        c.hidden = false;
        delete c.dataset.modeHid;
        const b = c instanceof HTMLButtonElement ? c : c.querySelector<HTMLButtonElement>(':scope > button');
        if (b) b.disabled = true;
      }
    }
    // no divider at the top or bottom, or two together, once items are left out
    let seen = false, last: HTMLElement | null = null;
    for (const c of menu.children) {
      if (!(c instanceof HTMLElement)) continue;
      if (c.tagName === 'HR') {
        if (c.dataset.modeHid) { c.hidden = false; delete c.dataset.modeHid; }
        if (!seen || last?.tagName === 'HR') { c.hidden = true; c.dataset.modeHid = '1'; } else last = c;
        continue;
      }
      if (!c.hidden) { seen = true; last = c; }
    }
    if (last?.tagName === 'HR') { last.hidden = true; last.dataset.modeHid = '1'; }
  }
  quickBar?.refresh();
}
tickMenuModes();
// (in the capture phase: the drawing takes a finger's press for itself, so it never bubbles up)
document.addEventListener('pointerdown', (e) => {
  if (openMenu && !(e.target as HTMLElement).closest('.menu-wrap')) showMenu(null);
}, true);
// listing the clipboard's formats needs the Windows app
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-cmd="clipboard-formats"]')) b.hidden = !nativeClipboard;

// Keys for menu commands come through the drawing's key handler (from the key map); these are
// the special cases where the key should do its usual job instead.
editor.runCommand = (name) => {
  // with text on the page selected, Ctrl+C and Ctrl+X copy that text
  if ((name === 'copy' || name === 'cut') && textSelected()) return false;
  // in a browser, Ctrl+V goes on to the paste event, which can read the clipboard
  if (name === 'paste' && !nativeClipboard) return false;
  return command(name);
};

// ---------------------------------------------------------------- split view

// A drawing beside a document, sheet or slides (View > Split View). Beside a document or sheet
// both sides are live: the drawing is in the app's document (they don't use it) and whichever
// side was clicked last has the keys and menus. Slides use the drawing area themselves, so beside
// slides the side not being worked on shows as a picture, and clicking it swaps the two over.

const splitPane = $<HTMLDivElement>('#split-pane');
const splitBody = $<HTMLDivElement>('#split-body');
const splitPick = $<HTMLSelectElement>('#split-pick');
const splitSnap = $<HTMLCanvasElement>('#split-snap');
const mainSnap = $<HTMLDivElement>('#main-snap');
const workEl = $<HTMLElement>('#work');

/** The document, sheet or slides in split view and the drawing beside it; null without a split. */
function splitState(): { main: Tab; drawing: Tab } | null {
  if (slideSplit && ws.tabs.includes(slideSplit) && ws.active === slideSplit.partner) return { main: slideSplit, drawing: ws.active };
  const t = ws.active;
  return t.mode !== 'drawing' && t.partner && ws.tabs.includes(t.partner) ? { main: t, drawing: t.partner } : null;
}

/** The tab Save saves: the drawing beside a document or sheet when it has the keys. */
function focusTab(): Tab {
  return splitDrawing && ws.pane && !cellEdit ? ws.pane : ws.active;
}

function applySplitWidth(): void {
  workEl.style.setProperty('--split-w', `${Math.round(splitWidth * 1000) / 10}vw`);
}

/** Put the drawing area, the pictures and the marks where the split (or no split) needs them. */
function layoutSplit(): void {
  const st = splitState();
  if (!st) slideSplit = null;
  const live = !!st && (!!ws.pane || ws.active === st.drawing);
  const drawingSide = !!st && (ws.active === st.drawing || (!!ws.pane && splitDrawing));
  splitPane.hidden = !st;
  document.body.classList.toggle('split-view', !!st);
  document.body.classList.toggle('split-live', live);
  document.body.classList.toggle('split-drawing', drawingSide && !cellEdit);
  // the drawing area sits beside, except while a figure or cell structure is drawn (it floats over the pages then)
  const want = live && !cellEdit ? splitBody : workEl;
  if (host.parentElement !== want) {
    if (want === workEl) workEl.insertBefore(host, mainSnap);
    else splitBody.prepend(host);
  }
  mainSnap.hidden = !st || ws.active !== st.drawing;
  splitSnap.hidden = live;
  if (ws.pane) editor.paused = !splitDrawing && !cellEdit;
  $('[data-cmd="split-view"]')?.setAttribute('aria-checked', String(!!st));
  if (!st) { $('#split-empty').hidden = true; return; }
  const opts = ws.tabs.filter((t) => t.mode === 'drawing').map((t) => new Option(t.name.replace(/\.(cdxml|cdx|cds)$/i, ''), String(t.id), false, t === st.drawing));
  opts.push(new Option('New canvas', 'new'));
  splitPick.replaceChildren(...opts);
  $('#split-insert').textContent = st.main.mode === 'document' ? 'Insert into Document' : st.main.mode === 'sheet' ? 'Insert into Cell' : st.main.mode === 'design' ? 'Insert into Design' : 'Insert into Slide';
  // while a figure's or cell's structure is drawn, Done puts that in; the drawing beside waits
  $<HTMLButtonElement>('#split-insert').disabled = !!cellEdit;
  if (live) $('#split-empty').hidden = true;
  else drawSplitSnap(st.drawing);
}

/** Beside slides: the drawing as a picture, fitted to its side, while the slide is worked on. */
function drawSplitSnap(t: Tab): void {
  const r = splitBody.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  const dpr = window.devicePixelRatio || 1;
  splitSnap.width = Math.round(r.width * dpr);
  splitSnap.height = Math.round(r.height * dpr);
  splitSnap.style.width = `${r.width}px`;
  splitSnap.style.height = `${r.height}px`;
  const ctx = splitSnap.getContext('2d')!;
  ctx.clearRect(0, 0, splitSnap.width, splitSnap.height);
  const d = ws.docOf(t);
  const pic = isEmpty(d) ? null : recordPicture(d, 4);
  $('#split-empty').hidden = !!pic;
  if (!pic) return;
  const pw = pic.box.x2 - pic.box.x1, ph = pic.box.y2 - pic.box.y1;
  const k = Math.min((r.width * 0.9) / pw, (r.height * 0.9) / ph, 2) * dpr;
  const src = pictureCanvas(d, pic, Math.min(300, 72 * k)).canvas;
  const w = pw * k, h = ph * k;
  ctx.drawImage(src, (splitSnap.width - w) / 2, (splitSnap.height - h) / 2, w, h);
}
new ResizeObserver(() => {
  const st = splitState();
  if (st && !splitSnap.hidden) drawSplitSnap(st.drawing);
}).observe(splitBody);

/** After the drawing beside a document or sheet changes: show it, at the zoom it had. */
function paneEntered(fit = false): void {
  layoutSplit();
  showSheetParts();
  resize();
  const p = ws.pane;
  if (p?.view && !fit) renderer.view = { ...p.view };
  else if (p) fitSplitDrawing();
  renderer.repaintAll();
  editor.clearSelection();
  editor.frame(true);
  refreshKeys();
  analysisKey = '';
  scheduleAnalysis(true);
}

/** A drawing fitted to its side of a split, but no bigger than twice actual size (a lone ring would fill it). */
function fitSplitDrawing(): void {
  editor.fit();
  const most = 2 * 96 / 72;
  if (renderer.view.scale > most) editor.zoomTo(most);
}

/** Beside a document or sheet: give the keys and menus to the drawing (true) or the pages or cells. */
function setSplitSide(drawing: boolean): void {
  if (!ws.pane || cellEdit || splitDrawing === drawing) return;
  if (!drawing) editor.closeCaption();
  splitDrawing = drawing;
  layoutSplit();
  showSheetParts();
  refreshKeys();
  analysisKey = '';
  scheduleAnalysis(true);
  if (drawing) editor.onToolChange(editor.toolName);
  else setHint(ws.active.mode === 'sheet' ? SHEET_HINT : DOC_HINT);
}

/** Beside slides: work on the drawing (true; the slide becomes a picture) or on the slide. */
function focusSlideDrawing(on: boolean): void {
  const st = splitState();
  if (!st || !st.main.deck) return;
  if (on === (ws.active === st.drawing)) return;
  if (on) {
    // the slide as it looks now, kept as a picture on its side
    const c = mainSnap.querySelector('canvas')!;
    c.width = scene.width;
    c.height = scene.height;
    c.style.width = scene.style.width || `${scene.clientWidth}px`;
    c.style.height = scene.style.height || `${scene.clientHeight}px`;
    c.getContext('2d')!.drawImage(scene, 0, 0);
    slideSplit = st.main;
    ws.activate(st.drawing);
  } else {
    slideSplit = null;
    ws.activate(st.main);
  }
}

/** View > Split View: a drawing beside the document, sheet or slides showing, or no split. */
function toggleSplit(): void {
  if (splitState()) { closeSplit(); return; }
  const t = ws.active;
  if (t.mode === 'drawing') {
    flash('Split view puts a canvas beside a document, spreadsheet, presentation or design: show one of those (or start one with the + tabs) and choose View > Split View there.', 8000);
    return;
  }
  finishTyping();
  const drawing = ws.tabs.find((x) => x.mode === 'drawing') ?? ws.addDrawing();
  // fitted to its side the first time it shows there
  drawing.view = null;
  ws.setPartner(drawing);
  splitDrawing = false;
  if (ws.pane) paneEntered(true);
  else layoutSplit();
  mainResized();
  flash(`${drawing.name} is beside the ${t.mode === 'document' ? 'document' : t.mode === 'sheet' ? 'sheet' : t.mode === 'design' ? 'design' : 'slides'}. Click a side to work on it; the bar above the drawing picks another drawing and puts structures in.`, 7000);
}

function closeSplit(): void {
  const st = splitState();
  if (!st) return;
  if (ws.active === st.drawing) focusSlideDrawing(false);
  finishTyping();
  if (ws.pane) ws.pane.view = { ...renderer.view };
  editor.clearSelection();
  ws.setPartner(null);
  splitDrawing = false;
  layoutSplit();
  const sheet = ws.active.mode === 'sheet', words = ws.active.mode === 'document';
  editor.paused = sheet || words;
  showSheetParts();
  refreshKeys();
  analysisKey = '';
  scheduleAnalysis(true);
  if (sheet) { setHint(SHEET_HINT); sheetMode?.focus(); }
  if (words) { setHint(DOC_HINT); docMode?.focus(); }
  resize();
  renderer.repaintAll();
  mainResized();
}

/** The document or slide got narrower or wider: fit the page or slide to its new width. */
function mainResized(): void {
  requestAnimationFrame(() => {
    if (ws.active.mode === 'document') docMode?.refit();
    if (ws.active.mode === 'slides') { resize(); editor.fit(); }
  });
}

/** The bar's drawing list: show another open drawing, or a new one. */
splitPick.addEventListener('change', () => {
  const st = splitState();
  if (!st) return;
  finishTyping();
  const t = splitPick.value === 'new' ? ws.addDrawing() : ws.tabs.find((x) => String(x.id) === splitPick.value);
  if (!t || t === st.drawing) return;
  if (ws.active === st.drawing) {
    // beside slides, with the drawing being worked on: the other drawing comes up in its place
    st.main.partner = t;
    slideSplit = st.main;
    t.view = null;
    ws.activate(t);
    return;
  }
  if (ws.pane) ws.pane.view = { ...renderer.view };
  editor.clearSelection();
  t.view = null;
  ws.setPartner(t);
  if (ws.pane) paneEntered(true);
  else layoutSplit();
});

/** The bar's Insert: the selected structures (or the whole drawing) into the document, cell or slide. */
$('#split-insert').addEventListener('click', () => {
  const st = splitState();
  if (!st || cellEdit) return;
  editor.closeCaption();
  const live = !!ws.pane || ws.active === st.drawing;
  const part = extractDrawing(ws.docOf(st.drawing), live && editor.hasSelection() ? editor.sel : null);
  if (isEmpty(part)) { flash('Draw something first.'); return; }
  if (st.main.mode === 'document') {
    setSplitSide(false);
    docMode?.insertDrawing(part.contents());
  } else if (st.main.mode === 'sheet') {
    setSplitSide(false);
    sheetMode?.putStructure(part.contents());
  } else {
    focusSlideDrawing(false);
    const deck = deckNow();
    fitPasted(part, doc.style, deck?.master.fitPasted ? deck.master.drawing.bondLength : undefined);
    doc.edit('Insert structure', () => {
      editor.sel = insertDrawing(doc, part, pasteCentre(), 'Insert structure');
      editor.placeClear(placingPage());
    });
    editor.changed();
  }
});

$('#split-close').addEventListener('click', () => closeSplit());

// clicking a side gives it the keys and menus
splitBody.addEventListener('pointerdown', (e) => {
  const st = splitState();
  if (!st) return;
  if (ws.pane) { setSplitSide(true); return; }
  if (ws.active !== st.drawing) {
    e.preventDefault();
    e.stopPropagation();
    focusSlideDrawing(true);
    overlay.focus();
  }
}, true);
for (const sel of ['#doc-pane', '#sheet-pane', '#doc-ribbon', '#sheet-ribbon']) {
  $(sel).addEventListener('pointerdown', () => { if (ws.pane && splitDrawing) setSplitSide(false); }, true);
}
mainSnap.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  focusSlideDrawing(false);
});
$('#split-handle').addEventListener('pointerdown', (e) => {
  const h = e.currentTarget as HTMLElement;
  h.setPointerCapture(e.pointerId);
  h.classList.add('dragging');
  const right = workEl.getBoundingClientRect().right;
  const move = (ev: PointerEvent) => {
    splitWidth = Math.min(0.8, Math.max(0.2, (right - ev.clientX) / window.innerWidth));
    applySplitWidth();
  };
  const up = () => {
    h.classList.remove('dragging');
    h.removeEventListener('pointermove', move);
    h.removeEventListener('pointerup', up);
    storeSettings();
    mainResized();
  };
  h.addEventListener('pointermove', move);
  h.addEventListener('pointerup', up);
  e.preventDefault();
});
applySplitWidth();

// ---------------------------------------------------------------- Slides: the slide list's width and the speaker notes (drag their edges)

const slidePanes = { width: 212, notes: true, notesH: 84 };
/** The slide list's pictures fill its width, less the slide numbers and the scroll bar. */
const thumbFor = (w: number) => Math.max(60, w - 44);

function applySlidePanes(): void {
  workEl.style.setProperty('--slide-pane-w', `${slidePanes.width}px`);
  workEl.style.setProperty('--notes-h', `${slidePanes.notesH}px`);
  $('#notes-pane').classList.toggle('notes-off', !slidePanes.notes);
  for (const b of document.querySelectorAll<HTMLElement>('[data-cmd="view-notes"]')) {
    b.setAttribute(b.getAttribute('role') === 'menuitemcheckbox' ? 'aria-checked' : 'aria-pressed', String(slidePanes.notes));
  }
  if (slideList.thumbW !== thumbFor(slidePanes.width)) slideList.setThumbW(thumbFor(slidePanes.width), true);
}

/** Drag a pane's edge: `at` turns the pointer's place into the new size; the size is kept in settings when you let go. */
function dragEdge(h: HTMLElement, at: (ev: PointerEvent) => void, done: () => void): void {
  h.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    h.setPointerCapture(e.pointerId);
    h.classList.add('dragging');
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      h.classList.remove('dragging');
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      done();
      storeSettings();
      mainResized();
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
    e.preventDefault();
  });
}
const listHandle = $<HTMLElement>('#slide-list-handle');
dragEdge(listHandle, (ev) => {
  const left = $('#slide-list').getBoundingClientRect().left;
  slidePanes.width = Math.round(Math.min(SLIDE_PANE_MAX, Math.max(SLIDE_PANE_MIN, ev.clientX - left)));
  workEl.style.setProperty('--slide-pane-w', `${slidePanes.width}px`);
  slideList.setThumbW(thumbFor(slidePanes.width));
}, () => slideList.setThumbW(thumbFor(slidePanes.width), true));
listHandle.addEventListener('dblclick', () => { slidePanes.width = 212; applySlidePanes(); storeSettings(); });
const notesHandle = $<HTMLElement>('#notes-handle');
dragEdge(notesHandle, (ev) => {
  const bottom = $('#notes-pane').getBoundingClientRect().bottom;
  const most = Math.min(NOTES_MAX, Math.round(workEl.getBoundingClientRect().height * 0.6));
  slidePanes.notesH = Math.round(Math.min(most, Math.max(NOTES_MIN, bottom - ev.clientY)));
  workEl.style.setProperty('--notes-h', `${slidePanes.notesH}px`);
}, () => undefined);
notesHandle.addEventListener('dblclick', () => { slidePanes.notesH = 84; applySlidePanes(); storeSettings(); });

// ---------------------------------------------------------------- settings and the Hotkeys window

/** The colour Chemistry > Highlight and Fill > Highlight uses: the one last chosen in the Style panel (a soft yellow at first). */
let highlightColour = '#ffe680';
/** The look new highlights take: the one last chosen in the Style panel. */
let highlightStyle: HighlightStyle | undefined;
/** Your own saved highlight looks (the ready-made ones are BUILT_IN_LOOKS). */
let ownLooks: HighlightLookPreset[] = [];

/** Turn a highlight setting on or off for the selected highlights; new highlights take the same look. */
function toggleHighlight(key: HighlightToggle, on: string, off: string): void {
  const r = editor.toggleHighlight(key);
  if (!r) { flash('Select highlighted atoms and bonds first.'); return; }
  const sel = [...editor.sel.atoms].map((id) => doc.atoms.get(id)?.hl).concat([...editor.sel.bonds].map((id) => doc.bonds.get(id)?.hl));
  highlightStyle = tidyStyle({ ...highlightStyle, ...(sel.find(Boolean) ?? {}) });
  flash(r === 'on' ? on : off, 6000);
}

/** Every highlight look: the ready-made ones, then your own. */
const allLooks = (): HighlightLookPreset[] => [...BUILT_IN_LOOKS, ...ownLooks];

/** Give the selection a look (the selected highlights keep their colour unless the look has its own). */
function applyHighlightLook(look: HighlightLookPreset): void {
  // nothing highlighted in the selection yet: highlight it in the last colour used
  const any = [...editor.sel.atoms].some((id) => doc.atoms.get(id)?.highlight) || [...editor.sel.bonds].some((id) => doc.bonds.get(id)?.highlight);
  if (!editor.highlightLook(look.colour ?? (any ? undefined : highlightColour), look.style)) { flash('Select the atoms and bonds to give the look to.'); return; }
  highlightStyle = tidyStyle(look.style);
  if (look.colour) highlightColour = look.colour;
}

/** Chemistry > Highlight and Fill > Highlight Look…: pick a look for the selection. */
async function chooseHighlightLook(): Promise<void> {
  const looks = allLooks();
  const got = await ask('Highlight look', [
    { name: 'look', label: 'Look', value: '0', options: looks.map((l, i) => ({ value: String(i), label: i >= BUILT_IN_LOOKS.length ? `${l.name} (yours)` : l.name })) },
  ], { ok: 'Use', note: 'The ready-made looks keep the highlight\'s color; your own looks have their color too. Save the look of a highlight you have set up with Chemistry > Highlight and Fill > Save Highlight Style.' });
  const look = got && looks[Number(got.look)];
  if (look) applyHighlightLook(look);
}

/** The colour and look of the first highlighted atom or bond selected. */
function selectedHighlight(): { colour: string; style: HighlightStyle } | null {
  for (const id of editor.sel.bonds) { const b = doc.bonds.get(id); if (b?.highlight) return { colour: b.highlight, style: b.hl ?? {} }; }
  for (const id of editor.sel.atoms) { const a = doc.atoms.get(id); if (a?.highlight) return { colour: a.highlight, style: a.hl ?? {} }; }
  return null;
}

/** Chemistry > Highlight and Fill > Save Highlight Look…: keep the selected highlight's look under a name. */
async function saveHighlightLook(): Promise<void> {
  const h = selectedHighlight();
  if (!h) { flash('Select a highlight that looks the way you want first.'); return; }
  const got = await ask('Save highlight style', [
    { name: 'name', label: 'Name', value: '', placeholder: 'for example Reacting bonds' },
    { name: 'colour', label: 'Keep its color too', value: 'true', type: 'checkbox' },
  ], { ok: 'Save', note: 'It is offered in Chemistry > Highlight and Fill > Highlight Style, in the Style panel and in the Highlight toolbox, in every drawing.' });
  const name = got?.name.trim();
  if (!got || !name) return;
  const look: HighlightLookPreset = { name, ...(got.colour === 'true' ? { colour: h.colour } : {}), style: tidyStyle(h.style) ?? {} };
  ownLooks = [...ownLooks.filter((l) => l.name !== name), look];
  storeSettings();
  looksChanged();
  flash(`Saved the look “${name}”.`);
}

/** Chemistry > Highlight and Fill > Delete Highlight Look…: forget one of your own looks. */
async function deleteHighlightLook(): Promise<void> {
  if (!ownLooks.length) { flash('You have no saved highlight styles yet (Chemistry > Highlight and Fill > Save Highlight Style).'); return; }
  const got = await ask('Delete highlight style', [{ name: 'look', label: 'Look', value: ownLooks[0].name, options: ownLooks.map((l) => ({ value: l.name, label: l.name })) }], { ok: 'Delete' });
  if (!got) return;
  ownLooks = ownLooks.filter((l) => l.name !== got.look);
  storeSettings();
  looksChanged();
}

/** Show the saved looks again wherever they are offered. */
function looksChanged(): void {
  if (toolboxState.places.highlight?.shown || toolboxState.places.colours?.shown) toolboxes.render();
  stylePanel.refresh(true);
}

/** Tick the chosen way of writing terminal methyls in the Chemistry menu. */
function tickMethylStyle(): void {
  $('[data-cmd="methyls-ch3"]')?.setAttribute('aria-checked', String(editor.options.methylStyle === 'CH3'));
  $('[data-cmd="methyls-me"]')?.setAttribute('aria-checked', String(editor.options.methylStyle === 'Me'));
}

/** Write terminal methyls as CH3 or Me from now on; the ones already shown in the selection (or the drawing) change too. */
function chooseMethylStyle(style: MethylStyle): void {
  const n = editor.setMethylStyle(style);
  tickMethylStyle();
  storeSettings();
  const how = style === 'Me' ? 'Me' : 'CH₃';
  flash(n ? `${n} terminal methyl${n > 1 ? 's' : ''} now written ${how}.` : `Show Terminal Methyls will write them as ${how}.`, 5000);
}

/** Ask before a command with nothing selected changes every structure on the page (Edit > Settings). */
let askWholeDrawing = true;
/** Where linked text goes (Edit > Settings). */
let linkSide: Settings['linkSide'] = 'keep';

/**
 * Show Terminal Methyls: on the selection, or with nothing selected on every structure, after
 * asking when there are several (some may be meant one way and some the other).
 */
async function toggleTerminalMethyls(): Promise<void> {
  const doc = editor.doc;
  if (!editor.sel.atoms.size && askWholeDrawing && doc.fragments().length > 1) {
    const r = await ask('Every structure on the page?', [
      { name: 'again', label: 'Don\u2019t ask again (Edit > Settings)', type: 'checkbox', value: 'false' },
    ], { ok: 'Change every structure', note: 'Nothing is selected, so this shows or hides the terminal methyls on every structure on the page. To change only some, cancel and select them first.' });
    if (!r) return;
    if (r.again === 'true') { askWholeDrawing = false; storeSettings(); }
  }
  flash(editor.toggleChainEnds(), 5000);
}

/** Axial chirality as P/M instead of Ra/Sa: every label shown changes. */
function showHelicity(on: boolean): void {
  if (axialStyle.helicity === on) return;
  axialStyle.helicity = on;
  editor.requestScene();
}

// File > Recent (desktop app): files and workspaces opened or saved lately
let recentFiles: string[] = [];
/** Characters typed from Insert > Symbol lately, newest first (saved in the settings). */
let recentSymbols: string[] = [];
function rememberFile(path: string): void {
  recentFiles = addRecent(recentFiles, path);
  renderRecent();
  storeSettings();
  if (canKeepHandles()) void forgetHandles(recentFiles).catch(() => {});
}
function renderRecent(): void {
  const box = document.querySelector<HTMLElement>('#recent-files');
  if (!box) return;
  const items = recentFiles.map((p) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.dataset.recent = p;
    const { name, folder } = recentLabel(p);
    b.title = isHandleEntry(p) ? `${name} (kept by this browser)` : p;
    const n = document.createElement('span');
    n.textContent = name;
    const f = document.createElement('small');
    f.className = 'muted';
    f.textContent = folder;
    b.append(n, f);
    return b;
  });
  const clear = document.createElement('button');
  clear.setAttribute('role', 'menuitem');
  clear.dataset.recent = '';
  clear.textContent = 'Clear Recent Files';
  box.replaceChildren(...(items.length ? [...items, document.createElement('hr'), clear] : []));
  box.hidden = !items.length;
  // File > Open Recent shows only with something in it
  const sub = document.querySelector<HTMLElement>('#recent-sub');
  if (sub) sub.hidden = box.hidden;
}
async function openRecent(path: string): Promise<void> {
  finishTyping();
  if (!path) { recentFiles = []; renderRecent(); storeSettings(); if (canKeepHandles()) void forgetHandles([]).catch(() => {}); return; }
  if (isHandleEntry(path)) {
    // the web version: a file the browser kept, opened again with its leave
    const handle = await handleFor(path).catch(() => null);
    const name = recentLabel(path).name;
    const file = await handle?.getFile().catch(() => null);
    if (!handle || !file) {
      recentFiles = removeRecent(recentFiles, path);
      renderRecent();
      storeSettings();
      flash(`${name} can't be opened from here any more (moved, deleted, or the browser wasn't allowed), so it has come off the recent list. File > Open finds it.`, 8000);
      return;
    }
    await ws.openBytes(new Uint8Array(await file.arrayBuffer()), file.name, { kind: 'handle', handle });
    return;
  }
  let bytes: Uint8Array;
  try {
    bytes = await readPath(path);
  } catch {
    // moved, renamed or deleted: said, and taken off the list
    recentFiles = removeRecent(recentFiles, path);
    renderRecent();
    storeSettings();
    flash(`${baseName(path)} isn't there any more (moved, renamed or deleted?), so it has come off the recent list.`, 8000);
    return;
  }
  await ws.openBytes(bytes, baseName(path), { kind: 'path', path });
}

// Workspaces (desktop app): every open tab saved together, with a list file to open them all again
const workspaceChoices = { copyIn: true, saveChanges: true };
async function saveWorkspace(choosePlace: boolean): Promise<void> {
  finishTyping();
  let path = choosePlace ? null : ws.workspacePath;
  const unsaved = ws.unsavedTabs.map((t) => t.name);
  const r = await ask(path ? 'Save Workspace' : 'Save Workspace As', [
    { name: 'copy', label: 'Put copies of files kept in other folders into the workspace folder (their tabs then save to the copies)', type: 'checkbox', value: String(workspaceChoices.copyIn) },
    { name: 'save', label: 'Save changes to tabs already saved as files', type: 'checkbox', value: String(workspaceChoices.saveChanges) },
  ], {
    ok: path ? 'Save' : 'Choose Folder…',
    note: (path ? `Saves the open tabs as the workspace ${baseName(path)}.` : 'A workspace is a folder with your files and a small .ciworkspace file listing the tabs, their order and split views. Next, pick or make a folder and name the workspace.')
      + (unsaved.length ? ` These tabs have never been saved and go into the workspace folder: ${unsaved.join(', ')}.` : ''),
  });
  if (!r) return;
  workspaceChoices.copyIn = r.copy === 'true';
  workspaceChoices.saveChanges = r.save === 'true';
  if (!path) {
    const target = await saveFileDialog(ws.workspacePath ? baseName(ws.workspacePath) : `Workspace.${WORKSPACE.extension}`, WORKSPACE).catch(async (e) => { await showError(String(e)); return null; });
    if (!target || target.ref.kind !== 'path') return;
    path = target.ref.path;
  }
  await ws.saveWorkspace(path, workspaceChoices);
}
async function openWorkspace(): Promise<void> {
  finishTyping();
  const f = await openBytesDialog('Workspaces', [WORKSPACE]).catch(async (e) => { await showError(String(e)); return null; });
  if (f && f.ref.kind === 'path') await ws.openWorkspace(new TextDecoder().decode(f.bytes), f.ref.path);
}

// Newer versions of the desktop app (File > Check for Updates…, Edit > Settings)
let updateCheck = true;
let updateChannel: UpdateChannel = 'latest';
let skipVersion: string | null = null;
const updates = new UpdateUI({
  unsaved: () => ws.tabs.filter((t) => t.dirty).map((t) => t.name),
  skipped: () => skipVersion,
  skip: (v) => { skipVersion = v; storeSettings(); },
  channel: () => updateChannel,
  openPage: (url) => openWebPage(url),
  // as when the window closes: the recovery copies and lock files aren't needed
  closing: async () => { await keeper.end(); await diagnostics.end(); },
});
/** The desktop app's version when it last ran (for What's New after an update). */
let lastVersion: string | null = null;
for (const el of document.querySelectorAll<HTMLElement>('.desktop-only')) el.hidden = !canUpdate;
let versionText = canUpdate ? '' : 'Web version';
void Promise.all([appVersion(), portableInfo()]).then(([v, portable]) => {
  versionText = canUpdate ? `Version ${v} ${STAGE.toLowerCase()}${portable ? ' (portable)' : ''}` : `Web version (${STAGE.toLowerCase()})`;
  diagnostics.version = versionText;
  if (portable && !portable.writable) flash(`This portable copy can’t write to its “Chem Illustrator Data” folder (a locked or read-only drive), so settings are kept on this computer instead.`, 8000);
  const el = document.querySelector('#app-version');
  if (el) el.textContent = versionText;
});

// Help > Send Feedback and Report a Problem
const feedback = new FeedbackDialog({
  openWebPage,
  copyText,
  about: () => ({
    Version: versionText || 'desktop app',
    Computer: computerName(navigator.userAgent),
    Mode: ws.active.mode,
  }),
});

/** An error nothing caught: say so, with a button that fills in a problem report about it. */
function errorNotice(e: LogEntry): void {
  const msg = e.message.split('\n')[0];
  flash(`Something went wrong: ${msg.length > 120 ? `${msg.slice(0, 119)}…` : msg}. It was written to the log (Help ▸ Copy Diagnostics).`, 12000,
    { label: 'Report It…', run: () => feedback.open('problem', errorReport(diagnostics, { entry: e })) });
}

/**
 * The app stopped without closing last time: a corner notice offering to report it, which stays
 * until it is answered (a passing message was hidden by the recovery question and the messages after it).
 */
function unexpectedCloseNotice(c: UnexpectedClose): void {
  const when = `${stamp(c.beat).slice(11, 16)} on ${stamp(c.beat).slice(0, 10)}`;
  notice('unexpected-close', 'Chem Illustrator closed unexpectedly last time',
    `It stopped without closing (last running at ${when}). Reporting it, with the log of what it was doing, helps find the cause.`, [
      { label: 'Report It…', main: true, run: () => feedback.open('problem', errorReport(diagnostics, { closed: c })) },
      { label: 'Dismiss', run: () => {} },
    ]);
}

/** Help > Copy Diagnostics: the version, computer and mode, then the newest part of the log. */
function diagnosticsText(): string {
  const about = Object.entries(feedback.about()).map(([k, v]) => `${k}: ${v}`).join('\n');
  const log = diagnostics.logText();
  return `Chem Illustrator diagnostics\n${about}\n\n${log.length > 20_000 ? `…\n${log.slice(-20_000)}` : log}`;
}

async function openLogFolder(): Promise<void> {
  try {
    await diagnostics.write();
    const kept = await invoke<string>('keep_folder');
    const { openPath } = await import('@tauri-apps/plugin-opener');
    await openPath(`${kept}${kept.includes('\\') ? '\\' : '/'}diagnostics`);
  } catch (e) {
    flash(`Couldn't open the log folder: ${e}`);
  }
}

/** View > Developer Tools > Error Console: this session's errors and warnings, newest last. */
function renderErrorLog(): void {
  if (!devTools) return;
  const body = $('#errors-body');
  const n = diagnostics.errorCount;
  $('#errors-count').textContent = n ? String(n) : '';
  if (!diagnostics.entries.length) { body.innerHTML = `<p class="muted">No errors or warnings since ${escapeHtml(stamp(diagnostics.started).slice(11, 16))}.</p>`; return; }
  body.innerHTML = diagnostics.entries.map((e) => {
    const head = escapeHtml(formatEntry({ ...e, detail: undefined }).slice(11));
    return e.detail
      ? `<details class="entry ${e.level}"><summary>${head}</summary><pre>${escapeHtml(e.detail)}</pre></details>`
      : `<div class="entry ${e.level}">${head}</div>`;
  }).join('');
  body.scrollTop = body.scrollHeight;
}
diagnostics.onChange(() => renderErrorLog());
$('#errors-clear').addEventListener('click', () => diagnostics.clear());
// the console's other buttons run their commands (side-panel buttons aren't wired to commands like menu items are)
$('#errors-section').addEventListener('click', (e) => {
  const cmd = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cmd]')?.dataset.cmd;
  if (cmd) command(cmd);
});
// The web inspector is built into the Windows and Linux apps (Apple doesn't allow it in App Store apps)
for (const el of document.querySelectorAll<HTMLElement>('.inspector-only')) el.hidden = !isTauri() || isMac;

// ---------------------------------------------------------------- opening files from outside

const platform = !isTauri() ? 'web' as const : /Windows/.test(navigator.userAgent) ? 'windows' as const : isMac ? 'mac' as const : 'linux' as const;
const fileTypesHost = {
  platform,
  get: () => invoke<string[]>('file_types_get'),
  set: (types: string[]) => invoke<void>('file_types_set', { types }),
  openDefaults: () => invoke<void>('file_types_defaults'),
  objects: {
    get: () => invoke<boolean>('ole_registered'),
    set: async (on: boolean) => { await invoke<void>('ole_register', { on }); setWordObjects(on); },
  },
  figures: { get: () => offerFigures, set: (on: boolean) => { offerFigures = on; storeSettings(); } },
  flash: (msg: string) => flash(msg, 7000),
};
let fileTypesOffered = false;
let wordObjectsOffered = false;

/** A drawing Word, PowerPoint or Excel asked to edit here (src-tauri/src/ole.rs). */
interface EmbeddedEdit { id: number; cdxml: string; app: string; doc: string }
/** Tabs editing drawings for other programs, by tab (a Save As to a file still ends the editing when the tab closes). */
const embeddedTabs = new Map<Tab, number>();
const embeddedTab = (id: number): Tab | undefined => [...embeddedTabs].find(([, i]) => i === id)?.[0];

async function openEmbedded(e: EmbeddedEdit): Promise<void> {
  const ref = { kind: 'embedded' as const, id: e.id, app: e.app, doc: e.doc };
  const from = e.doc || e.app || 'another program';
  const name = `Drawing in ${from}`;
  let t: Tab | null;
  if (e.cdxml.trim()) t = await ws.openAs(new TextEncoder().encode(e.cdxml), 'drawing.cdxml', { name, ref, dirty: false, stamp: null });
  else {
    // a new drawing (Insert ▸ Document ▸ Object in Word)
    t = ws.newDrawing();
    t.ref = ref;
    t.name = name;
    renderTabs();
  }
  if (!t) { void invoke('ole_close', { id: e.id }).catch(() => {}); return; }
  embeddedTabs.set(t, e.id);
  flash(`Editing the drawing from ${from}. Save (Ctrl+S) puts it back there; close this tab when you're done.`, 9000);
}

/**
 * Windows: drawings in Word, PowerPoint and Excel that open here when double-clicked. The first
 * time the app starts it registers them (a portable copy leaves the computer alone); after that it
 * keeps the registration pointing at this copy of the app. Settings ▸ Apps and System turns it off.
 */
async function startWordObjects(): Promise<void> {
  if (platform !== 'windows') return;
  const { listen } = await import('@tauri-apps/api/event');
  setEmbeddedWriter(async (ref, cdxml) => {
    const block = packFormats([['CDXML', new TextEncoder().encode(cdxml)], ['EMF', embeddedPicture(readCdxml(cdxml).doc, cdxml)]]);
    await invoke('ole_save', block, { headers: { 'ole-id': String(ref.id) } });
  });
  await listen<EmbeddedEdit>('ole-edit', (e) => void openEmbedded(e.payload));
  await listen<number>('ole-show', (e) => { const t = embeddedTab(e.payload); if (t) ws.activate(t); });
  // the document was closed in Word: the drawing stays here as an unsaved drawing
  await listen<number>('ole-closed', (e) => {
    const t = embeddedTab(e.payload);
    if (!t) return;
    embeddedTabs.delete(t);
    if (t.ref.kind === 'embedded') {
      flash(`${t.ref.doc || t.ref.app} was closed, so this drawing can't go back into it. It stays here; save it as a file to keep it.`, 9000);
      t.ref = { kind: 'none' };
      t.name = withExtension(t.name, 'cdxml');
      renderTabs();
    }
  });
  for (const e of await invoke<EmbeddedEdit[]>('ole_pending').catch(() => [])) await openEmbedded(e);
  let on = await invoke<boolean>('ole_registered').catch(() => false);
  if (on) await invoke('ole_register', { on: true }).catch(() => {});
  else if (!wordObjectsOffered && !(await portableInfo())) {
    on = await invoke('ole_register', { on: true }).then(() => true, () => false);
  }
  if (!wordObjectsOffered) { wordObjectsOffered = true; storeSettings(); }
  setWordObjects(on);
}

/** The files the desktop app was opened with (double-clicked, or Open with), and any opened while it runs. */
async function openOutsideFiles(): Promise<void> {
  if (!isTauri()) return;
  const { listen } = await import('@tauri-apps/api/event');
  // listening first, so no file is missed between asking and listening
  await listen<string[]>('open-files', (e) => { for (const p of e.payload) void openRecent(p); });
  for (const p of await invoke<string[]>('launch_files').catch(() => [])) await openRecent(p);
  // the first time the Windows app starts, it joins the chemistry files' "Open with" lists
  // (never the default: Settings ▸ Apps and System explains how); a portable copy leaves the computer alone
  if (platform === 'windows' && !fileTypesOffered && !(await portableInfo())) {
    fileTypesOffered = true;
    const now = await fileTypesHost.get().catch(() => [] as string[]);
    await fileTypesHost.set([...new Set([...now, ...FILE_TYPES.filter((t) => t.chemistry).map((t) => t.ext)])]).catch(() => {});
    storeSettings();
  }
}

/** A mechanism arrow gap typed in Settings ▸ Drawing, in points: null (the usual gap) when blank or not a number. */
const arrowGap = (v: string | undefined): number | null => { const n = Number(v); return !v || v.trim() === '' || !isFinite(n) || n < 0 ? null : Math.min(50, n); };

/** Settings ▸ Drawing: how structures are written and drawn, set once rather than per structure. */
async function drawingPreferences(): Promise<void> {
  const r = await ask('Drawing', [
    { name: 'methyl', label: 'Terminal methyls written as', value: editor.options.methylStyle, options: [{ value: 'Me', label: 'Me' }, { value: 'CH3', label: 'CH₃' }], inline: (v) => methylSwatch(v === 'CH3' ? 'CH3' : 'Me', doc.style),
      help: 'Show Terminal Methyls writes them this way; methyls already written out in the selection (or the whole drawing, with nothing selected) change too.' },
    { name: 'axial', label: 'Axial chirality written as', value: axialStyle.helicity ? 'PM' : 'RaSa', options: [{ value: 'RaSa', label: 'Ra / Sa' }, { value: 'PM', label: 'P / M (helicity)' }],
      help: 'Labels on biaryls and allenes follow the choice at once. Ra is the same as M, and Sa as P.' },
    { name: 'charges', label: 'Charges from the + and − keys', value: editor.options.circledCharges ? 'circled' : 'plain', options: [{ value: 'plain', label: 'In the label' }, { value: 'circled', label: 'In a circle' }], inline: (v) => chargeSwatch(v === 'circled', doc.style),
      help: 'Charges already drawn keep their look; the circle tools on the Object toolbox always draw a circled charge.' },
    { name: 'bondEnds', label: 'Ends of bond lines', value: String(bondEndPrefs.round), options: BOND_END_CHOICES.map((c) => ({ value: String(c.value), label: c.label })), inline: (v) => bondEndSwatch(Number(v)),
      help: 'How round the free ends of bonds are, on screen and in pictures and prints. Anything but Round also gives ring corners and chain bends a sharp, mitred point.' },
    { name: 'supR', label: 'Automatically superscript number(s) immediately following an "R" in chemically interpreted text', type: 'checkbox', value: String(labelPrefs.superscriptR) },
    { name: 'supRText', label: 'Also superscript them in regular text, as each word is typed', type: 'checkbox', value: String(labelPrefs.plainText) },
    { name: 'haptoDeloc', label: 'Draw η³, η⁵ and η⁶ ligands on a metal delocalized (a circle in the ring, an arc over an allyl)', type: 'checkbox', value: String(haptoLook.delocalized),
      help: 'Only the look: the bonds stay as drawn for SMILES and saving. Chemistry ▸ Structure ▸ Kekulé Form for η Ligand switches one back.' },
    { name: 'mechanism', label: 'Mechanism Arrows', type: 'heading', value: '' },
    { name: 'reroute', label: 'Mechanism arrows automatically wrap around structures that block their path', type: 'checkbox', value: String(editor.options.rerouteArrows),
      help: 'Arrows you bent by hand stay as they are.' },
    { name: 'arrowProducts', label: 'Offer Draw Next Intermediate and Check Arrows (Chemistry ▸ Mechanism Arrows)', type: 'checkbox', value: String(editor.options.arrowProducts),
      help: 'Both read the curved arrows as electrons moving: Check Arrows checks them, and Draw Next Intermediate draws the structure they make. Off takes both commands out of the menus; the arrows themselves are drawn as before.' },
    { name: 'startGap', label: 'Gap between tail of an arrow and its origin', value: arrowGaps.start === null ? '' : String(arrowGaps.start), type: 'number', unit: 'pt', placeholder: 'Automatic' },
    { name: 'endGap', label: 'Gap between head of an arrow and its target', value: arrowGaps.end === null ? '' : String(arrowGaps.end), type: 'number', unit: 'pt', placeholder: 'Automatic',
      help: 'Both gaps are measured from the atom\'s label (or a bare carbon\'s corner) or the lone pair\'s dots. Leave blank for the usual gap, which grows with the bond length. New arrows, and arrows stuck to a structure, use them when they are next drawn; Clean Up Arrow redraws the selected ones now.' },
  ], { ok: 'Save', preview: { title: 'Mechanism arrows', draw: (v, focus) => mechanismPreview({ start: arrowGap(v.startGap), end: arrowGap(v.endGap) }, doc.style, undefined, focus) } });
  if (!r) return;
  editor.options.circledCharges = r.charges === 'circled';
  editor.options.rerouteArrows = r.reroute === 'true';
  editor.options.arrowProducts = r.arrowProducts === 'true';
  showArrowProducts();
  arrowGaps.start = arrowGap(r.startGap);
  arrowGaps.end = arrowGap(r.endGap);
  if ((r.haptoDeloc === 'true') !== haptoLook.delocalized) { haptoLook.delocalized = r.haptoDeloc === 'true'; renderer.invalidate(doc); editor.requestScene(); }
  const ends = Number(r.bondEnds);
  if (isFinite(ends) && ends !== bondEndPrefs.round) {
    bondEndPrefs.round = ends;
    doc.allDirty = true;
    editor.requestScene();
  }
  labelPrefs.plainText = r.supRText === 'true';
  if (labelPrefs.superscriptR !== (r.supR === 'true')) {
    labelPrefs.superscriptR = r.supR === 'true';
    doc.allDirty = true;
    editor.requestScene();
  }
  showHelicity(r.axial === 'PM');
  if (r.methyl !== editor.options.methylStyle) chooseMethylStyle(r.methyl as MethylStyle);
  else storeSettings();
}

/**
 * Save As a Word or PowerPoint file while structures are saved there as pictures: ChemDraw objects
 * from ChemDraw stay ChemDraw objects unless converted, which is asked here (keeping them is the default).
 */
async function offerChemdrawToPictures(tab: Tab, name: string): Promise<void> {
  const ext = (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();
  const word = !!tab.document && /^(docx|docm|dotx|dotm)$/.test(ext) && officeStructures.docx === 'pictures';
  const slides = !!tab.deck && /^(pptx|pptm|potx|potm|ppsx|ppsm)$/.test(ext) && officeStructures.pptx === 'pictures';
  if (!word && !slides) return;
  const n = word ? (docMode?.chemdrawObjectCount(tab.document!) ?? 0) : deckChemdrawObjects(tab.deck!).size;
  if (!n) return;
  const what = word ? 'document' : tab.mode === 'design' ? 'design' : 'presentation';
  const app = word ? 'Word' : 'PowerPoint';
  const them = n === 1 ? 'it' : 'them';
  const got = await askChoice('Convert ChemDraw Objects to Pictures?',
    `This ${what} has ${n} ChemDraw object${n === 1 ? '' : 's'}. Save ${them} as pictures (SVG and PNG) like the rest of its structures, or keep ${them} as ChemDraw objects?`,
    [{ value: 'convert', label: 'Convert to Pictures' }, { value: 'keep', label: 'Keep as ChemDraw Objects', primary: true }], 'keep',
    `Converted, each is redrawn here from its ChemDraw data and saved as a picture, with the drawing kept beside it so it opens here as a structure; it no longer opens in ChemDraw from ${app}. Kept, they stay exactly as they came. Settings ▸ General ▸ Save structures in ${app} files as decides how the rest are saved.`);
  if (got !== 'convert') return;
  if (word) {
    const failed = docMode?.convertChemdrawObjects(tab.document!) ?? 0;
    if (failed) flash(`${failed} ChemDraw object${failed === 1 ? '' : 's'} couldn't be read and stay${failed === 1 ? 's' : ''} as ChemDraw had ${failed === 1 ? 'it' : 'them'}.`, 8000);
  } else convertDeckChemdraw(tab.deck!);
}

/** The ChemDraw objects from ChemDraw on a deck's slides (their structures carry its mark), by id. */
function deckChemdrawObjects(deck: Deck): Set<number> {
  const ids = new Set<number>();
  deck.slides.forEach((_, i) => {
    const d = deck.docOf(i);
    for (const x of [...d.atoms.values(), ...d.captions.values(), ...d.arrows.values(), ...d.shapes.values()]) if (x.ole) ids.add(x.ole.id);
  });
  return ids;
}

/** Save As with structures saved as pictures: a deck's ChemDraw objects made plain structures, saved as pictures (each slide one step to undo). */
function convertDeckChemdraw(deck: Deck): void {
  deck.slides.forEach((_, i) => {
    const d = deck.docOf(i);
    const marked = (x: { ole?: unknown }) => !!x.ole;
    if (![...d.atoms.values(), ...d.captions.values(), ...d.arrows.values(), ...d.shapes.values()].some(marked)) return;
    d.edit('Convert ChemDraw Objects to Pictures', () => {
      for (const a of [...d.atoms.values()]) if (a.ole) d.updateAtom(a.id, { ole: undefined });
      for (const c of [...d.captions.values()]) if (c.ole) d.updateCaption(c.id, { ole: undefined });
      for (const r of [...d.arrows.values()]) if (r.ole) d.updateArrow(r.id, { ole: undefined });
      for (const sh of [...d.shapes.values()]) if (sh.ole) d.updateShape(sh.id, { ole: undefined });
    });
  });
  deck.edits++;
}

/** Settings ▸ General: how structures are saved in Word and PowerPoint files. */
const STRUCTURES_AS = [{ value: 'pictures', label: 'Pictures (SVG and PNG)' }, { value: 'chemdraw', label: 'ChemDraw objects' }];
const STRUCTURES_AS_HELP = 'ChemDraw objects open in ChemDraw when double-clicked in Word or PowerPoint, on computers that have ChemDraw; elsewhere they show as pictures. Pictures (SVG and PNG) look the same in every program, including Google Docs, LibreOffice and Keynote. Either way, Chem Illustrator opens them again as editable drawings. ChemDraw objects that came in with a file stay ChemDraw objects.';

/** Settings ▸ General: selecting, groups, linked text, and your name on tracked changes. */
async function generalPreferences(): Promise<void> {
  const r = await ask('General', [
    { name: 'groupClick', label: 'Clicking something in a group selects', value: editor.options.groupClick, options: [{ value: 'group', label: 'The whole group' }, { value: 'item', label: 'Just that thing' }] },
    { name: 'groupOutline', label: 'Outline the rest of a group when part of it is selected', type: 'checkbox', value: String(editor.options.groupOutline) },
    { name: 'linkSide', label: 'Text linked to a structure goes', value: linkSide, options: [{ value: 'keep', label: 'Where it is' }, { value: 'below', label: 'Below' }, { value: 'above', label: 'Above' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    { name: 'ask', label: 'Ask before changing every structure on the page when nothing is selected', type: 'checkbox', value: String(askWholeDrawing) },
    { name: 'matchStructure', label: 'New bonds match the structure they\'re added to', type: 'checkbox', value: String(matchStructure.on),
      help: 'Bonds, rings and chains added to a structure take its own bond length, line widths and colors, so a structure drawn with other settings stays consistent. Off: they always take the document\'s drawing settings.' },
    { name: 'straightenLinear', label: 'Straighten alkynes and allenes when a bond becomes triple', type: 'checkbox', value: String(straightenLinear.on),
      help: 'When a bond becomes triple (or an allene carbon gets its second double bond), move the smaller side so the sp carbon\'s bonds are linear. Off: atoms stay put. New bonds are always drawn linear.' },
    { name: 'convertChemDraw', label: 'Redraw ChemDraw objects in Word files as they open', type: 'checkbox', value: String(!!docRead.convertChemDraw),
      help: 'Off: they keep the look they had in Word and become drawings when you edit one. On: each is redrawn here in the document\'s drawing style.' },
    { name: 'docxStructures', label: 'Save structures in Word files as', value: officeStructures.docx, options: STRUCTURES_AS, help: STRUCTURES_AS_HELP },
    { name: 'pptxStructures', label: 'Save structures in PowerPoint files as', value: officeStructures.pptx, options: STRUCTURES_AS, help: STRUCTURES_AS_HELP },
    { name: 'reviewer', label: 'Your name on tracked changes in documents', value: reviewAuthor() },
    { name: 'startView', label: 'Show the start view (new tabs, recent files) when the program opens', type: 'checkbox', value: String(startView) },
  ], { ok: 'Save', actions: {
    label: 'Settings file',
    help: 'One file holds all settings: shortcuts, toolboxes, preferences, templates, abbreviations, drawing styles, palettes, slide themes and highlight styles. Export to back up or move to another computer; Import to load one. Recent files aren\'t included.',
    buttons: [{ text: 'Export Settings…', run: (say) => void exportSettings(say) }, { text: 'Import Settings…', run: (say) => void importSettingsFile(say) }],
  } });
  if (!r) return;
  editor.options.groupClick = r.groupClick === 'item' ? 'item' : 'group';
  editor.options.groupOutline = r.groupOutline === 'true';
  linkSide = (['below', 'above', 'left', 'right'].includes(r.linkSide) ? r.linkSide : 'keep') as Settings['linkSide'];
  askWholeDrawing = r.ask === 'true';
  docRead.convertChemDraw = r.convertChemDraw === 'true';
  officeStructures = { docx: r.docxStructures === 'chemdraw' ? 'chemdraw' : 'pictures', pptx: r.pptxStructures === 'chemdraw' ? 'chemdraw' : 'pictures' };
  matchStructure.on = r.matchStructure === 'true';
  straightenLinear.on = r.straightenLinear === 'true';
  setReviewAuthor(r.reviewer ?? '');
  startView = r.startView === 'true';
  storeSettings();
}

/** Settings ▸ Toolboxes: each button in a cell of its own (lines, raised, or both). */
let toolCells: Settings['toolCells'] = 'off';
function setToolCells(v: Settings['toolCells']): void {
  toolCells = v;
  document.body.classList.toggle('cells-grid', v === 'grid' || v === 'both');
  document.body.classList.toggle('cells-raised', v === 'raised' || v === 'both');
  window.dispatchEvent(new Event('resize'));
}

/** Settings ▸ Toolboxes: how the toolboxes' buttons look and what their tips say. */
let ribbonLook: Settings['canvasRibbon'] = 'classic';
function setRibbonLook(look: Settings['canvasRibbon']): void {
  ribbonLook = look;
  canvasRibbon.setLook(look);
  repaintArrows();
  fitRibbons();
}

async function toolboxPreferences(): Promise<void> {
  const r = await ask('Toolboxes and Ribbon', [
    { name: 'look', label: 'Canvas ribbon', value: ribbonLook, options: [{ value: 'classic', label: 'Classic: two rows of buttons' }, { value: 'simple', label: 'Simplified: one row' }],
      help: 'Both keep the tabs and collapse with the arrow at the right end of the tabs.' },
    { name: 'cells', label: 'Button cells', value: toolCells, options: [{ value: 'off', label: 'None' }, { value: 'grid', label: 'Grid lines' }, { value: 'raised', label: 'Raised buttons' }, { value: 'both', label: 'Grid lines and raised buttons' }],
      help: 'Gives each toolbox button a cell of its own, so the buttons are easier to tell apart and to hit.' },
    { name: 'tips', label: 'Detailed tooltips: show what each tool does and what Alt, Shift and Ctrl change', type: 'checkbox', value: String(toolTip.enabled) },
  ], { ok: 'Save' });
  if (!r) return;
  setToolCells((['grid', 'raised', 'both'].includes(r.cells) ? r.cells : 'off') as Settings['toolCells']);
  setRibbonLook(r.look === 'simple' ? 'simple' : 'classic');
  showToolTips(r.tips === 'true');
  storeSettings();
}

/** Settings ▸ Preferences: how you like to work, and matters of taste such as how alkyl groups are written. */
/** How problems are marked on the drawing (Settings ▸ Preferences). */
function setWarnLook(look: Settings['warnLook']): void {
  const now = (['box', 'soft', 'circle', 'dashed', 'corners'] as const).includes(look) ? look : 'box';
  if (now === renderer.warnLook) return;
  renderer.warnLook = now;
  doc.allDirty = true;
  editor.requestScene?.();
}

/** Settings ▸ NMR Prediction (desktop app only). */
async function nmrSettings(): Promise<void> {
  const r1 = nmrRange('1H'), r13 = nmrRange('13C'), pk = peakLabels();
  const r = await ask('NMR Prediction', [
    { name: 'auto', label: 'Predict NMR as soon as a structure is selected', type: 'checkbox', value: String(nmrAutoPredict()),
      help: 'Off: the NMR section of the Analysis panel stays closed until you open it (or click Predict NMR on the Canvas ribbon), so selecting things stays quick. On: it opens and predicts with every selection, as long as you left it open.' },
    { name: 'quality', label: 'Predict spectra with', value: nmrQuality(), options: [
      { value: 'fast', label: 'Fast: first-order multiplets' }, { value: 'balanced', label: 'Balanced: exact simulation of up to 8 coupled protons' },
      { value: 'accurate', label: 'Accurate: 3-D conformers, up to 10 coupled protons' }],
      help: 'Accurate also predicts both shifts of diastereotopic CH2 protons and couplings from the 3-D shape; it takes a few seconds per structure. The Spectrum window\'s dropdown changes the same setting.' },
    { name: 'solvent', label: 'Solvent', value: nmrPanel.solvent, options: NMR_SOLVENTS.map((x) => ({ value: x, label: x })) },
    { name: 'mhz', label: 'Spectrometer frequency', value: String(nmrSpectrumMhz()), options: [300, 400, 500, 600, 800].map((m) => ({ value: String(m), label: `${m} MHz` })) },
    { name: 'h1lo', label: '1H spectrum from', type: 'number', value: String(r1.lo), unit: 'ppm',
      help: 'The spectrum is drawn over this range (−0.5 to 10 ppm unless you change it) and widens by itself when a peak falls outside it.' },
    { name: 'h1hi', label: '1H spectrum to', type: 'number', value: String(r1.hi), unit: 'ppm' },
    { name: 'c13lo', label: '13C spectrum from', type: 'number', value: String(r13.lo), unit: 'ppm',
      help: 'The spectrum is drawn over this range (−5 to 200 ppm unless you change it) and widens by itself when a peak falls outside it.' },
    { name: 'c13hi', label: '13C spectrum to', type: 'number', value: String(r13.hi), unit: 'ppm' },
    { name: 'compare', label: 'Show a pasted report against the prediction', value: compareMode(), options: [
      { value: 'inverted', label: 'Inverted: measured above, predicted mirrored below' }, { value: 'stacked', label: 'Stacked: one above the other, both upright' }, { value: 'overlay', label: 'Overlay: both on one baseline' }],
      help: 'Check Data in the Spectrum window. Its Inverted, Stacked and Overlay buttons change the same setting.' },
    { name: 'plLabel', label: 'Peak labels: atoms', type: 'checkbox', value: String(pk.label),
      help: 'What the Spectrum window (and its pictures) writes over each predicted peak. Atoms are named as in the list\'s Atoms column.' },
    { name: 'plShift', label: 'Peak labels: chemical shift (a range for m)', type: 'checkbox', value: String(pk.shift) },
    { name: 'plMult', label: 'Peak labels: multiplicity', type: 'checkbox', value: String(pk.mult) },
    { name: 'plCount', label: 'Peak labels: number of H', type: 'checkbox', value: String(pk.count) },
    { name: 'plJ', label: 'Peak labels: J values', type: 'checkbox', value: String(pk.j) },
    { name: 'plHover', label: 'Peak labels: show only the first part; hovering a peak shows the rest', type: 'checkbox', value: String(pk.hover) },
    { name: 'plSize', label: 'Peak label size', type: 'number', value: String(pk.size), unit: 'px' },
    { name: 'plPlace', label: 'Peak labels go', value: pk.place, options: [
      { value: 'above', label: 'Above each peak, one part per line' }, { value: 'top', label: 'Along the top on one line, with a line down to the peak' }, { value: 'upright', label: 'Upright over each peak' }] },
  ], { ok: 'Save' });
  if (!r) return;
  setNmrAutoPredict(r.auto === 'true');
  if (r.compare === 'inverted' || r.compare === 'stacked' || r.compare === 'overlay') setCompareMode(r.compare);
  if (r.quality === 'fast' || r.quality === 'balanced' || r.quality === 'accurate') setNmrQuality(r.quality);
  if ((NMR_SOLVENTS as readonly string[]).includes(r.solvent)) nmrPanel.solvent = r.solvent;
  if (Number(r.mhz) > 0) setNmrSpectrumMhz(Number(r.mhz));
  const bad: string[] = [];
  for (const [nuc, lo, hi] of [['1H', r.h1lo, r.h1hi], ['13C', r.c13lo, r.c13hi]] as const) {
    const a = Number(lo), b = Number(hi);
    if (lo.trim() === '' || hi.trim() === '' || !Number.isFinite(a) || !Number.isFinite(b) || a >= b) { bad.push(nuc); continue; }
    setNmrRange(nuc, a, b);
  }
  const size = Number(r.plSize);
  setPeakLabels({ label: r.plLabel === 'true', shift: r.plShift === 'true', mult: r.plMult === 'true', count: r.plCount === 'true', j: r.plJ === 'true', hover: r.plHover === 'true',
    size: size >= 6 && size <= 24 ? size : pk.size, place: r.plPlace === 'top' || r.plPlace === 'upright' ? r.plPlace : 'above' });
  if (bad.length) flash(`The ${bad.join(' and ')} range was kept as it was: the first number has to be lower than the second.`, 6000);
  nmrPanel.settingsChanged(document.getElementById('analysis-body'));
}

async function personalPreferences(): Promise<void> {
  const alt = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'Option+Enter' : 'Alt+Enter';
  const r = await ask('Preferences', [
    { name: 'enterFinishes', label: 'Finish typing text from the Text tool with', value: enterFinishesText ? 'enter' : 'esc',
      options: [{ value: 'esc', label: 'Esc (Enter starts a new line), as in ChemDraw' }, { value: 'enter', label: `Enter (${alt} starts a new line)` }],
      help: 'Everywhere you draw: Canvas, structures in documents and spreadsheets, and text boxes on slides. Ctrl+Enter always finishes, and Shift+Enter always breaks the line.' },
    { name: 'alkylLook', label: 'Auto format alkyl isomer prefixes', value: alkylPrefs.look, options: ALKYL_LOOK_CHOICES, short: true, inline: (v) => alkylSwatch(parseAlkylLook(v)),
      help: 'The n-, i-, s- and t- of Pr and Bu anywhere in labels or text: OtBu, N(iPr)2, Si(iPr)3, nBu, sBu and P(t-Bu)2 all follow the look picked. New labels use it when you finish typing; you\'ll be asked about existing ones. A dash is never added or removed where it would read as an element (PtBu3).' },
    { name: 'warnLook', label: 'Mark problems on the drawing with', value: renderer.warnLook, short: true, inline: (v) => problemSwatch((WARN_LOOKS as readonly string[]).includes(v) ? v as WarnLook : 'box', doc.style), options: [
      { value: 'box', label: 'A thin red box' }, { value: 'soft', label: 'A soft red disc' }, { value: 'circle', label: 'A red circle' },
      { value: 'dashed', label: 'A dashed red circle' }, { value: 'corners', label: 'Red corner marks' }],
      help: 'Atoms with too many bonds, labels that can\'t be read, a bond drawn on its own (as in the picture) and other problems the Warnings box lists. Clear Show on drawing (Warnings) to hide the marks.' },
    { name: 'pointer', label: 'Pointer While Drawing', type: 'heading', value: '' },
    { name: 'aidAngle', label: 'Show the angle beside the pointer while drawing bonds, arrows and lines', type: 'checkbox', value: String(editor.aids.angle) },
    { name: 'aidLength', label: 'Show the length there too, in', type: 'checkbox', value: String(editor.aids.length),
      beside: { name: 'aidUnits', label: 'Length units', value: editor.aids.units, options: LENGTH_UNITS },
      help: 'Pixels are counted at 100 % zoom (96 to the inch); inches are written as decimals.' },
    { name: 'aidLook', label: 'How the angle and hints look', value: editor.aids.look, short: true, options: [{ value: 'plain', label: 'Plain blue words' }, { value: 'box', label: 'Blue words on a pale box' }, { value: 'solid', label: 'White words on a blue box' }], inline: (v) => cursorAidSwatch(v === 'box' || v === 'solid' ? v : 'plain') },
    { name: 'aidHints', label: 'Show what Shift, Alt and Ctrl do beside the pointer', type: 'checkbox', value: String(editor.aids.hints),
      help: 'While dragging, the keys that change what the tool does are listed in blue (the one held in bold). With the button up they show as a key is held.' },
    { name: 'counterions', label: 'Counterions Typed as Text', type: 'heading', value: '' },
    { name: 'ionCharges', label: 'Add their charges (BF₄ becomes BF₄⁻, NBu₄ becomes NBu₄⁺)', type: 'checkbox', value: String(chemText.ionCharges), inline: (v) => counterionSwatch(v === 'true', doc.style),
      help: 'Off, a counterion typed without its charge is still read as that ion, and flagged until the charge is added.' },
    { name: 'saltGroups', label: 'Group each with the structure or ion of opposite charge next to it, as one salt', type: 'checkbox', value: String(chemText.saltGroups), inline: (v) => saltSwatch(v === 'true', doc.style),
      help: 'Grouped, the two count as one salt: one formula and mass, and a SMILES with both parts.' },
  ], { ok: 'Save' });
  if (!r) return;
  enterFinishesText = r.enterFinishes === 'enter';
  setWarnLook(r.warnLook as Settings['warnLook']);
  chemText.ionCharges = r.ionCharges === 'true';
  chemText.saltGroups = r.saltGroups === 'true';
  editor.aids = { ...editor.aids, angle: r.aidAngle === 'true', length: r.aidLength === 'true', hints: r.aidHints === 'true', look: r.aidLook === 'box' || r.aidLook === 'solid' ? r.aidLook : 'plain', units: r.aidUnits === 'px' || r.aidUnits === 'mm' ? r.aidUnits : 'in' };
  const look = parseAlkylLook(r.alkylLook);
  const changed = look !== alkylPrefs.look;
  alkylPrefs.look = look;
  storeSettings();
  if (changed && look !== 'typed') await offerAlkylRestyle(look);
}

const ALKYL_LOOK_CHOICES: { value: AlkylLook; label: string }[] = [
  { value: 'typed', label: 'As typed' },
  { value: 'plain', label: 'tBu' },
  { value: 'italic', label: 'tBu, italic t' },
  { value: 'dash', label: 't-Bu' },
  { value: 'both', label: 't-Bu, italic t' },
  { value: 'raised', label: 'ᵗBu, raised italic t' },
];
const parseAlkylLook = (v: string | undefined): AlkylLook => (ALKYL_LOOKS.includes(v as AlkylLook) ? v as AlkylLook : 'typed');

/** After a new alkyl look is chosen: offer to give it to the labels and text boxes already in the drawing. */
async function offerAlkylRestyle(look: AlkylLook): Promise<void> {
  const n = restyleAlkyl(doc, look, false);
  if (!n.labels && !n.texts) return;
  const parts = [n.labels && `${n.labels} atom label${n.labels > 1 ? 's' : ''}`, n.texts && `${n.texts} text box${n.texts > 1 ? 'es' : ''}`].filter(Boolean).join(' and ');
  const yes = await ask('Change Existing Alkyl Groups?', [], { ok: 'Change Them', note: `${parts} in this drawing ${n.labels + n.texts > 1 ? 'are' : 'is'} written another way. Change ${n.labels + n.texts > 1 ? 'them' : 'it'} to the new look? Cancel leaves ${n.labels + n.texts > 1 ? 'them' : 'it'} as ${n.labels + n.texts > 1 ? 'they are' : 'it is'}; new labels and text take the new look either way.` });
  if (!yes) return;
  restyleAlkyl(doc, look, true);
  editor.requestScene();
  flash(`Changed ${parts}`);
}

/** Settings ▸ Online: what the program asks the internet for. */
/** Edit > Settings > AI Model. */
async function aiSettings(): Promise<void> {
  await aiSettingsDialog(aiPrefs, (p) => { aiPrefs = p; storeSettings(); showAssistantMenu(); });
}

async function onlinePreferences(): Promise<void> {
  const r = await ask('Online', [
    { name: 'pubchem', label: 'Look up CAS RNs, and names the name reader can\'t read, on PubChem', type: 'checkbox', value: String(pubchemNames),
      help: 'Sends the name or CAS RN typed to PubChem, a free NIH database (and a CAS RN PubChem doesn\'t know to NCI CACTUS); Find CAS RN sends the structure as SMILES. Names the program can read itself never leave this computer.' },
    ...(canUpdate ? [{ name: 'updates', label: 'Check for a newer version when the app starts', type: 'checkbox' as const, value: String(updateCheck),
      help: 'Asks GitHub for the latest release number; nothing about you or your files is sent.' },
    { name: 'channel', label: 'Updates', options: UPDATE_CHANNELS, value: updateChannel,
      help: 'Stable versions have been tried out on a real computer before they are offered, so they change less often and have fewer surprises. Latest gets every new feature and fix the day it is made.' }] : []),
  ], { ok: 'Save' });
  if (!r) return;
  pubchemNames = r.pubchem === 'true';
  if (canUpdate) {
    // turning the check back on also forgets a skipped version
    if (r.updates === 'true' && !updateCheck) skipVersion = null;
    updateCheck = r.updates === 'true';
    // the other channel's versions are new to you: forget a skipped one
    if ((r.channel === 'stable' || r.channel === 'latest') && r.channel !== updateChannel) { updateChannel = r.channel; skipVersion = null; }
  }
  storeSettings();
}

let settingsLoaded = false;
// your palettes show in every colour box, in every mode
usePaletteMenus();
useDrawingColours(() => usedColours(editor.doc));
onPalettes(() => storeSettings());
/** Save the key map and preferences (after the saved ones have been read, so they aren't lost). */
function storeSettings(): void {
  if (!settingsLoaded) return;
  // (settings only applied for now are kept in the file as they were)
  saveSettings(currentSettings(), (msg) => flash(msg, 10000));
}

/** Every setting as it is now. */
function currentSettings(): Settings {
  return {
    hotkeys: keymap.overrides(),
    keepHotspotOnBond: editor.options.keepHotspotOnBond,
    stickyHotspot: editor.options.stickyHotspot,
    fixedLength: editor.options.fixedLength,
    fixedAngles: editor.options.fixedAngles,
    devTools,
    showRoles: editor.showRoles,
    scrollBars: scrollbars.shown,
    titleBar: titleBarPlace(),
    ribbonCollapsed: ribbonChosen,
    ribbonAutoFold,
    tabsInMenu,
    uiScale: uiScale(),
    textBar: CaptionEditor.barPlace,
    appTheme,
    density,
    shadows,
    iconLook,
    shapeInk: shapeInkNow,
    oneColumnTools,
    toolCells,
    canvasRibbon: ribbonLook,
    startView,
    enterFinishesText,
    offerFigures,
    page: defaultPage,
    welcomed,
    groupTips: labelTips.enabled,
    toolTips: toolTip.enabled,
    touchMode: touchMode(),
    penSketch: editor.options.penSketch,
    chemTyping: typingPrefs.chemistry,
    stereoItalic: typingPrefs.stereoItalic,
    boldNumbers: typingPrefs.boldNumbers,
    autoLinks: typingPrefs.links,
    linkCtrlClick: typingPrefs.linkCtrlClick,
    spellCheck: typingPrefs.spelling,
    replacements: typingPrefs.replacements,
    dictionary: typingPrefs.dictionary,
    modeColours,
    nicknames: ownNicknames,
    templates: ownTemplates(),
    splitWidth,
    slidePaneWidth: slidePanes.width,
    notesHeight: slidePanes.notesH,
    slideNotes: slidePanes.notes,
    citeStyle: preferredStyle().style,
    citeOptions: preferredStyle().options,
    methylStyle: editor.options.methylStyle,
    axialStyle: axialStyle.helicity ? 'PM' : 'RaSa',
    circledCharges: editor.options.circledCharges,
    ionCharges: chemText.ionCharges,
    saltGroups: chemText.saltGroups,
    groupClick: editor.options.groupClick,
    groupOutline: editor.options.groupOutline,
    rerouteArrows: editor.options.rerouteArrows,
    arrowProducts: editor.options.arrowProducts,
    arrowStartGap: arrowGaps.start,
    arrowEndGap: arrowGaps.end,
    cursorAids: { ...editor.aids },
    haptoDelocalized: haptoLook.delocalized,
    superscriptR: labelPrefs.superscriptR,
    superscriptRText: labelPrefs.plainText,
    alkylLook: alkylPrefs.look,
    warnLook: renderer.warnLook,
    bondEnds: bondEndPrefs.round,
    mapLook: mapLookPrefs.look,
    mapBox: { ...mapLookPrefs.custom },
    depthShade: { ...depthShadePrefs },
    linkSide,
    slideTemplate,
    slideThemes,
    askWholeDrawing,
    palettes: getPalettes(),
    toolboxes: toolboxState,
    ribbons: ribbonPrefs,
    quickBar: quickPrefs,
    myStyles: ownStyles,
    modeStyles,
    darkPage: dark.on,
    darkPalette: dark.palette,
    darkPalettes: dark.own,
    guides: { ...guidesOn },
    orient: { ...orientPrefs },
    pageLook: { ...pageLook },
    docPins: [...docBoxPrefs.pinned],
    docRuler: docRulerPrefs.shown,
    sheetFormulaBar: formulaBarPrefs.shown,
    slideRuler: slideLook.ruler,
    slidePanes: { ...chemPanes },
    slideGrid: slideLook.grid,
    rulerUnits: rulerPrefs.units,
    rulerFrom: rulerPrefs.from,
    updateCheck,
    updateChannel,
    pubchemNames,
    ai: aiPrefs,
    convertChemDraw: !!docRead.convertChemDraw,
    officeStructures: { ...officeStructures },
    matchStructure: matchStructure.on,
    straightenLinear: straightenLinear.on,
    fileTypesOffered,
    wordObjectsOffered,
    reviewName: reviewAuthor(),
    skipVersion,
    lastVersion,
    recentFiles,
    recentSymbols,
    scheme: { ...schemePrefs },
    newman: structuredClone(newmanPrefs),
    keep: keepPrefs,
    highlightLooks: ownLooks,
    formatFavorites: favorites,
    quickParts: docQuickParts,
    docDesign: newDocDesign(),
  };
}

// ---------------------------------------------------------------- Edit > Settings File > Export Settings and Import Settings

/** Save every setting in one file, to keep or to use on another computer. */
async function exportSettings(say: (text: string) => void = flash): Promise<void> {
  const target = await saveFileDialog('Chem Illustrator settings.json', SETTINGS_FILE).catch((e) => { say(String(e)); return null; });
  if (!target) return;
  await writeFile(target.ref, target.name, exportText(currentSettings()), SETTINGS_FILE).then(
    () => say(`Saved every setting in ${target.name}. Import it on another computer (Edit > Settings File > Import Settings) to set that one up the same.`),
    (e) => say(`Could not save the settings: ${e}`),
  );
}

/** Use the settings saved in a file with Export Settings (or the keys from a hotkeys file). */
async function importSettingsFile(say: (text: string) => void = flash): Promise<void> {
  const got = await openFileDialog([SETTINGS_FILE]).catch((e) => { say(String(e)); return null; });
  if (!got) return;
  const read = importSettings(got.text, currentSettings());
  if (!read) { say(`${got.name} isn't a Chem Illustrator settings file (use one saved with Export Settings).`); return; }
  applySettings(read.settings);
  storeSettings();
  say(read.only === 'hotkeys' ? `Using the keys from ${got.name}.` : `Now using the settings from ${got.name}: shortcuts, toolboxes, preferences, templates, abbreviations, styles and palettes. Recent files are unchanged.`);
}

/** The key for a menu command as things are now (in Slides mode PowerPoint's keys come first, in sheets Excel's). */
function commandKey(cmd: string): string | undefined {
  const first: KeyContext | null = sheetActive() ? 'sheet' : docActive() ? 'document' : editor.slideKeys ? 'slides' : null;
  const own = first ? keysOf(first, `command ${cmd}`)[0] : undefined;
  if (own) return own;
  // a key the slides or sheets use for something else does not do this command while they show
  const k = keymap.keysFor('command', `command ${cmd}`).find((c) => !first || !keymap.lookup(first, c));
  return k ? displayChord(k, isMac) : undefined;
}

/** Show the current keys in the menus and tool tips, and tick the options that are on. */
function refreshKeys(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.menu button[data-cmd], .ribbon button[data-cmd], .ribbon button[data-sh], .ribbon button[data-doc]')) {
    const k = commandKey((b.dataset.cmd ?? b.dataset.sh ?? b.dataset.doc)!);
    if (b.closest('.ribbon')) {
      const base = b.dataset.tip ?? (b.dataset.tip = b.title);
      b.title = k ? `${base} (${k})` : base;
      continue;
    }
    let kbd = b.querySelector('kbd');
    if (!k) { kbd?.remove(); continue; }
    if (!kbd) { kbd = document.createElement('kbd'); b.append(kbd); }
    kbd.textContent = k;
  }
  for (const [cmd, on] of [['fixed-length', editor.options.fixedLength], ['fixed-angles', editor.options.fixedAngles]] as const) {
    $(`[data-cmd="${cmd}"]`)?.setAttribute('aria-checked', String(on));
  }
  const sk = commandKey('command-search');
  $('#btn-search kbd').textContent = sk ?? '';
  $('#btn-search').title = sk ? `Search for a command by name (${sk})` : 'Search for a command by name';
  refreshHistory();
  quickBar?.refresh();
  toolbar.refreshTitles();
}

keymap.onChange(() => { refreshKeys(); storeSettings(); });
onTypingPrefs(() => { storeSettings(); editor.requestOverlay(); });

const modeDialog = new ModeColoursDialog({
  get: () => modeColours,
  set(c) {
    modeColours = c;
    applyModeColours(ws.active.mode, modeColours);
    storeSettings();
  },
});

const typingDialog = new TypingDialog({
  get: () => ({ ...typingPrefs }),
  set: (v) => setTypingPrefs(v),
  location: settingsLocation,
});

const hotkeysDialog = new HotkeysDialog({
  mac: isMac,
  location: settingsLocation,
  keepHotspot: {
    get: () => editor.options.keepHotspotOnBond,
    set: (v) => { editor.options.keepHotspotOnBond = v; storeSettings(); },
  },
  stickyHotspot: {
    get: () => editor.options.stickyHotspot,
    set: (v) => { editor.options.stickyHotspot = v; storeSettings(); },
  },
  exportKeys: async () => {
    const target = await saveFileDialog('Chem Illustrator hotkeys.json', KEYMAP_FILE).catch((e) => { hotkeysDialog.say(String(e)); return null; });
    if (!target) return;
    const text = JSON.stringify({ app: 'Chem Illustrator', kind: 'hotkeys', version: 1, hotkeys: keymap.overrides() }, null, 2) + '\n';
    await writeFile(target.ref, target.name, text, KEYMAP_FILE).then(
      () => hotkeysDialog.say(`Saved your keys in ${target.name}. Import it on another computer to use them there.`),
      (e) => hotkeysDialog.say(`Could not save the keys: ${e}`),
    );
  },
  importKeys: async () => {
    const got = await openFileDialog([KEYMAP_FILE]).catch((e) => { hotkeysDialog.say(String(e)); return null; });
    if (!got) return;
    let raw: { hotkeys?: KeyOverrides } | null = null;
    try { raw = JSON.parse(got.text); } catch { /* reported below */ }
    if (!raw || typeof raw !== 'object' || !raw.hotkeys || typeof raw.hotkeys !== 'object') {
      hotkeysDialog.say(`${got.name} isn't a hotkeys file (use one saved with Export).`);
      return;
    }
    keymap.setOverrides(raw.hotkeys);
    hotkeysDialog.say(`Using the keys from ${got.name}.`);
  },
});

/** Use these settings: at start, and when settings are imported (Edit > Settings File > Import Settings). */
function applySettings(s: Settings): void {
  editor.options.keepHotspotOnBond = s.keepHotspotOnBond;
  editor.options.stickyHotspot = s.stickyHotspot;
  editor.options.fixedLength = s.fixedLength;
  editor.options.fixedAngles = s.fixedAngles;
  editor.showRoles = s.showRoles;
  setSchemePrefs(s.scheme);
  newmanPrefs = structuredClone(s.newman);
  $('[data-cmd="show-roles"]')?.setAttribute('aria-checked', String(s.showRoles));
  showDevTools(s.devTools);
  showScrollBars(s.scrollBars);
  setOrient(s.orient, false);
  setPageLook(s.pageLook, false);
  void placeTitleBar(s.titleBar);
  ribbonChosen = s.ribbonCollapsed;
  setRibbonCollapsed(ribbonChosen);
  ribbonAutoFold = s.ribbonAutoFold;
  autoFoldRibbon(true);
  placeTabs(s.tabsInMenu);
  void setUiScale(s.uiScale);
  defaultPage = s.page;
  welcomed = s.welcomed;
  // the drawing open at start (empty and never saved) takes the default page
  if (!doc.page && !doc.source && !doc.atoms.size && !deckNow()) doc.page = defaultPage && { ...defaultPage };
  placeTextBar(s.textBar);
  setAppTheme(s.appTheme);
  setDensity(s.density);
  setShadows(s.shadows);
  setIconLook(s.iconLook);
  setShapesInk(s.shapeInk);
  setOneColumnTools(s.oneColumnTools);
  setToolCells(s.toolCells);
  setRibbonLook(s.canvasRibbon);
  startView = s.startView;
  enterFinishesText = s.enterFinishesText;
  offerFigures = s.offerFigures;
  showGroupTips(s.groupTips);
  showToolTips(s.toolTips);
  setTouchMode(s.touchMode);
  editor.options.penSketch = s.penSketch;
  $('[data-cmd="pen-sketch"]')?.setAttribute('aria-checked', String(s.penSketch));
  modeColours = s.modeColours;
  applyModeColours(ws.active.mode, modeColours);
  keymap.setOverrides(s.hotkeys);
  setTypingPrefs({ chemistry: s.chemTyping, stereoItalic: s.stereoItalic, boldNumbers: s.boldNumbers, links: s.autoLinks, linkCtrlClick: s.linkCtrlClick, spelling: s.spellCheck, replacements: s.replacements, dictionary: s.dictionary });
  ownNicknames = s.nicknames;
  addNicknames(ownNicknames);
  useOwnTemplates(s.templates);
  splitWidth = s.splitWidth;
  slidePanes.width = s.slidePaneWidth;
  slidePanes.notesH = s.notesHeight;
  slidePanes.notes = s.slideNotes;
  applySlidePanes();
  applySplitWidth();
  setPreferredStyle(s.citeStyle, s.citeOptions);
  editor.options.methylStyle = s.methylStyle;
  showHelicity(s.axialStyle === 'PM');
  editor.options.circledCharges = s.circledCharges;
  chemText.ionCharges = s.ionCharges;
  chemText.saltGroups = s.saltGroups;
  editor.options.groupClick = s.groupClick;
  editor.options.groupOutline = s.groupOutline;
  editor.options.rerouteArrows = s.rerouteArrows;
  editor.options.arrowProducts = s.arrowProducts;
  showArrowProducts();
  arrowGaps.start = s.arrowStartGap;
  arrowGaps.end = s.arrowEndGap;
  editor.aids = { ...s.cursorAids };
  haptoLook.delocalized = s.haptoDelocalized;
  labelPrefs.superscriptR = s.superscriptR;
  labelPrefs.plainText = s.superscriptRText;
  alkylPrefs.look = s.alkylLook;
  setWarnLook(s.warnLook);
  bondEndPrefs.round = s.bondEnds;
  mapLookPrefs.look = s.mapLook;
  mapLookPrefs.custom = { ...s.mapBox };
  Object.assign(depthShadePrefs, s.depthShade);
  for (const el of document.querySelectorAll('[data-cmd="depth-shading"][role="menuitemcheckbox"]')) el.setAttribute('aria-checked', String(depthShadePrefs.on));
  linkSide = s.linkSide;
  slideTemplate = s.slideTemplate;
  slideThemes = s.slideThemes;
  askWholeDrawing = s.askWholeDrawing;
  updateCheck = s.updateCheck;
  updateChannel = s.updateChannel;
  pubchemNames = s.pubchemNames;
  aiPrefs = s.ai;
  showAssistantMenu();
  docRead.convertChemDraw = s.convertChemDraw;
  officeStructures = { ...s.officeStructures };
  matchStructure.on = s.matchStructure;
  straightenLinear.on = s.straightenLinear;
  fileTypesOffered = s.fileTypesOffered;
  wordObjectsOffered = s.wordObjectsOffered;
  setReviewAuthor(s.reviewName);
  docQuickParts = s.quickParts;
  setNewDocDesign(s.docDesign);
  skipVersion = s.skipVersion;
  lastVersion = s.lastVersion;
  recentFiles = s.recentFiles;
  recentSymbols = s.recentSymbols;
  keepPrefs = s.keep;
  tickAutoSave();
  ownLooks = s.highlightLooks;
  favorites = s.formatFavorites;
  for (const r of favoriteStrips) r.refresh();
  renderRecent();
  setPalettes(s.palettes);
  toolboxState = withoutRetired(s.toolboxes);
  ribbonPrefs = s.ribbons;
  applyRibbons();
  quickPrefs = s.quickBar;
  quickBar?.render();
  ownStyles = s.myStyles;
  modeStyles = s.modeStyles;
  dark.palette = s.darkPalette;
  dark.own = s.darkPalettes;
  showDark(s.darkPage);
  Object.assign(guidesOn, s.guides);
  docBoxPrefs.pinned = parseDocPins(s.docPins);
  docRulerPrefs.shown = !!s.docRuler;
  formulaBarPrefs.shown = s.sheetFormulaBar !== false;
  sheetMode?.showFormulaBar();
  slideLook.ruler = !!s.slideRuler;
  Object.assign(chemPanes, s.slidePanes);
  showChemPanes();
  slideLook.grid = !!s.slideGrid;
  rulerPrefs.units = s.rulerUnits;
  rulerPrefs.from = s.rulerFrom;
  docMode?.showRuler();
  docMode?.boxesChanged();
  showGuides();
  // the drawing the app opened with takes your default style, if nothing has been drawn yet
  const first = modeStyles.drawing ? styleNamed(modeStyles.drawing, ownStyles) : undefined;
  if (first && ws.tabs.length === 1 && ws.active.mode === 'drawing' && ws.active.ref.kind === 'none' && doc.atoms.size === 0 && !doc.canUndo()) {
    doc.style = first;
    doc.allDirty = true;
    editor.changed();
  }
  toolboxes.render();
  tickToolboxes();
  placeSidePanel();
  tickMethylStyle();
  refreshKeys();
}

void loadSettings((msg) => flash(msg, 12000)).then((s) => {
  applySettings(s);
  settingsLoaded = true;
  void keeper.start();
  void lastClose.then((c) => { if (c) unexpectedCloseNotice(c); });
  void openOutsideFiles();
  void startWordObjects();
  // (a moment after starting, once a file opened with the app has had time to load)
  setTimeout(showWelcome, 800);
  // a few seconds after starting, so the check doesn't slow down opening the window
  if (canUpdate && updateCheck) setTimeout(() => void updates.quietCheck(), 4000);
  // the first start after an update says what changed
  if (canUpdate) void appVersion().then((now) => {
    const before = lastVersion;
    if (before === now) return;
    lastVersion = now;
    storeSettings();
    if (before) setTimeout(() => void updates.whatsNew(before, now), 2500);
  });
  refreshKeys();
});
refreshKeys();

// The Help window lists the most used keys as they are now (they can be changed).
const HELP_KEYS: Record<'atom' | 'bond' | 'space', string[]> = {
  atom: ['atom bond', 'atom ring-bond', 'atom carbonyl', 'atom phenyl', 'atom wedge', 'atom hash-wedge', 'atom cyclohexyl',
    'atom cyclopentyl', 'atom methylidene', 'atom dimethyl', 'atom alkyne', 'atom sulfonyl', 'label O', 'label N', 'label S',
    'label Cl', 'label Me', 'label OMe', 'label Ph', 'label Boc', 'atom plus', 'atom minus', 'atom number', 'atom attach',
    'atom nickname', 'atom edit-label', 'atom clear'],
  bond: ['bond single', 'bond double', 'bond triple', 'bond wedge', 'bond hash-wedge', 'bond bold', 'bond dashed', 'bond wavy',
    'bond left', 'bond center', 'bond right', 'fuse benzene', 'fuse 6', 'fuse 5', 'fuse chair'],
  space: ['tool select', 'tool bond-single', 'tool chain', 'tool ring-benzene', 'tool text', 'tool arrow'],
};

function openHelp(): void {
  for (const ctx of ['atom', 'bond', 'space'] as const) {
    const ul = $(`#help-${ctx}`);
    ul.replaceChildren(...HELP_KEYS[ctx].flatMap((action) => {
      const keys = keysOf(ctx, action);
      if (!keys.length) return [];
      const li = document.createElement('li');
      for (const k of keys.slice(0, 2)) {
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        li.append(kbd, ' ');
      }
      li.append(actionName(action));
      return [li];
    }));
  }
  for (const el of document.querySelectorAll<HTMLElement>('#help [data-cmd-key]')) {
    el.textContent = keysOf('command', `command ${el.dataset.cmdKey}`)[0] ?? '(no key)';
  }
  $<HTMLDialogElement>('#help').showModal();
}

const nicknames = new NicknameChooser();
editor.say = (msg) => flash(msg, 6000);
editor.onNickname = (atomId) => nicknames.open((name) => editor.runAction(`label ${name}`, { kind: 'atom', id: atomId }));
// / or ? on an atom or bond: select it and show its settings in the Style panel
editor.onProperties = () => revealStylePanel(true);
/**
 * Open the side panel if it is folded away (it starts folded in Presentation, Spreadsheet and
 * Document) and bring the Style panel into view, after it has caught up with the selection.
 */
function revealStylePanel(focus = false): void {
  if (sideIsFolded()) command('fold-side');
  setTimeout(() => {
    const sec = $('#style-section');
    if (sec.hidden || sec.classList.contains('empty')) return;
    sec.scrollIntoView({ block: 'nearest' });
    if (focus) sec.querySelector<HTMLElement>('input, select, button')?.focus();
  }, 60);
}

// Unsaved work: ask before the window closes.
if (isTauri()) {
  getCurrentWindow().onCloseRequested(async (e) => {
    finishTab();
    if (!(await ws.closeAll())) e.preventDefault();
    // closing normally: the recovery copies and lock files aren't needed
    else { await keeper.end(); await diagnostics.end(); }
  }).catch(() => {});
} else {
  window.addEventListener('beforeunload', (e) => {
    finishTyping();
    if (ws.anyDirty) e.preventDefault();
    // with nothing unsaved the copies can go; otherwise they stay, in case the page is left
    else void keeper.end();
    void diagnostics.write();
  });
}

/** For the speed tests: a ChemDraw file's text into the drawing showing, timed. */
function openText(text: string, name: string): ReadStats | null {
  const t0 = performance.now();
  try {
    const { doc: loaded, stats } = readCdxml(text);
    doc.loadFrom(loaded, true);
    editor.clearSelection();
    editor.lastEdited = null;
    editor.fit();
    editor.frame(true);
    const total = performance.now() - t0;
    lastStats = stats;
    lastOpen = `${name}: opened and drawn in ${total.toFixed(0)} ms (read ${stats.parseMs.toFixed(0)} ms, build ${stats.buildMs.toFixed(0)} ms, first paint ${renderer.lastSceneMs.toFixed(0)} ms)`;
    const sk = Object.entries(stats.skipped).map(([k, v]) => `${v} ${k}`).join(', ');
    flash(`Opened ${name}: ${stats.atoms} atoms, ${stats.bonds} bonds, ${stats.captions} captions, ${stats.arrows} arrows${sk ? `. Not shown yet: ${sk}` : ''}`);
    (window as any).__lastOpenMs = total;
    updatePanels();
    return stats;
  } catch (err) {
    flash('Could not open ' + name + ': ' + String(err));
    return null;
  }
}

// ---------------------------------------------------------------- stress test

/** Draw n drug-sized molecules with the same tools a person would use. */
function stressTest(n: number): void {
  const t0 = performance.now();
  const L = doc.style.bondLength;
  const cols = Math.ceil(Math.sqrt(n));
  doc.edit('Stress test', () => {
    for (let i = 0; i < n; i++) {
      const cx = (i % cols) * L * 9, cy = Math.floor(i / cols) * L * 7;
      const ring = placeRing(doc, freeRing({ x: cx, y: cy }, 6, L), { aromatic: true });
      const p = doc.atoms.get(ring[1])!, q = doc.atoms.get(ring[2])!;
      const ring2 = placeRing(doc, fusedRing(p, q, 6, -1), { existing: [p.id, q.id] });
      const n1 = doc.atoms.get(ring2[3])!;
      doc.updateAtom(n1.id, { z: 7 });
      const c1 = sprout(doc, n1.id);
      const c2 = sprout(doc, c1.id, 2, 'solid', 8);
      void c2;
      const c3 = sprout(doc, c1.id);
      const o = sprout(doc, c3.id, 1, 'wedge');
      doc.updateAtom(o.id, { label: 'OMe' });
      const top = doc.atoms.get(ring[4])!;
      const s1 = sprout(doc, top.id);
      doc.updateAtom(s1.id, { label: 'CO2Et' });
      const r5 = doc.atoms.get(ring2[4])!;
      placeRing(doc, ringOnAtom(r5, ringDir(doc, r5.id), 5, L), { existing: [r5.id] });
      const f = sprout(doc, ring[5]);
      doc.updateAtom(f.id, { z: 9 });
    }
  });
  const built = performance.now() - t0;
  editor.fit();
  editor.frame(true);
  lastOpen = `Stress test: built ${n} molecules (${doc.atoms.size} atoms) in ${built.toFixed(0)} ms, first paint ${renderer.lastSceneMs.toFixed(0)} ms`;
  updatePanels();
}

// ---------------------------------------------------------------- mass fragmentation

editor.onFragment = (p, q, bondIds) => { void fragmentAt(p, q, bondIds); };

/** The fragmentation tool's line: break the bonds it crosses and label each piece with its formula and mass. */
async function fragmentAt(p: { x: number; y: number }, q: { x: number; y: number }, bondIds: number[]): Promise<void> {
  if (!bondIds.length) { flash('Draw the line across one or more bonds to break them.'); return; }
  if (!chem.ready) { flash('The chemistry engine is still loading.'); return; }
  // one structure at a time: the one the first crossed bond belongs to
  const first = doc.bonds.get(bondIds[0])!;
  const frag = doc.fragmentOf(first.a1);
  const bonds = bondIds.map((id) => doc.bonds.get(id)!).filter((b) => frag.has(b.a1));
  const ex = toMolfile(doc, frag);
  const index = new Map<number, number>();
  ex.map.forEach((id, i) => { if (id >= 0) index.set(id, i); });
  const cuts = bonds.map((b) => [index.get(b.a1), index.get(b.a2)] as [number | undefined, number | undefined])
    .filter((c): c is [number, number] => c[0] !== undefined && c[1] !== undefined);
  const res = await chem.fragments(ex.molblock, cuts).catch((e) => ({ error: String(e) }));
  if ('error' in res) { flash(res.error); return; }
  const size = doc.style.captionSize;
  const font = doc.style.captionFont;
  const pieces = res.map((r) => {
    const atoms = r.atoms.map((i) => doc.atoms.get(ex.map[i])).filter((a): a is Atom => !!a);
    const c = atoms.length ? { x: atoms.reduce((s, a) => s + a.x, 0) / atoms.length, y: atoms.reduce((s, a) => s + a.y, 0) / atoms.length } : p;
    const runs = fragmentRuns(r.formula, r.exact);
    const w = Math.max(measureText(r.formula, size, font), measureText(r.exact.toFixed(4), size, font));
    return { r, c, runs, w };
  });
  const all = [...frag].map((id) => doc.atoms.get(id)!);
  const box = { x1: Math.min(...all.map((a) => a.x)) - size * 0.5, y1: Math.min(...all.map((a) => a.y)) - size * 0.5, x2: Math.max(...all.map((a) => a.x)) + size * 0.5, y2: Math.max(...all.map((a) => a.y)) + size * 0.5 };
  const places = captionPlaces(p, q, pieces.map((x) => x.c), pieces.map((x) => x.w), size, box);
  doc.edit('Mass fragmentation', () => {
    doc.addShape({ kind: 'line', dashed: true, x1: p.x, y1: p.y, x2: q.x, y2: q.y });
    pieces.forEach((x, i) => doc.addCaption({ x: places[i].x, y: places[i].y, runs: x.runs, justify: 'left' }));
  });
  editor.changed();
  const ring = res.length === 1 ? ' The bonds broken are in a ring, so the structure stays in one piece.' : '';
  flash(`Broke ${cuts.length} bond${cuts.length === 1 ? '' : 's'}: ${res.map((r) => `${r.formula} ${r.exact.toFixed(4)}`).join(', ')}.${ring}`);
}

// ---------------------------------------------------------------- analysis (background chemistry)

let analysisTimer = 0;
/** The structures last analysed, for the panel's buttons. */
let lastAnalysis: { results: FragmentResult[]; frags: Set<number>[]; molblocks: string[] } | null = null;
/** The ion for m/z, the isotope pattern and the HRMS text: picked in the m/z row of the Analysis panel. */
const adductSel = { value: COMMON_ADDUCTS[0] };
$('#analysis-body').addEventListener('change', (e) => {
  const t = e.target as HTMLElement;
  if (!(t instanceof HTMLSelectElement) || !t.matches('select[data-adduct]')) return;
  adductSel.value = t.value;
  scheduleAnalysis(true);
});
/** Starts the offline namer a few seconds after the first structure is analysed, so names come without asking. */
let namerTimer = 0;
function startNamerSoon(): void {
  if (namerTimer || namer.ready) return;
  namerTimer = window.setTimeout(() => { namer.start().then(() => scheduleAnalysis(true), () => { /* stays unnamed; tried again next session */ }); }, 3000);
}
/** What PubChem had on each structure looked up this session, by SMILES. */
const pubchemStates = new Map<string, PubChemState>();

/** Each structure's CAS RN as looked up this session, by SMILES. */
const casStates = new Map<string, CasState>();

/**
 * A structure's CAS RN line: as looked up this session, else straight from your Compound
 * Library (once it has been read) or the answers kept on this computer, without going online.
 */
function casStateOf(smiles: string): CasState {
  const st = casStates.get(smiles);
  if (st) return st;
  const mine = library.loaded ? library.now.compounds.find((c) => c.smiles === smiles && readCas(c.cas)?.kind === 'cas') : undefined;
  if (mine) return { kind: 'found', cas: [readCas(mine.cas)!.cas], name: mine.name || undefined, from: 'your Compound Library' };
  const kept = casMemory.byKey(smiles);
  if (kept?.cas.length) return { kind: 'found', cas: kept.cas, name: kept.name, cid: kept.cid, from: kept.source };
  return { kind: 'idle' };
}

/** The Analysis panel's Find button (and Find CAS RN): the structure's CAS RN, shown in its line. */
async function findCas(smiles: string, fresh = false): Promise<CasFound | null> {
  if (casStates.get(smiles)?.kind === 'busy') return null;
  casStates.set(smiles, { kind: 'busy' });
  scheduleAnalysis(true);
  let got: CasFound;
  try {
    got = await casForStructure(smiles, casDeps(), fresh);
  } catch (e) {
    got = { kind: 'error', message: (e as Error).message };
  }
  casStates.set(smiles, got);
  scheduleAnalysis(true);
  return got;
}

/**
 * Bring the Analysis list into view for an answer that shows there: in the Canvas, the ribbon's
 * Analysis box drops it down (or pops it out while the ribbon is folded to its tabs); elsewhere
 * the side panel opens.
 */
function showAnalysisList(): void {
  if (!canvasRibbon.el.hidden) {
    if (analysisBox.button.offsetParent) analysisBox.open();
    else analysisBox.detach();
  } else if (sideIsFolded()) command('fold-side');
}

/** The NMR commands on the Canvas ribbon: bring the Analysis list into view, then act on the first structure's NMR section (once the panel has it). */
function nmrRibbon(act: Parameters<NmrPanel['ribbon']>[0]): void {
  if (!nmrHere) { flash('Predicted NMR spectra are in the desktop app for Windows, Mac and Linux.'); return; }
  showAnalysisList();
  let tries = 0;
  const go = () => {
    if (nmrPanel.ribbon(act)) return;
    if (++tries < 30) { setTimeout(go, 100); return; }
    flash('Select a structure to predict its NMR spectrum.');
  };
  go();
}

/** Home > NMR: its commands in a menu under the button. */
function nmrMenu(): void {
  const b = document.querySelector<HTMLElement>('#canvas-ribbon [data-cmd="nmr-menu"]');
  const r = b?.getBoundingClientRect() ?? new DOMRect(200, 120, 0, 0);
  popupMenu(r.left, r.bottom + 2, [['Predict NMR', () => nmrRibbon('predict')], ['Spectrum Window', () => nmrRibbon('window')], ['Show on Drawing', () => nmrRibbon('marks')], ['Check Data…', () => nmrRibbon('check')], null, ['NMR Settings…', () => command('nmr-settings')]]);
}

/** Chemistry > NMR > Solvent…: the solvents in a menu under the button. */
function nmrSolventMenu(): void {
  const b = document.querySelector<HTMLElement>('#canvas-ribbon [data-cmd="nmr-solvent"]');
  const r = b?.getBoundingClientRect() ?? new DOMRect(200, 120, 0, 0);
  popupMenu(r.left, r.bottom + 2, NMR_SOLVENTS.map((x) => [`${x === nmrPanel.solvent ? '✓ ' : ''}${x}`, () => nmrRibbon({ solvent: x })] as [string, () => void]));
}

/** Chemistry > Look Up > Find CAS RN (and the right-click menu): the structure picked, its CAS RN shown in the Analysis panel. */
async function findCasChosen(): Promise<void> {
  const f = chosenStructures()[0];
  if (!f) { flash('Select a structure first.'); return; }
  const r = await weigh(f);
  if (!r?.smiles) { flash('Couldn\'t read that structure to look it up.'); return; }
  showAnalysisList();
  const got = await findCas(r.smiles, casStates.get(r.smiles)?.kind === 'none' || casStates.get(r.smiles)?.kind === 'error');
  $('#analysis-body .an-cas')?.scrollIntoView({ block: 'nearest' });
  if (got?.kind === 'found') flash(`CAS RN ${got.cas[0]}${got.name ? ` (${got.name})` : ''}, from ${got.from}. It is in the Analysis panel.`);
  else if (got) flash(got.message, 7000);
}

/** The Analysis panel's PubChem button: find the structure's compound number, then its record. */
async function lookUpOnPubChem(smiles: string): Promise<void> {
  pubchemStates.set(smiles, { kind: 'busy' });
  scheduleAnalysis(true);
  try {
    const cid = await pubchemCid(smiles);
    const c = cid ? await pubchemCompound(cid) : null;
    pubchemStates.set(smiles, c ? { kind: 'found', c } : { kind: 'none' });
    // its CAS RNs fill in the CAS RN line too
    if (c?.cas.length && casStateOf(smiles).kind !== 'found') {
      casStates.set(smiles, { kind: 'found', cas: c.cas, name: c.title || undefined, cid: c.cid, from: 'PubChem' });
      casMemory.remember(c.cas.map((cas) => ({ cas, smiles, key: smiles, whole: true, name: c.title || undefined, cid: c.cid, source: 'PubChem' as const, found: new Date().toISOString() })));
    }
  } catch (e) {
    pubchemStates.set(smiles, { kind: 'error', message: (e as Error).message });
  }
  scheduleAnalysis(true);
}

/** Chemistry > Look Up > Look Up on PubChem (and the right-click menu): the structure picked, shown in the Analysis panel. */
async function lookUpChosen(): Promise<void> {
  const f = chosenStructures()[0];
  if (!f) { flash('Select a structure first.'); return; }
  const r = await weigh(f);
  if (!r?.smiles) { flash('Couldn\'t read that structure to look it up.'); return; }
  showAnalysisList();
  await lookUpOnPubChem(r.smiles);
  $('#analysis-body .pubchem')?.scrollIntoView({ block: 'nearest' });
}

/** A web page, in the computer's browser. */
function openWebPage(url: string): void {
  if (isTauri()) void import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url)).catch((e) => flash(`Couldn't open the browser: ${e}`));
  else window.open(url, '_blank', 'noopener');
}

$('#analysis-body').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const page = t.closest<HTMLElement>('[data-pubchem-page]');
  if (page) { e.preventDefault(); openWebPage(compoundPage(Number(page.dataset.pubchemPage))); return; }
  const findBtn = t.closest<HTMLButtonElement>('button[data-cas]');
  if (findBtn && lastAnalysis) { const r = lastAnalysis.results[Number(findBtn.dataset.cas)]; if (r?.smiles) void findCas(r.smiles, casStates.has(r.smiles)); return; }
  const look = t.closest<HTMLButtonElement>('button[data-pubchem]');
  if (look && lastAnalysis) { const r = lastAnalysis.results[Number(look.dataset.pubchem)]; if (r?.smiles) void lookUpOnPubChem(r.smiles); return; }
  const b = t.closest<HTMLButtonElement>('button[data-insert]');
  if (!b || !lastAnalysis) return;
  const [kind, n] = b.dataset.insert!.split(':');
  const r = lastAnalysis.results[Number(n)], frag = lastAnalysis.frags[Number(n)];
  if (kind === 'formula') { if (frag) void attachDescriptors([frag]); return; }
  if (kind === 'cas') {
    const st = r?.smiles ? casStateOf(r.smiles) : null;
    if (st?.kind !== 'found' || !frag) return;
    const m = editor.measure();
    doc.edit('CAS caption', () => {
      const c = doc.addCaption({ x: 0, y: 0, runs: casRuns(st.cas[0]), justify: 'center', attach: { atoms: [...frag], side: 'below', gap: defaultGap(doc), shift: 0, role: 'caption' } });
      placeAttached(doc, c, m);
    });
    editor.changed();
    flash('Added the CAS RN under the structure; it follows it. Double-click to edit.');
    return;
  }
  if (kind === 'pcname' || kind === 'pccas' || kind === 'pchaz' || kind === 'name') {
    const st = r && pubchemStates.get(r.smiles);
    const named = kind === 'name' && r ? nameStates.get(r.smiles) : undefined;
    const runs = kind === 'name' ? (named?.kind === 'found' ? nameRuns(named.name) : null) : st?.kind === 'found' ? pubchemRuns(kind, st.c) : null;
    if (!runs || !frag) return;
    // tied to the structure like Add Caption's, so it follows it; edit or retype it like any text
    // (the structure stays selected, so the panel stays open for the other buttons)
    const m = editor.measure();
    doc.edit(kind === 'pcname' || kind === 'name' ? 'Name caption' : kind === 'pccas' ? 'CAS caption' : 'Hazards caption', () => {
      const c = doc.addCaption({ x: 0, y: 0, runs, justify: 'center', attach: { atoms: [...frag], side: 'below', gap: defaultGap(doc), shift: 0, role: 'caption' } });
      placeAttached(doc, c, m);
    });
    editor.changed();
    flash('Added under the structure; it follows it. Double-click to edit.');
    return;
  }
  const runs = r && analysisRuns(kind as 'formula' | 'hrms' | 'ea', r, adductSel.value);
  if (!runs || !frag) return;
  // under the structure, lined up with its left edge
  const atoms = [...frag].map((id) => doc.atoms.get(id)).filter((a): a is Atom => !!a);
  if (!atoms.length) return;
  const x = Math.min(...atoms.map((a) => a.x)), y = Math.max(...atoms.map((a) => a.y)) + doc.style.bondLength * 1.2;
  doc.edit(kind === 'formula' ? 'Analysis caption' : kind === 'hrms' ? 'HRMS text' : 'Elemental analysis text', () => {
    // long lines wrap to the structure's width (or about 15 bond lengths, if wider)
    const w = Math.max(Math.max(...atoms.map((a) => a.x)) - x, doc.style.bondLength * 15);
    doc.addCaption({ x, y, runs, justify: 'left', ...(kind === 'formula' ? {} : { wrap: w }) });
  });
  editor.changed();
  flash(kind === 'formula' ? 'Added the formula and masses as a caption. Double-click it to edit.' : 'Added the text. Double-click it to type the found values.');
});
let analysisSeq = 0;
let analysisKey = '';

// ---------------------------------------------------------------- captions tied to structures

/** The structures to work on: those with atoms selected, else the one last drawn on. */
function chosenStructures(): Set<number>[] {
  const roots = editor.sel.atoms.size ? [...editor.sel.atoms] : editor.lastEdited !== null && doc.atoms.has(editor.lastEdited) ? [editor.lastEdited] : [];
  const out: Set<number>[] = [];
  const seen = new Set<number>();
  for (const r of roots) {
    if (seen.has(r)) continue;
    const f = doc.fragmentOf(r);
    for (const x of f) seen.add(x);
    out.push(f);
  }
  return out;
}

/** A structure's formula and masses from the chemistry engine (null when it can't be worked out). */
async function weigh(atoms: Set<number>): Promise<FragmentResult | null> {
  if (!chem.ready || !atoms.size) return null;
  const ex = toMolfile(doc, atoms);
  const res = await chem.analyze([{ molblock: ex.molblock, map: ex.map }]).catch(() => null);
  const r = res?.results[0];
  return r && !r.error ? r : null;
}

/**
 * Chemistry > Attach Descriptors (and the Analysis panel's button): the formula and masses under
 * each structure, tied to it. They follow it, and are worked out again when it changes; the Style
 * panel chooses what they show and where they sit.
 */
async function attachDescriptors(frags = chosenStructures()): Promise<void> {
  if (!frags.length) { flash('Select a structure first.'); return; }
  if (!chem.ready) { flash('The chemistry engine is still loading. Try again in a moment.'); return; }
  const made: number[] = [];
  const weighed = await Promise.all(frags.map((f) => weigh(f)));
  doc.edit('Attach descriptors', () => {
    frags.forEach((f, i) => {
      const r = weighed[i];
      if (!r) return;
      const adduct = adductSel.value;
      const runs = descriptorRuns(r, DEFAULT_DESCRIPTORS, adduct);
      const attach: Attachment = { atoms: [...f], side: 'below', gap: defaultGap(doc), shift: 0, role: 'descriptors', show: [...DEFAULT_DESCRIPTORS], adduct, sig: structureSig(doc, f) };
      const c = doc.addCaption({ x: 0, y: 0, runs, justify: 'center', attach });
      placeAttached(doc, c, editor.measure());
      made.push(c.id);
    });
  });
  if (!made.length) { flash('Couldn\'t work out the formula of that structure.'); return; }
  editor.clearSelection();
  for (const id of made) editor.sel.captions.add(id);
  editor.changed();
  flash('Attached the formula and masses. They follow the structure and update when it changes; choose what they show in the Style panel.', 7000);
}

let descriptorBusy = false, descriptorAgain = false;
/** Work out tied descriptors again for structures that changed (the new text joins the change that caused it). */
async function refreshDescriptors(): Promise<void> {
  if (descriptorBusy) { descriptorAgain = true; return; }
  descriptorBusy = true;
  try {
    do {
      descriptorAgain = false;
      for (const c of [...doc.captions.values()]) {
        const a = c.attach;
        if (a?.role !== 'descriptors' || a.keepText) continue;
        const atoms = attachedAtoms(doc, a);
        const sig = structureSig(doc, atoms);
        if (!atoms.size || sig === a.sig) continue;
        const version = doc.version;
        const r = await weigh(atoms);
        // something else changed meanwhile: look again from the start
        if (doc.version !== version) { descriptorAgain = true; break; }
        const now = doc.captions.get(c.id);
        if (!r || !now?.attach) continue;
        doc.amend('Descriptors', () => doc.updateCaption(c.id, { runs: descriptorRuns(r, now.attach!.show ?? DEFAULT_DESCRIPTORS, now.attach!.adduct ?? adductSel.value), attach: { ...now.attach!, sig } }));
        editor.changed();
      }
    } while (descriptorAgain);
  } finally {
    descriptorBusy = false;
  }
}

function scheduleAnalysis(force = false): void {
  clearTimeout(analysisTimer);
  analysisTimer = window.setTimeout(() => runAnalysis(force), 30);
}

/** The R groups (R1, R2, X, Ar…) written in a structure's labels, alone or inside longer ones (OR1). */
function rGroupNames(ids: Set<number>): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const a = doc.atoms.get(id);
    if (a?.label) for (const t of tokenizeLabel(a.label)) if (t.kind === 'generic') out.add(t.text);
  }
  return [...out].sort((p, q) => p.localeCompare(q, undefined, { numeric: true }));
}

let saidSelection = '';
/** Tell screen readers what is selected: "Selected C6H5Br, 7 atoms". */
function saySelection(results: FragmentResult[]): void {
  const n = editor.sel.atoms.size;
  const key = n ? [...editor.sel.atoms].sort((a, b) => a - b).join(',') + ':' + doc.version : '';
  if (key === saidSelection) return;
  saidSelection = key;
  if (!n) return;
  const formulas = results.filter((r) => !r.error && r.formula).map((r) => r.formula);
  $('#sr-say').textContent = `Selected ${formulas.length ? formulas.join(', ') + ', ' : ''}${n} atom${n === 1 ? '' : 's'}`;
}

let analysisHadSel = false, clearedAt = -1;
async function runAnalysis(force: boolean): Promise<void> {
  if (!chem.ready) return;
  // Analyse the selected structures, or else the one last drawn on.
  let roots: number[] = [];
  // clearing the selection clears the panel, until something is drawn again
  const texts = selectedSpecies();
  const picked = editor.sel.atoms.size > 0 || texts.length > 0;
  if (picked) analysisHadSel = true;
  else if (analysisHadSel) { analysisHadSel = false; clearedAt = doc.version; }
  if (editor.sel.atoms.size) roots = [...editor.sel.atoms];
  else if (!picked && editor.lastEdited !== null && doc.atoms.has(editor.lastEdited) && doc.version !== clearedAt) roots = [editor.lastEdited];
  const frags: Set<number>[] = [];
  // the text boxes read as chemistry counted with each: ions grouped with the structure (its salt)
  const extras: Caption[][] = [];
  const seen = new Set<number>();
  const counted = new Set<number>();
  for (const r of roots) {
    if (seen.has(r)) continue;
    const f = doc.fragmentOf(r);
    for (const x of f) seen.add(x);
    const ions = groupedIons(doc, f, editor.measure());
    for (const c of ions) counted.add(c.id);
    // any atom picked analyses its whole structure (one carbon of a molecule is not CH4)
    frags.push(f);
    extras.push(ions);
    if (frags.length >= 12) break;
  }
  // selected text boxes on their own (an ion grouped with a structure counts with it)
  for (const c of texts) {
    if (counted.has(c.id) || frags.length >= 12) continue;
    counted.add(c.id);
    const mates = c.grp !== undefined ? texts.filter((o) => o.grp === c.grp && !counted.has(o.id)) : [];
    for (const o of mates) counted.add(o.id);
    frags.push(new Set());
    extras.push([c, ...mates]);
  }
  const key = doc.version + ':' + live.version + ':' + frags.map((f, i) => [...f].join(',') + '+' + extras[i].map((c) => c.id).join(',')).join('|');
  if (!force && key === analysisKey) return;
  analysisKey = key;
  const panel = $('#analysis-body');
  if (!frags.length) {
    panel.innerHTML = '<p class="muted" title="Or select text read as chemistry, such as BF4⁻ or DMAP, or draw a structure.">Select a structure to see its formula and masses.</p>';
    analysisBox.set(null);
    return;
  }
  const seq = ++analysisSeq;
  const t0 = performance.now();
  const exports = frags.map((f, i) => toMolfile(doc, f, '', { species: placeSpecies(doc, extras[i], editor.measure()) }));
  const res = await chem.analyze(exports.map((e) => ({ molblock: e.molblock, map: e.map }))).catch((e) => { panel.textContent = String(e); return null; });
  if (!res || seq !== analysisSeq) return;
  const roundTrip = performance.now() - t0;
  chemTimes.push(roundTrip);
  if (chemTimes.length > 50) chemTimes.shift();
  // repeat groups (polymer brackets): weigh each unit and count it as many times as its label says
  const groups = repeatGroups(doc);
  const results: FragmentResult[] = [];
  const polymers: (ReturnType<typeof withRepeats>['polymer'])[] = [];
  for (let i = 0; i < res.results.length; i++) {
    const mine = groups.filter((g) => g.inner.some((id) => frags[i].has(id)));
    const units: RepeatUnit[] = [];
    if (mine.length && !res.results[i].error) {
      const index = new Map<number, number>();
      exports[i].map.forEach((id, k) => { if (id >= 0) index.set(id, k); });
      for (const g of mine) {
        const cuts = g.crossing.map((c) => { const b = doc.bonds.get(c.bond)!; return [index.get(b.a1), index.get(b.a2)] as [number | undefined, number | undefined]; })
          .filter((c): c is [number, number] => c[0] !== undefined && c[1] !== undefined);
        const pieces = cuts.length ? await chem.fragments(exports[i].molblock, cuts).catch(() => null) : null;
        const at = index.get(g.inner[0]);
        const unit = pieces && !('error' in pieces) ? pieces.find((p) => at !== undefined && p.atoms.includes(at)) : null;
        if (unit) units.push({ text: g.text, count: g.count, counts: unit.counts, exact: unit.exact, mw: unit.mw });
      }
    }
    const w = withRepeats(res.results[i], units);
    results.push(w.r);
    polymers.push(w.polymer);
  }
  if (seq !== analysisSeq) return;
  lastAnalysis = { results, frags, molblocks: exports.map((e) => e.molblock) };
  // once the namer is running, every structure analysed gets its name without asking
  if (results.some((r) => !r.error && r.smiles)) startNamerSoon();
  if (namer.ready) results.forEach((r, i) => { if (!r.error && r.smiles && !polymers[i] && !rGroupNames(frags[i]).length && !nameStates.has(r.smiles)) void nameForPanel(r.smiles, exports[i].molblock); });
  saySelection(results);
  // the ribbon's Analysis box: the first structure's formula (and how many more), weight, exact mass and m/z
  const firstAt = results.findIndex((r) => !r.error && r.formula);
  const first = firstAt >= 0 ? results[firstAt] : null;
  const firstIon = first && !polymers[firstAt] && !rGroupNames(frags[firstAt]).length ? ionInfo(first, adductSel.value) : null;
  analysisBox.set(first ? {
    formula: formulaHtml(first.formula) + (results.length > 1 ? ` <span class="muted">+${results.length - 1}</span>` : ''),
    mw: first.mw.toFixed(2),
    exact: first.exact.toFixed(4),
    ion: firstIon ? { label: adductHtml(firstIon.adduct.label), mz: firstIon.mz.toFixed(4) } : null,
  } : null);
  panel.innerHTML = results.map((r, i) => polymers[i] ? polymerHtml(polymers[i]!) : analysisHtml(r, i, adductSel.value, { ions: COMMON_ADDUCTS, stereo: r.error ? '' : stereoSummary(frags[i]), unknown: exports[i].unknownLabels, electrons: frags[i].size ? electronsHtml(countElectrons(doc, frags[i].values().next().value!)) : '', rGroups: rGroupNames(frags[i]), name: r.error || !r.smiles || rGroupNames(frags[i]).length ? '' : nameHtml(nameStates.get(r.smiles) ?? { kind: 'idle' }, i), pubchem: r.error || !r.smiles ? '' : pubchemHtml(pubchemStates.get(r.smiles) ?? { kind: 'idle' }, i), cas: r.error || !r.smiles ? undefined : casHtml(casStateOf(r.smiles), i) })).join('');
  nmrPanel.attach(panel, results.map((r, i) => (r.error || !r.smiles || polymers[i] || rGroupNames(frags[i]).length ? null : { molblock: exports[i].molblock, map: exports[i].map })));
  updatePanels();
}

/**
 * Chemistry > Stereo Group: puts the selected stereocentres in an enhanced stereo group (abs, &n
 * or orn), as in ChemDraw and V3000 molfiles, or takes them out of one.
 */
async function setStereoGroup(): Promise<void> {
  const sel = [...editor.sel.atoms].map((id) => doc.atoms.get(id)).filter((a): a is Atom => !!a);
  const centres = sel.filter((a) => live.atom(a.id) || a.enhStereo);
  if (!centres.length) { flash(sel.length ? 'None of the selected atoms is a stereocenter.' : 'Select the stereocenters to group first.'); return; }
  // the next free group number in these structures, for each kind
  const used = { and: new Set<number>(), or: new Set<number>() };
  for (const a of centres) for (const id of doc.fragmentOf(a.id)) {
    const e = doc.atoms.get(id)?.enhStereo;
    if (e && e.type !== 'abs' && !editor.sel.atoms.has(id)) used[e.type].add(e.group ?? 1);
  }
  const first = centres[0].enhStereo;
  const free = (t: 'and' | 'or') => { let n = 1; while (used[t].has(n)) n++; return n; };
  const got = await ask('Stereo group', [
    { name: 'type', label: 'Group', value: first?.type ?? 'and', options: [
      { value: 'abs', label: 'abs: configuration known as drawn' },
      { value: 'and', label: '& (AND): a mixture of both forms' },
      { value: 'or', label: 'or (OR): one form, not known which' },
      { value: 'none', label: 'None' },
    ] },
    { name: 'group', label: 'Number', value: String(first && first.type !== 'abs' ? first.group ?? 1 : free(first?.type === 'or' ? 'or' : 'and')), type: 'number' },
  ], { ok: 'Set', note: `${centres.length} stereocenter${centres.length === 1 ? '' : 's'}. Centers with the same group and number change together: &1 centers are a racemic pair, or1 centers are one unknown enantiomer.` });
  if (!got) return;
  const type = got.type as 'abs' | 'and' | 'or' | 'none';
  const group = Math.max(1, Math.round(Number(got.group) || 1));
  doc.edit('Stereo group', () => {
    for (const a of centres) doc.updateAtom(a.id, { enhStereo: type === 'none' ? undefined : type === 'abs' ? { type } : { type, group } });
  });
  editor.changed();
}

/**
 * Chemistry > Polymer or Repeat Brackets: labels the selected brackets n (a polymer's repeat unit)
 * or a number (a group repeated that many times). The atoms between the brackets are the unit.
 */
async function setRepeatGroup(): Promise<void> {
  const br = [...editor.sel.shapes].map((id) => doc.shapes.get(id)).filter((s): s is Shape => s?.kind === 'bracket');
  if (!br.length) { flash('Select the brackets first (draw them around the repeat unit with the bracket tool).'); return; }
  // the label goes on the closing bracket (lips pointing back to the left), as ChemDraw puts it
  const closing = br.find((s) => lipDirection(s).x < -0.5) ?? br[br.length - 1];
  const now = br.find((s) => s.repeat)?.repeat ?? 'n';
  const got = await ask('Polymer or repeat brackets', [{ name: 'text', label: 'Label', value: now }], {
    ok: 'Set', note: 'Type n (or another letter) for a polymer\'s repeat unit, or a number for a group repeated that many times. Leave it empty to take the label off. The atoms between the brackets are the unit; the bonds crossing them join it to the rest.',
  });
  if (!got) return;
  const text = got.text.trim();
  doc.edit('Repeat brackets', () => {
    for (const s of br) if (s.repeat && s.id !== closing.id) doc.updateShape(s.id, { repeat: undefined });
    doc.updateShape(closing.id, { repeat: text || undefined });
  });
  editor.changed();
  if (text) {
    const g = repeatGroups(doc).find((x) => x.label.id === closing.id);
    if (!g) flash('Couldn\'t find the bracket facing this one. Draw both brackets, facing each other, around the repeat unit.');
    else if (!g.inner.length) flash('There are no atoms between these brackets.');
    else flash(`${g.inner.length} atom${g.inner.length === 1 ? '' : 's'} in the repeat unit, joined by ${g.crossing.length} bond${g.crossing.length === 1 ? '' : 's'} crossing the brackets.`);
  }
}

let rGroupLast = { rows: '', prefix: '', cols: 'formula-mw', extra: 'Yield (%)' };

/**
 * Chemistry > Polymers and R-Groups > R-Group Table: a table under a core structure with R groups (R1, R2…) listing what
 * each group is in each compound, with each compound's number, formula and mass worked out by
 * putting its groups in place. The result is an ordinary table, so anything in it can be typed over.
 */
async function rGroupTable(): Promise<void> {
  const root = editor.sel.atoms.size ? [...editor.sel.atoms][0] : editor.lastEdited;
  if (root === null || !doc.atoms.has(root)) { flash('Select a structure with R groups (R1, R2, X…) first.'); return; }
  const ids = [...doc.fragmentOf(root)];
  const groups = rGroupsOf(doc, ids);
  if (!groups.length) { flash('This structure has no R groups. Type R1, R2… (or R, X, Ar) as atom labels where the groups go.'); return; }
  const labels = groups.map((g) => g.label);
  const got = await ask('R-group table', [
    { name: 'rows', label: `One compound per line: ${labels.join(', ')}`, value: rGroupLast.rows, type: 'textarea', placeholder: labels.map((_, i) => ['Me', 'H', 'Ph', 'OMe'][i % 4]).join(', ') + '\n' + labels.map((_, i) => ['OMe', 'Cl', 'CF3', 'Et'][i % 4]).join(', ') },
    { name: 'prefix', label: 'Compound number', value: rGroupLast.prefix, placeholder: 'e.g. 2 for 2a, 2b…' },
    { name: 'cols', label: 'Worked out', value: rGroupLast.cols, options: [
      { value: 'formula-mw', label: 'Formula and MW' },
      { value: 'formula-mw-exact', label: 'Formula, MW and exact mass' },
      { value: 'none', label: 'Nothing' },
    ] },
    { name: 'extra', label: 'Columns to fill in', value: rGroupLast.extra, placeholder: 'e.g. Yield (%), ee (%)' },
  ], { ok: 'Create Table', note: 'Type each compound\'s groups the way you would label an atom (Me, Ph, OMe, CO2Et, Cl, H), separated by commas, or paste cells from Excel. Start a line with #number (#12, Me, H) to give that compound its own number.' });
  if (!got) return;
  rGroupLast = { rows: got.rows, prefix: got.prefix, cols: got.cols, extra: got.extra };
  const parsed = parseRows(got.rows, labels);
  if (!parsed.length) { flash('Type at least one compound\'s groups.'); return; }
  const numbers = rowNumbers(parsed.length, got.prefix);
  const rows = parsed.map((r, i) => ({ number: r.number ?? numbers[i], values: r.values }));
  const cols = { formula: got.cols !== 'none', mw: got.cols !== 'none', exact: got.cols === 'formula-mw-exact', extra: got.extra.split(',').map((e) => e.trim()).filter((e) => e) };
  let masses: RowMass[] = rows.map(() => null);
  if (cols.formula) {
    const mols = rows.map((r) => substituted(doc, ids, Object.fromEntries(labels.map((l, k) => [l, r.values[k]]))));
    const ok = rows.map((r, i) => r.values.every((v) => v) && !mols[i].unknownLabels.length);
    const res = await chem.analyze(mols.map((m) => ({ molblock: m.molblock, map: m.map }))).catch(() => null);
    masses = rows.map((_, i) => {
      const x = res?.results[i];
      return ok[i] && x && !x.error ? { formula: x.formula, mw: x.mw, exact: x.exact } : null;
    });
  }
  const t = tableFromCells(rGroupCells(labels, rows, masses, cols), textMeasure, doc.style.captionSize);
  const atoms = ids.map((id) => doc.atoms.get(id)!);
  const top = { x: (Math.min(...atoms.map((a) => a.x)) + Math.max(...atoms.map((a) => a.x))) / 2, y: Math.max(...atoms.map((a) => a.y)) + doc.style.bondLength * 1.2 };
  placeTable(t, 'R-group table', top);
  const bad = masses.filter((m) => !m).length;
  flash(cols.formula && bad
    ? `Made the table. ${bad} compound${bad === 1 ? '\'s' : 's\''} formula couldn't be worked out (a group left empty or not recognized), shown as ?. Double-click a cell to type it in.`
    : 'Made the table. Double-click any cell to change it; the Style panel has its rows, columns and lines.', 8000);
}

/**
 * Chemistry > Chiral Flag: the boxed Abs, Rel or Rac below the selected structure (or the one
 * last drawn on), replacing a flag already there.
 */
async function setChiralFlag(): Promise<void> {
  const root = editor.sel.atoms.size ? [...editor.sel.atoms][0] : editor.lastEdited;
  if (root === null || !doc.atoms.has(root)) { flash('Select a structure first.'); return; }
  const atoms = [...doc.fragmentOf(root)].map((id) => doc.atoms.get(id)!);
  const box = { x1: Math.min(...atoms.map((a) => a.x)), y1: Math.min(...atoms.map((a) => a.y)), x2: Math.max(...atoms.map((a) => a.x)), y2: Math.max(...atoms.map((a) => a.y)) };
  const L = doc.style.bondLength;
  const near = [...doc.shapes.values()].find((s) => s.kind === 'symbol' && s.symbol && CHIRAL_FLAGS[s.symbol] && s.x1 < box.x2 + L && s.x2 > box.x1 - L && s.y1 < box.y2 + 2 * L && s.y2 > box.y1 - L);
  const got = await ask('Chiral flag', [{ name: 'flag', label: 'Flag', value: near?.symbol ?? 'Absolute', options: [
    { value: 'Absolute', label: 'Abs: the structure is one enantiomer, as drawn' },
    { value: 'Relative', label: 'Rel: relative configuration only' },
    { value: 'Racemic', label: 'Rac: a racemic mixture' },
    { value: 'none', label: 'None (remove the flag)' },
  ] }], { ok: 'Set' });
  if (!got) return;
  doc.edit('Chiral flag', () => {
    if (near) doc.removeShape(near.id);
    if (got.flag === 'none') return;
    const size = doc.style.captionSize;
    const w = measureText(CHIRAL_FLAGS[got.flag], size) + 4, h = size * 1.15 + 4;
    const x2 = box.x2 + L * 0.3, y1 = box.y2 + L * 0.6;
    doc.addShape({ kind: 'symbol', symbol: got.flag, x1: x2 - w, y1, x2, y2: y1 + h });
  });
  editor.changed();
}

/**
 * Chemistry > Show Stereo Labels: shows the R/S and E/Z labels of the selected structures (or of
 * all of them) as part of the drawing, or hides them when they are all showing already.
 */
function toggleStereoLabels(): void {
  const s = editor.sel;
  const roots = s.atoms.size || s.bonds.size ? [...s.atoms, ...[...s.bonds].map((id) => doc.bonds.get(id)?.a1 ?? -1)] : [...doc.atoms.keys()];
  const atoms = new Set<number>();
  for (const r of roots) if (doc.atoms.has(r) && !atoms.has(r)) for (const id of doc.fragmentOf(r)) atoms.add(id);
  const bonds = new Set<number>();
  for (const id of atoms) for (const bid of doc.adj.get(id) ?? []) bonds.add(bid);
  const labelled = [...atoms].filter((id) => live.atom(id)).map((id) => doc.atoms.get(id)!);
  const labelledB = [...bonds].filter((id) => live.bond(id)).map((id) => doc.bonds.get(id)!);
  if (!labelled.length && !labelledB.length) {
    flash(chem.ready ? 'No stereocenters or E/Z double bonds here.' : 'The chemistry engine is still loading.');
    return;
  }
  const show = ![...labelled, ...labelledB].every((x) => x.showStereo || x.stereoLabel);
  doc.edit(show ? 'Show stereo labels' : 'Hide stereo labels', () => setStereoShown(doc, atoms, bonds, show));
  editor.changed();
  const n = labelled.length + labelledB.length;
  flash(show ? `Showing ${n} stereo label${n === 1 ? '' : 's'}.` : `Hid ${n} stereo label${n === 1 ? '' : 's'}.`);
}

/** The R/S and E/Z labels of a structure in reading order, e.g. "R, S; E". */
function stereoSummary(frag: Set<number>): string {
  const byPlace = (p: { x: number; y: number }, q: { x: number; y: number }) => p.y - q.y || p.x - q.x;
  // the drawing may have changed while the analysis ran: skip atoms that have gone
  const centres = [...frag].map((id) => doc.atoms.get(id)).filter((a): a is Atom => !!a && !!live.atom(a.id)).sort(byPlace).map((a) => shownDescriptor(live.atom(a.id)!));
  const dbl: { x: number; y: number; l: string }[] = [];
  for (const id of frag) for (const bid of doc.adj.get(id) ?? []) {
    const b = doc.bonds.get(bid);
    const l = b && b.a1 === id ? live.bond(bid) : null;
    if (b && l) { const p = doc.atoms.get(b.a1)!, q = doc.atoms.get(b.a2)!; dbl.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, l: shownDescriptor(l) }); }
  }
  dbl.sort(byPlace);
  return [centres.join(', '), dbl.map((d) => d.l).join(', ')].filter(Boolean).join('; ');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

// ---------------------------------------------------------------- chemistry warnings

const warnBox = $<HTMLInputElement>('#show-warnings');
warnBox.addEventListener('change', () => {
  renderer.showWarnings = warnBox.checked;
  renderer.repaintAll();
  editor.requestScene();
});
const warnTip = $<HTMLDivElement>('#warn-tip');
let warnKey = '';

/** The Warnings panel and the tip shown when pointing at a problem. Runs after each paint. */
function updateWarnings(): void {
  // tip for the atom or bond under the pointer
  const h = editor.hover;
  let tip: string[] | undefined;
  let at: { x: number; y: number } | null = null;
  if (h?.kind === 'atom') {
    const a = doc.atoms.get(h.id);
    if (a) { tip = checks.forAtom(a); at = a; }
  } else if (h?.kind === 'caption') {
    const c = doc.captions.get(h.id);
    const w = c && !c.ignoreWarnings ? captionChemWarning(doc, c, editor.measure()) : null;
    if (c && w) { tip = [w]; const b = renderer.captionBox(c); at = { x: b.x1, y: b.y2 }; }
  } else if (h?.kind === 'bond') {
    const b = doc.bonds.get(h.id);
    if (b) {
      tip = checks.forBond(b);
      const p = doc.atoms.get(b.a1)!, q = doc.atoms.get(b.a2)!;
      at = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    }
  }
  if (tip && at && renderer.showWarnings) {
    const s = renderer.toScreen(at);
    warnTip.textContent = tip.join(' ');
    warnTip.hidden = false;
    const w = warnTip.offsetWidth, ht = warnTip.offsetHeight;
    warnTip.style.left = `${Math.max(4, Math.min(renderer.width - w - 4, s.x + 14))}px`;
    warnTip.style.top = `${s.y + 16 + ht > renderer.height ? s.y - 16 - ht : s.y + 16}px`;
  } else warnTip.hidden = true;

  // the list, redone only when the warnings or the drawing changed
  const key = checks.version + ':' + doc.version + ':' + labelWarnVersion;
  if (key === warnKey) return;
  warnKey = key;
  const list: { kind: 'atom' | 'bond' | 'caption'; id: number; text: string[] }[] = checks.list();
  for (const [id, text] of labelWarnings) if (doc.captions.has(id)) list.push({ kind: 'caption', id, text: [text] });
  // text boxes read as chemistry: an ion without its charge, text set to Chemical that can't be read
  for (const c of doc.captions.values()) {
    if (c.ignoreWarnings) continue;
    const w = captionChemWarning(doc, c, editor.measure());
    if (w) list.push({ kind: 'caption', id: c.id, text: [w] });
  }
  const ignored = checks.ignoredCount() + [...doc.captions.values()].filter((c) => c.ignoreWarnings).length;
  $('#warnings-count').textContent = list.length ? String(list.length) : '';
  warningsBox.set(list.length);
  const MAX = 100;
  // the same problem in many places is one row, with how many
  const groups = groupWarnings(list);
  const rows = groups.slice(0, MAX).map((g, i) => {
    const n = g.items.length;
    return `<li><button class="w-text" data-i="${i}" title="${n > 1 ? 'Show them on the drawing, one by one' : 'Show it on the drawing'}">${n > 1 ? `<b class="w-count">${n}×</b> ` : ''}${escapeHtml(g.text)}</button>` +
      `<button class="w-ignore" data-i="${i}" title="Stop flagging ${n > 1 ? 'these' : 'this one'} (saved with the file)">${n > 1 ? 'Ignore All' : 'Ignore'}</button></li>`;
  }).join('');
  $('#warnings-body').innerHTML =
    (list.length ? `<ul class="warn-list">${rows}</ul>${groups.length > MAX ? `<p class="muted small">and ${groups.length - MAX} more</p>` : ''}` : '<p class="muted">No problems found.</p>') +
    (ignored ? `<p class="muted small">${ignored} ignored. <button id="w-unignore">Show them again</button></p>` : '');
  const shown = groups.slice(0, MAX);
  const next = new Map<number, number>();
  for (const b of document.querySelectorAll<HTMLButtonElement>('#warnings-body .w-text')) {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.i), g = shown[i], k = next.get(i) ?? 0;
      const w = g.items[k % g.items.length];
      next.set(i, k + 1);
      editor.reveal(w.kind, w.id);
      if (g.items.length > 1) flash(`${k % g.items.length + 1} of ${g.items.length}: ${g.text}`);
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#warnings-body .w-ignore')) {
    b.addEventListener('click', () => {
      const g = shown[Number(b.dataset.i)];
      doc.edit(g.items.length > 1 ? 'Ignore warnings' : 'Ignore warning', () => {
        for (const w of g.items) {
          if (w.kind === 'atom') doc.updateAtom(w.id, { ignoreWarnings: true });
          else if (w.kind === 'bond') doc.updateBond(w.id, { ignoreWarnings: true });
          else doc.updateCaption(w.id, { ignoreWarnings: true });
        }
      });
      editor.changed();
    });
  }
  $('#w-unignore')?.addEventListener('click', () => {
    doc.edit('Show ignored warnings', () => {
      for (const id of checks.atoms.keys()) if (doc.atoms.get(id)?.ignoreWarnings) doc.updateAtom(id, { ignoreWarnings: false });
      for (const id of checks.bonds.keys()) if (doc.bonds.get(id)?.ignoreWarnings) doc.updateBond(id, { ignoreWarnings: false });
      for (const c of doc.captions.values()) if (c.ignoreWarnings) doc.updateCaption(c.id, { ignoreWarnings: undefined });
    });
    editor.changed();
  });
}

/** Chemistry > Check Structure: go to the next problem after the one selected. */
/** Draw Next Intermediate and Check Arrows in the menus, or not (Settings ▸ Drawing). */
function showArrowProducts(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-cmd="draw-from-arrows"], [data-cmd="check-arrows"], #arrow-products-rule')) el.hidden = !editor.options.arrowProducts;
}

/** Check Arrows: each problem with the mechanism arrows in turn, selected and said (like Check Structure). */
let arrowIssue = 0;
function checkArrows(): void {
  if (!editor.options.arrowProducts) { flash('Check Arrows is turned off in Edit ▸ Settings ▸ Drawing.'); return; }
  const list = editor.checkArrows();
  if (list === 'many') { flash('The arrows are on more than one step: select an arrow or the structure of the step to check.', 5000); return; }
  if (list === 'none') { flash('There are no curved (mechanism) arrows on a structure to check.'); return; }
  if (!list.length) { flash('The arrows make sense: each starts at electrons that are there, and nothing ends up past an octet.', 5000); return; }
  arrowIssue = arrowIssue % list.length;
  const w = list[arrowIssue];
  editor.pickIssues([w]);
  flash(`${list.length > 1 ? `${arrowIssue + 1} of ${list.length}: ` : ''}${w.level === 'warning' ? 'Worth a look: ' : ''}${w.text}`, 9000);
  arrowIssue++;
}

function checkStructure(): void {
  const list = checks.list();
  if (!list.length) {
    flash(checks.ignoredCount() ? 'No problems found (apart from the ones you chose to ignore).' : 'No problems found.');
    return;
  }
  const cur = list.findIndex((w) => (w.kind === 'atom' ? editor.sel.atoms : editor.sel.bonds).has(w.id));
  const w = list[(cur + 1) % list.length];
  editor.reveal(w.kind, w.id);
  flash(`${(cur + 1) % list.length + 1} of ${list.length}: ${w.text.join(' ')}`);
}

// ---------------------------------------------------------------- speed panel

const chemTimes: number[] = [];

function stat(xs: number[]): { last: number; med: number; p95: number } {
  if (!xs.length) return { last: 0, med: 0, p95: 0 };
  const s = [...xs].sort((a, b) => a - b);
  return { last: xs[xs.length - 1], med: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] };
}

/** The pen's last stroke, for tablets: how often the pen reported and how often the screen
 * caught up, what each report cost and how long a paint took. */
function penRow(): string {
  const m = editor.penMoves, f = editor.dragFrames;
  if (m.length < 2) return '';
  // the last stroke: moves less than a quarter second apart
  let i = m.length - 1;
  while (i > 0 && m[i].t - m[i - 1].t < 250) i--;
  const s = m.slice(i);
  if (s.length < 2) return '';
  const span = (s[s.length - 1].t - s[0].t) / 1000 || 1;
  const fr = f.filter((x) => x.t >= s[0].t && x.t <= s[s.length - 1].t + 50);
  const pts = s[0].n < 0 ? 'no extra points from the browser' : `${(s.reduce((a, x) => a + x.n, 0) / s.length).toFixed(1)} points each`;
  const work = stat(s.map((x) => x.ms)), paint = stat(fr.map((x) => x.ms));
  return `<tr><th>Pen stroke</th><td>${Math.round((s.length - 1) / span)} reports/s (${pts}), screen ${Math.round(fr.length / span)} frames/s<br>
    <span class="muted">handling ${work.med.toFixed(1)} ms (95% ${work.p95.toFixed(1)}), paint ${paint.med.toFixed(1)} ms (95% ${paint.p95.toFixed(1)})</span></td></tr>`;
}

let panelQueued = false;
function updatePanels(): void {
  if (panelQueued || !devTools) return;
  panelQueued = true;
  requestAnimationFrame(() => {
    panelQueued = false;
    const lat = stat(editor.latencies);
    const ch = stat(chemTimes);
    const ok = (v: number, lim: number) => `<span class="${v <= lim ? 'ok' : 'slow'}">${v.toFixed(1)}</span>`;
    $('#speed-body').innerHTML = `
      <table>
        <tr><th>Input → screen</th><td>${ok(lat.last, 16)} ms <span class="muted">(median ${lat.med.toFixed(1)}, 95% ${lat.p95.toFixed(1)})</span></td></tr>
        ${penRow()}
        <tr><th>Full redraw</th><td>${ok(renderer.lastSceneMs, 16)} ms</td></tr>
        <tr><th>Chemistry</th><td>${chem.ready ? `${ok(ch.last, 50)} ms <span class="muted">(engine loaded in ${chem.loadMs.toFixed(0)} ms)</span>` : chem.error ? `<span class="slow">${escapeHtml(chem.error)}</span>` : 'loading…'}</td></tr>
        <tr><th>Drawing size</th><td>${doc.atoms.size.toLocaleString()} atoms, ${doc.bonds.size.toLocaleString()} bonds, ${doc.captions.size.toLocaleString()} captions</td></tr>
        <tr><th>Zoom</th><td>${Math.round((renderer.view.scale * 72 / 96) * 100)}%</td></tr>
      </table>
      ${lastOpen ? `<p class="muted small">${escapeHtml(lastOpen)}</p>` : ''}
      ${lastStats ? '' : ''}`;
  });
}

// font, size and other typed boxes get drop-downs that list every choice
installFontList();
installCombos();
// the free fonts that come with the app load when first used; then text is measured and drawn again
let fontRedraw = 0;
registerBundledFonts(() => {
  clearTimeout(fontRedraw);
  fontRedraw = window.setTimeout(() => {
    forgetTextWidths();
    doc.allDirty = true;
    editor.changed();
    docMode?.fontsChanged();
  }, 50);
});
// the icon library loads the first time something needs it (Design > Icons, a file with icons in it, a
// diagram); then anything with icons in it is drawn again
whenIconsLoaded(() => {
  // (only a drawing with shapes can hold icons: a big structure opened at start-up isn't drawn twice)
  if (doc.shapes.size) doc.allDirty = true;
  editor.changed();
  // a document's figures were recorded without them (empty, and too small)
  figures.forget();
  docMode?.fontsChanged();
});
// Design's Home tab has the same Font and Paragraph groups as the Presentation ribbon: one copy
// of them in the page, cloned into Design's ribbon, run by a second SlideTextRibbon
{
  const slot = document.querySelector<HTMLElement>('#design-ribbon [data-tx-slot]');
  if (slot) slot.replaceWith(...[...document.querySelectorAll<HTMLElement>('#ribbon [data-sl-text]')].map((g) => {
    const c = g.cloneNode(true) as HTMLElement;
    // the font sizes' list stays one (the copy's box uses it by its id)
    c.querySelectorAll('datalist, [id]').forEach((x) => (x instanceof HTMLDataListElement ? x.remove() : x.removeAttribute('id')));
    return c;
  }));
}
buildSelectGalleries();
buildColourGalleries();
applyRibbonIcons();
applyIconSet();
installRibbonFlyouts();

const stylePanel = new StylePanel($('#style-section'), $('#style-body'), doc, () => editor.sel, () => editor.changed());
stylePanel.onEditChart = (id) => void editChartShape(id);
stylePanel.turnable = () => editor.textFirst;
stylePanel.onEditMedia = (id) => void editMediaShape(id);
stylePanel.pickShape = (anchor, pick) => shapeMenu.show(anchor, 'Click a shape: the one selected changes to it, keeping its size, colors and text.', pick);
stylePanel.onEditEquation = (id) => void editEquationShape(id);
stylePanel.onEquationColour = (ids, color) => {
  doc.edit('Equation color', () => {
    for (const id of ids) {
      const s = doc.shapes.get(id);
      if (!s?.math) continue;
      const math = { ...s.math, color };
      doc.updateShape(id, { math, src: shapeMathPicture(math, measureText) });
    }
  });
  editor.changed();
};
stylePanel.applyLabel = (id, text) => editor.applyLabel(id, text);
stylePanel.tie = (ids) => tieCaptions(ids);
stylePanel.bracketPartner = { state: () => editor.bracketPartnerState(), toggle: () => editor.toggleBracketPartner() };

/**
 * Tie captions (text boxes) to a structure: `to` (a selected structure's atoms), or else the one
 * nearest each. They stay where they are, or go to the side chosen in Edit > Settings.
 */
function tieCaptions(ids: number[], to: Set<number> | null = null): void {
  const m = editor.measure();
  let n = 0;
  doc.edit('Link text to structure', () => {
    for (const id of ids) {
      const c = doc.captions.get(id);
      if (!c) continue;
      const f = to ?? nearestStructure(doc, m.captionBox(c), m);
      if (!f?.size) continue;
      const side = linkSide === 'keep' ? undefined : linkSide;
      const a = side ? { atoms: [...f], side, gap: defaultGap(doc), shift: 0, role: 'caption' as const } : attachWhereItIs(doc, c, f, m, 'caption');
      if (!a) continue;
      doc.updateCaption(id, { attach: a, ...(side ? { justify: side === 'right' ? 'left' as const : side === 'left' ? 'right' as const : 'center' as const } : {}) });
      n++;
    }
  });
  editor.changed();
  flash(n ? `Linked: the text now moves with its structure. Selecting either one shows the link.` : 'There is no structure to link it to.');
}

/** Format > Link Text to Structure: the selected text to the selected structure (or the nearest). */
function linkText(): boolean {
  const caps = [...editor.sel.captions].filter((id) => doc.captions.has(id));
  if (!caps.length) return false;
  const first = [...editor.sel.atoms].find((id) => doc.atoms.has(id));
  tieCaptions(caps, first === undefined ? null : doc.fragmentOf(first));
  return true;
}

/** Format > Unlink Text: the selected text (or the text tied to the selected structures) stays put. */
function unlinkText(): boolean {
  const ids = new Set([...editor.sel.captions].filter((id) => doc.captions.get(id)?.attach));
  for (const c of doc.captions.values()) if (c.attach?.atoms.some((a) => editor.sel.atoms.has(a))) ids.add(c.id);
  if (!ids.size) return false;
  doc.edit('Unlink text', () => { for (const id of ids) doc.updateCaption(id, { attach: undefined }); });
  editor.changed();
  return true;
}
// ---------------------------------------------------------------- right-click menu on the drawing

/**
 * What the right-click menu offers: the usual editing commands, then the top menus' commands
 * that fit what was clicked (a structure, an arrow, shapes or empty space), grouped as they are
 * at the top so they are found in the same place.
 */
/** The bond right-clicked last, for Fuse a Ring Here. */
let contextBond: number | null = null;
/** The atom the right-click menu opened on, and whether the menu's commands are for every selected atom (it was one of several picked before). */
let contextAtom: { id: number; all: boolean } | null = null;

/**
 * Repeat Label (right-click an atom after typing a label on another): the label last typed goes on
 * the atom right-clicked, or on every selected atom when it was one of several picked. From a key:
 * the selected atoms, or else the atom under the pointer.
 */
function repeatLabel(at: { id: number; all: boolean } | null): boolean {
  const last = editor.lastLabel;
  if (!last) { flash('Type a label on an atom first (NHAc, OTBS…); then Repeat Label puts the same label on other atoms.'); return false; }
  const hover = editor.hover?.kind === 'atom' ? [editor.hover.id] : [];
  const ids = at ? (at.all ? [...editor.sel.atoms] : [at.id]) : editor.sel.atoms.size ? [...editor.sel.atoms] : hover;
  if (editor.repeatLabel(ids)) return true;
  flash(`Select the atoms to label “${last.text}”, or right-click one.`);
  return false;
}

/** The right-click menu's Repeat “NHAc” Label, when a label has been typed and the menu opened on an atom. */
function repeatLabelMenu(): MenuItem[] {
  const last = editor.lastLabel;
  if (!last || !contextAtom || !editor.doc.atoms.has(contextAtom.id)) return [];
  const n = contextAtom.all ? editor.sel.atoms.size : 1;
  const shown = [...last.text].length > 24 ? `${[...last.text].slice(0, 23).join('')}…` : last.text;
  return [{ cmd: 'repeat-label:here', label: `Repeat “${shown}” Label${n > 1 ? ` on ${n} Atoms` : ''}` }, null];
}
/** The conformers Fuse a Ring Here offers, in this order. */
const FUSE_RINGS = ['chair', 'boat', 'twist-boat', 'half-chair', 'cyclohexanone', 'envelope', 'c5-twist', 'cyclopentene', 'cyclobutane', 'c7-twist-chair'];

/** Right-click on a bond of a ring drawn in 3-D: the conformers that can join it, each way they can. */
/** Ligands offered on right-clicking a metal, as in the Ligands palette. */
const MENU_LIGANDS = ['pph3', 'pcy3', 'co', 'mecn', 'py', 'cp', 'cpstar', 'benzene', 'allyl', 'ethylene', 'cod', 'dppe', 'dppf', 'binap', 'bipy', 'phen', 'acac', 'imes'];

/** Right-click on metals and hapto bonds: add a ligand, bond to a ring's middle, split a hapto bond, expand a ligand label. */
function metalMenu(): MenuItem[] {
  const out: MenuItem[] = [];
  const metal = editor.selectedMetal();
  if (metal !== null) out.push({ label: 'Add Ligand', items: [...MENU_LIGANDS.map((id) => ({ cmd: `add-ligand:${id}`, label: templateById(id)?.name ?? id })), null, { cmd: 'ligand-library', label: 'More in the Ligand Library…' }] });
  const sel = [...editor.sel.atoms].map((id) => doc.atoms.get(id)).filter((a): a is Atom => !!a && !a.multi);
  if (metal !== null && sel.length >= 3) out.push({ cmd: 'hapto-bond' });
  const hapto = (bid: number) => { const b = doc.bonds.get(bid); return !!b && !!centreEnd(doc, b); };
  if ((contextBond !== null && hapto(contextBond)) || [...editor.sel.atoms].some((id) => (doc.adj.get(id) ?? []).some(hapto))) out.push({ cmd: 'split-hapto' });
  if (editor.haptoCentresPicked(contextBond).length) out.push({ cmd: 'hapto-kekule' });
  if (editor.expandableLabels().length) out.push({ cmd: 'expand-label' }, { cmd: 'expand-label-full' });
  return out;
}

function fuseRingMenu(): MenuItem[] {
  if (contextBond === null) return [];
  const ways = editor.ringFusions(contextBond, FUSE_RINGS);
  if (!ways.length) return [];
  const items: MenuItem[] = [];
  for (const id of FUSE_RINGS) {
    const mine = ways.filter((w) => w.id === id);
    if (!mine.length) continue;
    items.push(mine.length === 1
      ? { cmd: `fuse-ring:${id}:${mine[0].index}`, label: mine[0].name }
      : { label: mine[0].name, items: mine.map((w) => ({ cmd: `fuse-ring:${id}:${w.index}`, label: w.note[0].toUpperCase() + w.note.slice(1) })) });
  }
  return [{ label: 'Fuse a Ring Here', items }];
}

/** Right-click on text: read it as chemistry or as plain text (the one in use ticked). */
function readAsMenu(): MenuItem {
  const caps = [...editor.sel.captions].map((id) => doc.captions.get(id)).filter((c): c is Caption => !!c);
  const now = new Set<string>(caps.map((c) => (c.chem === undefined ? 'auto' : c.chem ? 'on' : 'off')));
  const tick = (k: string) => now.size === 1 && now.has(k);
  const m = editor.measure();
  const reads = caps.length === 1 ? captionReading(doc, caps[0], m) : null;
  const auto = reads?.species ? ' (Now: Chemistry)' : reads && !reads.forced ? ' (Now: Text)' : '';
  return { label: 'Read Text As', items: [
    { cmd: 'caption-chem:auto', label: 'Automatically' + auto, checked: tick('auto') },
    { cmd: 'caption-chem:on', label: 'Chemical', checked: tick('on') },
    { cmd: 'caption-chem:off', label: 'Plain Text', checked: tick('off') },
  ] };
}

/** The atom a right-click > Attachment Point command is for: the atom clicked, or the one atom selected. */
function attachPointAtom(): number | null {
  if (contextAtom && !contextAtom.all) return contextAtom.id;
  return editor.sel.atoms.size === 1 && !editor.sel.bonds.size ? [...editor.sel.atoms][0] : null;
}

/** Right-click > Attachment Point > Wavy Bond, Star, Numbered or Remove. */
function attachPointCommand(kind: 'Wavy' | 'Star' | 'Numbered' | null): void {
  const id = attachPointAtom();
  if (id === null) { flash('Right-click the atom that gets the attachment point (a ring carbon gets a new bond to it).'); return; }
  editor.setAttachPoint(id, kind);
}

/** Right-click > Attachment Point, with the kind the atom has ticked. */
function attachPointMenu(): MenuItem[] {
  const id = attachPointAtom();
  const a = id === null ? undefined : doc.atoms.get(id);
  if (!a || a.multi) return [];
  const kind = a.attach === 'Wavy' ? 'wavy' : a.attach === 'Star' ? 'star' : a.attach ? 'numbered' : '';
  return [{ label: 'Attachment Point', items: [
    { cmd: 'attach-wavy', label: 'Wavy Bond', checked: kind === 'wavy' }, { cmd: 'attach-star', label: 'Star', checked: kind === 'star' }, { cmd: 'attach-numbered', label: 'Numbered', checked: kind === 'numbered' },
    ...(a.attach ? [null, { cmd: 'attach-remove', label: 'Remove Attachment Point' }] : []),
  ] }];
}

/** The bonds a right-click bond command changes: the selected ones, or the one clicked. */
function menuBonds(): Bond[] {
  const ids = editor.sel.bonds.size ? [...editor.sel.bonds] : contextBond !== null ? [contextBond] : [];
  return ids.map((id) => doc.bonds.get(id)).filter((b): b is Bond => !!b && !centreEnd(doc, b));
}

/**
 * Right-click on bonds: every bond type, grouped by order as ChemDraw's menu has them (Single,
 * Double, Triple…), each with its styles, ticked where all the bonds are that type.
 */
function bondMenu(): MenuItem[] {
  const bonds = menuBonds();
  if (!bonds.length) return [];
  const all = (f: (b: Bond) => boolean) => bonds.every(f);
  const as = (order: number, display: BondDisplay, label: string): MenuItem =>
    ({ cmd: `bond-as:${order}:${display}`, label, checked: all((b) => b.order === order && b.display === display) });
  const doubles = all((b) => b.order === 2 && b.display !== 'wavy');
  return [
    { label: 'Single', items: [
      as(1, 'solid', 'Plain'), as(1, 'dash', 'Dashed'), as(1, 'hash', 'Hashed'), as(1, 'hashWedge', 'Hashed Wedged'), as(1, 'bold', 'Bold'),
      as(1, 'wedge', 'Bold Wedged'), as(1, 'hollowWedge', 'Hollow Wedged'), as(1, 'wavyWedge', 'Wavy Wedged'), as(1, 'dative', 'Dative'), as(1, 'wavy', 'Wavy'),
    ] },
    { label: 'Double', items: [
      as(2, 'solid', 'Plain'), as(2, 'bold', 'Bold'), as(2, 'dash', 'Dashed'), as(2, 'wavy', 'Crossed (E or Z)'),
      ...(doubles ? [null,
        { label: 'Second Line Style', items: (['plain', 'dash', 'bold', 'hash'] as const).map((v): MenuItem => ({ cmd: `bond-line2:${v}`, label: { plain: 'Plain', dash: 'Dashed', bold: 'Bold', hash: 'Hashed' }[v], checked: all((b) => (b.line2 ?? 'plain') === v) })) },
        { label: 'Second Line Position', items: (['auto', 'left', 'center', 'right'] as const).map((v): MenuItem => ({ cmd: `bond-pos:${v}`, label: { auto: 'Automatic', left: 'Left', center: 'Centered', right: 'Right' }[v], checked: all((b) => b.dpos === v) })) },
      ] : []),
    ] },
    { label: 'Triple', items: [as(3, 'solid', 'Plain'), as(3, 'bold', 'Bold')] },
    { label: 'Other', items: [
      as(4, 'solid', 'Quadruple'), as(1.5, 'solid', 'Aromatic'), as(PARTIAL, 'dash', 'Partial (Transition State)'), null,
      as(1, 'hydrogen', 'Hydrogen Bond'), as(1, 'ionic', 'Ionic Bond'),
    ] },
    { cmd: 'show-style', label: 'Bond Properties…' },
    null,
  ];
}

/** Right-click ▸ Single/Double/Triple/Other ▸ …, Second Line Style and Position: change the bonds (one undo step). */
function bondFromMenu(name: string): boolean {
  const bonds = menuBonds();
  if (!bonds.length) return false;
  const [kind, a, b2] = name.split(':');
  doc.edit('Bond type', () => {
    for (const b of bonds) {
      if (kind === 'bond-line2') doc.updateBond(b.id, { line2: a === 'plain' ? undefined : a as Bond['line2'] });
      else if (kind === 'bond-pos') doc.updateBond(b.id, { dpos: a as Bond['dpos'] });
      else {
        const order = Number(a), display = b2 as BondDisplay;
        doc.updateBond(b.id, { order, display, ...(order !== 2 ? { line2: undefined } : {}), ...(order !== b.order ? { dpos: 'auto' as const } : {}) });
        straightenAt(doc, b.id);
      }
    }
  });
  editor.changed();
  return true;
}

/** The arrows a right-click arrow command changes: the selected ones (drawn arrows, not a picture's). */
function menuArrows(): Arrow[] {
  return [...editor.sel.arrows].map((id) => doc.arrows.get(id)).filter((a): a is Arrow => !!a);
}

/**
 * Right-click on arrows: ChemDraw's three sets of three, the line (Plain, Dashed, Bold), the head
 * (Solid, Hollow, Angled) and the marks (No-Go Cross or Hash, Dipole), ticked where all the arrows have it.
 */
function arrowMenu(): MenuItem[] {
  const arrows = menuArrows();
  if (!arrows.length) return [];
  const all = (f: (a: Arrow) => boolean) => arrows.every(f);
  // (each set of three in a group of its own, so the menu fits a laptop's window)
  return [
    { label: 'Line', items: [
      { cmd: 'arrow-as:line:solid', label: 'Plain', checked: all((a) => a.line === 'solid') },
      { cmd: 'arrow-as:line:dashed', label: 'Dashed', checked: all((a) => a.line === 'dashed') },
      { cmd: 'arrow-as:line:bold', label: 'Bold', checked: all((a) => a.line === 'bold') },
    ] },
    { label: 'Arrowhead', items: [
      { cmd: 'arrow-as:head:solid', label: 'Solid Arrowhead', checked: all((a) => a.headType === 'solid') },
      { cmd: 'arrow-as:head:hollow', label: 'Hollow Arrowhead', checked: all((a) => a.headType === 'hollow') },
      { cmd: 'arrow-as:head:angle', label: 'Angled Arrowhead', checked: all((a) => a.headType === 'angle') },
    ] },
    { label: 'No-Go and Dipole', items: [
      { cmd: 'arrow-as:nogo:cross', label: 'No-Go (Cross)', checked: all((a) => a.noGo && !a.noGoKind) },
      { cmd: 'arrow-as:nogo:hash', label: 'No-Go (Hash)', checked: all((a) => a.noGo && a.noGoKind === 'hash') },
      { cmd: 'arrow-as:dipole', label: 'Dipole', checked: all((a) => !!a.dipole) },
    ] },
    { cmd: 'show-style', label: 'Arrow Properties…' },
    null,
  ];
}

/** Right-click ▸ Plain/Dashed/Bold, Solid/Hollow/Angled Arrowhead, No-Go, Dipole: change the arrows (one undo step). Ticked marks toggle off. */
function arrowFromMenu(name: string): boolean {
  const arrows = menuArrows();
  if (!arrows.length) return false;
  const [, kind, v] = name.split(':');
  const on = (f: (a: Arrow) => boolean) => arrows.every(f);
  const patch: Partial<Arrow> =
    kind === 'line' ? { line: v as Arrow['line'] }
    : kind === 'head' ? { headType: v as Arrow['headType'] }
    : kind === 'nogo' ? (on((a) => a.noGo && (a.noGoKind ?? 'cross') === v) ? { noGo: false, noGoKind: undefined } : { noGo: true, noGoKind: v === 'hash' ? 'hash' : undefined })
    : { dipole: on((a) => !!a.dipole) ? undefined : true };
  doc.edit(kind === 'nogo' ? 'No-go arrow' : kind === 'dipole' ? 'Dipole arrow' : kind === 'head' ? 'Arrowhead shape' : 'Arrow line', () => {
    for (const a of arrows) doc.updateArrow(a.id, patch);
  });
  editor.changed();
  return true;
}

function drawingMenu(): MenuItem[] {
  const s = editor.sel;
  const any = s.atoms.size + s.bonds.size + s.captions.size + s.arrows.size + s.shapes.size > 0;
  const atoms = s.atoms.size > 0;
  const loneAtom = s.atoms.size === 1 && s.bonds.size + s.captions.size + s.arrows.size + s.shapes.size === 0;
  const texts = selectedSpecies().length > 0;
  const shapes = [...s.shapes].map((id) => doc.shapes.get(id)).filter((x): x is Shape => !!x);
  const design = ws.active.mode === 'design';
  const view: MenuItem = { label: 'View', items: [{ cmd: 'zoom-in' }, { cmd: 'zoom-out' }, { cmd: 'zoom-fit' }, { cmd: 'zoom-selection' }, { cmd: 'zoom-actual' }, null, { cmd: 'show-stereo' }, { cmd: 'group-tips' }, { cmd: 'tool-tips' }, { cmd: 'scroll-bars' }, null, { cmd: 'dark-page' }, { cmd: 'dark-colours' }] };
  if (!any) {
    return [
      { cmd: 'paste' }, { cmd: 'paste-smiles' }, { cmd: 'select-all' }, null,
      { cmd: 'undo' }, { cmd: 'redo' }, null,
      ...(ws.active.mode === 'slides' ? [{ cmd: 'new-comment', label: 'New Comment' }, { cmd: 'show-comments', label: 'Show Comments' }, null] : []),
      ...(ws.active.mode === 'slides' || design ? [{ cmd: 'format-background', label: 'Format Background…' }, { cmd: 'slide-references', label: 'References on Slide…' }, null] : []),
      ...(ws.active.mode === 'slides' && deckNow()?.current?.canvas ? [{ label: 'Keyframes', items: keyframeMenu() }, null] : []),
      { label: 'Insert', items: [{ cmd: 'name-to-structure' }, { cmd: 'sequence-to-structure' }, { cmd: 'periodic-table' }, { cmd: 'insert-picture' }, { cmd: 'import-picture', label: 'Structure from Picture…' }, { cmd: 'text-box' }, { cmd: 'insert-reference', label: 'Reference…' }, { cmd: 'insert-symbol' }, ...(design ? [{ cmd: 'design-shapes', label: 'Shape…' }, { cmd: 'design-icons', label: 'Icon…' }, { cmd: 'connector-tool' }] : []), ...(ws.active.mode === 'slides' ? [{ cmd: 'slide-shapes', label: 'Shape…' }, { cmd: 'slide-icons', label: 'Icon…' }] : [])] },
      { label: 'Scheme', items: [{ cmd: 'clean-up-reaction' }, { cmd: 'arrange-scheme' }, { cmd: 'number-compounds' }, { cmd: 'catalytic-cycle' }, { cmd: 'energy-diagram' }, { cmd: 'ts-brackets' }, null, { cmd: 'animate-reaction' }] },
      { cmd: 'drawing-style' },
      ...(ws.active.mode === 'drawing' && pageEdgesMenu() ? [pageEdgesMenu()!] : []),
      view,
    ];
  }
  const arrange: MenuItem[] = [
    { cmd: 'align-left' }, { cmd: 'align-hcenter' }, { cmd: 'align-right' }, null,
    { cmd: 'align-top' }, { cmd: 'align-vcenter' }, { cmd: 'align-bottom' }, null,
    { cmd: 'distribute-h' }, { cmd: 'distribute-v' }, null,
    { cmd: 'arrange-row' }, { cmd: 'arrange-column' }, { cmd: 'arrange-grid' },
  ];
  const turn: MenuItem[] = [
    { cmd: 'flip-h' }, { cmd: 'flip-v' }, { cmd: 'flip-h-keep' }, { cmd: 'flip-v-keep' }, null,
    { cmd: 'rotate-cw' }, { cmd: 'rotate-ccw' }, { cmd: 'rotate-180' }, { cmd: 'rotate-dialog' }, null, { cmd: 'scale' },
  ];
  const order: MenuItem[] = shapes.length || s.bonds.size || s.atoms.size || s.captions.size || s.arrows.size
    ? [{ cmd: 'shape-front', label: 'Bring to Front' }, { cmd: 'shape-forward', label: 'Bring Forward' }, { cmd: 'shape-backward', label: 'Send Backward' }, { cmd: 'shape-back', label: 'Send to Back' }]
    : [];
  // what the menu leads with: the atoms, the bonds, or the whole structure (and anything else) picked
  const focus = menuFocus();
  const bonds = focus === 'bond' ? bondMenu() : [];
  const arrows = arrowMenu();
  // (the bond and arrow commands end with their own Properties…)
  const props: MenuItem[] = bonds.length || arrows.length ? [] : [{ cmd: 'show-style', ...(focus === 'atom' && !s.captions.size ? { label: 'Atom Properties…' } : {}) }];
  return [
    { row: [{ cmd: 'cut' }, { cmd: 'copy' }, { cmd: 'paste' }, { cmd: 'delete', label: 'Delete' }] },
    null,
    ...(focus === 'atom' ? atomMenu() : repeatLabelMenu()),
    ...bonds,
    ...fuseRingMenu(),
    ...(focus === 'bond' && s.bonds.size <= 2 && !s.arrows.size ? [{ cmd: 'homolysis-arrows' }] : []),
    ...arrows,
    ...(editor.selectedEnergy() !== null ? [{ cmd: 'edit-energy' }, null] : []),
    ...(editor.selectedTorsion() !== null ? [{ cmd: 'edit-torsion' }, { cmd: 'copy-torsion-data' }, null] : []),
    ...(editor.selectedNewman() !== null ? [{ cmd: 'edit-newman' }, ...(doc.shapes.get(editor.selectedNewman()!)?.newman?.link ? [{ cmd: 'unlink-newman' }] : []), null] : []),
    ...(editor.selectedPlate() !== null ? [{ cmd: 'edit-plate' }, null] : []),
    ...(selectedOrbitals().length ? [{ cmd: 'edit-orbital' }, null] : []),
    ...(editor.selectedDiagram() !== null ? [{ cmd: 'edit-diagram' }, { cmd: 'diagram-to-shapes' }, null] : []),
    ...(s.captions.size ? [readAsMenu(), ...(texts && !atoms ? [{ cmd: 'expand-label', label: 'Expand to Structure' }, { cmd: 'expand-label-full', label: 'Expand to Full Structure' }] : [])] : []),
    ...(s.captions.size ? [{ cmd: 'link-text' }] : []),
    ...([...s.captions].some((id) => doc.captions.get(id)?.runs.some((r) => r.link))
      ? [{ cmd: 'open-link', label: 'Open Link' }, { cmd: 'insert-link', label: 'Edit Link…' }, { cmd: 'remove-link', label: 'Remove Link' }]
      : s.captions.size ? [{ cmd: 'insert-link', label: 'Link…' }] : []),
    ...([...s.captions].some((id) => doc.captions.get(id)?.attach) ? [{ cmd: 'unlink-text' }] : []),
    null,
    ...(atoms ? [
      { cmd: 'clean-up' },
      ...ringShapeMenu(),
      ...metalMenu(),
      { label: 'Structure', items: [
        { cmd: 'clean-up-options' }, null,
        { cmd: 'stereo-labels' }, { cmd: 'aromatic-circles' }, { cmd: 'chain-ends' }, { cmd: 'explicit-h' }, null,
        { cmd: 'contract-label' }, { cmd: 'expand-label' }, { cmd: 'expand-label-full' }, { cmd: 'join' }, null,
        { cmd: 'hapto-bond' }, { cmd: 'split-hapto' }, { cmd: 'hapto-kekule' }, null,
        { cmd: 'enhanced-stereo' }, { cmd: 'chiral-flag' }, { cmd: 'repeat-group' }, { cmd: 'rgroup-table' }, null,
        { cmd: 'check-structure' }, { cmd: 'save-template' }, { cmd: 'define-nickname' }, null,
        { label: 'Perspective', items: [{ cmd: 'turn-3d' }, { cmd: 'flatten-3d' }, null, { cmd: 'depth-shading', checked: depthShadePrefs.on }, { cmd: 'depth-shading-settings' }] },
      ] },
      // the look-ups in one group, named as on the Chemistry menu
      { label: 'Look Up', items: [
        { cmd: 'structure-to-name' }, { cmd: 'find-cas' }, { cmd: 'pubchem-lookup' }, { cmd: 'model-3d' },
        ...(contextBond !== null && doc.bonds.get(contextBond)?.order === 1 ? [{ cmd: 'newman-projection' }, { cmd: 'torsion-chart' }] : []),
        null,
        { cmd: 'add-to-compound-library', label: 'Add to Compound Library' },
        // Presentation and Design keep Analysis hidden until it is wanted (View > Show turns it on for good)
        ...((ws.active.mode === 'slides' || ws.active.mode === 'design') && !chemPanes.analysis ? [{ cmd: 'view-analysis-pane', label: 'Show Analysis' }] : []),
      ] },
    ] : []),
    ...(pickedCurved() ? [{ cmd: 'clean-up-arrow' }, { label: 'Mechanism Arrow', items: [
      { cmd: 'arrow-add-bend', ...(editor.contextSpot?.t !== undefined ? { label: 'Add Bend Here' } : {}) }, ...(editor.pickedJoin() ? [{ cmd: 'arrow-remove-bend' }, { cmd: 'arrow-smooth-join' }, { cmd: 'arrow-symmetric-join' }] : []), null,
      { label: 'Shape', items: [{ cmd: 'arrow-s-shape', label: 'S' }, { cmd: 'arrow-single-curve', label: 'Single Curve' }, { cmd: 'arrow-shape-u', label: 'U-Turn' }, { cmd: 'arrow-shape-loop', label: 'Loop' }] },
      { cmd: 'flip-arrow-bend' }, { cmd: 'arrow-reverse' }, { cmd: 'arrow-smooth-path' }, { cmd: 'arrow-simplify-path' }, null, { cmd: 'attach-arrow' }, { cmd: 'detach-arrow' },
    ] }, ...(editor.options.arrowProducts ? [{ cmd: 'draw-from-arrows' }, { cmd: 'check-arrows' }] : [])] : []),
    ...(pickedReactionArrow() !== undefined ? [{ cmd: 'animate-step' }] : []),
    // (a scheme is about whole structures and arrows, not an atom or a bond picked on its own)
    ...(s.arrows.size || (atoms && focus === 'structure') ? [...(editor.selectedSmart() !== null ? [{ cmd: 'ungroup-smart-scheme' }, null] : []), { label: 'Scheme', items: [{ cmd: 'clean-up-reaction' }, { cmd: 'clean-up-arrow' }, ...(smartIsCycle() ? [{ cmd: 'clean-up-cycle' }] : []), { cmd: 'arrange-scheme' }, ...(editor.selectedSmart() === null ? [{ cmd: 'convert-smart-scheme' }] : []), { cmd: 'smart-scheme' }, { cmd: 'number-compounds' }, ...(s.arrows.size ? [{ cmd: 'stoichiometry-table' }, { cmd: 'check-balance' }, { cmd: 'map-atoms' }, { cmd: 'copy-reaction-smiles' }] : []), { cmd: 'catalytic-cycle' }, { cmd: 'energy-diagram' }, { cmd: 'ts-brackets' }, null, { cmd: 'animate-reaction' }, ...(pickedReactionArrow() !== undefined ? [{ cmd: 'animate-step' }] : [])] }] : []),
    ...(atoms && focus !== 'bond' ? [{ label: 'Label the Structure', items: [
      { cmd: 'add-id-label' }, { cmd: 'add-caption' }, { cmd: 'attach-descriptors' }, null, { cmd: 'number-compounds' },
      ...(!shapes.length ? [null, { cmd: 'alt-text', label: 'Alt Text…' }] : []),
    ] }] : []),
    ...(atoms || shapes.some((x) => x.kind === 'ring') ? [{ label: 'Highlight and Fill', items: [{ cmd: 'highlight' }, { cmd: 'remove-highlight' }, { cmd: 'highlight-look' }, { cmd: 'select-highlight' }, null, { cmd: 'smooth-highlight' }, { cmd: 'centre-highlight' }, { cmd: 'soft-highlight' }, { cmd: 'outline-highlight' }, { cmd: 'shadow-highlight' }, { cmd: 'glow-highlight' }, { cmd: 'save-highlight-look' }, null, { cmd: 'fill-rings' }, { cmd: 'ring-shadow' }] }] : []),
    null,
    { label: 'Copy As', items: [...(atoms || texts ? [{ cmd: 'copy-smiles' }, { cmd: 'copy-mol' }, { cmd: 'copy-cdxml' }] : []), { cmd: 'copy-svg' }] },
    { label: 'Format', items: [
      { cmd: 'format-painter' }, { cmd: 'save-format-favorite' },
      ...(favorites.length ? [{ label: 'Format Favorites', items: favorites.slice(0, 20).map((f, i): MenuItem => ({ cmd: `format-favorite-${i}`, label: f.name })) }] : []),
    ] },
    // grouping, lining up, turning and stacking in one group, so the menu stays short
    { label: 'Arrange', items: [
      ...(s.atoms.size + s.captions.size + s.arrows.size + s.shapes.size > 1 ? [{ cmd: 'group' }] : []),
      ...(selectedGroups(doc, s).size ? [{ cmd: 'ungroup' }] : []),
      null,
      // (one atom alone has nothing to line up, turn or flip)
      ...(loneAtom ? [] : [{ label: 'Align', items: arrange }, { label: 'Rotate or Flip', items: turn }]),
      ...(order.length ? [{ label: 'Order', items: order }] : []),
      null,
      { cmd: 'add-frame' },
    ] },
    ...(shapes.some((x) => x.chart) ? [{ cmd: 'edit-chart', label: 'Edit Chart…' }] : []),
    ...(shapes.length === 1 && shapes[0].kind === 'picture' ? [{ cmd: 'alt-text', label: 'Alt Text…' }] : []),
    // (Design keeps fill and effects on its ribbon: Home and Shape Format)
    ...(shapes.some((x) => x.kind === 'geo' && !x.diagram) && ws.active.mode !== 'design' ? [
      { cmd: 'shape-styles-here', label: 'Shape Style…' },
      { label: 'Shape Effects', items: effectsMenu() },
      { label: 'Shape Fill', items: [{ cmd: 'shape-picture-fill', label: 'Picture…' }, { cmd: 'shape-no-picture-fill', label: 'No Picture' }] },
    ] : []),
    ...(shapes.some((x) => x.kind === 'picture') ? [{ cmd: 'import-picture', label: 'Import Structures from Picture…' }, { cmd: 'crop' }, { cmd: 'picture-format' }, { label: 'Picture Style', items: PICTURE_STYLES.map((p) => ({ cmd: `picture-style-${p.id}`, label: p.name })) }] : []),
    ...(ws.active.mode === 'slides' ? [{ label: 'Animation', items: [
      ...ANIM_COMMANDS.slice(0, EFFECTS.length), null, ...ANIM_COMMANDS.slice(EFFECTS.length), null,
      { cmd: 'remove-animation', label: 'Remove Animation' }, ...(s.arrows.size ? [{ cmd: 'auto-animate-steps' }] : []), { cmd: 'animation-pane', label: 'Animation Pane' }, { cmd: 'preview-slide', label: 'Preview Slide' },
    ] }, { cmd: 'new-comment', label: 'New Comment' }] : []),
    null,
    ...props,
    { cmd: 'select-all' },
    view,
  ];
}

/**
 * What the right-click menu leads with: `atom` for atoms picked on their own (one clicked, or
 * several shift-clicked), `bond` for bonds picked without the rest of their structure (or one
 * clicked), and `structure` for whole structures and anything else.
 */
function menuFocus(): 'atom' | 'bond' | 'structure' {
  const s = editor.sel;
  if (s.captions.size + s.arrows.size + s.shapes.size) return 'structure';
  if (s.atoms.size && !s.bonds.size) return 'atom';
  if (!s.bonds.size) return 'structure';
  if (contextBond !== null && s.bonds.has(contextBond) && s.bonds.size === 1) return 'bond';
  // bonds with only their own end atoms, leaving out some bond of their structure
  const ends = new Set<number>();
  for (const id of s.bonds) { const b = doc.bonds.get(id); if (b) { ends.add(b.a1); ends.add(b.a2); } }
  if ([...s.atoms].some((a) => !ends.has(a))) return 'structure';
  for (const a of ends) if ((doc.adj.get(a) ?? []).some((b) => !s.bonds.has(b))) return 'bond';
  // a whole structure picked: a bond right-clicked in it still leads with the bond types
  return contextBond !== null ? 'bond' : 'structure';
}

/** The atoms the right-click atom commands change: the one clicked, or every one picked when it was one of several. */
function menuAtoms(): number[] {
  const ids = contextAtom && doc.atoms.has(contextAtom.id) ? (contextAtom.all ? [...editor.sel.atoms] : [contextAtom.id]) : [...editor.sel.atoms];
  return ids.filter((id) => doc.atoms.has(id));
}

/** The elements on the right-click menu's Element group (each shows its hotkey). */
const MENU_ELEMENTS = ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I', 'Si', 'B'];

/** Right-click on atoms: the label, element, charge and attachment point first. */
function atomMenu(): MenuItem[] {
  const ids = menuAtoms();
  if (!ids.length) return [];
  const key = (action: string) => keysOf('atom', action)[0];
  return [
    ...repeatLabelMenu(),
    ...(ids.length === 1 ? [{ cmd: 'atom-key:edit-label', label: 'Edit Label…', key: key('atom edit-label') }] : []),
    { label: 'Element', items: [
      ...MENU_ELEMENTS.map((el): MenuItem => ({ cmd: `atom-label:${el}`, label: el, key: key(`label ${el}`) })),
      null, { cmd: 'periodic-table' },
    ] },
    { label: 'Charge', items: [
      { cmd: 'atom-key:plus', label: 'Increase Charge', key: key('atom plus') },
      { cmd: 'atom-key:minus', label: 'Decrease Charge', key: key('atom minus') },
    ] },
    ...attachPointMenu(),
    null,
  ];
}

/** Right-click ▸ Element ▸ N…, Charge ▸ …, Edit Label…: on the atoms the menu is for (one undo step). */
function atomFromMenu(name: string): boolean {
  const ids = menuAtoms();
  if (!ids.length) return false;
  const i = name.indexOf(':');
  const kind = name.slice(0, i), arg = name.slice(i + 1);
  if (kind === 'atom-label') {
    doc.edit(`Make ${arg}`, () => { for (const id of ids) editor.applyLabel(id, arg); });
    editor.changed();
    return true;
  }
  if (arg === 'edit-label') return editor.atomKey(ids[0], arg);
  let done = false;
  doc.edit(arg === 'plus' || arg === 'minus' ? 'Charge' : 'Atom', () => { for (const id of ids) done = editor.atomKey(id, arg) || done; });
  return done;
}

// ---------------------------------------------------------------- group tooltips (View > Group Tooltips)

/** Resting the mouse on OTBS, Boc, CO2Me… shows the group written out. */
const labelTips = new LabelTooltip(async (tip) => {
  // a ligand from the Ligand Library: its drawing on a metal, PPh2-style labels kept
  const lig = tip.ligand ? templateById(tip.ligand) : undefined;
  if (lig) {
    const d = new Doc();
    d.style = { ...editor.doc.style };
    d.bulk(() => placeTemplate(d, lig, freePlacement({ x: 0, y: 0 }, d.style.bondLength), { noMerge: true }));
    const pic = recordPicture(d, 3);
    if (pic) return pictureCanvas(d, pic, 72 * 1.8 * (window.devicePixelRatio || 1)).canvas;
  }
  if (!chem.ready) return null;
  const mb = await chem.smilesToMol(tip.smiles).catch(() => null);
  if (!mb) return null;
  const d = new Doc();
  d.style = { ...editor.doc.style };
  d.bulk(() => {
    const ids = addMolfile(d, mb, 0, 0);
    for (const i of starAtoms(tip.smiles)) {
      if (ids[i] !== undefined) d.updateAtom(ids[i], { attach: 'Wavy', attachNum: undefined, z: 0, label: null, charge: 0 });
    }
  });
  const pic = recordPicture(d, 3);
  if (!pic) return null;
  return pictureCanvas(d, pic, 72 * 1.4 * (window.devicePixelRatio || 1)).canvas;
});

function groupTipTarget(e: PointerEvent) {
  if (e.buttons) return null;
  // what is under the pointer now (not the editor's last hover, which can lag a move behind)
  const rect = renderer.overlay.getBoundingClientRect();
  const p = renderer.toDoc(e.clientX - rect.left, e.clientY - rect.top);
  const h = editor.hitTest(p);
  if (h?.kind !== 'atom') return null;
  const d = editor.doc;
  const a = d.atoms.get(h.id);
  if (!a?.label) return null;
  // only on the label's letters, so the tooltip goes as soon as the pointer is off them
  const pad = 2 / Math.max(1e-6, renderer.view.scale);
  if (!renderer.atomInfo(d, a).boxes.some((b) => p.x >= b.x1 - pad && p.x <= b.x2 + pad && p.y >= b.y1 - pad && p.y <= b.y2 + pad)) return null;
  const ext = (d.adj.get(h.id) ?? []).map((bid) => d.bonds.get(bid)!).filter((b) => b && !outsideValence(b)).map((b) => (b.order === 4 ? 1 : b.order));
  return { label: a.label, ext: ext.length ? ext : [1], x: e.clientX, y: e.clientY };
}
// the editor reads the pointer first (its listeners were added first), so its hover is up to date
renderer.overlay.addEventListener('pointermove', (e) => labelTips.over(groupTipTarget(e)));
for (const ev of ['pointerdown', 'pointerleave', 'wheel'] as const) renderer.overlay.addEventListener(ev, () => labelTips.hide());
window.addEventListener('keydown', () => labelTips.hide());
// anywhere off the drawing (a panel, a menu, another window) the tooltip goes too
window.addEventListener('pointermove', (e) => { if (e.target !== renderer.overlay) labelTips.hide(); }, true);
window.addEventListener('blur', () => labelTips.hide());
document.addEventListener('visibilitychange', () => labelTips.hide());

/** Show the page dark (screen only) or as it is, and tick the menu and the eye button. */
function showDark(on: boolean): void {
  dark.on = on;
  showDarkPage(on ? darkPaletteNamed(dark.palette, dark.own) : null);
  editor.dark = on;
  editor.requestOverlay();
  $('[data-cmd="dark-page"][role="menuitemcheckbox"]')?.setAttribute('aria-checked', String(on));
  quickBar?.refresh();
}

/** View > Window and Colours > Reading Mode Colours…: pick a palette, change its paper and ink, or keep your own. */
async function darkColours(): Promise<void> {
  const all = (): DarkPalette[] => [...DARK_PALETTES, ...dark.own];
  const cur = darkPaletteNamed(dark.palette, dark.own);
  const got = await ask('Reading Mode colors', [
    { name: 'palette', label: 'Palette', value: cur.name, options: [...all().map((p) => ({ value: p.name, label: dark.own.includes(p) ? `${p.name} (yours)` : p.name }))] },
    { name: 'paper', label: 'Paper shows as', value: cur.paper, type: 'color' },
    { name: 'ink', label: 'Black ink shows as', value: cur.ink, type: 'color' },
    { name: 'name', label: 'Save as your own, named', value: '', placeholder: 'leave empty to use the palette as it is' },
  ], { ok: 'Use', preview: { title: 'On screen', draw: (v) => {
    const base = darkPaletteNamed(v.palette, dark.own);
    const untouched = v.paper === cur.paper && v.ink === cur.ink;
    return readingPreview(untouched ? base : { name: '', paper: v.paper || base.paper, ink: v.ink || base.ink }, doc.style);
  } }, note: 'Only the screen changes: files, printing, copying and exports keep their white paper and black ink. The colors shown are the palette in use now: pick another palette and leave them alone to use it as it is, or change them (and give a name) to keep your own.' });
  if (!got) return;
  const base = darkPaletteNamed(got.palette, dark.own);
  // colours left as they were mean "this palette as it is"
  const untouched = got.paper === cur.paper && got.ink === cur.ink;
  const changed = !untouched && (got.paper !== base.paper || got.ink !== base.ink);
  const name = got.name.trim();
  if (changed || name) {
    const p: DarkPalette = { name: name || `${base.name} (changed)`, paper: got.paper || base.paper, ink: got.ink || base.ink };
    dark.own = [...dark.own.filter((o) => o.name !== p.name), p];
    dark.palette = p.name;
  } else dark.palette = base.name;
  showDark(true);
  storeSettings();
}

function showToolTips(on: boolean): void {
  toolTip.enabled = on;
  $('[data-cmd="tool-tips"]')?.setAttribute('aria-checked', String(on));
}
function showGroupTips(on: boolean): void {
  labelTips.enabled = on;
  if (!on) labelTips.hide();
  $('[data-cmd="group-tips"]')?.setAttribute('aria-checked', String(on));
}

// right-click menus show each command's key (the Document's and Spreadsheet's too)
setMenuKeys(commandKey);

editor.onContextMenu = (e) => {
  if (sheetActive() || docActive()) return;
  finishTyping();
  // on a keyframe's tab, corner or outline: the keyframe commands
  if (canvasKeys.menuAt(e) >= 0) { showContextMenu(e.clientX, e.clientY, keyframeMenu(), { run: (cmd) => void command(cmd), key: commandKey }); return; }
  const picked = new Set(editor.sel.atoms);
  const h = editor.contextPick(e);
  contextBond = h?.kind === 'bond' ? h.id : null;
  // (Repeat Label is for that atom only, unless it was one of several picked, not a whole structure)
  contextAtom = h?.kind === 'atom' ? { id: h.id, all: repeatsOnAll(doc, picked, h.id) } : null;
  rightClickAt = { left: e.clientX, bottom: e.clientY };
  showContextMenu(e.clientX, e.clientY, drawingMenu(), { run: (cmd) => void command(cmd), key: commandKey });
};

stylePanel.cropWithMouse = () => cropPicture();
stylePanel.formatPicture = () => void formatPicture();
stylePanel.removeWhite = (ids) => void removeWhite(ids);
stylePanel.frames = { add: () => void command('add-frame'), fit: (id) => editor.fitFrame(id) };
stylePanel.diagram = {
  edit: (id) => void smartDiagram(id),
  restyle: (id, patch) => { const d = doc.shapes.get(id)?.diagram; if (d) editor.putDiagramAt({ ...d, ...patch }, pasteCentre(), id); },
  ungroup: (id) => editor.ungroupSelectedDiagram(id),
};
stylePanel.plate = {
  edit: (id) => void plateFigure(null, id),
  restyle: (id, patch) => { const d = doc.shapes.get(id)?.plate; if (d) editor.putPlateAt({ ...d, ...patch }, pasteCentre(), id); },
};
stylePanel.orbital = {
  edit: () => void editOrbital(),
  restyle: (ids, patch) => restyleOrbitals(orbitalsAmong(doc, ids), patch),
};
stylePanel.energy = {
  edit: (id) => void energyDiagram(id),
  restyle: (id, patch) => { const d = doc.shapes.get(id)?.energy; if (d) editor.putEnergyDiagram({ ...d, ...patch }, pasteCentre(), id); },
};
stylePanel.ringFill = () => void command('fill-rings');
stylePanel.highlightUsed = (c) => { highlightColour = c; };
stylePanel.highlightStyleUsed = (st) => { highlightStyle = tidyStyle(st); };
// ---------------------------------------------------------------- Format Painter

/** What the brush holds: the look of some text, of things on a drawing, or the formats of cells. */
type HeldLook = { kind: 'text'; look: TextLook } | { kind: 'things'; look: ObjectLook } | { kind: 'cells'; block: CellBlock };
const brush = new Brush<HeldLook>();
const PAINTER_BUTTONS = '[data-cmd="format-painter"]:not([role="menuitem"]), [data-doc="format-painter"], [data-sh="format-painter"]';

/** Home > Format Painter (every mode): pick up the look of the selection; a double-click keeps the brush. */
function formatPainter(): void {
  const where = sheetActive() ? 'sheet' : docActive() ? 'document' : 'drawing';
  const got = brush.press(where, (): HeldLook | null => {
    if (where === 'sheet') { const block = sheetMode.pickFormats(); return block && { kind: 'cells', block }; }
    if (where === 'document') { const look = docMode.pickLook(); return look && { kind: 'text', look }; }
    const cap = editor.typingCaption;
    if (cap) return { kind: 'text', look: cap.ed.pickLook() };
    const look = pickObjectLook(editor.doc, editor.sel);
    return look && { kind: 'things', look };
  });
  if (got === 'picked') flash(where === 'sheet' ? 'Format Painter: click or drag over the cells to give them these formats. Double-click the button to keep painting; Esc stops.' : 'Format Painter: click or drag over what should take this look. Double-click the button to keep painting; Esc stops.', 6000);
  else if (got === 'sticky') flash('Format Painter stays on: paint as many things as you like, then press Esc or click Format Painter again.', 6000);
  else if (got === 'nothing') flash(where === 'sheet' ? 'Select the cells whose formats you want to copy, then click Format Painter.' : 'Select what has the look you want to copy (or put the caret in the text), then click Format Painter.');
  else if (got === 'dropped') flash('Format Painter off.');
}

/** The text look the brush holds (text picked up, or the text of a caption or shape picked up). */
function heldText(): TextLook | undefined {
  const l = brush.look;
  return l?.kind === 'text' ? l.look : l?.kind === 'things' ? l.look.text : undefined;
}

/** Paint text being typed in (a document, a caption, a text box or a cell of a table). */
function paintText(ed: import('./text/editing').TextEditing): void {
  const look = heldText();
  if (look && ed.paintLook(look)) brush.used();
}

/** Paint things clicked or boxed on a drawing, slide or design. A click on empty space puts a one-off brush down. */
function paintThings(sel: { atoms: Set<number>; bonds: Set<number>; captions: Set<number>; arrows: Set<number>; shapes: Set<number> }): void {
  const l = brush.look;
  if (!l || l.kind === 'cells') return;
  const look: ObjectLook = l.kind === 'things' ? l.look : { text: l.look, colour: { color: l.look.run.color } };
  const any = sel.atoms.size + sel.bonds.size + sel.captions.size + sel.arrows.size + sel.shapes.size > 0;
  let n = 0;
  if (any) editor.doc.edit('Format Painter', () => { n = paintObjects(editor.doc, sel, look); });
  if (n) { editor.changed(); brush.used(); }
  else if (!any) brush.used();
  else flash('Nothing to apply: the copied object has no formatting to paste (tables and charts keep their own).');
}

brush.onChange = () => {
  const l = brush.look;
  editor.painter = l && l.kind !== 'cells' ? { things: paintThings, text: paintText } : null;
  if (docMode) docMode.painter = heldText() ? paintText : null;
  if (sheetMode) sheetMode.view.painter = l?.kind === 'cells' ? () => { sheetMode.paintFormats(l.block); brush.used(); } : null;
  for (const b of document.querySelectorAll(PAINTER_BUTTONS)) b.setAttribute('aria-pressed', String(!!l));
  editor.requestOverlay();
};

// Escape puts the brush down (before anything else sees the key; a window's own Escape comes first)
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !brush.held || (e.target as Element | null)?.closest?.('dialog')) return;
  e.preventDefault();
  e.stopPropagation();
  brush.drop();
  flash('Format Painter off.');
}, true);

// ---------------------------------------------------------------- Format Favorites

/** Your Format Favorites (kept in the settings, so in every mode and file). */
let favorites: FormatFavorite[] = [];
let favoriteStrips: { refresh(): void }[] = [];
setTimeout(() => {
  favoriteStrips = [...document.querySelectorAll<HTMLElement>('[data-favorites-gallery]')].map((host) => ribbonFavorites(host, {
    list: () => favorites,
    apply: (f) => applyFavorite(f),
    save: () => void saveFavorite(),
    menu: (f, at) => favoriteMenu(f, at),
  }));
  // (the galleries make their groups wider: fit the ribbons again, so none runs past the window's edge)
  fitRibbons();
}, 400);

function favoritesChanged(): void {
  storeSettings();
  for (const r of favoriteStrips) r.refresh();
}

/** The look of what is selected, wherever it is: a document's text, a caption being typed in, or things on a drawing. */
function selectionLook(): ObjectLook | null {
  if (sheetActive()) return sheetMode.favoriteLook();
  if (docActive()) {
    // a picked shape, text box, figure or picture gives its fill and outline; else the text's look
    const o = docMode.objectLook();
    if (o) return o;
    const t = docMode.pickLook();
    return t ? { text: t, colour: { color: t.run.color } } : null;
  }
  const cap = editor.typingCaption;
  if (cap) { const t = cap.ed.pickLook(); return { text: t, colour: { color: t.run.color } }; }
  return pickObjectLook(editor.doc, editor.sel);
}

/** Right-click ▸ Save Format as Favorite…: keep the selection's look under a name. */
async function saveFavorite(replacing?: FormatFavorite): Promise<void> {
  const look = selectionLook();
  if (!look) {
    flash(sheetActive() ? 'Select the cells or the shape with the look you want to keep first.' : 'Select something with the look you want to keep (a shape, arrow, structure, picture or text) first.');
    return;
  }
  let name = replacing?.name;
  if (!name) {
    const got = await ask('Save Format as Favorite', [{ name: 'name', label: 'Name', value: freshFavoriteName(favorites), placeholder: 'for example Key intermediate box' }], {
      ok: 'Save', note: `Keeps ${favoriteSummary(look) || 'the look'} of what is selected. Click it under Format Favorites on the Home tab (or Edit ▸ Format Favorites…) to give that look to the selection, in any drawing, slide, design, document or sheet.`,
    });
    name = got?.name.trim();
    if (!name) return;
  }
  favorites = withFavorite(favorites, { name, look });
  favoritesChanged();
  flash(replacing ? `“${name}” now has the selection's look.` : `Saved the look as “${name}”.`, 3000);
}

/** Give the selection a favorite's look (one undo step). */
function applyFavorite(f: FormatFavorite): void {
  const look = f.look;
  if (sheetActive()) { if (!sheetMode.paintFavorite(look, f.name)) flash(`“${f.name}” has no look cells or this object can take.`); return; }
  if (docActive()) {
    if (docMode.objectLook()) {
      if (!docMode.paintObjectLook(look, f.name)) flash(`“${f.name}” has no fill or outline for this to take.`);
      return;
    }
    if (!look.text) { flash(`“${f.name}” has no text look to give to text.`); return; }
    if (!docMode.paintLook(look.text)) flash('Put the caret in a word, or select some text, first.');
    return;
  }
  const cap = editor.typingCaption;
  if (cap) {
    if (look.text && cap.ed.paintLook(look.text)) return;
    finishTyping();
  }
  const sel = editor.sel;
  if (!(sel.atoms.size + sel.bonds.size + sel.captions.size + sel.arrows.size + sel.shapes.size)) { flash('Select what should take this look first.'); return; }
  let n = 0;
  editor.doc.edit(`Format Favorite “${f.name}”`, () => { n = paintObjects(editor.doc, sel, look); });
  if (n) editor.changed();
  else flash(`“${f.name}” has no look for what is selected (a table or chart keeps its own).`);
}

/** A favorite's own menu (right-click its card): give, update from the selection, rename, delete. */
function favoriteMenu(f: FormatFavorite, at: HTMLElement): void {
  const r = at.getBoundingClientRect();
  popupMenu(r.left, r.bottom + 2, [
    [`Give the Selection “${f.name}”`, () => applyFavorite(f)],
    ['Update to Match Selection', () => void saveFavorite(f)],
    ['Rename…', async () => {
      const got = await ask('Rename favorite', [{ name: 'name', label: 'Name', value: f.name }], { ok: 'Rename' });
      const name = got?.name.trim();
      if (!name || name === f.name) return;
      favorites = favorites.filter((x) => x.name !== name).map((x) => (x.name === f.name ? { ...x, name } : x));
      favoritesChanged();
    }],
    ['Move Earlier', () => {
      const i = favorites.findIndex((x) => x.name === f.name);
      if (i > 0) { favorites = [...favorites.slice(0, i - 1), favorites[i], favorites[i - 1], ...favorites.slice(i + 1)]; favoritesChanged(); }
    }, favorites[0]?.name !== f.name],
    null,
    ['Delete', () => { favorites = favorites.filter((x) => x.name !== f.name); favoritesChanged(); flash(`Deleted “${f.name}”.`, 2500); }],
  ]);
}

/** Edit ▸ Format Favorites…: the favorites as a menu, to give one to the selection (and save another). */
function favoritesMenu(): void {
  const host = document.querySelector<HTMLElement>('[data-favorites-gallery]:not([hidden])');
  const r = host && host.offsetParent ? host.getBoundingClientRect() : { left: innerWidth / 2 - 100, bottom: 120 };
  popupMenu(r.left, r.bottom + 2, [
    ...favorites.map((f): [string, () => void] => [f.name, () => applyFavorite(f)]),
    ...(favorites.length ? [null] : []),
    ['Save Format as Favorite…', () => void saveFavorite()],
  ]);
}

// ---------------------------------------------------------------- Insert > Symbol

/** Type a symbol where the caret is: a cell, a document, the text being typed, or a new caption (Insert > Symbol, the Text Formatting toolbox). */
function insertSymbol(ch: string): boolean {
  if (sheetActive()) {
    if (sheetMode.view.typeText(ch)) return true;
    flash('Pick a cell to type the symbol into.');
    return false;
  }
  if (docActive()) {
    if (docMode.insertText(ch)) return true;
    flash('Symbols can\'t be typed in Read Mode: go back to Print Layout (View).');
    return false;
  }
  const cap = editor.typingCaption;
  if (cap) cap.ed.type(ch);
  else editor.typeNew(ch);
  return true;
}

const symbolWindow = new SymbolWindow({
  insert: insertSymbol,
  recent: () => recentSymbols,
  used: (ch) => { recentSymbols = addRecentSymbol(recentSymbols, ch); storeSettings(); },
  warn: (ch) => (ws.active.mode === 'drawing' && !savableChar(ch) ? 'ChemDraw may not show this character in a ChemDraw file (it isn\'t in its usual fonts or the Symbol font).' : ''),
});

stylePanel.highlightLooks = { list: allLooks, apply: (l) => applyHighlightLook(l), save: () => void saveHighlightLook() };

// ---------------------------------------------------------------- toolboxes (View > Toolboxes)

let toolboxState: ToolboxState = defaultToolboxes();
/** The drawing tools' bar, which the Drawing Tools toolbox holds wherever it is. */
const toolsNav = $<HTMLElement>('#tools');

/** Every tool on the tool bar (palette items too), by name, for toolboxes. */
const ALL_TOOLS = new Map<string, { title: string; icon: string }>();
for (const group of [...TOOL_GROUPS, OFF_BAR]) {
  for (const item of group) {
    const pal = 'palette' in item ? item : null;
    for (const t of pal ? pal.items : [item as { name: string; title: string }]) {
      if (t.name === OWN_ADD || t.name === LIGAND_LIBRARY_OPEN) continue;
      ALL_TOOLS.set(t.name, { title: t.title, icon: ICONS[t.name] ?? pal?.icon?.(t.name, 28) ?? t.name });
    }
  }
}

/**
 * Document and Spreadsheet, with no structure being drawn: one Insert Structure button in place of
 * the drawing tools (they do nothing until a structure is open). In a sheet the structure goes in
 * the active cell; in a document, at the caret (or the picked drawing opens). While a structure is
 * drawn, and in split view, the whole toolbox is back.
 */
const structureStart = document.createElement('button');
structureStart.type = 'button';
structureStart.id = 'structure-start';
structureStart.innerHTML = `${ICONS['insert-structure']}<span>Insert<br>Structure</span>`;
structureStart.addEventListener('click', () => {
  const mode = ws.active.mode;
  if (mode === 'sheet') command('draw-structure');
  else if (mode === 'document') docMode?.drawWithTool();
});
structureStart.addEventListener('pointerenter', () => {
  const sheet = ws.active.mode === 'sheet';
  const cell = sheet ? $<HTMLInputElement>('#sh-name').value : '';
  structureStart.title = sheet ? `Insert Structure: draw a structure in the active cell${cell ? ` (${cell})` : ''}. Double-click a structure to change it` : 'Insert Structure: draw a structure or scheme at the cursor (or edit the selected drawing)';
});
structureStart.title = 'Insert Structure';
structureStart.setAttribute('aria-label', 'Insert Structure');
$('#dock-left').prepend(structureStart);

/**
 * A tool picked from a toolbox. In Document and Sheet modes, with no drawing open, a drawing
 * tool opens one to use it on: a new structure at the text cursor, or the selected cell's.
 */
function pickTool(name: string): void {
  const mode = ws.active.mode;
  const b = document.body.classList;
  if ((mode === 'document' || mode === 'sheet') && !b.contains('floating-drawing') && !b.contains('split-view')) {
    modeTool[mode] = name;
    editor.setTool(name);
    if (name !== 'select' && name !== 'eraser') {
      if (mode === 'document') docMode?.drawWithTool();
      else command('draw-structure');
    }
  } else editor.setTool(name);
  if (name === 'element') periodicTable.open();
}

/** A tool's button in a toolbox: picks the tool, and shows when it is the one in use. */
/** Saved toolboxes without the tools and palettes taken off the tool bar since (they left empty cells). */
function withoutRetired(saved: ToolboxState): ToolboxState {
  // the select button became a fly-out (with the lasso): a layout saved before keeps its place
  const was = (k: string | null) => (k === 'tool:select' ? 'pal:select' : k);
  const st: ToolboxState = {
    ...saved,
    items: saved.items?.main ? { ...saved.items, main: saved.items.main.map((k) => was(k)!) } : saved.items,
    grids: saved.grids?.main ? { ...saved.grids, main: { ...saved.grids.main, cells: saved.grids.main.cells.map(was) } } : saved.grids,
  };
  const isTool = (n: string) => ALL_TOOLS.has(n) || ownTemplates().some((t) => `tpl-${t.id}` === n);
  const item = (k: string) => (k.startsWith('tool:') ? isTool(k.slice(5)) : k.startsWith('pal:') ? PALETTES.has(k.slice(4)) : true);
  return withoutGoneItems(st, item, (pal, n) => PALETTES.has(pal) && (pal === 'tpl-own' || isTool(n)));
}

function toolButton(name: string): HTMLButtonElement | null {
  const t = ALL_TOOLS.get(name);
  if (!t) return null;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tool tb-tool';
  b.dataset.tool = name;
  b.title = t.title;
  b.setAttribute('aria-label', t.title);
  b.innerHTML = t.icon;
  b.classList.toggle('active', editor.toolName === name);
  b.addEventListener('click', () => pickTool(name));
  return b;
}

const runFromToolbox = (cmd: string) => { finishTyping(); command(cmd); };

/** What the Colours toolbox's swatches do: colour the lines and text, highlight, or fill. */
let colourMode: 'line' | 'highlight' | 'fill' = 'line';

/** The side panel's contents: in the panel at the right, or in the "details" toolbox when taken out. */
const sideContent = $('#side-content');

/** The highlight looks as buttons: one click gives the selection that look. */
function looksList(vertical: boolean): HTMLElement {
  const box = document.createElement('div');
  box.className = 'tb-looks' + (vertical ? ' vertical' : '');
  const head = document.createElement('div');
  head.className = 'tb-heading';
  head.textContent = 'Looks';
  box.append(head);
  for (const look of allLooks()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-look';
    const dot = document.createElement('span');
    dot.className = 'tb-look-dot';
    dot.style.background = look.colour ?? 'transparent';
    if (!look.colour) dot.classList.add('keeps');
    b.append(dot, look.name);
    b.title = `${look.name}${look.colour ? '' : ' (keeps the highlight\'s color)'}`;
    b.addEventListener('click', () => { finishTyping(); applyHighlightLook(look); });
    box.append(b);
  }
  return box;
}

/** The toolboxes' names, as they come. */
const BOX_TITLES: Record<string, string> = {
  main: 'Drawing Tools', structure: 'Structure', arrange: 'Object', templates: 'Templates', colours: 'Colors', highlight: 'Highlight', text: 'Text Formatting', guides: 'Guides', custom: 'My Toolbox', smart: 'Smart Scheme', details: 'Side Panel',
  schemes: 'Smart Schemes', diagrams: 'Diagrams', tables: 'Tables and Charts', biopolymers: 'Biopolymers', perspective: 'Perspective and 3-D',
};
/** What the toolboxes of buttons come with ("cmd:", "tool:", "pal:", "w:looks", "sep"). */
const cmds = (list: (string | null)[]) => list.map((c) => (c ? `cmd:${c}` : 'sep'));
const BOX_ITEMS: Record<string, readonly string[]> = {
  main: MAIN_ITEMS,
  structure: cmds(['clean-up', 'clean-up-options', 'add-frame', 'fill-rings', 'highlight', 'remove-highlight', null, 'chain-ends', 'explicit-h', 'aromatic-circles', 'stereo-labels', null, 'add-id-label', 'add-caption', 'attach-descriptors', 'number-compounds', null, 'contract-label', 'expand-label', 'expand-label-full', 'hapto-bond', 'name-to-structure']),
  arrange: cmds(['align-left', 'align-hcenter', 'align-right', 'align-top', 'align-vcenter', 'align-bottom', null, 'distribute-h', 'distribute-v', 'arrange-row', 'arrange-column', 'arrange-grid', null, 'flip-h', 'flip-v', 'rotate-cw', 'rotate-ccw', null, 'shape-front', 'shape-back']),
  highlight: [...cmds(['highlight', 'remove-highlight', null, 'smooth-highlight', 'centre-highlight', 'soft-highlight', 'outline-highlight', 'shadow-highlight', 'glow-highlight', null, 'save-highlight-look']), 'w:looks'],
  custom: defaultToolboxes().custom,
  schemes: cmds(['smart-scheme', 'catalytic-cycle', 'convert-smart-scheme', 'ungroup-smart-scheme', null, 'arrange-scheme', 'clean-up-cycle', 'scheme-settings', null, 'stoichiometry-table', 'check-balance', 'map-atoms', 'animate-reaction']),
  diagrams: cmds(['energy-diagram', 'edit-energy', 'mo-diagram', 'orbital', 'p-orbitals', 'ts-brackets', null, 'torsion-chart', 'edit-torsion', 'copy-torsion-data', null, 'newman-projection', 'edit-newman', 'unlink-newman', null, 'insert-diagram', 'edit-diagram', 'diagram-to-shapes']),
  tables: cmds(['insert-table', 'rgroup-table', 'stoichiometry-table', null, 'insert-chart', 'edit-chart', null, 'tlc-plate', 'gel', 'edit-plate']),
  biopolymers: ['cmd:sequence-to-structure', 'sep', 'pal:tpl-amino', 'pal:tpl-sugars', 'pal:tpl-nucleic'],
  perspective: [...cmds(['model-3d', 'turn-3d', 'flatten-3d', null, 'depth-shading', 'depth-shading-settings', null, 'ring-chair', 'ring-chair-flip', 'newman-projection', 'crystal-structure']), 'sep', 'pal:tpl-perspective', 'pal:tpl-conformers', 'pal:tpl-projections'],
};
/** Short names on toolbox buttons for commands with no icon. */
const SHORT_LABEL: Record<string, string> = {
  'smooth-highlight': 'Smooth', 'centre-highlight': 'Center', 'soft-highlight': 'Soft', 'outline-highlight': 'Outline only',
  'shadow-highlight': 'Shadow', 'glow-highlight': 'Glow', 'save-highlight-look': 'Save look…',
};

/** The tools a fly-out palette comes with. */
const givenTools = (name: string): string[] => PALETTES.get(name)?.items.filter((t) => ALL_TOOLS.has(t.name)).map((t) => t.name) ?? [];

/** A fly-out's tools on their grid, as Customize Toolboxes has them. */
function paletteGrid(name: string): Grid {
  return flyGrid(toolboxState, name, toolboxState.flyouts?.[name] ?? givenTools(name), PALETTES.get(name)?.columns ?? 3);
}

/** A fly-out palette with the tools Customize Toolboxes gave it, on their grid (null when it has none). */
function paletteNow(name: string): PaletteDef | null {
  const base = PALETTES.get(name);
  if (!base) return null;
  // (My templates holds what you save, so its tools aren't chosen)
  if ((!toolboxState.flyouts?.[name] && !toolboxState.flyGrids?.[name]) || name === 'tpl-own') return base.items.length ? base : null;
  const g = paletteGrid(name);
  const tool = (n: string) => base.items.find((i) => i.name === n) ?? (ALL_TOOLS.has(n) ? { name: n, title: ALL_TOOLS.get(n)!.title } : null);
  const cells = g.cells.map((n) => (n && tool(n) ? n : null));
  const items = cells.filter((n): n is string => !!n).map((n) => tool(n)!);
  return items.length ? { ...base, items, cells, columns: g.cols } : null;
}

/** How each toolbox's grid shows now, and what it does when the window is too short for it. */
const SHOWN = new WeakMap<HTMLElement, { s: Shown; wrap: boolean; across: boolean }>();

/**
 * A toolbox's buttons, as Customize Toolboxes has them: tools, palettes, commands and the
 * highlight looks, each in its cell of the toolbox's grid (empty cells kept, so groups stay apart).
 */
function buildBox(body: HTMLElement, id: string, vertical: boolean): void {
  const dock = toolboxState.places[id]?.dock ?? 'float';
  toolsInOneColumn = wantOneColumn();
  toolboxesBuilt = true;
  const whole = boxGrid(toolboxState, id, BOX_ITEMS[id]);
  const g = toolsInOneColumn && (dock === 'left' || dock === 'right') ? oneColumn(whole) : whole;
  const s = shownGrid(g, dock);
  const cells = document.createElement('div');
  cells.className = 'tb-cells';
  cells.style.gridTemplateColumns = `repeat(${s.cols}, minmax(34px, auto))`;
  const make = (k: string): HTMLElement | null => {
    const name = k.slice(k.indexOf(':') + 1);
    // the drawing tools' buttons are the tool bar's own (it shows the one in use, and each palette's last pick)
    if (k.startsWith('tool:')) { const t = ALL_TOOLS.get(name); return id === 'main' ? (t ? toolbar.toolButton({ name, title: t.title }) : null) : toolButton(name); }
    if (k.startsWith('pal:')) { const p = paletteNow(name); return p && toolbar.paletteButton(p); }
    if (k.startsWith('cmd:')) return commandButton(name, runFromToolbox, SHORT_LABEL[name]);
    if (k === 'w:looks') return looksList(vertical);
    return null;
  };
  const fillCells = () => {
    g.cells.forEach((k, i) => {
      const b = (k && make(k)) || Object.assign(document.createElement('span'), { className: 'tb-gap' });
      b.classList.add('tb-cell');
      b.dataset.cell = String(i);
      if (k === 'w:looks') b.classList.add('tb-wide');
      cells.append(b);
    });
  };
  // one column scrolls rather than wrapping back into more columns
  const wrap = overflowOf(toolboxState, id) === 'wrap' && g === whole;
  SHOWN.set(cells, { s, wrap, across: dock === 'top' || dock === 'bottom' });
  if (id === 'main') { toolbar.fill((root) => { fillCells(); root.append(cells); }); body.append(toolsNav); }
  else { fillCells(); body.append(cells); }
  layCells(cells);
  if (id !== 'main' && !gridItems(g).length) {
    const edit = commandButton('customize-toolbox', () => openCustomToolbox(id), 'Choose what goes here…');
    edit.title = 'Customize Toolboxes: drag tools and commands into this one';
    body.append(edit);
  }
}

/** The toolboxes laid out by the app itself (the rest show buttons chosen in Customize Toolboxes). */
const SPECIAL_BOXES: Record<string, (body: HTMLElement, vertical: boolean) => void> = {
  templates: (body, vertical) => {
    // (many templates: the box scrolls rather than run off the window)
    body.classList.add('tb-grid', 'tb-scroll');
    body.style.setProperty('--cols', vertical ? '2' : '12');
    for (const group of TOOL_GROUPS) for (const item of group) {
      if (!('palette' in item) || !item.palette.startsWith('tpl-') || item.palette === 'tpl-own') continue;
      // a heading over each palette's buttons, so the families are easy to find
      const head = document.createElement('div');
      head.className = 'tb-heading';
      head.textContent = head.title = item.title;
      body.append(head);
      for (const t of item.items) { const b = toolButton(t.name); if (b) body.append(b); }
    }
  },
  colours: (body, vertical) => {
    const modes = document.createElement('div');
    modes.className = 'tb-modes';
    // in Highlight mode, the saved looks too
    const looks = looksList(vertical);
    looks.hidden = colourMode !== 'highlight';
    for (const [m, label, title] of [['line', 'Color', 'Color the lines and text'], ['highlight', 'Highlight', 'A band of color behind atoms and bonds'], ['fill', 'Fill', 'Fill shapes and ring fills']] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-pressed', String(colourMode === m));
      b.addEventListener('click', () => { colourMode = m; for (const o of modes.children) o.setAttribute('aria-pressed', String(o === b)); looks.hidden = m !== 'highlight'; });
      modes.append(b);
    }
    const grid = document.createElement('div');
    grid.className = 'tb-swatches';
    const swatch = (c: string | undefined) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-swatch';
      if (c) b.style.background = c; else { b.textContent = '∅'; b.style.fontSize = '11px'; }
      b.title = c ? c.toUpperCase() : 'None: take the color, highlight or fill off';
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => {
        if (!editor.colourSelection(c, colourMode)) flash('Select what to color first.');
        else if (colourMode === 'highlight' && c) highlightColour = c;
      });
      return b;
    };
    grid.append(swatch(undefined));
    for (const c of [...STANDARD_COLOURS, '#ffffff']) grid.append(swatch(c));
    for (const p of getPalettes()) {
      if (!p.colors.length) continue;
      const n = document.createElement('div');
      n.className = 'tb-swatch-name';
      n.textContent = p.name;
      grid.append(n, ...p.colors.map((c) => swatch(c)));
    }
    body.append(modes, grid, looks);
    if (vertical) body.style.maxWidth = '110px';
  },
  // The side panel (Style, Warnings, Analysis; Format in documents, Cell in sheets) is a toolbox,
  // docked at the right to start with. Its arrow goes with it, so it shows even when the title bar is
  // locked away.
  details: (body) => { body.before($('#side-fold')); body.append(sideContent); },
  text: (body, vertical) => { textToolbox = buildTextToolbox(body, vertical, textToolboxHooks); },
  guides: (body, vertical) => { guidesToolbox = buildGuidesToolbox(body, vertical, guidesToolboxHooks); },
  // the Smart Scheme species list, docked (it floats beside the scheme otherwise)
  smart: (body) => { smartDockBody = body; queueMicrotask(() => { if (smartDockBody === body && body.isConnected) smartPane.dockInto(body); }); },
};
/** Where the docked Smart Scheme species list goes (its toolbox's body). */
let smartDockBody: HTMLElement | null = null;

const guidesToolboxHooks: GuidesToolboxHooks = {
  get: () => editor.doc.guides,
  set: (g) => {
    if (ws.active.mode !== 'drawing') { flash('Guides are for canvases: slides and designs have their own (View > Guides).'); return; }
    editor.doc.guides = g;
    editor.onGuides();
    editor.requestOverlay();
  },
  centre: () => { const a = editor.viewArea(); return { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 }; },
  units: () => rulerPrefs.units,
};
editor.onGuides = () => { ws.noteKeptChange(); guidesToolbox?.refresh(); };

const DOC_TOGGLES: Partial<Record<string, string>> = { bold: 'doc-bold', italic: 'doc-italic', underline: 'doc-underline', sub: 'doc-sub', sup: 'doc-sup', formula: 'doc-formula' };
const DOC_ALIGN: Record<string, string> = { left: 'doc-align-left', center: 'doc-align-center', right: 'doc-align-right', justify: 'doc-justify' };
const DOC_LINES: Record<number, string> = { 1: 'line-single', 1.5: 'line-1-5', 2: 'line-double' };
const textToolboxHooks: TextToolboxHooks = {
  format: (f) => {
    if (docActive()) {
      const cmd = f.kind === 'stereo' ? 'doc-stereo-italic' : f.kind === 'toggle' ? DOC_TOGGLES[f.key] : f.kind === 'align' ? DOC_ALIGN[f.j] : f.kind === 'line' ? DOC_LINES[f.v] : undefined;
      if (!cmd) { flash('In a document, the Home tab\'s Font and Paragraph groups set these.'); return true; }
      return docMode.run(cmd);
    }
    if (sheetActive()) return false;
    return editor.formatText(f);
  },
  type: (ch) => insertSymbol(ch),
  link: () => { if (!docActive() && !sheetActive()) void insertLink(); },
  look: () => {
    if (docActive() || sheetActive()) return null;
    const l = editor.textLook();
    return l ? { style: l.style, align: l.align, list: l.list, line: l.line, before: l.before ?? 0, after: l.after ?? 0, wrap: l.wrap, link: !!l.link, defaultFont: l.defaultFont } : null;
  },
  back: () => editor.refocusText(),
  say: (t) => flash(t),
};
// the Canvas ribbon's Font and Paragraph groups: all of the typing bar, working as the Text Formatting
// toolbox does (and while they show, the bar above the text hides: see CaptionEditor.barElsewhere)
// (set by the ribbon's callback, which TypeScript can't see)
const textRows = canvasTextRows as { font: HTMLElement; paragraph: HTMLElement } | null;
if (textRows) {
  canvasFont = buildTextBar(textRows.font, {
    format: (f) => textToolboxHooks.format(f),
    type: (ch) => textToolboxHooks.type(ch),
    link: () => textToolboxHooks.link(),
    state: () => textToolboxHooks.look(),
    back: () => textToolboxHooks.back(),
    nothing: () => flash('Click into some text, or pick a caption or text box, first.'),
  }, { ribbon: { paragraph: textRows.paragraph } });
}

/** Ring Shape on the right-click menu, when the selection is one cyclohexane that can be redrawn. */
function ringShapeMenu(): MenuItem[] {
  const got = viewRingOf(doc, editor.sel.atoms);
  if (!('ring' in got)) return [];
  const now = viewNow(doc, got.ring).view;
  const shape = (cmd: string, v: RingView): MenuItem => ({ cmd, checked: now === v });
  const walks = got.ring.subs.length > 0;
  return [{ label: 'Ring Shape', items: [
    shape('ring-flat', 'flat'), shape('ring-chair', 'chair'), shape('ring-chair-flip', 'chair-flip'), shape('ring-boat', 'boat'), null,
    { cmd: 'ring-flip' }, ...(walks ? [{ cmd: 'ring-walk-cw' }, { cmd: 'ring-walk-ccw' }] : []),
  ] }];
}

/** The toolboxes there are now (the drawing tools first, as the others' buttons may come from its bar). */
function toolboxDefs(): ToolboxDef[] {
  const ids = boxIds(toolboxState);
  return ['main', ...ids.filter((id) => id !== 'main')].map((id) => ({
    id,
    title: boxTitle(toolboxState, id, BOX_TITLES[id]),
    info: id === 'guides' ? GUIDES_INFO : undefined,
    build: (body: HTMLElement, vertical: boolean) => (SPECIAL_BOXES[id] && !isEditable(id) ? SPECIAL_BOXES[id](body, vertical) : buildBox(body, id, vertical)),
  }));
}

const toolboxes = new Toolboxes(toolboxDefs, {
  get: () => toolboxState,
  set: (st) => { toolboxState = st; tickToolboxes(); storeSettings(); placeSidePanel(); },
  work: () => $('#work'),
  customize: (id) => openCustomToolbox(id),
  // each mode keeps the side panel folded or open on its own
  folded: (id) => (id === 'details' ? sideIsFolded() : undefined),
  fold: (id) => { if (id !== 'details') return false; command('fold-side'); return true; },
  say: (text) => flash(text),
  rendered: () => fitTools(),
});
contextBoxes.ready = true;

/**
 * Put a toolbox's buttons in their cells on screen: as the grid has them, or wrapped when only
 * `fit` rows (columns, along the top or bottom) have room. Thin lines go between the rows that have them.
 */
function layCells(cells: HTMLElement, fit?: number): void {
  const info = SHOWN.get(cells);
  if (!info) return;
  const { s, across } = info;
  const full = across ? s.cols : s.rows;
  const { at, starts } = wrapped(s, Math.min(full, fit ?? full), across);
  const blocks = starts.length;
  // the longest block sets how many rows (columns, along the top or bottom) there are
  const len = Math.max(...starts.map((st, b) => (starts[b + 1] ?? full) - st));
  cells.style.gridTemplateColumns = `repeat(${across ? len : s.cols * blocks}, minmax(34px, auto))`;
  cells.style.gridTemplateRows = `repeat(${across ? s.rows * blocks : len}, minmax(32px, auto))`;
  cells.querySelectorAll('.tb-line').forEach((l) => l.remove());
  // a line where a block starts is not needed: the blocks stand apart
  const lineRows = new Set(across ? s.lineRows : s.lineRows.filter((r) => !starts.includes(r)));
  const lineCols = new Set(across ? s.lineCols.filter((c) => !starts.includes(c)) : s.lineCols);
  for (const el of cells.querySelectorAll<HTMLElement>(':scope > .tb-cell')) {
    const i = Number(el.dataset.cell);
    const p = at[i], o = s.at[i];
    el.style.gridRow = String(p.r + 1);
    const room = across ? len - p.c : s.cols - (p.c % s.cols);
    el.style.gridColumn = el.classList.contains('tb-wide') ? `${p.c + 1} / span ${Math.max(1, room)}` : String(p.c + 1);
    el.classList.toggle('tb-after-line', lineRows.has(o.r));
    el.classList.toggle('tb-after-vline', lineCols.has(o.c));
    // (with grid lines on, the cell before a division carries it as a bold edge)
    el.classList.toggle('tb-before-line', lineRows.has(o.r + 1));
    el.classList.toggle('tb-before-vline', lineCols.has(o.c + 1));
    el.classList.toggle('tb-block', p.start);
  }
  // the lines themselves, across each block of the grid (or down it, turned on its side)
  const line = (r: number, c: number, span: number, down: boolean) => {
    const l = document.createElement('div');
    l.className = 'tb-line' + (down ? ' down' : '');
    l.style.gridRow = down ? `${r + 1} / span ${span}` : String(r + 1);
    l.style.gridColumn = down ? String(c + 1) : `${c + 1} / span ${span}`;
    cells.append(l);
  };
  const size = (b: number) => (starts[b + 1] ?? full) - starts[b];
  for (let b = 0; b < blocks; b++) {
    if (!across) {
      for (const r of lineRows) { const k = inBlock(starts, r); if (k.b === b) line(k.i, b * s.cols, s.cols, false); }
      for (const c of lineCols) line(0, b * s.cols + c, size(b), true);
    } else {
      for (const r of lineRows) line(b * s.rows + r, 0, size(b), false);
      for (const c of lineCols) { const k = inBlock(starts, c); if (k.b === b) line(b * s.rows, k.i, s.rows, true); }
    }
  }
}

/** The menu bar, file tabs, ribbon and status bar together at their tallest (Presentation, ribbon open), in pixels. */
const SIDE_DOCK_CHROME = 236;

/**
 * A toolbox set to wrap, with too little room for its grid, takes fewer rows and puts the rest in
 * more columns beside them (or, along the top or bottom, fewer columns and more rows). One set to
 * scroll scrolls. A dock down a side fades at its foot while there is more below to scroll to.
 */
function fitTools(): void {
  const all = [...document.querySelectorAll<HTMLElement>('.toolbox .tb-cells')].filter((c) => SHOWN.has(c));
  for (const c of all) layCells(c);
  for (const c of all) {
    const { s, wrap, across } = SHOWN.get(c)!;
    const box = c.closest<HTMLElement>('.toolbox');
    if (!wrap || !box || box.classList.contains('collapsed')) continue;
    const dock = box.parentElement!;
    const floating = box.classList.contains('floating');
    // a dock down a side wraps for the room the window has in its busiest mode (a ribbon above), not for
    // the room this mode leaves, so each tool keeps its place in every mode and after the ribbon folds or
    // the window narrows; where that is still too little, the dock scrolls
    const room = innerHeight - SIDE_DOCK_CHROME;
    const tall = () => [...dock.children].reduce((h, el) => h + (el as HTMLElement).offsetHeight, 0);
    const over = () => (floating ? box.scrollHeight > box.clientHeight + 1 : across ? c.scrollWidth > dock.clientWidth - 16 : tall() > room + 1);
    for (let f = (across ? s.cols : s.rows) - 1; f >= 1 && over(); f--) layCells(c, f);
  }
  scrollMainTools();
  settleDocks();
  fadeDocks();
}

/**
 * The drawing tools stay two columns wide in every mode and dock, and scroll inside their own box
 * when the window is too short for them. Whether they scroll is judged against the room the window
 * has in its busiest mode (as wrapping is, above), and the box then keeps room for its scroll bar
 * in every mode, so it never widens or narrows as a ribbon tab, a selection or the mode changes.
 */
function scrollMainTools(): void {
  const box = document.querySelector<HTMLElement>('.toolbox[data-id="main"]');
  const body = box?.querySelector<HTMLElement>(':scope > .tb-body');
  if (!box || !body) return;
  // (scrolling the tools takes a fly-out away from its button)
  body.onscroll = () => toolbar.close();
  const dock = box.parentElement!;
  const across = dock.classList.contains('dock-h');
  const floating = box.classList.contains('floating');
  // floating, the box ends above the window's foot (it scrolls from there)
  if (floating) box.style.maxHeight = `${Math.max(120, Math.round(innerHeight - Math.max(0, box.getBoundingClientRect().top) - 8))}px`;
  else box.style.removeProperty('max-height');
  let scrolls = false;
  if (!box.classList.contains('collapsed') && !across) {
    const own = box.offsetHeight - body.clientHeight + body.scrollHeight;
    if (floating) scrolls = own > parseFloat(box.style.maxHeight);
    else {
      const kids = [...dock.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null);
      const gap = parseFloat(getComputedStyle(dock).rowGap) || 0, pad = parseFloat(getComputedStyle(dock).paddingTop) + parseFloat(getComputedStyle(dock).paddingBottom);
      const tall = kids.reduce((h, el) => h + (el === box ? own : el.offsetHeight), 0) + gap * Math.max(0, kids.length - 1) + pad;
      scrolls = tall > innerHeight - SIDE_DOCK_CHROME + 1;
    }
    scrolls ||= body.scrollHeight > body.clientHeight + 1;
  }
  box.classList.toggle('tb-scrolls', scrolls);
}
/**
 * Let the docks down the sides measure their width afresh. A dock squeezed or overfilled for a
 * moment while its toolboxes were built and wrapped took a scroll bar, and the browser kept that
 * bar's width after the bar went: the toolbox stayed wider and the work moved over (a jump).
 */
function settleDocks(): void {
  const docks = [...document.querySelectorAll<HTMLElement>('.dock-v, .toolbox[data-id="main"] > .tb-body')];
  for (const d of docks) d.style.overflowY = 'hidden';
  void document.body.offsetWidth;
  for (const d of docks) d.style.removeProperty('overflow-y');
}
function fadeDocks(): void {
  for (const d of document.querySelectorAll<HTMLElement>('.dock-v')) d.classList.toggle('more-below', d.scrollTop + d.clientHeight < d.scrollHeight - 2);
}
for (const d of document.querySelectorAll<HTMLElement>('.dock-v')) d.addEventListener('scroll', fadeDocks, { passive: true });
addEventListener('resize', () => { fitTools(); autoFoldRibbon(); });

/** The ribbon folded or whole as you last chose it (Ctrl+F1, View > Ribbon > Collapse the Ribbon). */
let ribbonChosen = false;
/** View > Ribbon > Fold on Short Windows: the ribbon folds to its tabs while the window is under SHORT_WINDOW pixels tall. */
let ribbonAutoFold = false;
const SHORT_WINDOW = 760;
let wasShort = false;
/** Fold the ribbon as the window becomes short, and give it back as you had it when it is tall again. */
function autoFoldRibbon(force = false): void {
  const short = ribbonAutoFold && innerHeight < SHORT_WINDOW;
  $('[data-cmd="ribbon-auto-fold"]')?.setAttribute('aria-checked', String(ribbonAutoFold));
  if (short === wasShort && !force) return;
  wasShort = short;
  setRibbonCollapsed(short || ribbonChosen);
}

/** Tick the shown toolboxes and the lock in the View menu, and show the lock on its button. */
function tickToolboxes(): void {
  fillToolboxMenu();
  $('[data-cmd="lock-toolboxes"]')?.setAttribute('aria-checked', String(toolboxState.locked));
  $('[data-cmd="fold-side"]')?.setAttribute('aria-checked', String(!sideIsFolded()));
  $('#status-side')?.setAttribute('aria-pressed', String(!sideIsFolded()));
  quickBar?.refresh();
}

/** Show the side panel folded or open as the mode showing has it, and its arrow to match. */
function placeSidePanel(): void {
  const folded = sideIsFolded();
  $('.toolbox[data-id="details"]')?.classList.toggle('collapsed', folded);
  const fold = $('#side-fold');
  fold.textContent = '×';
  fold.title = 'Close the side panel (Ctrl+Alt+B, or the panel button at the bottom right, opens it again)';
  fold.setAttribute('aria-label', fold.title);
}
$('#side-fold').addEventListener('click', () => command('fold-side'));
$('#status-side').addEventListener('click', () => command('fold-side'));

/** Below this window width the side panel folds by itself, so the drawing keeps its room. */
const NARROW_WINDOW = 1200;
const narrowWindow = () => innerWidth < NARROW_WINDOW;
/** The side panel opened by hand while the window is narrow (forgotten when it widens). */
let narrowOpen = false;

/** The side panel is folded away in the mode showing (each mode keeps its own choice), or the window is narrow. */
function sideIsFolded(): boolean {
  return sideFolded(toolboxState, ws.active.mode) || (narrowWindow() && !narrowOpen);
}

/** Fold or open the side panel. In a narrow window that lasts until it widens; otherwise it is kept for the mode. */
function foldSide(fold: boolean): void {
  if (narrowWindow()) {
    narrowOpen = !fold;
    if (!fold && sideFolded(toolboxState, ws.active.mode)) { toolboxes.setSideCollapsed(ws.active.mode, false); return; }
    placeSidePanel();
    tickToolboxes();
    return;
  }
  toolboxes.setSideCollapsed(ws.active.mode, fold);
}
let wasNarrow = narrowWindow();
addEventListener('resize', () => {
  const now = narrowWindow();
  if (now === wasNarrow) return;
  wasNarrow = now;
  if (!now) narrowOpen = false;
  placeSidePanel();
  tickToolboxes();
});

/** Where View > Toolboxes' entries start (the line above them). */
let toolboxMenuTop: Element | null = null;

/** View > Toolboxes: a ticked entry for each toolbox there is now, named and in the order Customize Toolboxes has them. */
function fillToolboxMenu(): void {
  const first = document.querySelector<HTMLElement>('header .menu [data-cmd^="toolbox-"]');
  if (!first) return;
  toolboxMenuTop ??= first.previousElementSibling;
  const menu = first.parentElement!;
  const have = new Map([...menu.querySelectorAll<HTMLElement>(':scope > [data-cmd^="toolbox-"]')].map((b) => [b.dataset.cmd!.slice('toolbox-'.length), b]));
  let at = toolboxMenuTop;
  for (const id of boxIds(toolboxState)) {
    if (id === 'details') continue;
    let b = have.get(id);
    if (!b) {
      b = document.createElement('button');
      b.setAttribute('role', 'menuitemcheckbox');
      b.dataset.cmd = `toolbox-${id}`;
      b.title = 'A toolbox of your own (View > Toolboxes > Customize Toolboxes changes it)';
      b.append(document.createElement('span'));
    }
    have.delete(id);
    b.hidden = false;
    b.querySelector('span')!.textContent = `Toolbox: ${boxTitle(toolboxState, id, BOX_TITLES[id])}`;
    b.setAttribute('aria-checked', String(!!toolboxState.places[id]?.shown));
    if (at) at.after(b); else menu.prepend(b);
    at = b;
  }
  // deleted ones: your own go, the app's wait for Restore
  for (const [id, b] of have) { if (isOwnBox(id)) b.remove(); else b.hidden = true; }
}

/** A tool's or command's name and icon in Customize Toolboxes. */
function describeItem(key: string): Pickable {
  const name = key.slice(key.indexOf(':') + 1);
  if (key === 'sep') return { key, label: 'Divider', icon: undefined };
  if (key === 'w:looks') return { key, label: 'Highlight looks', icon: LOOKS_ICON };
  if (key.startsWith('tool:')) { const t = ALL_TOOLS.get(name); return { key, label: t ? t.title.split(/[.:] /)[0] : name, icon: t?.icon }; }
  if (key.startsWith('pal:')) { const p = PALETTES.get(name); return { key, label: p?.title ?? name, icon: p?.items[0] && (ALL_TOOLS.get(p.items[0].name)?.icon) }; }
  return { key, label: topMenuEntry(name)?.label ?? SHORT_LABEL[name] ?? name, icon: commandIcon(name) };
}
const LOOKS_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="7" r="2.2" fill="currentColor" fill-opacity="0.35"/><circle cx="6" cy="12" r="2.2"/><circle cx="6" cy="17" r="2.2" fill="currentColor" fill-opacity="0.6"/><line x1="11" y1="7" x2="20" y2="7"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="11" y1="17" x2="18" y2="17"/></svg>';

/** Everything that can go in a toolbox, for Customize Toolboxes' list. */
function toolboxCatalogue(): { name: string; items: Pickable[] }[] {
  const d = (key: string) => describeItem(key);
  const loose = [...TOOL_GROUPS.flat(), ...OFF_BAR].filter((it): it is ToolDef => !('palette' in it)).map((t) => d(`tool:${t.name}`));
  const groups: { name: string; items: Pickable[] }[] = [
    { name: 'Drawing tools', items: loose },
    { name: 'Fly-out palettes', items: [...PALETTES.keys()].map((p) => d(`pal:${p}`)) },
    { name: 'Lists', items: [d('w:looks')] },
  ];
  for (const p of PALETTES.values()) if (p.palette !== 'tpl-own' || p.items.length > 1) groups.push({ name: p.title, items: p.items.filter((t) => ALL_TOOLS.has(t.name)).map((t) => d(`tool:${t.name}`)) });
  for (const g of menuCommands()) if (g.items.length) groups.push({ name: `${g.menu} menu`, items: g.items.filter((c) => !c.cmd.startsWith('toolbox-')).map((c) => ({ key: `cmd:${c.cmd}`, label: c.label, icon: commandIcon(c.cmd) })) });
  return groups;
}

const toolboxEditor = new ToolboxEditor({
  get: () => toolboxState,
  set: (st) => { toolboxState = st; tickToolboxes(); storeSettings(); toolboxes.render(); placeSidePanel(); },
  catalogue: toolboxCatalogue,
  describe: describeItem,
  title: (id) => BOX_TITLES[id] ?? 'My Toolbox',
  given: (id) => BOX_ITEMS[id] ?? [],
  palette: (name) => { const p = PALETTES.get(name); return p && name !== 'tpl-own' ? { title: p.title } : null; },
  flyGrid: paletteGrid,
  newPlace: () => { const w = $('#work').getBoundingClientRect(); return { x: Math.round(Math.max(w.left + 8, w.right - 300)), y: Math.round(w.top + 40) }; },
});

// ---------------------------------------------------------------- View > Ribbon > Customize the Ribbon

/** Each ribbon's tabs and groups as you put them (kept in the settings). */
let ribbonPrefs: RibbonsPrefs = {};
/** The ribbons as they came (read the first time they are laid out). */
let ribbonInfo: RibbonInfo[] | null = null;
const ribbonsNow = () => (ribbonInfo ??= readRibbons());
/** The ribbon each mode shows (drawings have none: the Slides one is offered). */
const RIBBON_OF_MODE: Record<string, string> = { slides: 'slides', document: 'doc', sheet: 'sheet', design: 'design', drawing: 'slides' };

/** Lay every ribbon out with your changes. */
function applyRibbons(): void {
  // (nothing changed and nothing laid out yet: the ribbons are as they come)
  if (!ribbonInfo && !Object.keys(ribbonPrefs).length) return;
  for (const info of ribbonsNow()) applyRibbon(info, ribbonPrefs[info.id], { run: (cmd) => { finishTyping(); command(cmd); } });
  fitRibbons();
}

/** The top menus' commands, in groups, for adding to the ribbons. */
const ribbonMenus = () => menuCommands().filter((g) => g.items.length).map((g) => ({ name: `${g.menu} menu`, items: g.items.filter((c) => !c.cmd.startsWith('toolbox-')).map((c) => ({ key: `cmd:${c.cmd}`, label: c.label, icon: commandIcon(c.cmd) })) }));
const ribbonEditor = new RibbonEditor({
  ribbons: ribbonsNow,
  get: () => ribbonPrefs,
  set: (p) => { ribbonPrefs = p; applyRibbons(); storeSettings(); },
  menus: ribbonMenus,
  jiggle: () => toolboxState.jiggle !== false,
});
// the gear at the right of each ribbon's tabs: edit the ribbon where it is
const ribbonLive = new RibbonLive({
  ribbons: ribbonsNow,
  get: () => ribbonPrefs,
  set: (p) => { ribbonPrefs = p; applyRibbons(); storeSettings(); },
  customize: (id) => ribbonEditor.open(id),
  saveText: async (name, text) => {
    const target = await saveFileDialog(name, SETTINGS_FILE).catch((e) => { flash(String(e)); return null; });
    if (target) await writeFile(target.ref, target.name, text, SETTINGS_FILE).then(() => flash(`Saved the layout in ${target.name}.`), (e) => flash(`Could not save the layout: ${e}`));
  },
  openText: async () => (await openFileDialog([SETTINGS_FILE]).catch((e) => { flash(String(e)); return null; }))?.text ?? null,
  flash: (m) => flash(m, 6000),
  menus: ribbonMenus,
});
ribbonLive.install();
// right-click a ribbon's tabs (or a group's name) to customize it
for (const [mode, id] of [['slides', '#ribbon'], ['document', '#doc-ribbon'], ['sheet', '#sheet-ribbon'], ['design', '#design-ribbon']] as const) {
  $(id).addEventListener('contextmenu', (e) => {
    if (!(e.target as Element).closest('.rb-tabs, .rb-label')) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      { cmd: 'customize-ribbon', label: 'Customize the Ribbon…' },
      { cmd: 'collapse-ribbon', label: ribbonCollapsed() ? 'Show the Whole Ribbon' : 'Collapse the Ribbon' },
    ], { key: (c) => commandKey(c), run: (c) => (c === 'customize-ribbon' ? ribbonEditor.open(RIBBON_OF_MODE[mode]) : command(c)) });
  });
}

/** View > Toolboxes > Customize Toolboxes, at a toolbox (My Toolbox unless one is named). */
function openCustomToolbox(id?: string): void {
  toolboxEditor.open(id);
}

toolboxes.render();
tickToolboxes();

// ---------------------------------------------------------------- the quick bar beside the menus (Quick Access Toolbar)

/** The quick bar's commands (null: as it comes; kept in the settings). */
let quickPrefs: string[] | null = null;
/** A command's name as its menu item shows it now (Undo Add Bond), or its name in Keyboard Shortcuts. */
const menuLabel = (cmd: string) => topMenuEntry(cmd)?.label ?? commandDef(cmd)?.label ?? COMMAND_NAMES[cmd] ?? cmd;
quickBar = new QuickBar($('#quick-bar'), {
  get: () => quickPrefs,
  set: (list) => { quickPrefs = list; storeSettings(); },
  run: (cmd) => { finishTyping(); if (!command(cmd)) flash(`${menuLabel(cmd)} isn't available here.`); },
  label: menuLabel,
  key: (cmd) => commandKey(cmd),
  icon: (cmd) => (cmd === 'lock-toolboxes' ? lockIcon(toolboxState.locked) : commandIcon(cmd)),
  state: (cmd) => {
    const item = document.querySelector<HTMLButtonElement>(`header .menu-wrap [data-cmd="${cmd}"]`);
    const e = topMenuEntry(cmd);
    return { enabled: !item || (!item.disabled && !item.closest('[data-mode-hid]')), on: e?.checked ?? null };
  },
  all: () => menuCommands().map((g) => ({ name: `${g.menu} menu`, items: g.items.filter((c) => !c.cmd.startsWith('toolbox-')) })),
});
// right-click a menu item, or a ribbon button that runs a menu command, to put it on the quick bar (or take it off)
document.addEventListener('contextmenu', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('header .menu [data-cmd], .ribbon button[data-cmd]');
  if (!b || !quickBar) return;
  e.preventDefault();
  const qb = quickBar;
  showContextMenu(e.clientX, e.clientY, [...qb.menuFor(b.dataset.cmd!), { cmd: 'qa-edit', label: 'Customize Quick Access Toolbar…' }], { run: (c) => qb.run(c), key: () => undefined });
});

// ---------------------------------------------------------------- Search Commands (Alt+Q)

const onScreen = (el: Element) => el.getClientRects().length > 0;

/** A ribbon button's name: its own words, or its tool tip's first phrase when it only shows a sign. */
function ribbonLabel(b: HTMLElement): string {
  const t = b.cloneNode(true) as HTMLElement;
  t.querySelectorAll('.rb-icon, .sw, svg, kbd').forEach((x) => x.remove());
  const own = t.textContent!.replace(/\s+/g, ' ').trim();
  const tip = (b.dataset.tip ?? b.title ?? b.getAttribute('aria-label') ?? '').replace(/\s*\(.*?\)/g, '').split(/[.:;,] /)[0].trim();
  return own.length > 2 ? own : tip || own;
}

/** A command's picture for the search list: the one drawn for it, or the one on its ribbon button. */
function searchIcon(cmd: string | undefined, b?: HTMLElement): string | undefined {
  const from = (el: Element | null | undefined) => {
    if (!el) return undefined;
    const svg = el.querySelector('svg');
    if (svg) return svg.outerHTML;
    const glyph = el.querySelector('.rb-icon')?.textContent?.trim();
    return glyph && glyph.length <= 2 ? `<span>${glyph.replace(/[<&]/g, '')}</span>` : undefined;
  };
  return from(b) ?? (cmd ? commandIcon(cmd) ?? from(document.querySelector(`.ribbon [data-cmd="${cmd}"]`)) : undefined);
}

function commandItems(): CommandItem[] {
  const out: CommandItem[] = [];
  const runCmd = (cmd: string, label: string) => () => {
    finishTyping();
    if (!command(cmd)) flash(`${label} isn't available here.`);
  };
  for (const wrap of document.querySelectorAll<HTMLElement>('header .menu-wrap')) {
    const menu = wrap.querySelector<HTMLElement>(':scope > button')?.textContent?.trim() ?? '';
    for (const b of wrap.querySelectorAll<HTMLButtonElement>('[data-cmd]')) {
      if (b.hidden || b.disabled || getComputedStyle(b).display === 'none') continue;
      // the submenus it is in, outermost first (File ▸ Export)
      const subs: HTMLButtonElement[] = [];
      for (let w = b.parentElement?.closest<HTMLElement>('.submenu'); w; w = w.parentElement?.closest<HTMLElement>('.submenu')) {
        const head = w.querySelector<HTMLButtonElement>(':scope > button');
        if (head) subs.unshift(head);
      }
      if (subs.some((h) => h.disabled || h.parentElement!.hidden)) continue; // a submenu for another mode
      const cmd = b.dataset.cmd!, e = topMenuEntry(cmd);
      const label = e?.label ?? cmd;
      const path = subs.map((h) => h.firstChild?.textContent?.trim() ?? '').join(' ▸ ');
      out.push({ id: `cmd:${cmd}`, label, place: subs.length ? `${menu} ▸ ${path}` : `${menu} menu`, more: b.title, key: commandKey(cmd),
        checked: e?.checked, icon: searchIcon(cmd), run: runCmd(cmd, label) });
    }
  }
  for (const rib of document.querySelectorAll<HTMLElement>('.ribbon')) {
    if (rib.hidden || !onScreen(rib)) continue;
    for (const b of rib.querySelectorAll<HTMLButtonElement>('button')) {
      if (b.getAttribute('role') === 'tab' || b.hidden || b.disabled || b.closest('[hidden]:not(.rb-panel)')) continue;
      const panel = b.closest<HTMLElement>('.rb-panel');
      const tabAttr = panel && [...panel.attributes].find((a) => /^data-.*-panel$/.test(a.name));
      const tab = tabAttr ? rib.querySelector<HTMLButtonElement>(`[${tabAttr.name.replace(/-panel$/, '-tab')}="${tabAttr.value}"]`) : null;
      if (tab?.hidden) continue; // a tab shown only now and then (Table Design, Chart)
      const label = ribbonLabel(b);
      if (!label) continue;
      const name = b.dataset.cmd ? `cmd:${b.dataset.cmd}` : b.dataset.sh ? `sh:${b.dataset.sh}` : b.dataset.doc ? `doc:${b.dataset.doc}` : b.id ? `id:${b.id}` : `rb:${rib.id}:${label}`;
      const code = b.dataset.cmd ?? b.dataset.sh ?? b.dataset.doc;
      out.push({
        id: name, label, place: tab ? `${tab.textContent!.trim()} tab` : `${rib.getAttribute('aria-label')} ribbon`, more: b.dataset.tip ?? b.title,
        key: code ? commandKey(code) : undefined,
        icon: searchIcon(b.dataset.cmd, b),
        run: () => {
          if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
          b.click();
        },
      });
    }
  }
  if (onScreen($('#tools'))) {
    for (const [name] of ALL_TOOLS) {
      const label = toolNames[name] ?? ALL_TOOLS.get(name)!.title.split(/[.:] /)[0];
      const icon = ALL_TOOLS.get(name)!.icon;
      out.push({ id: `tool:${name}`, label, place: 'Drawing tools', more: ALL_TOOLS.get(name)!.title, key: keysOf('space', `tool ${name}`)[0],
        icon: icon.startsWith('<') ? icon : undefined,
        run: () => { editor.setTool(name); if (name === 'element') periodicTable.open(); } });
    }
  }
  for (const p of recentFiles) {
    const { name, folder } = recentLabel(p);
    out.push({ id: `recent:${p}`, label: `Open ${name}`, place: folder, more: 'recent file', run: () => void openRecent(p) });
  }
  for (const p of SETTINGS_PAGES) out.push({ id: `set:${p.id}`, label: `${p.title} settings`, place: 'Settings', more: p.words, run: () => settingsWindow.open(p.id) });
  // the User Guide's sections, once its pages have loaded (the first search starts that)
  if (guideIndex) {
    for (const h of guideIndex) {
      out.push({ id: `guide:${h.page}#${h.anchor}`, label: h.title, place: h.anchor ? `User Guide ▸ ${h.pageTitle}` : 'User Guide', more: 'help how to guide',
        run: () => void guide.open(h.page, h.anchor) });
    }
  } else if (!guideIndexLoading) {
    guideIndexLoading = true;
    void import('./ui/guide-window').then((m) => m.guideHeadings()).then((h) => { guideIndex = h; commandSearch.refresh(); }, () => { guideIndexLoading = false; });
  }
  return uniqueCommands(out);
}
let guideIndex: GuideHeading[] | null = null;
let guideIndexLoading = false;
const commandSearch = new CommandSearch(commandItems);
// the User Guide (and the Markdown reader it uses) loads the first time it opens
let guideWindow: GuideWindow | null = null;
const guide = {
  async open(page?: string, anchor?: string): Promise<void> {
    const { GuideWindow } = await import('./ui/guide-window');
    await (guideWindow ??= new GuideWindow(openWebPage)).open(page, anchor);
  },
};
watchRibbons((on) => { ribbonChosen = on; storeSettings(); });
// the Canvas ribbon's arrow switches it between Classic and Simplified (Settings ▸ Toolboxes and Ribbon has both too)
addLookToggle(canvasRibbon.el, { simple: () => ribbonLook === 'simple', toggle: () => { setRibbonLook(ribbonLook === 'simple' ? 'classic' : 'simple'); storeSettings(); } });
const SETTINGS_PAGES: SettingsPage[] = [
  { id: 'general', title: 'General', words: 'backup back up copy move settings file new computer install reinstall export import groups selecting click outline linked text above below ask whole page tracked changes reviewer name start view recent files chemdraw objects ole word powerpoint docx pptx save structures pictures svg png compatibility', open: generalPreferences },
  ...nmrHere ? [{ id: 'nmr', title: 'NMR Prediction', words: 'nmr prediction predict spectrum spectra proton carbon 1h 13c ppm range width solvent cdcl3 spectrometer frequency mhz quality fast balanced accurate automatic selection', open: nmrSettings }] : [],
  { id: 'preferences', title: 'Preferences', words: 'personal personalize habits enter return key finish text tool box new line alt option escape esc taste alkyl isomer prefix prefixes italic dash hyphen raised superscript tbu t-bu ipr i-pr nbu sbu ibu tert-butyl isopropyl problems warnings marks red box circle pointer cursor angle length units pixels px millimeters mm inches readout hints modifier shift alt ctrl keys counterions ions salt bf4 nbu4 charges group', open: personalPreferences },
  { id: 'drawing', title: 'Drawing', words: 'bond ends round rounded square caps mitre corners methyl me ch3 axial chirality ra sa helicity charges circled ammonium nh4 r groups numbers superscript regular text eta hapto delocalized mechanism arrows reroute wrap around block path gap tail head origin target intermediate check arrows', open: drawingPreferences },
  { id: 'style', perFile: true, title: 'Drawing Style', words: 'bond length line width font journal acs rsc wiley elsevier thieme hash spacing margin arrow text reagents conditions above below size smaller reaction arrows gap fit alignment line up structures plus scheme', open: drawingStyleDialog },
  { id: 'hotkeys', title: 'Keyboard Shortcuts', words: 'keys keyboard shortcuts import export reset', open: () => hotkeysDialog.open() },
  { id: 'typing', title: 'Text and Spelling', words: 'typing spelling dictionary autocorrect replacements chemistry formulas subscripts', open: () => typingDialog.open() },
  { id: 'palettes', title: 'Color Palettes', words: 'colors colors palette rows', open: () => editPalettes() },
  { id: 'mode-colours', title: 'Mode Colors', words: 'tab colors accent window drawing slides sheet document design appearance', open: () => modeDialog.open() },
  { id: 'navigation', title: 'Navigation', words: 'document map navigator minimap map overview edge arrows off screen lost find dot grid dots tint outside fit go to selection orientation zoom', open: navigationSettings },
  { id: 'page-grid', title: 'Page Grid', words: 'pages page grid boundaries dashed dotted lines paper fixed edges hatched wall empty gray print chemdraw paste wrap', open: pageGridSettings },
  { id: 'toolboxes', title: 'Toolboxes and Ribbon', words: 'toolbox ribbon classic simplified one row two rows buttons cells grid lines raised bevel borders tooltips hints keys modifiers shortcuts', open: toolboxPreferences },
  { id: 'dark', title: 'Reading Mode', words: 'reading mode dark page dark mode night paper ink graphite slate appearance colors', open: darkColours },
    { id: 'newman', title: 'Newman Projections', words: 'newman sawhorse projection conformation torsion dihedral gauche anti eclipsed color largest middle smallest group strain a-value energy chart rotation barrier kcal kj', open: () => newmanSettingsPage() },
  { id: 'schemes', title: 'Schemes', words: 'scheme arrow gap plus text reagents conditions boxes', open: schemeSettings },
  { id: 'autosave', title: 'AutoSave and Recovery', words: 'autosave recovery versions backup copies shared folders onedrive', open: () => keeper.optionsCommand() },
  { id: 'ai', title: 'AI Model', words: 'ai artificial intelligence claude anthropic chatgpt gpt openai gemini google ollama openrouter api key llm model link connect', open: () => aiSettings() },
  { id: 'online', title: 'Online', words: 'pubchem internet names lookup updates check version privacy stable latest channel beta', open: onlinePreferences },
  { id: 'files', actions: true, title: APPS_PAGE_TITLE, words: 'file types open with default app apps system computer device other programs explorer finder associations cdxml cdx mol sdf docx pptx xlsx double-click word powerpoint excel objects ole make figures offer documents', open: () => fileTypesPage(fileTypesHost) },
];
// Apply on a Settings page uses its settings and keeps them. Pages about the open file (Drawing
// Style) apply to that file; their Set as Default is for new files too.
/** Settings that change by themselves (recent files, pane sizes): never part of a page's changes. */
const RUNNING_SETTINGS = ['recentFiles', 'recentSymbols', 'lastVersion', 'welcomed', 'skipVersion', 'splitWidth', 'slidePaneWidth', 'notesHeight', 'fileTypesOffered', 'wordObjectsOffered'];
const settingsHost: SettingsHost = {
  snapshot: () => {
    const s = JSON.parse(JSON.stringify(currentSettings())) as Record<string, unknown>;
    for (const k of RUNNING_SETTINGS) delete s[k];
    return s;
  },
  restore: (s) => {
    applySettings({ ...currentSettings(), ...s } as Settings);
    storeSettings();
  },
  applied: () => storeSettings(),
};
const settingsWindow = new SettingsWindow(SETTINGS_PAGES, settingsHost);
$('#btn-search').addEventListener('click', () => commandSearch.open());
placeSidePanel();
// your palettes show in the Colours toolbox as soon as they change
onPalettes(() => { if (toolboxState.places.colours?.shown) toolboxes.render(); });
stylePanel.reaction = {
  roles: (id) => editor.reactionRoles(id),
  others: () => editor.sel.atoms.size + editor.sel.captions.size + editor.sel.shapes.size,
  setRole: (id, role) => { editor.setReactionRole(id, role); },
  reset: (id) => editor.resetReactionRoles(id),
  select: (id, role) => editor.selectRole(id, role),
  cleanUp: () => command('clean-up-reaction'),
  arrange: () => command('arrange-scheme'),
  sideText: (id) => editor.arrowSideText(id),
  setSideText: (id, side, text) => editor.setArrowSideText(id, side, text),
};
stylePanel.tables = {
  part: () => editor.tablePart,
  setPart: (p) => { editor.tablePart = p; },
  update: (id, t) => editor.updateTable(id, t),
  edit: (id, part) => editor.editTable(id, part),
  measure: textMeasure,
};

let stereoSeen = -1;
let outlineSeen = -1;
// scroll bars over the drawing: they cover what is drawn (or the slide), and the part on screen
const scrollArea = () => {
  const d = ws.active.deck;
  // a canvas slide: its keyframes and whatever is drawn beyond them
  const c = d?.current?.canvas;
  if (d && c) return unionRect(keysBounds(c, d.size), doc.bounds());
  if (d) return { x1: 0, y1: 0, x2: d.size.w, y2: d.size.h };
  // with the page grid: the pages, and a page more on each side that can grow
  const p = gridPage(), bb = doc.bounds();
  return p ? scrollBox(p, pageExtent(p, bb), bb) : bb;
};
const scrollbars = new Scrollbars(host, renderer, scrollArea, () => editor.requestScene());
// the wheel stops where the bars end, at the edge of the drawing, rather than going on for ever
editor.scrollArea = scrollArea;

// ---------------------------------------------------------------- finding your way round (Settings ▸ Navigation)


/** Drawings: the dot grid, painted behind everything (on screen only; never saved, printed or copied). */
const drawingBackdrop = {
  draw(ctx: CanvasRenderingContext2D): void { paintGrid(ctx, orientPrefs, renderer.dpr, dark.on); },
};
if (!renderer.page && !deckNow()) renderer.page = drawingBackdrop;

/** Is an endless drawing showing in the window (not a slide, design, sheet or document)? */
const drawingShown = () => !deckNow() && !editor.paused;

/** What the edge arrows point to: each structure, and (when set) text, arrows and shapes. Worked out again when the drawing changes, not while dragging. */
let targetsCache: { version: number; to: OrientPrefs['arrowsTo']; list: Target[] } | null = null;
function arrowTargets(): Target[] {
  if (targetsCache && (targetsCache.version === doc.version || editor.dragging) && targetsCache.to === orientPrefs.arrowsTo) return targetsCache.list;
  const list: Target[] = [];
  const box = (pts: { x: number; y: number }[]) => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of pts) { if (p.x < x1) x1 = p.x; if (p.y < y1) y1 = p.y; if (p.x > x2) x2 = p.x; if (p.y > y2) y2 = p.y; }
    return { x1, y1, x2, y2 };
  };
  for (const f of doc.fragments()) list.push({ what: 'structure', box: box([...f].map((id) => doc.atoms.get(id)!)) });
  if (orientPrefs.arrowsTo === 'everything') {
    for (const c of doc.captions.values()) list.push({ what: 'text', box: { x1: c.x, y1: c.y - 10, x2: c.x + (c.width ?? 40), y2: c.y + 4 } });
    for (const r of doc.arrows.values()) list.push({ what: 'arrow', box: box([r.tail, r.head]) });
    for (const sh of doc.shapes.values()) list.push({ what: 'shape', box: { x1: Math.min(sh.x1, sh.x2), y1: Math.min(sh.y1, sh.y2), x2: Math.max(sh.x1, sh.x2), y2: Math.max(sh.y1, sh.y2) } });
  }
  targetsCache = { version: doc.version, to: orientPrefs.arrowsTo, list };
  return list;
}

const navMap = new Navigator(host, renderer, () => orientPrefs, {
  content: () => doc.bounds(),
  version: () => doc.version,
  paint: (ctx) => drawDrawing(ctx, doc),
  background: () => doc.background,
  moved: () => editor.requestScene(),
  fit: () => command('zoom-fit'),
  busy: () => editor.dragging,
});
const edgeArrows = new EdgeArrows(host, renderer, () => editor.requestScene());
editor.underlay = (ctx) => {
  // a structure drawn in its box (a cell's, a document's or a window's) stays white right to the box's edge
  if (!drawingShown() || cellEdit) return;
  const p = gridPage();
  // with the page grid, whole pages show what is in use, so the tint round the drawing is left off
  if (p && pageLook.grid) paintPages(ctx, pageLook, renderer, p, pageExtent(p, doc.bounds()), pagesInUse(p), dark.on, dark.on ? null : darkSurround);
  else paintTint(ctx, orientPrefs, renderer, doc.bounds(), doc.style.labelSize * 1.5 + doc.style.bondLength);
};
editor.overlayTop = (ctx) => nmrPanel.drawMarks(ctx, renderer.view.scale, (id) => doc.atoms.get(id), (id) => doc.neighbors(id), getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0e7c86');
// Fit on an empty drawing shows its first page
editor.emptyArea = () => { const p = gridPage(); return p ? { x1: 0, y1: 0, x2: p.w, y2: p.h } : null; };
// nothing is drawn or moved past a fixed edge of the page grid
editor.walls = () => { const p = gridPage(); return p ? wallRect(p) : null; };

/** Each frame: the navigator and the edge arrows follow the view and the drawing. */
function updateOrientation(): void {
  const on = drawingShown();
  // (no Document Map over a structure's box: the box is small, and Fit shows the whole structure)
  navMap.update(on && !cellEdit);
  edgeArrows.update(on && orientPrefs.edgeArrows ? arrowTargets() : null, doc.version, navMap.box());
}

/** Use these navigation settings: tick the View menu, show or hide the buttons, and repaint (the grid is in the drawing's tiles). */
function setOrient(next: OrientPrefs, store = true): void {
  const gridChanged = next.dotGrid !== orientPrefs.dotGrid || next.gridSpacing !== orientPrefs.gridSpacing || next.gridStrength !== orientPrefs.gridStrength;
  orientPrefs = { ...next };
  targetsCache = null;
  for (const [cmd, on] of [['navigator', orientPrefs.navigator], ['edge-arrows', orientPrefs.edgeArrows], ['dot-grid', orientPrefs.dotGrid], ['outside-tint', orientPrefs.tint]] as const) {
    for (const el of document.querySelectorAll(`[data-cmd="${cmd}"][role="menuitemcheckbox"]`)) el.setAttribute('aria-checked', String(on));
  }
  $('#go-buttons').hidden = !orientPrefs.goButtons;
  if (gridChanged) renderer.repaintAll();
  editor.requestScene();
  if (store) storeSettings();
}

// ---------------------------------------------------------------- the page grid (page-grid.ts)

/** The drawing's page, when its page grid shows: a drawing (not a slide or design) with a page, and the grid switched on. */
function gridPage(): PageSetup | null {
  return pageLook.grid && !deckNow() && doc.page ? doc.page : null;
}

/** The pages with something on them, worked out again when the drawing changes. */
let usedCache: { doc: Doc; version: number; w: number; h: number; set: Set<string> } | null = null;
function pagesInUse(p: PageSetup): Set<string> {
  if (usedCache && usedCache.doc === doc && usedCache.version === doc.version && usedCache.w === p.w && usedCache.h === p.h) return usedCache.set;
  const r = doc.style.labelSize * 0.5;
  const boxes: Rect[] = [];
  for (const a of doc.atoms.values()) boxes.push({ x1: a.x - r, y1: a.y - r, x2: a.x + r, y2: a.y + r });
  for (const c of doc.captions.values()) boxes.push({ x1: c.x, y1: c.y - 10, x2: c.x + (c.width ?? 40), y2: c.y + 4 });
  for (const a of doc.arrows.values()) boxes.push({ x1: Math.min(a.tail.x, a.head.x), y1: Math.min(a.tail.y, a.head.y), x2: Math.max(a.tail.x, a.head.x), y2: Math.max(a.tail.y, a.head.y) });
  for (const sh of doc.shapes.values()) boxes.push({ x1: Math.min(sh.x1, sh.x2), y1: Math.min(sh.y1, sh.y2), x2: Math.max(sh.x1, sh.x2), y2: Math.max(sh.y1, sh.y2) });
  const set = usedPages(p, boxes);
  // a new, empty drawing shows its first page white, ready to draw on, not greyed as unused
  if (!set.size) set.add(pageKey(0, 0));
  usedCache = { doc, version: doc.version, w: p.w, h: p.h, set };
  return usedCache.set;
}

/** Use these page grid settings: tick the View menu and repaint. */
function setPageLook(next: PageLook, store = true): void {
  pageLook = { ...next };
  for (const el of document.querySelectorAll('[data-cmd="page-grid"][role="menuitemcheckbox"]')) el.setAttribute('aria-checked', String(pageLook.grid));
  editor.requestScene();
  if (store) storeSettings();
}

/** Fix or free one edge of the page grid (right-click > Page Edges, or Page Setup). */
function togglePageEdge(side: Side): boolean {
  const p = doc.page;
  if (!p || deckNow()) { flash('This drawing has no pages: choose a paper in File > Page Setup first.'); return false; }
  if (!p.grow) { flash('The drawing is kept to a set number of pages, so all its edges are fixed. Choose "Add pages as the drawing grows" in File > Page Setup to free some.', 7000); return false; }
  const w = wallsOf(p), on = w[side] === undefined;
  if (on && fixedCount(w) >= 3) { flash('At most three edges can be fixed, so the drawing always has room to grow. Free another edge first.', 6000); return false; }
  p.walls = setWall(p, doc.bounds(), side, on);
  ws.noteChange();
  editor.requestScene();
  flash(on ? `The ${SIDE_NAMES[side]} edge is fixed: nothing can go past it.` : `The ${SIDE_NAMES[side]} edge is free: pages are added that way as the drawing grows.`, 3500);
  return true;
}

/** Right-click on the drawing: fix or free the page grid's edges. */
function pageEdgesMenu(): MenuItem | null {
  const p = gridPage();
  if (!p || !p.grow) return null;
  const w = wallsOf(p);
  return { label: 'Page Edges', items: [
    ...SIDES.map((s) => ({ cmd: `page-edge:${s}`, label: `${w[s] !== undefined ? '✓ ' : ''}Fix ${SIDE_NAMES[s][0].toUpperCase()}${SIDE_NAMES[s].slice(1)} Edge` })),
    null, { cmd: 'page-setup' }, { cmd: 'page-grid-settings' },
  ] };
}

/**
 * After a paste: when it goes past a fixed edge, it is moved inside, adding pages the open ways,
 * or its pieces are wrapped at the page's edges like a line of text (asked, unless a choice is set
 * in Settings ▸ Page Grid). The change joins the paste, so one undo takes both back.
 */
/** How far in from a fixed page edge a paste is kept (points: a quarter of an inch). */
const PASTE_MARGIN = 18;

async function keepPasteInside(): Promise<void> {
  const p = gridPage();
  if (!p || !editor.hasSelection()) return;
  const walls = wallRect(p), box = editor.selBox();
  if (!box) return;
  // a paste is kept a little way in from a fixed edge, not right against it
  const inner = insetWalls(walls, PASTE_MARGIN, box);
  if (!crossesWalls(box, inner)) return;
  let how: 'pages' | 'wrap' = pageLook.pasteAtWall === 'wrap' ? 'wrap' : 'pages';
  // only near the edge, not past it: moved in, without asking
  if (!crossesWalls(box, walls)) how = 'pages';
  else if (pageLook.pasteAtWall === 'ask') {
    const got = await ask('Pasted past a fixed edge', [
      { name: 'how', label: 'Fit it in by', value: 'pages', options: [
        { value: 'pages', label: 'Adding pages: keep it as it was pasted' },
        { value: 'wrap', label: 'Wrapping: put its structures on new rows at the page\'s edge' },
      ] },
      { name: 'remember', label: 'Do this every time (Settings ▸ Page Grid changes it)', type: 'checkbox', value: 'false' },
    ], { ok: 'OK', note: 'What was pasted goes past a fixed edge of the page grid, where nothing can go.' });
    how = got?.how === 'wrap' ? 'wrap' : 'pages';
    if (got?.remember === 'true') setPageLook({ ...pageLook, pasteAtWall: how });
  }
  const sel = editor.sel;
  doc.amend('Paste', () => {
    const pieces = units(doc, sel, editor.measure());
    if (how === 'wrap' && pieces.length > 1) {
      // between the fixed edges, or the grid's edges on an open side
      const grid = extentRect(p, pageExtent(p, doc.bounds()));
      const left = isFinite(walls.x1) ? walls.x1 : Math.max(grid.x1, Math.min(box.x1, grid.x2 - p.w));
      const right = isFinite(walls.x2) ? walls.x2 : Math.max(grid.x2, left + p.w);
      const top = Math.max(isFinite(walls.y1) ? walls.y1 : -Infinity, box.y1);
      const gap = doc.style.bondLength;
      const moves = wrapPieces(pieces.map((u) => u.box), left + gap / 2, right - gap / 2, top + gap / 2, gap);
      pieces.forEach((u, i) => moveUnit(doc, u, moves[i]));
    }
    const now = editor.selBox();
    if (now) { const d = clampMove(now, { x: 0, y: 0 }, insetWalls(walls, PASTE_MARGIN, now)); if (d.x || d.y) for (const u of units(doc, sel, editor.measure())) moveUnit(doc, u, d); }
  });
  editor.changed();
  if (crossesWalls(editor.selBox() ?? box, walls)) flash('What was pasted is bigger than the room between the fixed edges. Free an edge (right-click > Page Edges) or choose a bigger page.', 7000);
}

/** Settings ▸ Page Grid. */
async function pageGridSettings(): Promise<void> {
  const o = pageLook;
  // sizes in pixels, with the one in use kept even when it isn't one of these
  const px = (vs: number[], now: number) => [...new Set([...vs, now])].sort((a, b) => a - b).map((v) => ({ value: String(v), label: `${v} px` }));
  const shade = [{ value: 'off', label: 'None' }, { value: 'faint', label: 'Faint' }, { value: 'light', label: 'Light' }, { value: 'strong', label: 'Stronger' }];
  const r = await ask('Page Grid', [
    { name: 'grid', label: 'Show the drawing\'s pages (a new canvas starts with one, and pages are added as it grows)', type: 'checkbox', value: String(o.grid),
      help: 'On screen only. Off: the endless drawing with nothing fixed. The paper size and fixed edges are in File > Page Setup.' },
    { name: 'lineStyle', label: 'Page boundaries', value: o.lineStyle, options: [{ value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }, { value: 'solid', label: 'Solid' }] },
    { name: 'lineWidth', label: 'Boundary thickness', value: String(o.lineWidth), options: [0.5, 1, 1.5, 2, 3].map((v) => ({ value: String(v), label: `${v} px` })) },
    { name: 'lineColour', label: 'Boundary color', value: o.lineColour, type: 'color' },
    { name: 'lineOpacity', label: 'Boundary strength', value: String(o.lineOpacity), options: [[0.2, 'Very faint'], [0.35, 'Faint'], [0.55, 'Light'], [0.8, 'Strong'], [1, 'Solid']].map(([v, l]) => ({ value: String(v), label: `${l} (${Math.round(Number(v) * 100)}%)` })) },
    { name: 'emptyShade', label: 'Pages with nothing on them', value: o.emptyShade, options: shade },
    { name: 'outsideShade', label: 'The space around the pages', value: o.outsideShade, options: shade },
    { name: 'ghost', label: 'Outline the pages beyond, where drawing adds pages', type: 'checkbox', value: String(o.ghost) },
    { name: 'wallStyle', label: 'Fixed edges', value: o.wallStyle, options: [{ value: 'hatch', label: 'Bold line, hatched on the outside' }, { value: 'line', label: 'Bold line' }] },
    { name: 'wallWidth', label: 'Fixed edge line', value: String(o.wallWidth), options: px([1.5, 2, 2.2, 2.5, 3, 4], o.wallWidth) },
    { name: 'hatchSpacing', label: 'Hatching: gap between strokes', value: String(o.hatchSpacing), options: px([4, 5, 6, 7, 8, 10, 12, 14], o.hatchSpacing) },
    { name: 'hatchLength', label: 'Hatching: how far out', value: String(o.hatchLength), options: px([4, 5, 6, 7, 8, 10, 12, 16], o.hatchLength) },
    { name: 'hatchWidth', label: 'Hatching: stroke width', value: String(o.hatchWidth), options: px([0.5, 0.75, 1, 1.25, 1.5, 2], o.hatchWidth) },
    { name: 'hatchAngle', label: 'Hatching: slant', value: String(o.hatchAngle), options: [{ value: '45', label: '45° (/)' }, { value: '135', label: '45° (\\)' }, { value: '60', label: '60° (steep /)' }, { value: '120', label: '60° (steep \\)' }, { value: '30', label: '30° (shallow /)' }, { value: '150', label: '30° (shallow \\)' }] },
    { name: 'hatchCorner', label: 'Hatching where two fixed edges meet', value: o.hatchCorner, options: [{ value: 'wrap', label: 'Continue around the corner' }, { value: 'mirror', label: 'Lean the other way on the sides (a chevron at the corner)' }] },
    { name: 'pasteAtWall', label: 'A paste that goes past a fixed edge', value: o.pasteAtWall, options: [{ value: 'ask', label: 'Ask each time' }, { value: 'pages', label: 'Move it inside, adding pages' }, { value: 'wrap', label: 'Wrap its structures at the page\'s edge' }] },
  ], { ok: 'Save', preview: { title: 'Pages', draw: (v) => pageGridPreview(readLook(v)) } });
  if (!r) return;
  setPageLook(readLook(r));
  function readLook(r: Record<string, string>): PageLook {
    return {
    grid: r.grid === 'true', lineStyle: r.lineStyle as PageLook['lineStyle'], lineWidth: Number(r.lineWidth) || 1,
    lineColour: /^#[0-9a-f]{6}$/i.test(r.lineColour) ? r.lineColour : o.lineColour, lineOpacity: Number(r.lineOpacity) || o.lineOpacity,
    emptyShade: r.emptyShade as PageLook['emptyShade'], outsideShade: r.outsideShade as PageLook['outsideShade'], ghost: r.ghost === 'true',
    wallStyle: r.wallStyle === 'line' ? 'line' : 'hatch', pasteAtWall: r.pasteAtWall as PageLook['pasteAtWall'],
    wallWidth: Number(r.wallWidth) || o.wallWidth, hatchSpacing: Number(r.hatchSpacing) || o.hatchSpacing, hatchLength: Number(r.hatchLength) || o.hatchLength,
    hatchWidth: Number(r.hatchWidth) || o.hatchWidth, hatchAngle: Number(r.hatchAngle) || o.hatchAngle, hatchCorner: r.hatchCorner === 'mirror' ? 'mirror' : 'wrap',
    };
  }
}

/** Settings ▸ Navigation. */
async function navigationSettings(): Promise<void> {
  const o = orientPrefs;
  const strength = [{ value: 'faint', label: 'Faint' }, { value: 'light', label: 'Light' }, { value: 'strong', label: 'Stronger' }];
  const r = await ask('Navigation', [
    { name: 'navigator', label: 'Document Map: a small map of the whole drawing in a corner (click or drag in it to move there; double-click to fit)', type: 'checkbox', value: String(o.navigator) },
    { name: 'navCorner', label: 'Document Map corner', value: o.navCorner, options: [{ value: 'br', label: 'Bottom right' }, { value: 'bl', label: 'Bottom left' }, { value: 'tr', label: 'Top right' }, { value: 'tl', label: 'Top left' }] },
    { name: 'navSize', label: 'Document Map size', value: o.navSize, options: [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }] },
    { name: 'navHideAll', label: 'Hide the Document Map while the whole drawing is on screen', type: 'checkbox', value: String(o.navHideAll) },
    { name: 'edgeArrows', label: 'Edge arrows: point to things scrolled out of sight (click one to go there)', type: 'checkbox', value: String(o.edgeArrows) },
    { name: 'arrowsTo', label: 'Edge arrows point to', value: o.arrowsTo, options: [{ value: 'structures', label: 'Structures' }, { value: 'everything', label: 'Structures, text, arrows and shapes' }] },
    { name: 'dotGrid', label: 'Dot grid behind the drawing', type: 'checkbox', value: String(o.dotGrid),
      help: 'On screen only: files, printing, copying and exports have no grid. The dots spread out as you zoom out.' },
    { name: 'gridSpacing', label: 'Dot spacing', value: o.gridSpacing, options: [{ value: 'fine', label: 'Fine (¼ inch)' }, { value: 'normal', label: 'Normal (½ inch)' }, { value: 'wide', label: 'Wide (1 inch)' }] },
    { name: 'gridStrength', label: 'Dots', value: o.gridStrength, options: strength },
    { name: 'tint', label: 'Tint the empty space beyond everything drawn', type: 'checkbox', value: String(o.tint),
      help: 'On screen only. Shows at a glance which way the drawing is when nothing of it is in the window. Not shown with the page grid, whose white pages already show where the drawing is.' },
    { name: 'tintStrength', label: 'Tint', value: o.tintStrength, options: strength },
    { name: 'goButtons', label: 'Fit and Go to Selection buttons in the status bar', type: 'checkbox', value: String(o.goButtons),
      help: 'F6 fits the drawing and Shift+F6 goes to the selection, with or without the buttons (Edit ▸ Keyboard Shortcuts changes the keys).' },
  ], { ok: 'Save', preview: { title: 'Dots and tint', draw: (v) => navigationPreview({
    dotGrid: v.dotGrid === 'true', gridSpacing: v.gridSpacing as OrientPrefs['gridSpacing'], gridStrength: v.gridStrength as OrientPrefs['gridStrength'],
    tint: v.tint === 'true', tintStrength: v.tintStrength as OrientPrefs['tintStrength'] }, editor.dark) } });
  if (!r) return;
  setOrient({
    navigator: r.navigator === 'true', navCorner: r.navCorner as OrientPrefs['navCorner'], navSize: r.navSize as OrientPrefs['navSize'], navHideAll: r.navHideAll === 'true',
    edgeArrows: r.edgeArrows === 'true', arrowsTo: r.arrowsTo === 'everything' ? 'everything' : 'structures',
    dotGrid: r.dotGrid === 'true', gridSpacing: r.gridSpacing as OrientPrefs['gridSpacing'], gridStrength: r.gridStrength as OrientPrefs['gridStrength'],
    tint: r.tint === 'true', tintStrength: r.tintStrength as OrientPrefs['tintStrength'],
    goButtons: r.goButtons === 'true',
  });
}

$('#go-fit').addEventListener('click', () => { command('zoom-fit'); $('#overlay').focus({ preventScroll: true }); });
$('#go-sel').addEventListener('click', () => { command('zoom-selection'); $('#overlay').focus({ preventScroll: true }); });
$('#status-notes').addEventListener('click', () => command('view-notes'));

// ---------------------------------------------------------------- the page in drawings

/** The page new drawings start on (File > Page Setup's default). */
let defaultPage: Settings['page'] = { name: 'letter', w: 540, h: 720, grow: true };

// ---------------------------------------------------------------- the welcome card

/** The welcome card has been closed for good. */
let welcomed = false;
const welcomeCard = $('#welcome');
/** While the welcome card shows: looks, on each change, for drawing having started. */
let welcomeWatch: (() => void) | null = null;
/** Show the start view (after the welcome card has been seen): new tabs, recent files. It goes when anything is picked or drawn. */
function showStartView(): void {
  if (!startView || doc.atoms.size || doc.captions.size || doc.shapes.size || doc.arrows.size || deckNow() || ws.active.mode !== 'drawing' || ws.tabs.length > 1) return;
  const card = $('#start-view');
  // the New buttons carry the tabs' mode icons
  for (const b of card.querySelectorAll<HTMLElement>('.sv-new [data-mode]')) {
    const icon = b.querySelector('.sv-icon')!;
    if (!icon.firstChild) icon.innerHTML = TAB_ICONS[b.dataset.mode as Tab['mode']][0];
  }
  const files = recentFiles.slice(0, 6).map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    const { name, folder } = recentLabel(p);
    const n = document.createElement('span');
    n.textContent = name;
    const f = document.createElement('small');
    f.className = 'muted';
    f.textContent = folder;
    b.append(n, f);
    b.title = isHandleEntry(p) ? name : p;
    b.addEventListener('click', () => { off(); void openRecent(p); });
    return b;
  });
  card.querySelector('.sv-files')!.replaceChildren(...files);
  card.querySelector<HTMLElement>('.sv-recent')!.hidden = !files.length;
  const again = card.querySelector<HTMLInputElement>('.sv-again input')!;
  again.checked = true;
  card.hidden = false;
  const seen = doc.version;
  const tab = ws.active;
  const off = () => {
    welcomeWatch = null;
    if (card.hidden) return;
    card.hidden = true;
    if (!again.checked) { startView = false; storeSettings(); }
  };
  card.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-start]');
    if (!b) return;
    off();
    if (b.dataset.start === 'draw') $('#overlay').focus({ preventScroll: true });
    else command(b.dataset.start!);
  };
  // drawing anything, or going to another tab, puts it away
  welcomeWatch = () => { if (card.hidden) welcomeWatch = null; else if (doc.version !== seen || ws.active !== tab) off(); };
}

/** Show the welcome card on a first, empty drawing; it goes when closed or when drawing starts. */
function showWelcome(): void {
  if (welcomed) { showStartView(); return; }
  if (doc.atoms.size || doc.captions.size || doc.shapes.size || deckNow() || ws.active.mode !== 'drawing') return;
  welcomeCard.hidden = false;
  const seen = doc.version;
  const off = () => {
    welcomeWatch = null;
    if (welcomeCard.hidden) return;
    welcomeCard.hidden = true;
    welcomed = true;
    storeSettings();
  };
  $('#welcome-close').addEventListener('click', () => { off(); $('#overlay').focus({ preventScroll: true }); }, { once: true });
  welcomeCard.querySelector('[data-cmd="user-guide"]')?.addEventListener('click', (e) => { e.preventDefault(); off(); command('user-guide'); }, { once: true });
  // drawing anything puts it away (looked for on each change, not on every frame)
  welcomeWatch = () => { if (welcomeCard.hidden) welcomeWatch = null; else if (doc.version !== seen) off(); };
}

/**
 * File > Page Setup…: the drawing's paper size and way up; whether pages are added as it grows
 * (and which edges are fixed) or it is kept to a set number of pages; and the default for new drawings.
 */
async function pageSetup(): Promise<void> {
  const p = doc.page;
  const land = !!p && p.w > p.h;
  const paper = p ? PAPER.find((x) => (Math.abs(x.w - p.w) < 1 && Math.abs(x.h - p.h) < 1) || (Math.abs(x.w - p.h) < 1 && Math.abs(x.h - p.w) < 1)) : undefined;
  const walls = p ? wallsOf(p) : { l: 0, t: 0 };
  const count = p ? pageCount(pageExtent(p, doc.bounds())) : { across: 1, down: 1 };
  const got = await ask('Page Setup', [
    { name: 'paper', label: 'Paper', value: !p ? 'none' : paper?.name ?? 'custom', options: [...PAPER.map((x) => ({ value: x.name, label: x.label })), { value: 'custom', label: 'Custom Size' }, { value: 'none', label: 'No page (an endless drawing)' }] },
    { name: 'way', label: 'Orientation', value: land ? 'landscape' : 'portrait', options: [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] },
    { name: 'w', label: 'Custom size: width (in)', value: String(Math.round(((p?.w ?? 540) + 72) / 72 * 100) / 100), type: 'number' },
    { name: 'h', label: 'Custom size: height (in)', value: String(Math.round(((p?.h ?? 720) + 72) / 72 * 100) / 100), type: 'number' },
    { name: 'grow', label: 'Pages', value: !p || p.grow ? 'grow' : 'keep', options: [{ value: 'grow', label: 'Add pages as the drawing grows' }, { value: 'keep', label: 'Keep it to a set number of pages (as ChemDraw)' }] },
    { name: 'across', label: 'Set number of pages: across', value: String(count.across), type: 'number' },
    { name: 'down', label: 'Set number of pages: down', value: String(count.down), type: 'number' },
    ...SIDES.map((sd) => ({ name: `fix-${sd}`, label: `Fixed ${SIDE_NAMES[sd]} edge`, type: 'checkbox' as const, value: String(walls[sd] !== undefined) })),
    { name: 'dflt', label: 'Use this for new canvases', type: 'checkbox', value: 'false' },
  ], { ok: 'OK', note: 'Sizes are the paper; the page drawn on is half an inch in from each edge, as in ChemDraw. When pages are added as the drawing grows, up to three edges can be fixed: nothing can go past them (a new canvas has its top and left edges fixed, as ChemDraw\'s pages grow right and down). Right-click the drawing for Page Edges to change them as you go.' });
  if (!got) return;
  let next: PageSetup | null = null;
  if (got.paper !== 'none') {
    const pp = PAPER.find((x) => x.name === got.paper);
    let w = pp ? pp.w : Math.max(1, Number(got.w) || 8.5) * 72 - 72, h = pp ? pp.h : Math.max(1, Number(got.h) || 11) * 72 - 72;
    if ((got.way === 'landscape') !== (w > h)) [w, h] = [h, w];
    const grow = got.grow !== 'keep';
    const pages = (v: string) => Math.max(1, Math.min(200, Math.round(Number(v) || 1)));
    next = { w: Math.max(72, w), h: Math.max(72, h), grow, ...(pp ? { name: pp.name } : {}) };
    if (!grow) {
      next.across = pages(got.across);
      next.down = pages(got.down);
    } else {
      if (p?.grow && p.across) next.across = p.across;
      if (p?.grow && p.down) next.down = p.down;
      // edges fixed before stay where they were (on the same page size); new ones where the grid's edge is now
      const same = !!p && Math.abs(p.w - next.w) < 1 && Math.abs(p.h - next.h) < 1 && p.grow;
      let w2: PageWalls = same ? { ...wallsOf(p!) } : {};
      for (const sd of SIDES) {
        const on = got[`fix-${sd}`] === 'true';
        if (!on) { delete w2[sd]; continue; }
        if (w2[sd] === undefined) w2 = setWall({ ...next, walls: w2 }, doc.bounds(), sd, true);
      }
      if (fixedCount(w2) > 3) {
        delete w2.b;
        flash('At most three edges can be fixed, so the drawing always has room to grow: the bottom edge was left free.', 7000);
      }
      next.walls = w2;
    }
  }
  doc.page = next;
  ws.noteChange();
  if (got.dflt === 'true') { defaultPage = next && { ...next, ...(next.walls ? { walls: { ...next.walls } } : {}) }; storeSettings(); }
  if (next && !next.grow && !keepOnPage(doc)) flash('The drawing is bigger than its pages, so it can\'t all be kept on them. Choose more pages, a bigger page, or add pages as it grows.', 7000);
  editor.changed();
  renderer.repaintAll();
  editor.requestScene();
}

/** View > Window and Colours > Interface Size: the whole window bigger or smaller, saved for next time. */
function sizeInterface(v: number): void {
  if (!canScaleUi()) { flash('In the web version, use your browser\'s zoom (in its menu) to make the whole page bigger or smaller.', 5000); return; }
  void setUiScale(v).then(() => flash(`Interface size ${Math.round(uiScale() * 100)}% (Ctrl+Alt+= larger, Ctrl+Alt+- smaller, Ctrl+Alt+0 normal)`, 2500));
  storeSettings();
}

/** View > Window and Colours > Text Formatting Bar: along the top of the drawing, floating by the text, or hidden. */
function placeTextBar(where: Settings['textBar']): void {
  CaptionEditor.barPlace = where;
  for (const w of ['docked', 'floating', 'hidden']) $(`[data-cmd="text-bar-${w}"]`)?.setAttribute('aria-checked', String(w === where));
}

/** View > Window and Colours > Theme: the window light or dark whatever the computer is set to, or as it is set. */
let appTheme: Settings['appTheme'] = 'darkgray';
function setAppTheme(t: Settings['appTheme']): void {
  appTheme = t;
  const root = document.documentElement;
  // Dark Gray is the light theme with its own colours over it
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t === 'darkgray' ? 'light' : t;
  if (t === 'darkgray') root.dataset.gray = ''; else delete root.dataset.gray;
  themeChanged();
  for (const w of ['system', 'light', 'dark', 'darkgray']) $(`[data-cmd="theme-${w}"]`)?.setAttribute('aria-checked', String(w === t));
}

/** View > Window and Colours > Density: bigger icons and more room between the toolboxes' and ribbons' buttons. */
let density: Settings['density'] = 'cozy';
/** Shadows under the menus and on the toolboxes: light as the app comes, strong, or off. */
let shadows: Settings['shadows'] = 'light';
function setShadows(v: Settings['shadows']): void {
  shadows = v;
  if (v === 'light') delete document.documentElement.dataset.shadows;
  else document.documentElement.dataset.shadows = v;
  for (const w of ['light', 'strong', 'off']) $(`[data-cmd="shadows-${w}"]`)?.setAttribute('aria-checked', String(w === v));
}
function setDensity(d: Settings['density']): void {
  density = d;
  if (d === 'cozy') delete document.documentElement.dataset.density;
  else document.documentElement.dataset.density = d;
  for (const w of ['snug', 'cozy', 'normal', 'standard', 'large']) $(`[data-cmd="density-${w}"]`)?.setAttribute('aria-checked', String(w === d));
  fitRibbons();
}

/** View > Window and Colours > Icon Colours: the mode's colour on one part of each icon (the default), or a colour for each kind of command. */
let iconLook: Settings['iconLook'] = 'mode';
function setIconLook(l: Settings['iconLook']): void {
  iconLook = l;
  if (l === 'kind') document.documentElement.dataset.icons = 'colour';
  else delete document.documentElement.dataset.icons;
  for (const w of ['mode', 'kind']) $(`[data-cmd="icons-${w}"]`)?.setAttribute('aria-checked', String(w === l));
}

/** View > Window and Colours > Icon Colours > Shapes in the Mode Colour. */
let shapeInkNow: Settings['shapeInk'] = 'neutral';
function setShapesInk(ink: Settings['shapeInk']): void {
  shapeInkNow = ink;
  setShapeInk(ink);
  $('[data-cmd="shape-ink-accent"]')?.setAttribute('aria-checked', String(ink === 'accent'));
}

/** The space round the drawing's pages in the dark theme (app.css --surround), or null in the light theme, where the page grid's light shading shows. */
let darkSurround: string | null = null;
const darkScheme = matchMedia('(prefers-color-scheme: dark)');
function themeChanged(): void {
  const t = document.documentElement.dataset.theme;
  const isDark = t === 'dark' || (t !== 'light' && darkScheme.matches);
  darkSurround = isDark ? getComputedStyle(document.documentElement).getPropertyValue('--surround').trim() || null : null;
  // the slide's and the document's canvases paint the space round the page themselves
  dispatchEvent(new CustomEvent('surround-changed', { detail: darkSurround }));
  renderer.repaintAll();
  editor.requestScene();
}
darkScheme.addEventListener('change', themeChanged);
themeChanged();

/** View > Focus View (Ctrl+Shift+F1): the toolboxes, side panel and ribbon hidden, the page given the whole window. */
function setFocusView(on: boolean): void {
  focusView = on;
  document.body.classList.toggle('focus-view', on);
  $('[data-cmd="focus-view"]')?.setAttribute('aria-checked', String(on));
  dispatchEvent(new Event('resize'));
  if (on) flash(`Focus view: toolboxes, side panel and ribbon hidden. ${commandKey('focus-view') || 'View > Focus View'} brings them back.`, 6000);
}

/** View > Toolboxes > One Column Outside Drawing: side-docked toolboxes in one column in the other kinds of tab. */
function setOneColumnTools(on: boolean): void {
  oneColumnTools = on;
  $('[data-cmd="one-column-tools"]')?.setAttribute('aria-checked', String(on));
  if (toolboxesBuilt && wantOneColumn() !== toolsInOneColumn) toolboxes.render();
}

function showScrollBars(on: boolean): void {
  scrollbars.shown = on;
  $('[data-cmd="scroll-bars"]')?.setAttribute('aria-checked', String(on));
  scrollbars.update(doc.version);
}

/** The status bar's zoom box: what the zoom is now, as a percentage of actual size. */
const zoomPick = $<HTMLSelectElement>('#zoom-pick');
let zoomShown = -1;
function showZoom(): void {
  const pct = Math.round((renderer.view.scale / (96 / 72)) * 100);
  if (pct === zoomShown) return;
  zoomShown = pct;
  const own = zoomPick.querySelector<HTMLOptionElement>('option[value="now"]')!;
  const listed = [...zoomPick.options].find((o) => o.value === String(pct));
  own.hidden = !!listed;
  own.textContent = `${pct}%`;
  zoomPick.value = listed ? listed.value : 'now';
}
zoomPick.addEventListener('change', () => {
  const v = zoomPick.value;
  if (v === 'fit') command('zoom-fit');
  else if (v === 'actual') command('zoom-actual');
  else if (/^\d+$/.test(v)) editor.zoomTo((Number(v) / 100) * (96 / 72));
  zoomShown = -1;
  showZoom();
  $('#overlay').focus({ preventScroll: true });
});

editor.onFrame = () => {
  // in place: the pages follow the drawing tools' zoom and scrolling, and show the structure as it is drawn
  if (place && cellEdit) {
    const v = renderer.view;
    if (placeSeen && !sameView(v, placeSeen)) { place.follow({ scale: v.scale, ox: v.ox, oy: v.oy }); pullPlace(); }
    if (doc.version !== placeVersion || editor.dragging) { placeVersion = doc.version; place.show((ctx) => drawDrawing(ctx, doc)); }
  }
  showZoom();
  rulers.update();
  // what is typed on the slide shows in the outline
  if (outlineView.shown && doc.version !== outlineSeen) { outlineSeen = doc.version; outlineView.rebuild(); }
  layers?.refresh();
  scrollbars.update(doc.version);
  updateOrientation();
  updatePanels();
  // while dragging, the warnings list and R/S labels wait for the drop (they changed every frame)
  if (editor.dragging) { warnTip.hidden = true; return; }
  updateWarnings();
  if (doc.version !== stereoSeen) { stereoSeen = doc.version; updateStereo(); }
};
const slideText = new SlideTextRibbon($('#ribbon'), {
  format: (f) => editor.formatText(f),
  look: () => editor.textLook(),
  refocus: () => editor.refocusText(),
  nothing: () => flash('Click into some text, or pick a text box or a shape with text, first.'),
  box: (c) => editor.setTextBox(c),
  boxLook: () => editor.textBoxLook(),
});
const designText = new SlideTextRibbon($('#design-ribbon'), {
  format: (f) => editor.formatText(f),
  look: () => editor.textLook(),
  refocus: () => editor.refocusText(),
  nothing: () => flash('Click into some text, or pick a text box or a shape with text, first.'),
  box: (c) => editor.setTextBox(c),
  boxLook: () => editor.textBoxLook(),
});
/** The text groups of the ribbon showing (Presentation or Design) follow the text being edited. */
const textRibbonNow = () => (ws.active.mode === 'slides' ? slideText : ws.active.mode === 'design' ? designText : null);
// the Text Formatting toolbox is the typing bar, and so are the Canvas ribbon's Home tab's Font and
// Paragraph groups: with either showing, the bar above the text hides (with the ribbon collapsed or on
// another tab, it shows as before)
CaptionEditor.barElsewhere = () => toolboxes.isShown('text') || (!canvasRibbon.el.hidden && !ribbonCollapsed() && canvasRibbon.tab === 'home');
CaptionEditor.onState = () => { textRibbonNow()?.refresh(); textToolbox?.refresh(); canvasFont?.refresh(); };
// the Smart Scheme pane: the selected scheme's species, beside it
const smartPane = new SmartPane({
  doc: () => editor.doc,
  measure: () => editor.fullMeasure(),
  selected: () => (editor.sel.shapes.size + editor.sel.captions.size + editor.sel.arrows.size + editor.sel.atoms.size ? editor.selectedSmart() : null),
  screenRect: (r) => {
    const o = overlay.getBoundingClientRect();
    const a = renderer.toScreen({ x: r.x1, y: r.y1 }), b = renderer.toScreen({ x: r.x2, y: r.y2 });
    return { x1: a.x + o.left, y1: a.y + o.top, x2: b.x + o.left, y2: b.y + o.top };
  },
  area: () => { const o = host.getBoundingClientRect(); return { x1: o.left, y1: o.top, x2: o.right, y2: o.bottom }; },
  slotRuns: (id, k, parts) => editor.smartSlotRuns(id, k, parts),
  stepRuns: (id, k, part, parts) => editor.smartStepRuns(id, k, part, parts),
  toStructure: (id, k) => editor.smartToHolder(id, k),
  toText: (id, k) => editor.smartToText(id, k),
  stepToStructure: (id, k, part) => editor.smartStepToHolder(id, k, part),
  stepToText: (id, k, part) => editor.smartStepToText(id, k, part),
  selectHolder: (shape) => editor.selectShape(shape),
  add: (id, after) => editor.smartInsert(id, after),
  remove: (id, k) => editor.smartRemove(id, k),
  move: (id, from, to) => editor.smartMove(id, from, to),
  arrange: (id, patch) => editor.smartArrange(id, patch),
  format: (id, fmt) => editor.smartFormat(id, fmt),
  async secondLoop(id) {
    const st = editor.smartCycleStart(id);
    if (!st) {
      if (editor.smartReagentStructures(id)) flash('A second loop can\'t be added while a step has a structure joining or leaving it: make those steps\' reagents text first (in the species list), add the loop, then make them structures again.', 8000);
      return;
    }
    const got = await askCycle(0, { spec: { loops: [st.loop] }, look: st.look, drawn: st.drawn });
    if (got?.rows) editor.smartRebuildCycle(id, got.spec, got.look, got.rows);
  },
  cleanUpCycle: (id) => { if (!editor.smartCleanUpCycle(id)) flash('Clean Up Cycle needs three or more species in one loop.', 4000); },
  ungroup: (id) => editor.ungroupSmart(id),
  dock: (where) => {
    if (where === null) { smartDockBody = null; toolboxes.toggle('smart', false); smartPane.float(); return; }
    toolboxes.put('smart', where);
  },
  work: () => $('#work').getBoundingClientRect(),
});
// Auto-Animate Steps offered when a scheme of two steps or more (or a Smart Scheme) is selected on a slide
const buildHint = new BuildHint({
  onSlide: () => ws.active.mode === 'slides' && !!deckNow(),
  doc: () => editor.doc,
  measure: () => editor.fullMeasure(),
  scope: () => {
    const s = editor.sel;
    if (!s.atoms.size && !s.captions.size && !s.arrows.size && !s.shapes.size) return null;
    const smart = editor.selectedSmart();
    const f = smart !== null ? editor.doc.shapes.get(smart)?.frame : undefined;
    return f
      ? { scope: { atoms: new Set(f.atoms), captions: new Set(f.captions), arrows: new Set(f.arrows), shapes: new Set(f.shapes) }, smart: true }
      : { scope: { atoms: new Set(s.atoms), captions: new Set(s.captions), arrows: new Set(s.arrows), shapes: new Set(s.shapes) }, smart: false };
  },
  anims: () => { const d = deckNow(); return d?.slides[d.index]?.anims ?? []; },
  screenRect: (r) => {
    const o = overlay.getBoundingClientRect();
    const a = renderer.toScreen({ x: r.x1, y: r.y1 }), b = renderer.toScreen({ x: r.x2, y: r.y2 });
    return { x1: a.x + o.left, y1: a.y + o.top, x2: b.x + o.left, y2: b.y + o.top };
  },
  area: () => { const o = host.getBoundingClientRect(); return { x1: o.left, y1: o.top, x2: o.right, y2: o.bottom }; },
  run: () => void autoAnimateSteps(),
});
editor.onOverlay = () => { smartPane.place(); buildHint.place(); };
editor.onSmartAdded = (frame, cap) => smartPane.focusCaption(frame, cap);
editor.onChange = () => { welcomeWatch?.(); showToolStatus(); ($('#go-sel') as HTMLButtonElement).disabled = !editor.hasSelection(); showRibbonContext(); smartPane.refresh(); buildHint.refresh(); if (ws.active.mode === 'slides' || ws.active.mode === 'design') { textRibbonNow()?.refresh(); showContextTabs(); } textToolbox?.refresh(); canvasFont?.refresh(); animUi?.selectionChanged(); updateStereo(); scheduleAnalysis(); updatePanels(); ws.noteChange(); stylePanel.refresh(); void refreshDescriptors(); scheduleLabelCheck(); };
chem.onReady = () => {
  (window as any).__chemReadyMs = performance.now() - startMs;
  sheetChem.flush();
  updatePanels();
  updateStereo();
  scheduleAnalysis(true);
  void refreshDescriptors();
};

/** A sample molecule, for the self-test and the speed tests. */
function sampleMolecule(): void {
  doc.bulk(() => {
    const L = doc.style.bondLength;
    const ring = placeRing(doc, freeRing({ x: 120, y: 90 }, 6, L), { aromatic: true });
    const a = doc.atoms.get(ring[1])!;
    const c = sprout(doc, a.id);
    const ch = sprout(doc, c.id, 1, 'hashWedge');
    doc.updateAtom(ch.id, { label: null });
    const n = sprout(doc, c.id);
    doc.updateAtom(n.id, { z: 7 });
    const co = sprout(doc, n.id);
    sprout(doc, co.id, 2, 'solid', 8);
    const o = sprout(doc, co.id, 1, 'solid', 8);
    doc.updateAtom(o.id, { label: null });
    const tb = sprout(doc, o.id);
    doc.updateAtom(tb.id, { label: 'tBu' });
    editor.lastEdited = ring[0];
  });
  doc.allDirty = true;
  editor.fit();
  editor.changed();
}

// the Design ribbon's tabs
for (const b of document.querySelectorAll<HTMLButtonElement>('#design-ribbon [data-dz-tab]')) {
  b.addEventListener('click', () => {
    for (const x of document.querySelectorAll<HTMLButtonElement>('#design-ribbon [data-dz-tab]')) x.setAttribute('aria-selected', String(x === b));
    for (const p of document.querySelectorAll<HTMLElement>('#design-ribbon [data-dz-panel]')) p.hidden = p.dataset.dzPanel !== b.dataset.dzTab;
  });
}
// the ribbon's buttons run the same commands as the menus
for (const id of ['#ribbon', '#design-ribbon']) {
  $(id).addEventListener('click', (e) => {
    const cmd = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cmd]')?.dataset.cmd;
    if (cmd) command(cmd);
  });
  // (ticks in the ribbon too)
  $(id).addEventListener('change', (e) => {
    const cmd = (e.target as HTMLElement).closest<HTMLInputElement>('input[type="checkbox"][data-cmd]')?.dataset.cmd;
    if (cmd) command(cmd);
  });
}
// the Beta mark beside the program's name says what beta means here
$('#stage-badge').addEventListener('click', () => command('about'));

renderTabs();
updateTitle();

resize();
requestAnimationFrame(() => {
  editor.fit();
  editor.frame(true);
  (window as any).__firstPaintMs = performance.now() - startMs;
  // start the speed readout from the first real interaction
  editor.latencies.length = 0;
});

// Hooks for the automated speed tests.
(window as any).__app = { assistant: { items: assistantItems, apply: applyAssistantAction, markStep: markAssistantStep }, doc, editor, renderer, settingsWindow, toolboxes, chem, live, command, setRibbonLook, setPageLook, getPageLook: () => ({ ...pageLook }), addMolfile, keeper, cdxml: (name: string) => writeCdxml(doc, { name, textMeasure: measureText }), openText, picture: (dpi = 150) => { const p = recordPicture(doc, 0); if (!p) return null; const c = pictureCanvas(doc, p, dpi); return { url: c.canvas.toDataURL('image/png'), box: p.box, dpi: c.dpi }; }, stressTest, pasteChemistry, smiles: async (loose = false) => chem.molToSmiles(toMolfile(doc, doc.atoms.keys(), '', { species: allSpecies(doc, editor.measure()) }).molblock, loose), placePicture, sample: sampleMolecule, ws, slideList, get presenter() { return shows?.presenter; }, Doc, keymap, names, get sheetMode() { return sheetMode; }, sheetChem, get docMode() { return docMode; }, loadModes: () => Promise.all([loadSheetMode(), loadDocMode()]), docxBytes: async () => (await import('./io/docx-write')).writeDocx(docMode.file!.t, docFiles),
  pptxBytes: async () => { const d = deckNow()!; const { writePptx } = await import('./io/pptx-write'); return writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ id: s.id, layout: s.layout, doc: d.docOf(i), notes: s.notes, transition: s.transition, anims: s.anims, comments: s.comments, canvas: s.canvas })), oleKept: d.oleKept, picKept: d.picKept }, pptxOptions()); } };

// ---------------------------------------------------------------- desktop self-test

// Inside the desktop app, started with CHEM_ILLUSTRATOR_SELFTEST set (see src-tauri/src/lib.rs):
// check that the drawing, the chemistry engine and the name reader work in this web view, time a few redraws,
// report, and close. The automatic Windows build runs this on the app it has just built.
if (isTauri()) {
  invoke<boolean>('selftest_requested').then((yes) => { if (yes) desktopSelfTest(); }).catch(() => {});
}

async function desktopSelfTest(): Promise<void> {
  const report: Record<string, unknown> = { userAgent: navigator.userAgent };
  let ok = false;
  try {
    sampleMolecule();
    const t0 = performance.now();
    while (!chem.ready && !chem.error && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => requestAnimationFrame(r));
    Object.assign(report, {
      atoms: doc.atoms.size,
      firstPaintMs: (window as any).__firstPaintMs,
      chemReadyMs: (window as any).__chemReadyMs,
      rdkit: chem.version,
      chemError: chem.error,
    });
    if (chem.ready) {
      const { molblock, map } = toMolfile(doc, doc.atoms.keys());
      const res = await chem.analyze([{ molblock, map }]);
      report.formula = res.results[0]?.formula;
      report.exactMass = res.results[0]?.exact;
      ok = !!report.formula && !res.results[0]?.error;
    }
    // Name to structure (OPSIN in its worker) in this web view, under the app's security rules.
    const n0 = performance.now();
    const nr = await names.read('(2R)-butan-2-ol');
    report.nameToStructure = { ok: nr.ok, smiles: nr.smiles, message: nr.message, ms: Math.round(performance.now() - n0) };
    ok = ok && nr.ok && nr.smiles === 'C[C@H](CC)O';
    // Redraw speed on a large drawing, in this web view.
    const s0 = performance.now();
    stressTest(2000);
    report.stress2000 = { atoms: doc.atoms.size, buildAndFirstPaintMs: performance.now() - s0 };
    const times: number[] = [];
    renderer.renderScene(doc);
    for (let i = 0; i < 40; i++) { renderer.view.ox += i % 2 ? 3 : -3; renderer.renderScene(doc); times.push(renderer.lastSceneMs); }
    (report.stress2000 as Record<string, unknown>).panMedianMs = stat(times).med;
  } catch (e) {
    report.exception = String(e);
    ok = false;
  }
  await invoke('selftest_report', { report: JSON.stringify(report, null, 2), ok });
}
