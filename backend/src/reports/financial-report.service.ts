import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

interface ReportData {
  month: string;
  familyName: string;
  income: { total: number; byMember: { name: string; total: number }[]; byType: { type: string; total: number }[] };
  expense: {
    total: number;
    recurringTotal: number;
    oneTimeTotal: number;
    byCategory: { name: string; total: number; color: string }[];
    byMember: { name: string; total: number }[];
    byRecurring: { id: string; name: string; total: number }[];
    dailyTotals: { date: string; total: number }[];
  };
}

/* ─── palette ─── */
const C = {
  dark: 'FF1E293B',
  grey: 'FF64748B',
  lightGrey: 'FFF1F5F9',
  accent: 'FF4F46E5',
  accentLight: 'FFE0E7FF',
  pos: 'FF059669',
  posLight: 'FFD1FAE5',
  neg: 'FFDC2626',
  negLight: 'FFFEE2E2',
  amber: 'FFD97706',
  amberLight: 'FFFEF3C7',
  blue: 'FF2563EB',
  blueLight: 'FFDBEAFE',
};

/* ─── helper builders ─── */

function fill(hex: string): ExcelJS.FillPattern {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: hex } };
}

function thickBorder(style: ExcelJS.BorderStyle = 'thin'): ExcelJS.Borders {
  return {
    top: { style },
    bottom: { style },
    left: { style },
    right: { style },
    diagonal: {},
  };
}

function headerCell(ws: ExcelJS.Worksheet, row: number, col: number, text: string, bg: string) {
  const cell = ws.getCell(row, col);
  cell.value = text;
  cell.font = { bold: true, size: 11, color: { argb: C.dark } };
  cell.fill = fill(bg);
  cell.border = thickBorder();
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function labelCell(ws: ExcelJS.Worksheet, row: number, col: number, text: string, opts: { bold?: boolean; indent?: number } = {}) {
  const cell = ws.getCell(row, col);
  cell.value = text;
  cell.font = { bold: opts.bold ?? false, size: 11, color: { argb: C.dark } };
  if (opts.indent) cell.alignment = { indent: opts.indent };
}

function valueCell(ws: ExcelJS.Worksheet, row: number, col: number, value: number, opts: { bold?: boolean; bg?: string; color?: string; format?: string } = {}) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font = { bold: opts.bold ?? false, size: 11, color: { argb: opts.color ?? C.dark } };
  if (opts.bg) cell.fill = fill(opts.bg);
  cell.alignment = { horizontal: 'right' };
  cell.numFmt = opts.format ?? '#,##0.00';
  cell.border = thickBorder();
}

function spacer(ws: ExcelJS.Worksheet, row: number, height = 1) {
  ws.getRow(row).height = 6 * height;
}

/* ─── service ─── */

@Injectable()
export class FinancialReportService {
  build(data: ReportData): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Family Expense Tracker';
    wb.modified = new Date();

    this.coverSheet(wb, data);
    this.summarySheet(wb, data);
    this.breakdownSheet(wb, data);
    this.dailySheet(wb, data);

