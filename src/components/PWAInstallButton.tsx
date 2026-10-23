import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, PlusSquare, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>نصب اپلیکیشن</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 transition cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-amber-400" />
          <span>نصب در iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-right" dir="rtl">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>نصب پرندو در آیفون / آیپد</span>
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-300">
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center shrink-0 font-bold text-amber-400">۱</div>
                  <p>در نوار پایین مرورگر سافاری، روی دکمه <strong>اشتراک‌گذاری (Share)</strong> <Share2 className="w-3.5 h-3.5 inline text-sky-400" /> بزنید.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center shrink-0 font-bold text-amber-400">۲</div>
                  <p>کمی به پایین اسکرول کرده و گزینه <strong>Add to Home Screen (افزودن به صفحه اصلی)</strong> <PlusSquare className="w-3.5 h-3.5 inline text-emerald-400" /> را لمس نمایید.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center shrink-0 font-bold text-amber-400">۳</div>
                  <p>در بالای صفحه روی <strong>Add</strong> کلیک کنید تا پرندو مانند یک برنامه بومی نصب شود.</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition cursor-pointer"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
