import { SOURCE_CATALOG } from '../../types/connectors';

export const SOURCE_CATALOG_BY_ID = new Map(
  SOURCE_CATALOG.map((source) => [source.connector_id, source]),
);

export const SOURCE_ICON_BY_ID: Record<string, string> = {
  gmail: '\u2709\uFE0F',
  gmail_imap: '\u2709\uFE0F',
  gmail_api: '\u2709\uFE0F',
  slack: '#',
  imessage: '\uD83D\uDCAC',
  gdrive: '\uD83D\uDCC1',
  notion: '\uD83D\uDCC4',
  obsidian: '\uD83D\uDCC1',
  granola: '\uD83C\uDF99\uFE0F',
  gcalendar: '\uD83D\uDCC5',
  gcontacts: '\uD83D\uDCC7',
  outlook: '\u2709\uFE0F',
  apple_notes: '\uD83C\uDF4E',
  dropbox: '\uD83D\uDCE6',
  whatsapp: '\uD83D\uDCF1',
  upload: '\uD83D\uDCC2',
};
