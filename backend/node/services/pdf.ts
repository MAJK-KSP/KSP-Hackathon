/**
 * @file pdf.ts
 * @description Service to generate polished PDF documents for chat histories.
 * Saves PDFs locally in backend/node/storage/pdf_exports/ and returns a readable stream.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Find project root by climbing up until package.json is found
let rootDir = __dirname;
while (!fs.existsSync(path.join(rootDir, 'package.json')) && path.dirname(rootDir) !== rootDir) {
  rootDir = path.dirname(rootDir);
}

const EXPORTS_DIR = path.join(rootDir, 'backend', 'node', 'storage', 'pdf_exports');

export interface MessageData {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface OfficerProfile {
  badge_number?: string;
  rank?: string;
  post?: string;
  jurisdiction?: string;
  area?: string;
  station?: string;
}

/**
 * Ensures the PDF exports directory exists.
 */
function ensureExportsDirectory() {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }
}

/**
 * Cleans simple markdown structures into PDFKit formatting.
 */
function renderPdfTable(doc: PDFKit.PDFDocument, rows: string[][], fontSize = 8) {
  if (rows.length === 0) return;
  const colCount = rows[0].length;
  const tableWidth = 515; // 595 - 2*40 margins
  const colWidth = tableWidth / colCount;
  const startX = 40;
  
  doc.save();
  
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const isHeader = rIdx === 0;
    
    // Calculate row height based on max characters or word wrap.
    let maxCellLines = 1;
    row.forEach(cell => {
      const charCount = cell.length;
      const approxWidth = colWidth - 10;
      const avgCharWidth = fontSize * 0.5;
      const charsPerLine = Math.max(12, Math.floor(approxWidth / avgCharWidth));
      const cellLines = Math.max(1, Math.ceil(charCount / charsPerLine));
      if (cellLines > maxCellLines) {
        maxCellLines = cellLines;
      }
    });
    
    const rowHeight = maxCellLines * (fontSize + 3) + 10;
    
    // Check if row fits on current page. A4 page height is 842. Margin bottom is 40.
    if (doc.y + rowHeight > 780) {
      doc.addPage();
    }
    
    const currentY = doc.y;
    
    // Draw background
    doc.rect(startX, currentY, tableWidth, rowHeight);
    if (isHeader) {
      doc.fillColor('#1e3a8a'); // KSP Navy
      doc.fill();
    } else {
      doc.fillColor(rIdx % 2 === 1 ? '#ffffff' : '#f9fafb'); // Zebra striping
      doc.fill();
    }
    
    // Write cell texts
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const cellText = row[cIdx] || '';
      const cellX = startX + cIdx * colWidth;
      
      doc.fillColor(isHeader ? '#ffffff' : '#374151');
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      
      doc.text(cellText, cellX + 5, currentY + 5, {
        width: colWidth - 10,
        align: 'left',
        lineGap: 1
      });
      
      // Draw vertical divider between columns (except for the last column outline which is covered by the row rect)
      if (cIdx > 0) {
        doc.strokeColor('#d1d5db')
          .lineWidth(0.5)
          .moveTo(cellX, currentY)
          .lineTo(cellX, currentY + rowHeight)
          .stroke();
      }
    }
    
    // Draw borders
    doc.strokeColor('#d1d5db')
      .lineWidth(0.5)
      .rect(startX, currentY, tableWidth, rowHeight)
      .stroke();
      
    doc.y = currentY + rowHeight;
  }
  
  doc.restore();
  doc.moveDown(0.4);
}

