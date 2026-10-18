---
name: xlsx
description: Use when creating, reading, or manipulating Excel workbooks programmatically with formulas, charts, and formatting.
---

# Excel Spreadsheets

## When to Use This Skill
- Generating Excel reports with formatted data
- Adding formulas, charts, or conditional formatting
- Reading and processing data from .xlsx files
- Handling large datasets efficiently

## Workflow
1. Install the library: `pip install openpyxl` or `npm install exceljs`
2. Create a workbook: `wb = Workbook()` or `new ExcelJS.Workbook()`
3. Access or create worksheets: `ws = wb.active`
4. Write data: cells, rows, or columns
5. Add formulas: `ws['B2'] = '=SUM(A1:A10)'`
6. Format cells: font, fill, border, alignment, number format
7. Add charts: reference a data range and configure the chart type
8. Save: `wb.save('output.xlsx')`
9. Reopen the saved workbook and verify sheet names, row counts, formula text, and number formats

## Rules
- Don't merge cells for layout — use it only for data that spans multiple columns
- Use number formats for dates, currency, and percentages
- Set column widths for readability — don't leave defaults
- Test with Excel, LibreOffice, and Google Sheets
- Stream large datasets instead of loading everything into memory
- Use freeze panes for headers on large sheets
- Save edits to a new file until preservation of the original workbook's features has been checked
- openpyxl stores formulas but does not calculate them; verify calculated results in the target spreadsheet application
- Preserve identifiers with leading zeros as text
- Inspect existing charts, drawings, macros, and other advanced features before choosing a library; unsupported features can be lost during a round-trip
