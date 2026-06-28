/**
 * CSV cell escaping that also neutralizes spreadsheet FORMULA INJECTION.
 *
 * A CSV cell whose text begins with `=`, `+`, `-`, `@`, a TAB, or a CR is
 * interpreted as a formula by Excel / Google Sheets / LibreOffice. An attacker
 * who can get such a string into an exported cell (e.g. a deal/decision note)
 * can trigger data exfiltration or command execution when an operator opens the
 * file. Prefix any such cell with a single quote so it is rendered as literal
 * text, then apply normal RFC-4180 quoting.
 */
export function csvEscape(value: string | number | null | undefined | Date): string {
  if (value === null || value === undefined) return '';
  let str = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
