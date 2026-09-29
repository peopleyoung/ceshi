const fs = require('fs');
const path = require('path');

const MIN_TEXT_LENGTH = 50;

async function extractTextFromPDF(filePath) {
  const { PDFParse } = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

async function renderPDFPagesAsImages(filePath) {
  const { PDFParse } = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getScreenshot({ scale: 2 });
    return result.pages.map((p) => p.data);
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromDOCX(filePath) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || '';
}

async function extractTextFromDOC(filePath) {
  const buffer = fs.readFileSync(filePath);
  const strings = [];
  const regex = /[\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]{4,}/g;
  const content = buffer.toString('binary');
  let match;
  while ((match = regex.exec(content)) !== null) {
    strings.push(match[0]);
  }
  return strings.join('\n');
}

async function performOCR(imageData) {
  const Tesseract = require('tesseract.js');
  const worker = await Tesseract.createWorker('chi_sim+eng');
  try {
    const { data: { text } } = await worker.recognize(imageData);
    return text || '';
  } finally {
    await worker.terminate();
  }
}

async function extractTextFromPDFWithOCR(filePath) {
  const text = await extractTextFromPDF(filePath);
  if (text.trim().length >= MIN_TEXT_LENGTH) {
    return text;
  }

  console.log(`[TextExtraction] PDF text too short (${text.trim().length} chars), attempting OCR: ${path.basename(filePath)}`);
  const pageImages = await renderPDFPagesAsImages(filePath);
  const texts = [];
  for (let i = 0; i < pageImages.length; i++) {
    console.log(`[TextExtraction] OCR page ${i + 1}/${pageImages.length}`);
    const pageText = await performOCR(pageImages[i]);
    if (pageText.trim()) {
      texts.push(pageText.trim());
    }
  }
  return texts.join('\n\n');
}

async function extractTextFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('文件不存在');
  }

  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.pdf':
      return extractTextFromPDFWithOCR(filePath);
    case '.docx':
      return extractTextFromDOCX(filePath);
    case '.doc':
      return extractTextFromDOC(filePath);
    case '.png':
    case '.jpg':
    case '.jpeg':
      return performOCR(filePath);
    default:
      throw new Error(`不支持的文件格式: ${ext}`);
  }
}

module.exports = { extractTextFromFile };
