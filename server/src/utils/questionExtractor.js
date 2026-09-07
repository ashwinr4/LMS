/**
 * Universal Question & Answer Extraction Engine
 * 
 * Capable of extracting multiple choice questions, options (A, B, C, D),
 * correct answer keys, and explanations from:
 * - AI-Generated Markdown (ChatGPT, Claude, DeepSeek formats)
 * - Hand-typed human documents (inconsistent delimiters like Q1:, 1., 1))
 * - Web-downloaded exam papers (inline answers or consolidated end-of-document keys)
 */

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { sanitizeQuestionText } from './documentScanner.js';

/**
 * Extract raw text from buffer based on file extension
 */
export async function extractRawTextFromBuffer(buffer, filename) {
  const ext = (filename || '').toLowerCase();

  if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (ext.endsWith('.pdf')) {
    try {
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      await parser.destroy?.();
      return textResult?.text || '';
    } catch (pdfErr) {
      const rawFallback = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      if (rawFallback && rawFallback.length > 50) {
        return rawFallback;
      }
      throw new Error(`Failed to extract text from PDF: ${pdfErr.message}`);
    }
  }

  // Fallback plain text / markdown
  return buffer.toString('utf-8');
}

/**
 * Universal Parser that turns raw document text into structured questions
 */
export function parseQuestionsFromText(rawText) {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  // 1. Normalize line breaks and clean whitespace
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-');

  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  // 2. Check for End-of-Document Answer Key matrix
  // e.g. "ANSWER KEY: 1-A, 2-C, 3-B" or "Answers: 1. B, 2. A"
  const endKeyMap = extractEndOfDocumentAnswerKey(normalized);

  const parsedQuestions = [];
  let currentQ = null;

  // Regex patterns
  const qHeaderRegex = /^(?:(?:\*\*|\#\#\#|\#\#)?\s*(?:(?:Q(?:uestion)?\.?|Prob(?:lem)?\.?)\s*\d+|\d+)\s*[\.\:\-\)]\s*|\bq\d+[\.\:\)]\s*)(.+)/i;
  const optionRegex = /^(?:(?:\*\*|\*|\-)?\s*\(?([A-Da-d\d])\)?\s*[\.\:\-\)]\s*)(.+)/i;
  const inlineAnswerRegex = /^(?:(?:\*\*|\#\#)?\s*(?:Correct\s+Answer|Answer\s+Key|Answer|Ans|Key)\s*[:\-]?\s*(?:\*\*)?\s*\(?([A-Da-d\d])\)?\s*(?:\*\*)?)(.*)/i;
  const explanationRegex = /^(?:(?:\*\*|\#\#)?\s*(?:Explanation|Rationale|Note)\s*[:\-]?\s*(?:\*\*)?)(.*)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Question Header
    const qMatch = line.match(qHeaderRegex);
    if (qMatch) {
      if (currentQ && currentQ.options.length >= 2) {
        parsedQuestions.push(finalizeQuestion(currentQ, parsedQuestions.length + 1, endKeyMap));
      }

      currentQ = {
        questionText: cleanMarkdownFormatting(qMatch[1] || line),
        options: [],
        correctOption: 0,
        explanation: '',
      };
      continue;
    }

    if (!currentQ) continue;

    // Check Option (A, B, C, D)
    const optMatch = line.match(optionRegex);
    if (optMatch && optMatch[1] && currentQ.options.length < 6) {
      const optText = cleanMarkdownFormatting(optMatch[2] || '');
      currentQ.options.push(sanitizeQuestionText(optText));
      continue;
    }

    // Check Inline Answer
    const ansMatch = line.match(inlineAnswerRegex);
    if (ansMatch && ansMatch[1]) {
      const char = ansMatch[1].toUpperCase();
      const letterIndex = char.charCodeAt(0) - 65; // A -> 0, B -> 1, C -> 2, D -> 3
      if (letterIndex >= 0 && letterIndex < 6) {
        currentQ.correctOption = letterIndex;
      }
      if (ansMatch[2]) {
        currentQ.explanation = cleanMarkdownFormatting(ansMatch[2]);
      }
      continue;
    }

    // Check Explanation
    const expMatch = line.match(explanationRegex);
    if (expMatch) {
      currentQ.explanation = cleanMarkdownFormatting(expMatch[1] || '');
      continue;
    }

    // Multiline continuation
    if (currentQ.options.length === 0) {
      currentQ.questionText += ' ' + cleanMarkdownFormatting(line);
    } else if (currentQ.options.length > 0 && !currentQ.explanation) {
      const lastIdx = currentQ.options.length - 1;
      currentQ.options[lastIdx] += ' ' + cleanMarkdownFormatting(line);
    }
  }

  // Push last question
  if (currentQ && currentQ.options.length >= 2) {
    parsedQuestions.push(finalizeQuestion(currentQ, parsedQuestions.length + 1, endKeyMap));
  }

  return parsedQuestions;
}

/**
 * Correlate question with detected answer key and default fallback
 */
function finalizeQuestion(q, questionIndex, endKeyMap) {
  // If no inline answer was found, check end-of-document answer key
  if (q.correctOption === 0 && endKeyMap[questionIndex] !== undefined) {
    q.correctOption = endKeyMap[questionIndex];
  }

  // Ensure options are sanitized and distinct
  const sanitizedOptions = q.options.map((opt) => sanitizeQuestionText(opt)).filter(Boolean);

  return {
    id: `q_${questionIndex}_${Date.now().toString(36)}`,
    questionText: sanitizeQuestionText(q.questionText),
    options: sanitizedOptions.length >= 2 ? sanitizedOptions : ['Option A', 'Option B', 'Option C', 'Option D'],
    correctOption: Math.min(Math.max(0, q.correctOption), (sanitizedOptions.length || 4) - 1),
    explanation: sanitizeQuestionText(q.explanation || ''),
  };
}

/**
 * Extract End-of-Document Answer Key (e.g. "1. B, 2. A, 3. C")
 */
function extractEndOfDocumentAnswerKey(text) {
  const map = {};
  const endKeySection = text.match(/(?:ANSWER\s+KEY|ANSWERS|CORRECT\s+OPTIONS)[\s\S]+/i);
  if (!endKeySection) return map;

  const keyText = endKeySection[0];
  const pairRegex = /(?:(\d+)\s*[\.\:\-\)]\s*\(?([A-Fa-f])\)?|\b(\d+)\s*-\s*([A-Fa-f]))/g;
  let match;
  while ((match = pairRegex.exec(keyText)) !== null) {
    const qNum = parseInt(match[1] || match[3], 10);
    const letter = (match[2] || match[4]).toUpperCase();
    const idx = letter.charCodeAt(0) - 65;
    if (qNum && idx >= 0 && idx < 6) {
      map[qNum] = idx;
    }
  }

  return map;
}

/**
 * Remove common AI markdown artifacts like **bold**, `code`, etc.
 */
function cleanMarkdownFormatting(str) {
  if (!str) return '';
  return str
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\_\_(.*?)\_\_/g, '$1')
    .replace(/\`(.*?)\`/g, '$1')
    .trim();
}