function renderFormattedText(doc: PDFKit.PDFDocument, text: string, fontSize = 10) {
  const lines = text.split('\n');
  let tableRows: string[][] = [];
  let inTable = false;

  const flushTable = () => {
    if (tableRows.length > 0) {
      renderPdfTable(doc, tableRows, fontSize - 2);
      tableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      if (trimmed.includes('---')) {
        continue; // Skip separator line
      }
      const cells = trimmed
        .split('|')
        .map(c => c.trim())
        .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      tableRows.push(cells);
      continue;
    }

    // If we were in a table and encounter a non-table line, flush it
    if (inTable) {
      flushTable();
      inTable = false;
    }

    if (trimmed.length === 0) {
      doc.moveDown(0.4);
      continue;
    }

    // Header 1 (# Title)
    if (trimmed.startsWith('# ')) {
      doc.font('Helvetica-Bold')
        .fontSize(fontSize + 4)
        .fillColor('#1e3a8a')
        .text(trimmed.substring(2));
      doc.moveDown(0.3);
      continue;
    }

    // Header 2 (## Title)
    if (trimmed.startsWith('## ')) {
      doc.font('Helvetica-Bold')
        .fontSize(fontSize + 2)
        .fillColor('#1e3a8a')
        .text(trimmed.substring(3));
      doc.moveDown(0.2);
      continue;
    }

    // Header 3 (### Title)
    if (trimmed.startsWith('### ')) {
      doc.font('Helvetica-Bold')
        .fontSize(fontSize + 1)
        .fillColor('#1e3a8a')
        .text(trimmed.substring(4));
      doc.moveDown(0.2);
      continue;
    }

    // Bullet points (- or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const content = trimmed.substring(2);
      doc.font('Helvetica')
        .fontSize(fontSize)
        .fillColor('#374151');
      doc.text('  • ' + content);
      doc.moveDown(0.15);
      continue;
    }

    // Parse simple inline bolding (**text**) within a paragraph
    const parts = line.split('**');
    if (parts.length > 1) {
      doc.font('Helvetica').fontSize(fontSize).fillColor('#374151');
      for (let j = 0; j < parts.length; j++) {
        const isBold = j % 2 === 1;
        const isLast = j === parts.length - 1;
        
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(parts[j], { continued: !isLast });
      }
      doc.moveDown(0.2);
    } else {
      doc.font('Helvetica')
        .fontSize(fontSize)
        .fillColor('#374151')
        .text(line);
      doc.moveDown(0.2);
    }
  }

  // Flush any trailing table
  if (inTable) {
    flushTable();
  }
}

/**
 * Format timestamp standardly for report
 */
function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const timeStr = d.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
    return `${dateStr} ${timeStr} hrs`;
  } catch {
    return isoString;
  }
}

/**
 * Generates the conversation PDF and saves it locally.
 * Returns the file path.
 */
