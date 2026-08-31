/* ================= KPI board -> .xlsx, in the browser =================
 *
 * A CSV carries the numbers and nothing else. What a consultant actually hands
 * over is a workbook where each indicator has its own sheet, with the table AND
 * the chart that reads it - so the chart is a real Excel chart, bound to the
 * cells beside it, editable and recolourable once it lands in a deck.
 *
 * Everything is written by hand: a minimal SpreadsheetML package (workbook,
 * sheets, a drawing and a chart part per panel) zipped with the same writer the
 * deck generator uses. Entries are STORED, not deflated, which keeps the whole
 * export synchronous - an async export loses the user gesture and iOS Safari
 * then refuses the download.
 */
"use strict";

const XL_NS = {
  ct:  "http://schemas.openxmlformats.org/package/2006/content-types",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  or:  "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  ss:  "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  c:   "http://schemas.openxmlformats.org/drawingml/2006/chart",
  a:   "http://schemas.openxmlformats.org/drawingml/2006/main",
  xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
};

const xlEsc = s => String(s == null ? "" : s)
  .replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]))
  /* Control characters are illegal in XML 1.0 and make Excel refuse the file. */
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function xlCol(n){            /* 1 -> A, 27 -> AA */
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
  return s;
}

/* Excel rejects []:*?/\ in a sheet name, caps it at 31 characters, and refuses
   two sheets with the same name - so names are sanitised and de-duplicated. */
