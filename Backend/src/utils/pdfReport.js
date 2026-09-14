const PDFDocument = require('pdfkit');

const COLORS = {
  primary: '#1a73e8',
  primaryDark: '#174ea6',
  dark: '#202124',
  gray: '#5f6368',
  lightGray: '#f1f3f4',
  border: '#dadce0',
  white: '#ffffff',
  green: '#1e8e3e',
  red: '#d93025'
};

const PAGE_MARGIN = 40;
const HEADER_BAND_HEIGHT = 92;
const ROW_PADDING_X = 8;
const ROW_PADDING_Y = 7;
const HEADER_ROW_HEIGHT = 26;

/**
 * Renders the branded band at the top of the first page: WasteZero wordmark,
 * report title/subtitle, and a "generated on ... by ..." line.
 */
const drawBrandHeader = (doc, { title, subtitle, generatedBy }, pageWidth) => {
  const top = doc.page.margins.top;
  const left = doc.page.margins.left;

  doc.rect(left, top, pageWidth, HEADER_BAND_HEIGHT).fill(COLORS.primary);

  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text('WasteZero', left + 16, top + 14);

  const generatedLine = `Generated ${new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })}${generatedBy ? ` by ${generatedBy}` : ''}`;

  doc
    .fillColor(COLORS.white)
    .font('Helvetica')
    .fontSize(8)
    .text(generatedLine, left, top + 18, { width: pageWidth - 16, align: 'right' });

  doc
    .fillColor('#d2e3fc')
    .font('Helvetica')
    .fontSize(9)
    .text('Smart Waste Pickup & Recycling Platform', left + 16, top + 34);

  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(title, left + 16, top + 54);

  if (subtitle) {
    doc
      .fillColor('#d2e3fc')
      .font('Helvetica')
      .fontSize(9)
      .text(subtitle, left + 16, top + 74, { width: pageWidth - 32 });
  }

  return top + HEADER_BAND_HEIGHT + 20;
};

/** Draws the shaded column-header row of the table at the given Y. */
const drawTableHeaderRow = (doc, columns, colWidths, left, y) => {
  doc.rect(left, y, colWidths.reduce((a, b) => a + b, 0), HEADER_ROW_HEIGHT).fill(COLORS.dark);

  let x = left;
  columns.forEach((col, i) => {
    doc
      .fillColor(COLORS.white)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(col.label.toUpperCase(), x + ROW_PADDING_X, y + 8, {
        width: colWidths[i] - ROW_PADDING_X * 2,
        align: col.align || 'left'
      });
    x += colWidths[i];
  });

  return y + HEADER_ROW_HEIGHT;
};

/**
 * Renders a summary strip of key/value stat "chips" above the table
 * (used for a quick at-a-glance count on each report).
 */
const drawSummaryChips = (doc, chips, left, y, pageWidth) => {
  if (!chips || chips.length === 0) return y;

  const chipWidth = pageWidth / chips.length;
  chips.forEach((chip, i) => {
    const x = left + i * chipWidth;
    doc.roundedRect(x, y, chipWidth - 10, 44, 4).fillAndStroke(COLORS.lightGray, COLORS.border);
    doc
      .fillColor(COLORS.gray)
      .font('Helvetica')
      .fontSize(8)
      .text(chip.label.toUpperCase(), x + 10, y + 8, { width: chipWidth - 30 });
    doc
      .fillColor(COLORS.dark)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(String(chip.value), x + 10, y + 20, { width: chipWidth - 30 });
  });

  return y + 44 + 20;
};

/**
 * Builds a landscape A4 PDF report with a branded header, optional summary
 * chips, and a paginated, word-wrapped, zebra-striped data table.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.subtitle]
 * @param {string} [opts.generatedBy]
 * @param {Array<{label: string, key: string, weight: number, align?: string}>} opts.columns
 *   `weight` values are relative (e.g. 2 is twice as wide as 1); they don't need to sum to 100.
 * @param {Array<Record<string, string>>} opts.rows - pre-stringified cell values keyed by column.key
 * @param {Array<{label: string, value: string|number}>} [opts.chips] - summary stat chips
 * @returns {import('pdfkit')} the PDFDocument (a readable stream) - caller should `.pipe()` it and call `.end()`
 */
const buildReportPdf = ({ title, subtitle, generatedBy, columns, rows, chips }) => {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: PAGE_MARGIN,
    bufferPages: true
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const left = doc.page.margins.left;

  const totalWeight = columns.reduce((sum, c) => sum + c.weight, 0);
  const colWidths = columns.map((c) => (c.weight / totalWeight) * pageWidth);

  let y = drawBrandHeader(doc, { title, subtitle, generatedBy }, pageWidth);
  y = drawSummaryChips(doc, chips, left, y, pageWidth);
  y = drawTableHeaderRow(doc, columns, colWidths, left, y);

  const addNewPage = () => {
    doc.addPage();
    let newY = doc.page.margins.top;
    doc
      .fillColor(COLORS.gray)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(title, left, newY, { width: pageWidth, align: 'left' });
    newY += 20;
    newY = drawTableHeaderRow(doc, columns, colWidths, left, newY);
    return newY;
  };

  rows.forEach((row, rowIndex) => {
    // Measure the tallest cell in this row to know the row's height.
    const cellHeights = columns.map((col, i) =>
      doc.font('Helvetica').fontSize(8.5).heightOfString(String(row[col.key] ?? ''), {
        width: colWidths[i] - ROW_PADDING_X * 2
      })
    );
    const rowHeight = Math.max(...cellHeights) + ROW_PADDING_Y * 2;

    if (y + rowHeight > pageBottom) {
      y = addNewPage();
    }

    if (rowIndex % 2 === 1) {
      doc.rect(left, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(COLORS.lightGray);
    }

    let x = left;
    columns.forEach((col, i) => {
      doc
        .fillColor(COLORS.dark)
        .font('Helvetica')
        .fontSize(8.5)
        .text(String(row[col.key] ?? ''), x + ROW_PADDING_X, y + ROW_PADDING_Y, {
          width: colWidths[i] - ROW_PADDING_X * 2,
          align: col.align || 'left'
        });
      x += colWidths[i];
    });

    doc
      .moveTo(left, y + rowHeight)
      .lineTo(left + pageWidth, y + rowHeight)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();

    y += rowHeight;
  });

  if (rows.length === 0) {
    doc
      .fillColor(COLORS.gray)
      .font('Helvetica')
      .fontSize(10)
      .text('No records found for this report.', left, y + 20, { width: pageWidth, align: 'center' });
  }

  // Footer: page numbers + brand tag on every page. We temporarily zero out
  // the bottom margin while drawing this - PDFKit's flowing text mode treats
  // any text below (page.height - margins.bottom) as overflow and silently
  // starts a brand-new page to hold it, which would otherwise leave a blank
  // trailing page after every footer we draw.
  const pageRange = doc.bufferedPageRange();
  const originalBottomMargin = doc.page.margins.bottom;
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc
      .fillColor(COLORS.gray)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `WasteZero  \u00b7  Page ${i - pageRange.start + 1} of ${pageRange.count}`,
        left,
        doc.page.height - originalBottomMargin + 10,
        { width: pageWidth, align: 'center' }
      );
    doc.page.margins.bottom = originalBottomMargin;
  }

  return doc;
};

module.exports = { buildReportPdf, COLORS };
