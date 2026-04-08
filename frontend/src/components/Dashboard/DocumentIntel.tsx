import type { DocumentAnalysisResult } from '../../lib/api';

type DocumentMode = 'summary' | 'business_review' | 'finance_review' | 'investment_memo' | 'kpi_extract';

export type DocumentIntelBrief = {
  prompt: string;
  memoPrompt: string;
};

export type SavedDocumentBrief = {
  id: string;
  label: string;
  mode: string;
  summary: string;
  details: string;
  created_at: string;
};

export function DocumentIntel({
  title,
  onTitleChange,
  mode,
  onModeChange,
  onSelectFiles,
  onAnalyze,
  files,
  busy,
  analysis,
  brief,
  architectureBusy,
  onLoadAnalysis,
  onRouteToPlanner,
  onPrepareMemo,
  onSaveBrief,
  onExportDocx,
  onExportSecondary,
  secondaryExportLabel,
  onMakeTask,
  recentBriefs,
  onLoadSavedBrief,
  onMemoSavedBrief,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  mode: DocumentMode;
  onModeChange: (value: DocumentMode) => void;
  onSelectFiles: () => void;
  onAnalyze: () => void;
  files: File[];
  busy: boolean;
  analysis: DocumentAnalysisResult | null;
  brief: DocumentIntelBrief | null;
  architectureBusy: boolean;
  onLoadAnalysis: () => void;
  onRouteToPlanner: () => void;
  onPrepareMemo: () => void;
  onSaveBrief: () => void;
  onExportDocx: () => void;
  onExportSecondary: () => void;
  secondaryExportLabel: string;
  onMakeTask: () => void;
  recentBriefs: SavedDocumentBrief[];
  onLoadSavedBrief: (item: SavedDocumentBrief) => void;
  onMemoSavedBrief: (item: SavedDocumentBrief) => void;
}) {
  return (
    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Document Intel</div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">pdf / word / excel / powerpoint</div>
      </div>
      <div className="mt-2 text-sm text-slate-200/76">
        Upload business and finance documents for direct analysis in the HUD.
      </div>
      <input
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="Optional document set title"
        className="mt-3 w-full rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-sm text-cyan-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select
          value={mode}
          onChange={(event) => onModeChange(event.target.value as DocumentMode)}
          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-sm text-cyan-50 outline-none transition focus:border-cyan-300/40"
        >
          <option value="summary">Summary</option>
          <option value="business_review">Business Review</option>
          <option value="finance_review">Finance Review</option>
          <option value="investment_memo">Investment Memo</option>
          <option value="kpi_extract">KPI Extract</option>
        </select>
        <button
          type="button"
          onClick={onSelectFiles}
          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
        >
          Upload Docs
        </button>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!files.length || busy}
          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Analyzing' : 'Analyze Docs'}
        </button>
      </div>
      {files.length ? (
        <div className="mt-3 rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 text-xs text-slate-200/76">
          {files.map((file) => file.name).join(', ')}
        </div>
      ) : null}
      {analysis ? (
        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Document Analysis</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
              {analysis.mode.replace('_', ' ')} / {analysis.model}
            </div>
          </div>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-200/76">
            {analysis.content}
          </pre>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onLoadAnalysis}
              className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
            >
              Load Analysis
            </button>
            <button
              type="button"
              onClick={onRouteToPlanner}
              disabled={architectureBusy}
              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {architectureBusy ? 'Routing' : 'Route To Planner'}
            </button>
            <button
              type="button"
              onClick={onPrepareMemo}
              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
            >
              Prepare Memo
            </button>
            <button
              type="button"
              onClick={onSaveBrief}
              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
            >
              Save Brief
            </button>
            <button
              type="button"
              onClick={onExportDocx}
              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
            >
              Export DOCX
            </button>
            <button
              type="button"
              onClick={onExportSecondary}
              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
            >
              {secondaryExportLabel}
            </button>
            <button
              type="button"
              onClick={onMakeTask}
              className="rounded-[0.85rem] border border-emerald-300/18 bg-emerald-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-400/[0.14]"
            >
              Make Task
            </button>
          </div>
        </div>
      ) : null}
      {recentBriefs.length ? (
        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Recent Document Briefs</div>
          <div className="mt-3 space-y-3">
            {recentBriefs.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-cyan-50/92">{item.label}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                      {item.mode.replace(/_/g, ' ')} / {item.created_at || 'saved'}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-200/76">{item.summary}</div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onLoadSavedBrief(item)}
                    className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                  >
                    Load Brief
                  </button>
                  <button
                    type="button"
                    onClick={() => onMemoSavedBrief(item)}
                    className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                  >
                    Memo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
