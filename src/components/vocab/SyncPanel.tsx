import React, { useState, useEffect } from 'react';
import {
  getSyncCode, setSyncCode, getLastSync, runSync, isSyncAvailable, resetSyncState,
} from '../../lib/syncClient';
import { RefreshCw, Cloud, CloudOff, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';

interface Props {
  onSynced?: () => void;
}

/**
 * Cihazlar arası senkron paneli.
 * Giriş ekranı yok; tek bir "senkron kodu" ile çalışıyor. Aynı kodu
 * girdiğiniz her cihaz aynı veriyi görür.
 */
export const SyncPanel: React.FC<Props> = ({ onSynced }) => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [code, setCode] = useState(getSyncCode());
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [lastSync, setLastSyncState] = useState(getLastSync());

  useEffect(() => {
    isSyncAvailable().then(setAvailable);
  }, []);

  const handleSaveCode = () => {
    setSyncCode(code.trim());
    resetSyncState();
    setLastSyncState(null);
    setResult('Kod kaydedildi. Şimdi "Şimdi Senkronize Et" düğmesine basın.');
  };

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await runSync(setProgress);
      setLastSyncState(r.at);
      setResult(
        `Tamamlandı: ${r.pushed} kayıt gönderildi, ${r.pulled} kayıt alındı` +
          (r.audioUp || r.audioDown
            ? `, ${r.audioUp} ses yüklendi, ${r.audioDown} ses indirildi.`
            : '.')
      );
      onSynced?.();
    } catch (err: any) {
      setError(err?.message || 'Senkronizasyon başarısız.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  if (available === false) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center space-x-2">
          <CloudOff className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-900">Senkronizasyon kapalı</h3>
        </div>
        <p className="text-[11px] text-slate-600">
          Cihazlar arası senkron için Netlify'da <code className="bg-slate-200 px-1 rounded">SUPABASE_URL</code> ve{' '}
          <code className="bg-slate-200 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> ortam
          değişkenlerini tanımlamanız gerekiyor.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Cloud className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-900">Cihazlar Arası Senkron</h3>
        </div>
        {lastSync && (
          <span className="text-[10px] text-slate-500">
            Son: {new Date(lastSync).toLocaleString('tr-TR')}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-700 block">Senkron Kodu</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showCode ? 'text' : 'password'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="en az 6 karakter"
              autoComplete="off"
              className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:border-teal-500"
            />
            <button
              type="button"
              onClick={() => setShowCode((v) => !v)}
              className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={handleSaveCode}
            disabled={code.trim().length < 6}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
          >
            Kaydet
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          Bu kodu diğer bilgisayarınıza da girin; aynı kodu kullanan cihazlar aynı verileri
          görür. Kod bir şifre gibidir — tahmin edilmesi zor bir şey seçin ve kimseyle
          paylaşmayın.
        </p>
      </div>

      <button
        type="button"
        onClick={handleSync}
        disabled={busy || getSyncCode().length < 6}
        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition cursor-pointer"
      >
        <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
        <span>{busy ? progress || 'Senkronize ediliyor...' : 'Şimdi Senkronize Et'}</span>
      </button>

      {result && (
        <p className="flex items-start space-x-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5">
          <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{result}</span>
        </p>
      )}

      {error && (
        <p className="flex items-start space-x-1.5 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}

      <p className="text-[10px] text-slate-400">
        Çakışmalarda en son değiştirilen kayıt geçerli olur. Senkron otomatik değil; her
        cihazda çalışmayı bitirince bu düğmeye basın.
      </p>
    </div>
  );
};
