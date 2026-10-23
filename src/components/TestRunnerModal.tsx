import React, { useState, useEffect } from 'react';
import { runAllCoreTests, TestResult } from '../core/tests_suite';
import { CheckCircle2, XCircle, RotateCcw, X, Terminal, Server } from 'lucide-react';
import { toPersianDigits } from '../utils/formatters';

interface TestRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({ isOpen, onClose }) => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [filter, setFilter] = useState<'همه' | 'نردبان (Ladder)' | 'هسته (Kernel)' | 'یکپارچگی (Integration)' | 'تسویه (Settlement)' | 'افزونه‌ها (Extensions)'>('همه');

  const executeTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const res = runAllCoreTests();
      setResults(res);
      setIsRunning(false);
    }, 150);
  };

  useEffect(() => {
    if (isOpen && results.length === 0) {
      executeTests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const passedCount = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  const getFilteredCategory = () => {
    switch (filter) {
      case 'نردبان (Ladder)':
        return 'Ladder';
      case 'هسته (Kernel)':
        return 'Kernel';
      case 'یکپارچگی (Integration)':
        return 'Integration';
      case 'تسویه (Settlement)':
        return 'Settlement';
      case 'افزونه‌ها (Extensions)':
        return 'Extensions';
      default:
        return 'All';
    }
  };

  const filtered = filter === 'همه' ? results : results.filter((r) => r.category === getFilteredCategory());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm text-right" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                مجموعه آزمون‌های اعتبارسنجی هسته و بک‌اند
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {results.length > 0 ? `${toPersianDigits(passedCount)} از ${toPersianDigits(results.length)} آزمون موفق` : 'آماده اجرا'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                شامل آزمون‌های واحد و یکپارچگی ADR-001، پروتکل TR-12، برابری TR-13 و وب‌سرویس‌های FastAPI
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filter */}
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs bg-slate-900">
          <div className="flex items-center space-x-2 space-x-reverse flex-wrap gap-y-1">
            {(['همه', 'نردبان (Ladder)', 'هسته (Kernel)', 'یکپارچگی (Integration)', 'تسویه (Settlement)', 'افزونه‌ها (Extensions)'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  filter === cat
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            onClick={executeTests}
            disabled={isRunning}
            className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition cursor-pointer shadow-md shadow-emerald-500/20 disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>اجرای مجدد آزمون‌ها</span>
          </button>
        </div>

        {/* Test List */}
        <div className="p-5 flex-1 overflow-y-auto space-y-2 bg-slate-950/40 text-xs">
          {filtered.map((t, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg border flex items-center justify-between transition ${
                t.status === 'passed'
                  ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  : 'bg-red-950/30 border-red-800/60 text-red-300'
              }`}
            >
              <div className="flex items-center space-x-3 space-x-reverse">
                {t.status === 'passed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <div>
                  <span className="font-semibold text-slate-200 block text-right">{t.name}</span>
                  {t.error && (
                    <span className="text-red-400 text-[11px] block mt-0.5 text-right font-mono">{t.error}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3 space-x-reverse text-slate-500 text-[11px] shrink-0 font-mono">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {t.category}
                </span>
                <span>{toPersianDigits(t.durationMs)} میلی‌ثانیه</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-4 space-x-reverse">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              موفق: <strong className="text-white">{toPersianDigits(passedCount)}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              ناموفق: <strong className="text-white">{toPersianDigits(failedCount)}</strong>
            </span>
          </div>

          <span className="text-slate-500">
            زمان کل اجرای آزمون‌ها: {toPersianDigits(results.reduce((acc, r) => acc + r.durationMs, 0).toFixed(2))} میلی‌ثانیه
          </span>
        </div>
      </div>
    </div>
  );
};
