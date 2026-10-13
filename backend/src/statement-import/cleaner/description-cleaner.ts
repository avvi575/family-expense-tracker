/** Cleans raw transaction descriptions extracted from PDF text. */
export function cleanDescription(raw: string, bank: string): string {
  let d = raw.trim();

  d = d.replace(/^\d+%\s*/, '').replace(/^[A-Za-z\/]+-\d+%\s*/, '');
  d = d.replace(/^UPI-\d{6,18}-/i, '');
  d = d.replace(/^IMPS[-\s]?\d{6,18}-?/i, '');
  d = d.replace(/^NEFT[-\s]?[A-Z0-9]{6,18}-?/i, '');
  d = d.replace(/^RTGS[-\s]?[A-Z0-9]{6,18}-?/i, '');
  d = d.replace(/^POS\s+(?:DEBIT|CREDIT)\s+/i, '');
  d = d.replace(/^ATM\s+(?:WDL|CASH\s*WDL)\s+/i, '');
  d = d.replace(/^CHEQUE\s+NO\.?\s*\d+\s*/i, '');
  d = d.replace(/^TXN[-\s]?\d+/i, '');
  d = d.replace(/^REF[-\s]?\d+/i, '');
  d = d.replace(/\s+IN\s*$/i, '').replace(/\s+Intl\.#\s*$/i, '');
  d = d.replace(/\s+\d{1,4}\s*$/, '');
  d = d.replace(/\s+/g, ' ').trim();
  d = d
    .split(' ')
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(' ');
  return d.slice(0, 150);
}