    return wb;
  }

  /* ─── Cover page ─── */
  private coverSheet(wb: ExcelJS.Workbook, data: ReportData) {
    const ws = wb.addWorksheet('Report', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 8 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 8 }];

    const net = data.income.total - data.expense.total;
    const savingsRate = data.income.total > 0 ? (net / data.income.total) * 100 : 0;
    const topCat = data.expense.byCategory[0];

    // Title band — merge once, style once
    ws.mergeCells(1, 1, 1, 6);
    ws.getRow(1).height = 42;
    const title = ws.getCell(1, 1);
    title.value = '👨‍👩‍👧‍👦 Family Financial Report';
    title.font = { size: 22, bold: true, color: { argb: C.dark } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.fill = fill(C.accentLight);
    title.border = thickBorder();
    ws.mergeCells(2, 1, 2, 6);
    const subRow = ws.getRow(2);
    subRow.height = 22;
    const sub = ws.getCell(2, 1);
    sub.value = `${data.familyName}  ·  ${data.month}  ·  Generated ${new Date().toISOString().slice(0, 10)}`;
    sub.font = { size: 12, color: { argb: C.grey } };
    sub.alignment = { horizontal: 'center', vertical: 'middle' };
    sub.fill = fill(C.accentLight);
    spacer(ws, 3, 2);

    // KPI cards (4 cells across)
    const kpiRow = 4;
    const cards = [
      { label: 'Total income', value: data.income.total, color: C.pos, bg: C.posLight, icon: '📈' },
      { label: 'Total expenses', value: data.expense.total, color: C.neg, bg: C.negLight, icon: '🪔' },
      { label: 'Net savings', value: net, color: net >= 0 ? C.pos : C.neg, bg: net >= 0 ? C.posLight : C.negLight, icon: '🪔' },
      { label: 'Savings rate', value: `${savingsRate.toFixed(1)}%`, color: savingsRate >= 20 ? C.pos : savingsRate >= 0 ? C.amber : C.neg, bg: savingsRate >= 20 ? C.posLight : savingsRate >= 0 ? C.amberLight : C.negLight, icon: '🪔' },
    ];
    for (let c = 0; c < 4; c++) {
      const col = c + 2;
      // Single cell — no merge needed
      const cell = ws.getCell(kpiRow, col);
      cell.value = `${cards[c].icon}  ${cards[c].label}\n${cards[c].value}`;
      cell.font = { bold: true, size: 12, color: { argb: cards[c].color } };
      cell.fill = fill(cards[c].bg);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thickBorder('medium');
      ws.getRow(kpiRow).height = 50;
    }
    spacer(ws, 5, 2);

    // Headline message
    ws.mergeCells(6, 1, 6, 6);
    const headline = ws.getCell(6, 1);
    headline.value = this.headlineMessage(data, savingsRate, net);
    headline.font = { size: 12, italic: true, color: { argb: C.dark } };
    headline.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headline.fill = fill(C.blueLight);
    headline.border = thickBorder();
    ws.getRow(6).height = 36;
    spacer(ws, 7, 2);

    // Key stats section
    ws.mergeCells(8, 1, 8, 6);
    headerCell(ws, 8, 1, 'KEY METRICS', C.accentLight);
    let r = 9;
    const stats = [
      { label: 'Period', value: data.month, icon: '📅' },
      { label: 'Total transactions', value: `${data.expense.byCategory.reduce((s, c) => s + c.total > 0 ? 1 : 0, 0)} categories, ${data.expense.byMember.reduce((s, m) => s + m.total > 0 ? 1 : 0, 0)} members spending`, icon: '🔢' },
      { label: 'Recurring expenses', value: data.expense.recurringTotal, icon: '🔄', format: '#,##0.00' },
      { label: 'One-time expenses', value: data.expense.oneTimeTotal, icon: '1️⃣', format: '#,##0.00' },
      { label: 'Recurring % of spend', value: data.expense.total > 0 ? `${((data.expense.recurringTotal / data.expense.total) * 100).toFixed(1)}%` : '—', icon: '🪔' },
      { label: 'Top category', value: topCat ? `${topCat.name} (${((topCat.total / data.expense.total) * 100).toFixed(1)}% of spend)` : '—', icon: '🏆' },
      { label: 'Income sources', value: `${data.income.byType.length} types, ${data.income.byMember.length} members`, icon: '🪔' },
    ];
    for (const s of stats) {
      labelCell(ws, r, 1, `${s.icon}  ${s.label}`);
      ws.mergeCells(r, 2, r, 3);
      labelCell(ws, r, 2, String(s.value));
      spacer(ws, r, 1);
      r++;
    }

    // Income statement summary
    r += 1;
    ws.mergeCells(r, 1, r, 6);
    headerCell(ws, r, 1, 'INCOME STATEMENT', C.accentLight);
    r++;
    const stmt = [
      { label: 'Total income', value: data.income.total, color: C.pos, bg: C.posLight },
      { label: 'Total expenses', value: -data.expense.total, color: C.neg, bg: C.negLight },
      { label: 'Net savings', value: net, color: net >= 0 ? C.pos : C.neg, bg: net >= 0 ? C.posLight : C.negLight },
    ];
    for (const row of stmt) {
      labelCell(ws, r, 1, row.label);
      ws.mergeCells(r, 2, r, 3);
      valueCell(ws, r, 2, row.value, { bold: true, bg: row.bg, color: row.color });
      spacer(ws, r, 1);
      r++;
    }
  }

  private headlineMessage(data: ReportData, savingsRate: number, net: number): string {
    const income = data.income.total;
    const expense = data.expense.total;
    if (income === 0 && expense === 0) return 'No income or expenses recorded for this period. Start tracking to see insights.';
    if (income === 0) return `Your family spent ₹${expense.toLocaleString('en-IN')} but no income was recorded. Add income declarations to see the full picture.`;
    if (net >= 0 && savingsRate >= 30) return `Outstanding! Your family saved ${savingsRate.toFixed(0)}% of income this period — well above the 20% benchmark.`;
    if (net >= 0 && savingsRate >= 15) return `Healthy finances. You saved ${savingsRate.toFixed(0)}% of income — right in the recommended 15–25% zone.`;
    if (net >= 0) return `You spent ₹${expense.toLocaleString('en-IN')} against ₹${income.toLocaleString('en-IN')} income. Consider reviewing discretionary spending to boost savings.`;
    return `⚠️  Expenses exceeded income by ₹${Math.abs(net).toLocaleString('en-IN')}. Review your largest spending categories to find savings opportunities.`;
  }

  /* ─── Summary: income & expense overview ─── */
  private summarySheet(wb: ExcelJS.Workbook, data: ReportData) {
    const ws = wb.addWorksheet('Overview', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 36 }, { width: 18 }, { width: 12 }, { width: 36 }, { width: 18 }, { width: 12 }];

    let r = 1;
    ws.mergeCells(1, 1, 1, 6);
    const t = ws.getCell(1, 1);
    t.value = 'Income & Expense Overview';
    t.font = { size: 16, bold: true, color: { argb: C.dark } };
    t.alignment = { horizontal: 'center' };
    spacer(ws, 2, 2);

    // Income section — start at row 3 (row 1 is title, row 2 is spacer)
    r = 3;
    r = this.section(ws, r, 'INCOME', C.pos);
    r = this.section(ws, r, 'By member', C.posLight);
    const incomeByMember = data.income.byMember;
    const incomeTotal = data.income.total;
    headerCell(ws, r, 1, 'Member', C.posLight);
    headerCell(ws, r, 2, 'Amount', C.posLight);
    headerCell(ws, r, 3, '% share', C.posLight);
    r++;
    for (const m of incomeByMember) {
      labelCell(ws, r, 1, m.name);
      valueCell(ws, r, 2, m.total, { color: C.pos });
      valueCell(ws, r, 3, incomeTotal > 0 ? (m.total / incomeTotal) * 100 : 0, { format: '0.0%' });
      r++;
    }
    labelCell(ws, r, 1, 'Total income', { bold: true });
    valueCell(ws, r, 2, incomeTotal, { bold: true, color: C.pos, bg: C.posLight });
    valueCell(ws, r, 3, 100, { bold: true, format: '0.0%', bg: C.posLight });
    r += 2;

    if (data.income.byType.length > 0) {
      r = this.section(ws, r, 'By type', C.posLight);
      headerCell(ws, r, 1, 'Type', C.posLight);
      headerCell(ws, r, 2, 'Amount', C.posLight);
      headerCell(ws, r, 3, '% share', C.posLight);
      r++;
      for (const t of data.income.byType) {
        labelCell(ws, r, 1, t.type);
        valueCell(ws, r, 2, t.total, { color: C.pos });
        valueCell(ws, r, 3, incomeTotal > 0 ? (t.total / incomeTotal) * 100 : 0, { format: '0.0%' });
        r++;
      }
      r += 2;
    }

    // Expense section
    r = this.section(ws, r, 'EXPENSES', C.neg);
    r = this.section(ws, r, 'By member', C.negLight);
    const expByMember = data.expense.byMember;
    const expTotal = data.expense.total;
    headerCell(ws, r, 1, 'Member', C.negLight);
    headerCell(ws, r, 2, 'Amount', C.negLight);
    headerCell(ws, r, 3, '% share', C.negLight);
    r++;
    for (const m of expByMember) {
      labelCell(ws, r, 1, m.name);
      valueCell(ws, r, 2, m.total, { color: C.neg });
      valueCell(ws, r, 3, expTotal > 0 ? (m.total / expTotal) * 100 : 0, { format: '0.0%' });
      r++;
    }
    labelCell(ws, r, 1, 'Total expenses', { bold: true });
    valueCell(ws, r, 2, expTotal, { bold: true, color: C.neg, bg: C.negLight });
    valueCell(ws, r, 3, 100, { bold: true, format: '0.0%', bg: C.negLight });
  }

  /* ─── Breakdown: categories & recurring ─── */
  private breakdownSheet(wb: ExcelJS.Workbook, data: ReportData) {
    const ws = wb.addWorksheet('Spending Analysis', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 36 }, { width: 18 }, { width: 12 }, { width: 36 }, { width: 18 }, { width: 12 }];

    let r = 1;
    ws.mergeCells(1, 1, 1, 6);
    const t = ws.getCell(1, 1);
    t.value = 'Spending Analysis';
    t.font = { size: 16, bold: true, color: { argb: C.dark } };
    t.alignment = { horizontal: 'center' };
    spacer(ws, 2, 2);

    // By category — start at row 3 (row 1 is title, row 2 is spacer)
    r = 3;
    r = this.section(ws, r, 'EXPENSE BY CATEGORY', C.neg);
    const cats = data.expense.byCategory;
    const total = data.expense.total;
    headerCell(ws, r, 1, 'Category', C.negLight);
    headerCell(ws, r, 2, 'Amount', C.negLight);
    headerCell(ws, r, 3, '% of spend', C.negLight);
    r++;
    for (const cat of cats) {
      labelCell(ws, r, 1, cat.name);
      valueCell(ws, r, 2, cat.total, { color: C.neg });
      valueCell(ws, r, 3, total > 0 ? (cat.total / total) * 100 : 0, { format: '0.0%' });
      r++;
    }
    r += 2;

    // Recurring
    if (data.expense.byRecurring.length > 0) {
      r = this.section(ws, r, 'RECURRING EXPENSES', C.accent);
      headerCell(ws, r, 1, 'Name', C.accentLight);
      headerCell(ws, r, 2, 'Amount', C.accentLight);
      headerCell(ws, r, 3, '% of spend', C.accentLight);
      r++;
      for (const rec of data.expense.byRecurring) {
        labelCell(ws, r, 1, rec.name);
        valueCell(ws, r, 2, rec.total, { color: C.accent });
        valueCell(ws, r, 3, total > 0 ? (rec.total / total) * 100 : 0, { format: '0.0%' });
        r++;
      }
    }
  }

  /* ─── Daily spending ─── */
  private dailySheet(wb: ExcelJS.Workbook, data: ReportData) {
    const ws = wb.addWorksheet('Daily Spending', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 14 }, { width: 16 }, { width: 30 }];

    let r = 1;
    ws.mergeCells(1, 1, 1, 3);
    const t = ws.getCell(1, 1);
    t.value = 'Daily Spending Pattern';
    t.font = { size: 16, bold: true, color: { argb: C.dark } };
    t.alignment = { horizontal: 'center' };
    spacer(ws, 2, 2);

    headerCell(ws, r, 1, 'Date', C.accentLight);
    headerCell(ws, r, 2, 'Total spent', C.accentLight);
    headerCell(ws, r, 3, 'Visual', C.accentLight);
    r++;

    const max = Math.max(...data.expense.dailyTotals.map((d) => d.total), 1);
    for (const d of data.expense.dailyTotals) {
      labelCell(ws, r, 1, d.date);
      valueCell(ws, r, 2, d.total, { color: C.neg });
      // Visual bar
      const bar = ws.getCell(r, 3);
      const pct = (d.total / max) * 100;
      bar.value = `${'█'.repeat(Math.max(1, Math.round(pct / 5)))}  ${pct.toFixed(0)}%`;
      bar.font = { size: 9, color: { argb: pct > 80 ? C.neg : pct > 40 ? C.amber : C.pos } };
      bar.alignment = { horizontal: 'left' };
      r++;
    }
    r += 1;
    labelCell(ws, r, 1, 'Period total', { bold: true });
    valueCell(ws, r, 2, data.expense.total, { bold: true, color: C.neg, bg: C.negLight });
  }

  private section(ws: ExcelJS.Worksheet, r: number, label: string, bg: string): number {
    ws.mergeCells(r, 1, r, 3);
    const cell = ws.getCell(r, 1);
    cell.value = label;
    cell.font = { bold: true, size: 12, color: { argb: C.dark } };
    cell.fill = fill(bg);
    cell.border = thickBorder();
    ws.getRow(r).height = 20;
    return r + 1;
  }
}
