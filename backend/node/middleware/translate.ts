import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';

const translationCache = new Map<string, string>();

/**
 * Traverse JSON object and collect strings for translation.
 * Mutates the obj by marking places to be translated.
 */
function extractStrings(obj: any, stringsToTranslate: Set<string>) {
  if (!obj || typeof obj !== 'object') return;
  
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      // Skip empty, very short strings, UUIDs, ISO dates, and PURE numbers
      if (
        trimmed.length > 1 &&
        isNaN(Number(trimmed)) && // skip pure numbers
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) && // skip UUIDs
        !/^\d{4}-\d{2}-\d{2}/.test(trimmed) // skip dates
      ) {
        stringsToTranslate.add(trimmed);
      }
    } else if (typeof val === 'object') {
      extractStrings(val, stringsToTranslate);
    }
  }
}

/**
 * Apply translated strings back to the JSON object.
 */
function applyTranslations(obj: any, translations: Map<string, string>) {
  if (!obj || typeof obj !== 'object') return;
  
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (translations.has(trimmed)) {
        obj[key] = translations.get(trimmed) || val;
      }
    } else if (typeof val === 'object') {
      applyTranslations(val, translations);
    }
  }
}

/**
 * Calls the Python translation endpoint to translate an array of strings.
 */
async function translateBatch(strings: string[], targetLang: string = 'kn'): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (strings.length === 0) return result;
  
  const pythonUrl = process.env.PYTHON_BACKEND_URL
      ? process.env.PYTHON_BACKEND_URL.replace(/\/$/, '') + '/translate'
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/internal-python/translate`
      : 'http://127.0.0.1:8000/translate';
      
  try {
    // Instead of sending the whole batch (which python endpoint doesn't support bulk yet), 
    // we join with a delimiter, translate, and split back.
    // Given the Python endpoint only takes `text` string, we join with " ||| ".
    const delimiter = " ||| ";
    const combinedText = strings.join(delimiter);
    
    const res = await fetch(pythonUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: combinedText, target_language: targetLang })
    });
    
    if (res.ok) {
      const data = await res.json();
      const translatedText = data.translated_text || '';
      const translatedArray = translatedText.split(delimiter);
      
      // Match them back
      strings.forEach((str, i) => {
        if (translatedArray[i]) {
          result.set(str, translatedArray[i].trim());
          translationCache.set(str, translatedArray[i].trim()); // Cache it globally
        }
      });
    } else {
      console.error('Translation batch failed:', await res.text());
    }
  } catch (error) {
    console.error('Error translating batch:', error);
  }
  return result;
}

/**
 * Middleware that intercepts JSON responses and translates strings if Accept-Language is kn.
 */
export const translateResponse = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const acceptLang = req.headers['accept-language'];
  
  // If not requesting Kannada, bypass entirely
  if (!acceptLang || !acceptLang.includes('kn')) {
    return next();
  }

  // Intercept res.json
  const originalJson = res.json;
  
  res.json = function (this: any, body: any) {
    if (res.locals.translated) {
      return originalJson.call(this, body);
    }
    res.locals.translated = true;
    
    (async () => {
      try {
        const stringsToTranslate = new Set<string>();
        extractStrings(body, stringsToTranslate);
        
        const neededTranslations = new Map<string, string>();
        const stringsToFetch: string[] = [];
        
        // Check cache first
        for (const str of stringsToTranslate) {
          if (translationCache.has(str)) {
            neededTranslations.set(str, translationCache.get(str)!);
          } else {
            stringsToFetch.push(str);
          }
        }
        
        // Fetch remaining
        if (stringsToFetch.length > 0) {
          // Chunk to avoid huge payload limit
          const chunkSize = 20;
          for (let i = 0; i < stringsToFetch.length; i += chunkSize) {
            const chunk = stringsToFetch.slice(i, i + chunkSize);
            const fetched = await translateBatch(chunk, 'kn');
            for (const [k, v] of fetched.entries()) {
              neededTranslations.set(k, v);
            }
          }
        }
        
        applyTranslations(body, neededTranslations);
        
        return originalJson.call(this, body);
      } catch (err) {
        console.error('Translation interceptor error:', err);
        return originalJson.call(this, body);
      }
    })();
    
    return this;
  } as any;
  
  next();
};
