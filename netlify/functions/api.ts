// Netlify Function: Express uygulamasini serverless olarak sarmalar.
// netlify.toml icindeki yonlendirme sayesinde /api/* istekleri buraya gelir.
//
// ONEMLI SINIR: Netlify'da senkron fonksiyonlarin suresi varsayilan 10 saniye,
// Pro planda talep uzerine en fazla 26 saniyedir. Uzun videolarda
// /api/extract-transcript bu sureyi asar. Once /api/check-captions ucuyla
// altyazi cekiminin calisip calismadigini test edin.

import serverless from 'serverless-http';
import { app } from '../../server';

const serverlessHandler = serverless(app);

const FUNCTION_PREFIX = '/.netlify/functions/api';

/**
 * Netlify, yonlendirme sonrasi fonksiyona bazen tam yolu
 * (/.netlify/functions/api/...), bazen orijinal yolu (/api/...) gonderir.
 * Express'in rotalarini bulabilmesi icin yolu her iki durumda da
 * /api/... bicimine normalize ediyoruz.
 */
function normalizePath(rawPath: string): string {
  let p = rawPath || '/';

  if (p.startsWith(FUNCTION_PREFIX)) {
    p = p.slice(FUNCTION_PREFIX.length) || '/';
  }

  if (!p.startsWith('/api')) {
    p = '/api' + (p === '/' ? '' : p);
  }

  return p;
}

export const handler = async (event: any, context: any) => {
  const normalizedEvent = { ...event, path: normalizePath(event?.path) };
  return serverlessHandler(normalizedEvent, context);
};
