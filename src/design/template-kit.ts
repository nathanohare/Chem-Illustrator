// The pieces the Design templates (design/templates.ts) are built from: the shape of a template,
// color themes, and small helpers for the boxes most templates have (a dashed spot where a
// structure or picture goes, text with no box, a filled band, a heading). Positions and sizes are
// in points on the template's page.

import type { Shape } from '../model';

/** A shape in a template: where it goes on the page (points) and what it says. */
export interface Box {
  geo: string;
  x: number; y: number; w: number; h: number;
  /**
   * Paragraphs are separated by \n; the first can be set bold. Inside the text, {f:Na2SO4} is set
   * as a formula (digits subscript), {b:words} bold, {i:words} italic, {sup:2} superscript and {sub:50} subscript.
   */
  text?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  /** Text color. */
  ink?: string;
  fill?: string | null;
  line?: string | null;
  /** Outline width in points (the drawing style's line width when left out). */
  lw?: number;
  dashed?: boolean;
  align?: Shape['textAlign'];
  valign?: Shape['textValign'];
  /** How see-through the fill is, 0 to 1. */
  clear?: number;
  rot?: number;
  name?: string;
}

/** A connector from one box's side to another's (sides: 0 top, 1 right, 2 bottom, 3 left). */
export interface Link { from: number; fp: number; to: number; tp: number; elbow?: boolean }

/** An arrow not stuck to anything, from tail (x1, y1) to head (x2, y2), with how it looks. */
export type FreeArrow = [number, number, number, number, ArrowLook?];
export interface ArrowLook { color?: string; width?: number; sweep?: number; dashed?: boolean; equilibrium?: boolean; both?: boolean }

export type TemplateCategory = 'poster' | 'abstract' | 'toc' | 'figure' | 'flyer' | 'flowchart' | 'workup' | 'timeline';

/** The categories in the New Design window's list, in order. */
export const TEMPLATE_CATEGORIES: { id: TemplateCategory; name: string }[] = [
  { id: 'poster', name: 'Posters' },
  { id: 'abstract', name: 'Graphical abstracts' },
  { id: 'toc', name: 'TOC graphics' },
  { id: 'figure', name: 'Figures' },
  { id: 'flyer', name: 'Flyers' },
  { id: 'flowchart', name: 'Flowcharts' },
  { id: 'workup', name: 'Workup schemes' },
  { id: 'timeline', name: 'Timelines' },
];

export interface DesignTemplate {
  id: string;
  name: string;
  /** What it is for, in a line. */
  blurb: string;
  category: TemplateCategory;
  /** The page size it is laid out for (DESIGN_SIZES id). */
  sizeId: string;
  /** The page's color, when not white (a full-page band under everything). */
  paper?: string;
  boxes: Box[];
  links: Link[];
  arrows?: FreeArrow[];
}

// ---------------------------------------------------------------- color themes

export interface Theme {
  /** Banners and headings. */
  dark: string;
  /** A second color for highlights. */
  accent: string;
  /** Light fills: section bodies, cards. */
  soft: string;
  /** Text on light fills. */
  ink: string;
  /** Text on the dark color. */
  onDark: string;
}

export const THEMES = {
  navy: { dark: '#1f3864', accent: '#c55a11', soft: '#eef2f8', ink: '#1a1a1a', onDark: '#ffffff' },
  blue: { dark: '#2f5597', accent: '#548235', soft: '#dae3f3', ink: '#1a1a1a', onDark: '#ffffff' },
  teal: { dark: '#0f6b6b', accent: '#e07a1f', soft: '#e6f2f1', ink: '#16302f', onDark: '#ffffff' },
  forest: { dark: '#2e5e3a', accent: '#b8860b', soft: '#edf4ee', ink: '#1b2a1e', onDark: '#ffffff' },
  crimson: { dark: '#8b1e2d', accent: '#2f5597', soft: '#f8eef0', ink: '#2a1418', onDark: '#ffffff' },
  plum: { dark: '#5b2a6e', accent: '#1f8a8a', soft: '#f3edf6', ink: '#24142b', onDark: '#ffffff' },
  slate: { dark: '#37474f', accent: '#00897b', soft: '#eceff1', ink: '#1c262b', onDark: '#ffffff' },
  orange: { dark: '#b5521b', accent: '#1f3864', soft: '#fbf0e8', ink: '#2b1a10', onDark: '#ffffff' },
  /** Light text on a dark page. */
  night: { dark: '#0d1b2a', accent: '#f2b134', soft: '#1b2d44', ink: '#e8eef5', onDark: '#ffffff' },
} satisfies Record<string, Theme>;

export const GREY = '#7f7f7f';

// ---------------------------------------------------------------- boxes

/** A dashed box marking where a structure or picture goes. */
export const spot = (x: number, y: number, w: number, h: number, text: string, size: number, more: Partial<Box> = {}): Box =>
  ({ geo: 'rect', x, y, w, h, text, size, ink: GREY, fill: null, line: GREY, dashed: true, name: `Placeholder: ${text}`, ...more });

/** Text with no box around it. */
export const words = (x: number, y: number, w: number, h: number, text: string, size: number, more: Partial<Box> = {}): Box =>
  ({ geo: 'rect', x, y, w, h, text, size, fill: null, line: null, ...more });

/** A filled box with no outline. */
export const band = (x: number, y: number, w: number, h: number, fill: string, more: Partial<Box> = {}): Box =>
  ({ geo: 'rect', x, y, w, h, fill, line: null, ...more });

/** A circle centered on (cx, cy). */
export const dot = (cx: number, cy: number, r: number, fill: string | null, more: Partial<Box> = {}): Box =>
  ({ geo: 'ellipse', x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill, line: null, ...more });

/** An icon from the icon library (design/icons.ts), filled in one color. */
export const icon = (name: string, x: number, y: number, s: number, color: string): Box =>
  ({ geo: `icon:${name}`, x, y, w: s, h: s, fill: color, line: null, name: `Icon: ${name}` });

/** A piece of lab glassware (design/geo.ts), drawn at line width lw. */
export const glass = (geo: string, x: number, y: number, w: number, h: number, lw: number, color = '#000000'): Box =>
  ({ geo, x, y, w, h, line: color, fill: null, lw });
