import React, { useState, useEffect, useRef } from 'react';
import { buildCard, addCardsIfMissing, CardKind, CardLevel } from '../../lib/vocabStore';
import { Plus, Loader2, Check, X, Layers } from 'lucide-react';

interface Props {
  /** Seçimin dinleneceği alan. */
  containerRef: React.RefObject<HTMLElement | null>;
  lessonId: string;
  lessonTitle: string;
  /** Kart eklendikten sonra üst bileşeni bilgilendirmek için. */
  onAdded?: () => void;
}

interface Draft {
  front: string;
  back: string;
  ipa?: string;
  kind: CardKind;
  level: CardLevel;
  exampleEn?: string;
  exampleTr?: string;
  contextEn?: string;
}

/**
 * Metinde bir kelime/ifade seçildiğinde yanında "Karta Ekle" düğmesi çıkarır.
 * Düğmeye basılınca yapay zeka o ifadeyi BAĞLAMINA göre tanımlar ve kart
 * taslağı açılır; onaylayınca kelime kartlarına eklenir.
 */
export const SelectionToCard: React.FC<Props> = ({
  containerRef,
  lessonId,
  lessonTitle,
  onAdded,
}) => {
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleSelection = () => {
      // Taslak paneli açıkken seçim balonunu güncelleme
      if (draft || isLoading) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelection(null);
        return;
      }

      const text = sel.toString().trim();
      if (!text || text.length > 120) {
        setSelection(null);
        return;
      }

      // Yalnızca ilgili alandaki seçimleri dikkate al
      const container = containerRef.current;
      if (container && sel.anchorNode && !container.contains(sel.anchorNode)) {
        setSelection(null);
        return;
      }

      try {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setSelection({
          text,
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      } catch {
        setSelection(null);
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', handleSelection);
    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('touchend', handleSelection);
    };
  }, [containerRef, draft, isLoading]);

  /** Seçimin geçtiği cümleyi bağlam olarak yakala. */
  const captureContext = (): string => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    const node = sel.anchorNode;
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null);
    return (el?.textContent || '').slice(0, 400);
  };

  const handleLookup = async () => {
    if (!selection) return;
    const term = selection.text;
    const context = captureContext();

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/define-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: term, context }),
      });

      const raw = await res.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error('Sunucu beklenmeyen bir yanıt döndürdü.');
      }
      if (!res.ok) throw new Error(data.error || 'Kelime bilgisi alınamadı.');

      setDraft({
        front: data.front || term,
        back: data.back || '',
        ipa: data.ipa,
        kind: data.kind || 'word',
        level: data.level || 'B2',
        exampleEn: data.exampleEn,
        exampleTr: data.exampleTr,
        contextEn: context,
      });
      setSelection(null);
    } catch (err: any) {
      setError(err?.message || 'Kelime bilgisi alınamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      const card = buildCard({
        lessonId,
        lessonTitle,
        front: draft.front,
        back: draft.back,
        ipa: draft.ipa,
        kind: draft.kind,
        level: draft.level,
        exampleEn: draft.exampleEn,
        exampleTr: draft.exampleTr,
        contextEn: draft.contextEn,
      });
      const added = await addCardsIfMissing([card]);
      setDraft(null);
      setSavedMsg(
        added > 0
          ? `"${card.front}" → ${lessonTitle} dersine eklendi`
          : `"${card.front}" zaten bu derste kayıtlı`
      );
      window.getSelection()?.removeAllRanges();
      onAdded?.();
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Kart eklenemedi.');
    }
  };

  return (
    <>
      {/* Seçim balonu */}
      {selection && !draft && (
        <button
          type="button"
          onClick={handleLookup}
          disabled={isLoading}
          style={{
            position: 'fixed',
            left: Math.max(80, Math.min(window.innerWidth - 80, selection.x)),
            top: Math.max(8, selection.y - 44),
            transform: 'translateX(-50%)',
            zIndex: 60,
          }}
          className="flex items-center space-x-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-lg transition cursor-pointer whitespace-nowrap"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          <span>Karta Ekle</span>
        </button>
      )}

      {/* Taslak paneli */}
      {draft && (
        <div className="fixed inset-0 bg-slate-900/40 z-[70] flex items-center justify-center p-4">
          <div
            ref={panelRef}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-teal-600" />
                <span>Kelime Kartı Ekle</span>
              </h3>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">İfade</label>
              <input
                type="text"
                value={draft.front}
                onChange={(e) => setDraft({ ...draft, front: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">Türkçe karşılık</label>
              <input
                type="text"
                value={draft.back}
                onChange={(e) => setDraft({ ...draft, back: e.target.value })}
                placeholder="Anlamı"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Seviye</label>
                <select
                  value={draft.level}
                  onChange={(e) => setDraft({ ...draft, level: e.target.value as CardLevel })}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {(['A2', 'B1', 'B2', 'C1', 'C2'] as CardLevel[]).map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Tür</label>
                <select
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value as CardKind })}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <option value="word">Kelime</option>
                  <option value="phrasal_verb">Phrasal Verb</option>
                  <option value="collocation">Kalıp</option>
                  <option value="idiom">Deyim</option>
                  <option value="expression">Konuşma Kalıbı</option>
                </select>
              </div>
            </div>

            {draft.exampleEn && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-0.5">
                <p className="text-xs text-slate-900 font-medium">{draft.exampleEn}</p>
                {draft.exampleTr && <p className="text-[11px] text-slate-600">{draft.exampleTr}</p>}
              </div>
            )}

            <p className="text-[10px] text-slate-500">
              Kart <strong>{lessonTitle}</strong> dersine eklenecek. Kelime Kartları
              sekmesinde &quot;Bu Ders&quot; veya &quot;Tüm Kartlar&quot; altında görünür.
            </p>

            {error && (
              <p className="text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={!draft.front.trim() || !draft.back.trim()}
                className="flex-1 flex items-center justify-center space-x-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Kartlarıma Ekle</span>
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kaydedildi bildirimi */}
      {savedMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center space-x-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-lg">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{savedMsg}</span>
        </div>
      )}
    </>
  );
};
