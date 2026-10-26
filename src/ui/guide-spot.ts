// Which part of the User Guide F1 opens: kept apart from the guide window, which loads only when
// the guide is first opened.

/** The page and heading that explain a tool (by its kind) or a mode. */
export function guideSpot(mode: string, toolKind?: string): { page: string; anchor: string } {
  const pages: Record<string, string> = { slides: 'guide/slides.md', sheet: 'guide/sheets.md', document: 'guide/documents.md', design: 'guide/design.md' };
  if (pages[mode]) return { page: pages[mode], anchor: '' };
  const tools: Record<string, string> = {
    select: 'select-and-eraser', eraser: 'select-and-eraser', bond: 'bonds-and-chains', chain: 'bonds-and-chains', ring: 'rings',
    template: 'templates', text: 'text-periodic-table-and-fragmentation', element: 'text-periodic-table-and-fragmentation',
    fragment: 'text-periodic-table-and-fragmentation', arrow: 'arrows-mechanism-symbols-shapes-and-brackets',
    symbol: 'arrows-mechanism-symbols-shapes-and-brackets', shape: 'arrows-mechanism-symbols-shapes-and-brackets',
    bracket: 'arrows-mechanism-symbols-shapes-and-brackets', line: 'arrows-mechanism-symbols-shapes-and-brackets',
    mark: 'arrows-mechanism-symbols-shapes-and-brackets',
  };
  return { page: 'guide/drawing.md', anchor: (toolKind && tools[toolKind]) || '' };
}