function xlSheetName(label, taken){
  let base = String(label || "Sheet").replace(/[\[\]:*?\/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let name = base, n = 2;
  while (taken.has(name.toLowerCase())) {
    const suffix = " (" + n++ + ")";
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(name.toLowerCase());
  return name;
}

function xlSheetXml(rows, widths, drawingRel){
  const body = rows.map((row, ri) => {
    const cells = row.map((v, ci) => {
      const ref = xlCol(ci + 1) + (ri + 1);
      const style = ri === 0 ? ' s="1"' : "";
      if (v === null || v === undefined || v === "") return `<c r="${ref}"${style}/>`;
      if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xlEsc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  const cols = widths && widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const pane = rows.length > 1
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${XL_NS.ss}" xmlns:r="${XL_NS.or}"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>${cols}<sheetData>${body}</sheetData>${
    drawingRel ? `<drawing r:id="${drawingRel}"/>` : ""}</worksheet>`;
}

/* One bar chart per panel. Categories run down column A, each series occupies
   one column; a single-series chart is a plain ranked bar, several series are
   stacked, which is exactly what the board shows on screen. */
function xlChartXml(spec){
  if (spec.type === "pie") return xlPieXml(spec);
  const CAT_AX = 111111111, VAL_AX = 222222222;
  const n = spec.categories.length;
  const sheet = "'" + spec.sheet.replace(/'/g, "''") + "'";
  const catRef = `${sheet}!$A$2:$A$${n + 1}`;

  const series = spec.series.map((se, i) => {
    const col = xlCol(i + 2);
    const cache = se.values.map((v, j) =>
      (v === null || v === undefined || v === "") ? "" : `<c:pt idx="${j}"><c:v>${v}</c:v></c:pt>`).join("");
    const catCache = spec.categories.map((v, j) => `<c:pt idx="${j}"><c:v>${xlEsc(v)}</c:v></c:pt>`).join("");
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>`
      + `<c:tx><c:strRef><c:f>${sheet}!$${col}$1</c:f><c:strCache><c:ptCount val="1"/>`
      + `<c:pt idx="0"><c:v>${xlEsc(se.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`
      + `<c:spPr><a:solidFill><a:srgbClr val="${se.colour.replace("#", "").toUpperCase()}"/></a:solidFill>`
      + `<a:ln><a:noFill/></a:ln></c:spPr>`
      + `<c:invertIfNegative val="0"/>`
      + `<c:cat><c:strRef><c:f>${catRef}</c:f><c:strCache><c:ptCount val="${n}"/>${catCache}</c:strCache></c:strRef></c:cat>`
      + `<c:val><c:numRef><c:f>${sheet}!$${col}$2:$${col}$${n + 1}</c:f>`
      + `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${cache}</c:numCache></c:numRef></c:val>`
      + `</c:ser>`;
  }).join("");

  const multi = spec.series.length > 1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${XL_NS.c}" xmlns:a="${XL_NS.a}" xmlns:r="${XL_NS.or}"><c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr>
<a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${xlEsc(spec.title)}</a:t></a:r></a:p></c:rich></c:tx>
<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="bar"/><c:grouping val="${multi ? "stacked" : "clustered"}"/><c:varyColors val="0"/>
${series}
<c:gapWidth val="${multi ? 60 : 40}"/><c:overlap val="${multi ? 100 : -27}"/>
<c:axId val="${CAT_AX}"/><c:axId val="${VAL_AX}"/></c:barChart>
<c:catAx><c:axId val="${CAT_AX}"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:delete val="0"/>
<c:axPos val="l"/><c:crossAx val="${VAL_AX}"/></c:catAx>
<c:valAx><c:axId val="${VAL_AX}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>
<c:axPos val="b"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/>
<c:crossAx val="${CAT_AX}"/></c:valAx></c:plotArea>
${multi ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : ""}
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}


/* A donut on screen becomes a pie in Excel - the one chart Excel draws that
   matches it. Each slice carries its own colour through <c:dPt>, so the export
   keeps the palette instead of falling back to Excel's default theme. */
function xlPieXml(spec){
  const n = spec.categories.length;
  const sheet = "'" + spec.sheet.replace(/'/g, "''") + "'";
  const se = spec.series[0];
  const cats = spec.categories.map((v, j) => `<c:pt idx="${j}"><c:v>${xlEsc(v)}</c:v></c:pt>`).join("");
  const vals = se.values.map((v, j) => `<c:pt idx="${j}"><c:v>${v}</c:v></c:pt>`).join("");
  const points = spec.categories.map((v, j) =>
    `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${
      (se.colours[j] || se.colour).replace("#", "").toUpperCase()}"/></a:solidFill>`
    + `<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${XL_NS.c}" xmlns:a="${XL_NS.a}" xmlns:r="${XL_NS.or}"><c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr>
<a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${xlEsc(spec.title)}</a:t></a:r></a:p></c:rich></c:tx>
<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:pieChart><c:varyColors val="1"/>
<c:ser><c:idx val="0"/><c:order val="0"/>
<c:tx><c:strRef><c:f>${sheet}!$B$1</c:f><c:strCache><c:ptCount val="1"/>
<c:pt idx="0"><c:v>${xlEsc(se.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>
${points}
<c:cat><c:strRef><c:f>${sheet}!$A$2:$A$${n + 1}</c:f><c:strCache><c:ptCount val="${n}"/>${cats}</c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:f>${sheet}!$B$2:$B$${n + 1}</c:f>
<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vals}</c:numCache></c:numRef></c:val>
</c:ser><c:firstSliceAng val="0"/></c:pieChart></c:plotArea>
<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

/* The chart sits to the right of the table and grows with the number of rows,
   so a 29-country ranked bar is not squeezed into the same box as a 4-row one. */
function xlDrawingXml(rows, cols){
  const bottom = Math.max(18, Math.min(60, rows + 2));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="${XL_NS.xdr}" xmlns:a="${XL_NS.a}"><xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${cols + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${cols + 12}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${bottom}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="${XL_NS.c}"><c:chart xmlns:c="${XL_NS.c}" xmlns:r="${XL_NS.or}" r:id="rId1"/></a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
}

/* Build the package. `sheets` is [{name, rows, widths, chart}] where `chart` is
   the spec above or null for a plain data sheet. */
function xlsxBlob(sheets){
  const enc = new TextEncoder();
  const files = [];
  const put = (name, xml) => files.push({ name, bytes: enc.encode(xml) });

  put("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${XL_NS.rel}"><Relationship Id="rId1" Type="${XL_NS.or}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);

  put("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${XL_NS.ss}" xmlns:r="${XL_NS.or}"><sheets>${
    sheets.map((s, i) => `<sheet name="${xlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
  }</sheets></workbook>`);

  put("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${XL_NS.rel}">${
    sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${XL_NS.or}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
  }<Relationship Id="rId${sheets.length + 1}" Type="${XL_NS.or}/styles" Target="styles.xml"/></Relationships>`);

  /* Two formats only: body text, and a bold header row. */
  put("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${XL_NS.ss}">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);

  const overrides = [];
  sheets.forEach((s, i) => {
    const n = i + 1;
    const hasChart = !!s.chart;
    put(`xl/worksheets/sheet${n}.xml`, xlSheetXml(s.rows, s.widths, hasChart ? "rId1" : null));
    overrides.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    if (!hasChart) return;
    put(`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${XL_NS.rel}"><Relationship Id="rId1" Type="${XL_NS.or}/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`);
    put(`xl/drawings/drawing${n}.xml`, xlDrawingXml(s.rows.length, s.rows[0] ? s.rows[0].length : 2));
    put(`xl/drawings/_rels/drawing${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${XL_NS.rel}"><Relationship Id="rId1" Type="${XL_NS.or}/chart" Target="../charts/chart${n}.xml"/></Relationships>`);
    put(`xl/charts/chart${n}.xml`, xlChartXml(s.chart));
    overrides.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    overrides.push(`<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
  });

  put("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${XL_NS.ct}">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${overrides.join("\n")}</Types>`);

  /* [Content_Types].xml has to be the first entry in the archive. */
  files.sort((a, b) => (a.name === "[Content_Types].xml" ? -1 : b.name === "[Content_Types].xml" ? 1 : 0));

  return writeZip(files.map(f => ({
    name: f.name, flags: 0, method: 0, time: 0,
    crc: crc32(f.bytes), rawSize: f.bytes.length, data: f.bytes
  })), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