export async function generateConversationPdf(
  conversationId: string,
  title: string,
  messages: MessageData[],
  officerProfile: OfficerProfile | null,
  userEmail: string
): Promise<string> {
  ensureExportsDirectory();
  const filePath = path.join(EXPORTS_DIR, `${conversationId}.pdf`);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // --- BRANDING HEADER ---
      doc.font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#1e3a8a')
        .text('KARNATAKA STATE POLICE', { align: 'center' });
      
      doc.font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#4b5563')
        .text(officerProfile?.station ? officerProfile.station.toUpperCase() : 'KORAMANGALA POLICE STATION', { align: 'center' });
      
      doc.font('Helvetica')
        .fontSize(9)
        .fillColor('#9ca3af')
        .text('INTERNAL AI INTELLIGENCE RECORD — RESTRICTED ACCESS', { align: 'center' });
      
      doc.moveDown(1);
      
      // Divider Line
      doc.strokeColor('#e5e7eb')
        .lineWidth(1)
        .moveTo(40, 100)
        .lineTo(555, 100)
        .stroke();
      
      doc.moveDown(0.5);

      // --- REPORT METADATA BOX ---
      const metadataTop = doc.y;
      doc.rect(40, metadataTop, 515, 80)
        .fillColor('#f9fafb')
        .fillAndStroke('#e5e7eb');
      
      doc.fillColor('#111827');
      
      // Left Column Metadata
      doc.font('Helvetica-Bold').fontSize(9).text('Subject:', 50, metadataTop + 10);
      doc.font('Helvetica').text(title || 'Untitled Query Session', 110, metadataTop + 10);
      
      doc.font('Helvetica-Bold').text('Date Exported:', 50, metadataTop + 25);
      doc.font('Helvetica').text(new Date().toLocaleString(), 120, metadataTop + 25);

      doc.font('Helvetica-Bold').text('Session ID:', 50, metadataTop + 40);
      doc.font('Helvetica').text(conversationId, 110, metadataTop + 40);
      
      doc.font('Helvetica-Bold').text('Officer Account:', 50, metadataTop + 55);
      doc.font('Helvetica').text(userEmail, 130, metadataTop + 55);

      // Right Column Metadata
      doc.font('Helvetica-Bold').text('Badge No:', 350, metadataTop + 10);
      doc.font('Helvetica').text(officerProfile?.badge_number || 'N/A', 410, metadataTop + 10);

      doc.font('Helvetica-Bold').text('Rank/Post:', 350, metadataTop + 25);
      doc.font('Helvetica').text(`${officerProfile?.rank || 'Officer'} / ${officerProfile?.post || 'N/A'}`, 410, metadataTop + 25);

      doc.font('Helvetica-Bold').text('Jurisdiction:', 350, metadataTop + 40);
      doc.font('Helvetica').text(officerProfile?.jurisdiction || 'Koramangala, South Zone', 420, metadataTop + 40);

      doc.font('Helvetica-Bold').text('Classification:', 350, metadataTop + 55);
      doc.font('Helvetica-Bold').fillColor('#b91c1c').text('CONFIDENTIAL', 430, metadataTop + 55);

      doc.fillColor('#111827'); // reset fill
      doc.y = metadataTop + 95; // move past metadata box

      // --- CHAT LOG TRANSCRIPT ---
      doc.font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#1e3a8a')
        .text('TRANSCRIPT LOG');
      doc.moveDown(0.5);

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const isUser = msg.role === 'user';
        const speaker = isUser ? 'OFFICER' : 'KSP AI ASSISTANT';
        const accentColor = isUser ? '#1e3a8a' : '#10b981'; // Blue for User, Green for AI

        // Ensure we don't start a new message block at the very bottom of a page
        if (doc.y > 740) {
          doc.addPage();
        }

        const headerY = doc.y;

        // Draw a subtle horizontal divider above the message (except for the first message)
        if (i > 0) {
          doc.strokeColor('#e5e7eb')
            .lineWidth(0.5)
            .moveTo(40, headerY)
            .lineTo(555, headerY)
            .stroke();
          doc.y = headerY + 12;
        } else {
          doc.y = headerY + 5;
        }

        const currentY = doc.y;

        // Draw speaker tag with accent color
        doc.font('Helvetica-Bold')
          .fontSize(9.5)
          .fillColor(accentColor)
          .text(speaker, 40, currentY);
        
        // Draw timestamp on the right
        doc.font('Helvetica')
          .fontSize(8)
          .fillColor('#6b7280')
          .text(formatTime(msg.created_at), 380, currentY + 1, { align: 'right', width: 175 });

        doc.y = currentY + 15;

        // Render message body text exactly once
        renderFormattedText(doc, msg.content, 9.5);
        
        doc.moveDown(1.5);
      }

      // --- SIGNATURE SECTION ---
      // Push signatures to next page if too close to bottom
      if (doc.y > 680) {
        doc.addPage();
      } else {
        doc.moveDown(2);
      }

      const sigTop = doc.y;
      doc.strokeColor('#e5e7eb')
        .lineWidth(1)
        .moveTo(40, sigTop)
        .lineTo(555, sigTop)
        .stroke();
      
      doc.moveDown(1);
      
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
      doc.text('PREPARED BY:', 60, sigTop + 20);
      doc.font('Helvetica').text('_________________________________', 60, sigTop + 45);
      doc.text(`${officerProfile?.rank || 'Officer'} signature`, 60, sigTop + 55);
      
      doc.font('Helvetica-Bold').text('ENDORSED BY STATION HOUSE OFFICER (SHO):', 320, sigTop + 20);
      doc.font('Helvetica').text('_________________________________', 320, sigTop + 45);
      doc.text('Inspector Signature & Seal', 320, sigTop + 55);

      // --- PAGE NUMBERS & HEADER/FOOTER (RUN ON PAGE BUFFERS) ---
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        
        // Temporarily clear bottom margin to prevent footer text at Y=812 from triggering auto-pagebreak
        const oldBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        
        // Draw top running header (except first page if we want, but since it's a security doc, all pages get it)
        doc.font('Helvetica')
          .fontSize(7)
          .fillColor('#9ca3af')
          .text('CONFIDENTIAL // KSP SECURE AUTHENTICATION SYSTEM', 40, 20);
        
        // Draw bottom footer
        doc.strokeColor('#f3f4f6')
          .lineWidth(0.5)
          .moveTo(40, 805)
          .lineTo(555, 805)
          .stroke();

        doc.font('Helvetica')
          .fontSize(7)
          .fillColor('#9ca3af')
          .text(`System Reference: KSP-AI-${conversationId.substring(0, 8).toUpperCase()}`, 40, 812);

        doc.text(`Page ${i + 1} of ${range.count}`, 480, 812, { align: 'right', width: 75 });

        // Restore bottom margin
        doc.page.margins.bottom = oldBottom;
      }

      doc.end();

      writeStream.on('finish', () => {
        resolve(filePath);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
