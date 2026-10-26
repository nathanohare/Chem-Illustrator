// Word files (.docx): the shared parts (docx-base.ts), the writer and the reader in one place.
// The app itself imports the reader and writer only when a document is opened or saved.

export * from './docx-base';
export { writeDocx, type DocxDeps } from './docx-write';
export { readDocx, type DocxReadDeps } from './docx-read';
