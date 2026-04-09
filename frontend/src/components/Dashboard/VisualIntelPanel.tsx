export function VisualIntelPanel({
  screenSnapshot,
  screenDeck,
  screenContextNote,
  setScreenContextNote,
  setScreenSnapshot,
  setScreenDeck,
  captureScreenSnapshot,
  injectCommand,
  analyzeCurrentVisual,
  visionBusy,
  extractCurrentVisualText,
  analyzeAllScreens,
  extractAllScreensText,
  createTaskFromScreenContext,
  actionBusy,
  rememberScreenContext,
  intentBusy,
  visionAnalysis,
  visionTextExtraction,
  createTaskFromVisionResult,
  rememberVisionResult,
  suggestVisualActions,
  extractVisualSignals,
  extractVisualUiTargets,
  setVisionAnalysis,
  setVisionSignals,
  setVisionTextExtraction,
  setVisionSuggestedActions,
  setVisionUiTargets,
  setVisionUiPlan,
  setVisionUiVerify,
  setVisionQuery,
  setVisionQuestion,
  visionQuestion,
  askVisualQuestion,
  visualBrief,
  architectureBusy,
  handoffWithBrief,
  buildDailyOpsPrompt,
  saveVisualBrief,
  visionSignals,
  visionQuery,
  visionUiTargets,
  visionUiVerify,
  verifyVisualUiTarget,
  visionUiPlan,
  planVisualUiTarget,
  visionSuggestedActions,
  stageVisualDesktopIntent,
  stageTask,
  setActionBusy,
  setActionCenter,
  setActionNotice,
  durableOperatorMemory,
  apiBase,
  restoreVisualObservation,
  setWorkbenchNotice,
  loadDesignAudit,
  saveDesignBriefFromVisual,
}: {
  screenSnapshot: any;
  screenDeck: any[];
  screenContextNote: string;
  setScreenContextNote: (value: string) => void;
  setScreenSnapshot: (value: any) => void;
  setScreenDeck: (value: any[]) => void;
  captureScreenSnapshot: (label: string, append?: boolean) => void;
  injectCommand: (value: string) => void;
  analyzeCurrentVisual: () => void;
  visionBusy: boolean;
  extractCurrentVisualText: () => void;
  analyzeAllScreens: () => void;
  extractAllScreensText: () => void;
  createTaskFromScreenContext: () => void;
  actionBusy: string | null;
  rememberScreenContext: () => void;
  intentBusy: string | null;
  visionAnalysis: any;
  visionTextExtraction: any;
  createTaskFromVisionResult: () => void;
  rememberVisionResult: () => void;
  suggestVisualActions: () => void;
  extractVisualSignals: () => void;
  extractVisualUiTargets: () => void;
  setVisionAnalysis: (value: any) => void;
  setVisionSignals: (value: any) => void;
  setVisionTextExtraction: (value: any) => void;
  setVisionSuggestedActions: (value: any) => void;
  setVisionUiTargets: (value: any) => void;
  setVisionUiPlan: (value: any) => void;
  setVisionUiVerify: (value: any) => void;
  setVisionQuery: (value: any) => void;
  setVisionQuestion: (value: string) => void;
  visionQuestion: string;
  askVisualQuestion: () => void;
  visualBrief: any;
  architectureBusy: boolean;
  handoffWithBrief: (brief: string, source: string) => void;
  buildDailyOpsPrompt: () => string;
  saveVisualBrief: () => void;
  visionSignals: any;
  visionQuery: any;
  visionUiTargets: any;
  visionUiVerify: any;
  verifyVisualUiTarget: (item: any) => void;
  visionUiPlan: any;
  planVisualUiTarget: (item: any) => void;
  visionSuggestedActions: any;
  stageVisualDesktopIntent: (intent: any) => void;
  stageTask: (task: { title: string; notes: string }) => Promise<any>;
  setActionBusy: (value: 'stage' | 'approve' | 'hold' | null) => void;
  setActionCenter: (value: any) => void;
  setActionNotice: (value: string) => void;
  durableOperatorMemory: any;
  apiBase: string;
  restoreVisualObservation: (item: any) => void;
  setWorkbenchNotice: (value: string) => void;
  loadDesignAudit: () => void;
  saveDesignBriefFromVisual: () => void;
}) {
  return (
    <>
                  {screenSnapshot ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                          {screenSnapshot.source === 'upload' ? 'Visual Upload' : 'Screen Snapshot'}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                          {new Date(screenSnapshot.capturedAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-300/65">{screenSnapshot.label}</div>
                      <img
                        src={screenSnapshot.dataUrl}
                        alt={screenSnapshot.label}
                        className="mt-3 max-h-48 w-full rounded-[0.95rem] border border-cyan-400/10 object-cover"
                      />
                      <textarea
                        value={screenContextNote}
                        onChange={(event) => setScreenContextNote(event.target.value)}
                        placeholder="What matters in this visual? Add a short note so JARVIS can turn it into a task or memory."
                        className="mt-3 min-h-[84px] w-full rounded-[0.95rem] border border-cyan-400/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      {screenDeck.length > 1 ? (
                        <div className="mt-3">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                            Screen Deck · {screenDeck.length}
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {screenDeck.map((item) => (
                              <button
                                key={`${item.label}-${item.capturedAt}`}
                                onClick={() => {
                                  setScreenSnapshot(item);
                                  setVisionAnalysis(null);
                                }}
                                className={`rounded-[0.9rem] border px-3 py-3 text-left transition ${
                                  screenSnapshot?.capturedAt === item.capturedAt
                                    ? 'border-cyan-300/30 bg-cyan-400/[0.1]'
                                    : 'border-cyan-400/10 bg-slate-950/55 hover:bg-cyan-400/[0.08]'
                                }`}
                              >
                                <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">{item.label}</div>
                                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">
                                  {new Date(item.capturedAt).toLocaleTimeString()}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => captureScreenSnapshot(`Screen ${screenDeck.length + 1}`, true)}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Add Screen
                        </button>
                        <button
                          onClick={() =>
                            injectCommand(
                              screenSnapshot.source === 'upload'
                                ? 'I uploaded an image into the HUD. Help me figure out what the most important visible detail is, then ask one clarifying question before you suggest the next action.'
                                : 'I captured a screen snapshot in the HUD. Help me figure out what the most important visible task is, then ask one clarifying question before you suggest the next action.',
                            )
                          }
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                        >
                          Load Visual Prompt
                        </button>
                        <button
                          onClick={analyzeCurrentVisual}
                          disabled={visionBusy}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Analyzing' : 'Analyze'}
                        </button>
                        <button
                          onClick={extractCurrentVisualText}
                          disabled={visionBusy}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Extracting' : 'Extract Text'}
                        </button>
                        <button
                          onClick={analyzeAllScreens}
                          disabled={visionBusy || !screenDeck.length}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Analyzing' : `Analyze All${screenDeck.length > 1 ? ` (${screenDeck.length})` : ''}`}
                        </button>
                        <button
                          onClick={extractAllScreensText}
                          disabled={visionBusy || !screenDeck.length}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Extracting' : `Extract All${screenDeck.length > 1 ? ` (${screenDeck.length})` : ''}`}
                        </button>
                        <button
                          onClick={createTaskFromScreenContext}
                          disabled={actionBusy !== null || !screenContextNote.trim()}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Make Task
                        </button>
                        <button
                          onClick={rememberScreenContext}
                          disabled={intentBusy !== null || !screenContextNote.trim()}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remember
                        </button>
                        <button
                          onClick={createTaskFromVisionResult}
                          disabled={actionBusy !== null || (!visionAnalysis?.content && !visionTextExtraction?.content)}
                          className="rounded-[0.85rem] border border-emerald-300/18 bg-emerald-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Task From Vision
                        </button>
                        <button
                          onClick={rememberVisionResult}
                          disabled={intentBusy !== null || (!visionAnalysis?.content && !visionTextExtraction?.content)}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remember Result
                        </button>
                        <button
                          onClick={suggestVisualActions}
                          disabled={visionBusy || !screenDeck.length}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Planning' : 'Suggest Actions'}
                        </button>
                        <button
                          onClick={extractVisualSignals}
                          disabled={visionBusy || !screenDeck.length}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Scanning' : 'Extract Signals'}
                        </button>
                        <button
                          onClick={extractVisualUiTargets}
                          disabled={visionBusy || !screenDeck.length}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Scanning' : 'Find UI Targets'}
                        </button>
                        <button
                          onClick={() => {
                            setScreenSnapshot(null);
                            setScreenDeck([]);
                            setScreenContextNote('');
                            setVisionAnalysis(null);
                            setVisionSignals(null);
                            setVisionTextExtraction(null);
                            setVisionSuggestedActions(null);
                            setVisionUiTargets(null);
                            setVisionUiPlan(null);
                            setVisionUiVerify(null);
                            setVisionQuery(null);
                            setVisionQuestion('');
                          }}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Clear Visual
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_160px]">
                        <input
                          value={visionQuestion}
                          onChange={(event) => setVisionQuestion(event.target.value)}
                          placeholder="What matters most on these screens?"
                          className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                        />
                        <button
                          onClick={askVisualQuestion}
                          disabled={visionBusy || !screenDeck.length || !visionQuestion.trim()}
                          className="rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Querying' : 'Ask Vision'}
                        </button>
                      </div>
                      {visualBrief ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Visual Brief</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">{visualBrief.title}</div>
                          </div>
                          <div className="mt-2 text-sm text-slate-200/76">{visualBrief.summary}</div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => injectCommand(visualBrief.prompt)}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                            >
                              Load Brief
                            </button>
                            <button
                              onClick={loadDesignAudit}
                              className="rounded-[0.85rem] border border-violet-300/18 bg-violet-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-violet-100 transition hover:bg-violet-400/[0.14]"
                            >
                              Design Audit
                            </button>
                            <button
                              onClick={saveDesignBriefFromVisual}
                              className="rounded-[0.85rem] border border-violet-300/18 bg-violet-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-violet-100 transition hover:bg-violet-400/[0.14]"
                            >
                              Save Design Brief
                            </button>
                            <button
                              onClick={() => handoffWithBrief(visualBrief.prompt, 'visual-brief')}
                              disabled={architectureBusy}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {architectureBusy ? 'Routing' : 'Route To Planner'}
                            </button>
                            <button
                              onClick={() => injectCommand(buildDailyOpsPrompt())}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                            >
                              Blend Into Daily Ops
                            </button>
                            <button
                              onClick={saveVisualBrief}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                            >
                              Save Brief
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {visionAnalysis?.content ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Vision Analysis</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionAnalysis.model}
                              {visionAnalysis.screen_count ? ` · ${visionAnalysis.screen_count} screens` : ''}
                            </div>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200/76">
                            {visionAnalysis.content}
                          </pre>
                        </div>
                      ) : null}
                      {visionTextExtraction?.content ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Visible Text</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionTextExtraction.model}
                              {visionTextExtraction.screen_count ? ` · ${visionTextExtraction.screen_count} screens` : ''}
                            </div>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200/76">
                            {visionTextExtraction.content}
                          </pre>
                        </div>
                      ) : null}
                      {visionSignals ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Visual Signals</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionSignals.model}
                              {visionSignals.screen_count ? ` · ${visionSignals.screen_count} screens` : ''}
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-slate-200/76">
                            {visionSignals.summary || 'No major signals extracted.'}
                          </div>
                          {visionSignals.blockers.length ? (
                            <div className="mt-3">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-rose-300/70">Blockers</div>
                              <div className="mt-2 grid gap-2">
                                {visionSignals.blockers.map((item: string, index: number) => (
                                  <div key={`${item}-${index}`} className="rounded-[0.85rem] border border-rose-300/12 bg-rose-400/[0.06] px-3 py-2 text-sm text-slate-100/80">
                                    {item}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {visionSignals.deadlines.length ? (
                            <div className="mt-3">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/70">Deadlines</div>
                              <div className="mt-2 grid gap-2">
                                {visionSignals.deadlines.map((item: string, index: number) => (
                                  <div key={`${item}-${index}`} className="rounded-[0.85rem] border border-amber-300/12 bg-amber-400/[0.06] px-3 py-2 text-sm text-slate-100/80">
                                    {item}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {visionSignals.attention_items.length ? (
                            <div className="mt-3">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Attention Items</div>
                              <div className="mt-2 grid gap-2">
                                {visionSignals.attention_items.map((item: string, index: number) => (
                                  <div key={`${item}-${index}`} className="rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-2 text-sm text-slate-100/80">
                                    {item}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {visionQuery?.answer ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Visual Q&amp;A</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionQuery.model}
                              {visionQuery.screen_count ? ` - ${visionQuery.screen_count} screens` : ''}
                            </div>
                          </div>
                          <div className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-100/85">
                            {visionQuery.question}
                          </div>
                          {visionQuery.history_used ? (
                            <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/50">
                              Using {visionQuery.history_used} recent visual memory item{visionQuery.history_used === 1 ? '' : 's'}
                            </div>
                          ) : null}
                          <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200/76">
                            {visionQuery.answer}
                          </pre>
                        </div>
                      ) : null}
                      {visionUiTargets?.targets?.length ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">UI Targets</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionUiTargets.model}
                              {visionUiTargets.screen_count ? ` · ${visionUiTargets.screen_count} screens` : ''}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {visionUiTargets.targets.map((item: any, index: number) => (
                              <div
                                key={`${item.label}-${item.control_type}-${index}`}
                                className="rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">{item.label}</div>
                                  <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">
                                    {item.control_type} · {item.confidence}%
                                  </div>
                                </div>
                                <div className="mt-2 text-sm text-slate-200/76">{item.detail}</div>
                                <div className="mt-3 flex gap-2">
                                  <button
                                    onClick={() => verifyVisualUiTarget(item)}
                                    className="rounded-[0.85rem] border border-amber-300/16 bg-amber-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-amber-100 transition hover:bg-amber-400/[0.14]"
                                  >
                                    Verify Target
                                  </button>
                                  <button
                                    onClick={() => planVisualUiTarget(item)}
                                    className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                                  >
                                    Plan Interaction
                                  </button>
                                  <button
                                    onClick={() => injectCommand(item.prompt)}
                                    className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                                  >
                                    Load Target
                                  </button>
                                  <button
                                    onClick={() => stageVisualDesktopIntent(item.desktop_intent)}
                                    disabled={!item.desktop_intent}
                                    className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Stage Desktop
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setActionBusy('stage');
                                      try {
                                        const next = await stageTask({
                                          title: `UI target · ${item.label}`,
                                          notes: `${item.detail}\n\n${item.prompt}`,
                                        });
                                        setActionCenter(next);
                                        setActionNotice('UI target staged as a task.');
                                      } catch (error) {
                                        setActionNotice(error instanceof Error ? error.message : 'Unable to stage UI target.');
                                      } finally {
                                        setActionBusy(null);
                                      }
                                    }}
                                    className="rounded-[0.85rem] border border-emerald-300/18 bg-emerald-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-400/[0.14]"
                                  >
                                    Stage Task
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {visionUiVerify ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">UI Verification</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionUiVerify.model}
                              {visionUiVerify.screen_count ? ` · ${visionUiVerify.screen_count} screens` : ''}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">
                              {visionUiVerify.target_label}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">
                              {visionUiVerify.risk_level} · {visionUiVerify.confidence}%
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-slate-200/76">{visionUiVerify.summary}</div>
                          {visionUiVerify.verification_checks.length ? (
                            <div className="mt-3">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/70">Verify Before Acting</div>
                              <div className="mt-2 grid gap-2">
                                {visionUiVerify.verification_checks.map((item: any, index: number) => (
                                  <div key={`${item}-${index}`} className="rounded-[0.85rem] border border-amber-300/12 bg-amber-400/[0.06] px-3 py-2 text-sm text-slate-100/80">
                                    {item}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {visionUiVerify.evidence.length ? (
                            <div className="mt-3">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Evidence</div>
                              <div className="mt-2 grid gap-2">
                                {visionUiVerify.evidence.map((item: any, index: number) => (
                                  <div key={`${item}-${index}`} className="rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-2 text-sm text-slate-100/80">
                                    {item}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {visionUiPlan ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">UI Interaction Plan</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionUiPlan.model}
                              {visionUiPlan.screen_count ? ` · ${visionUiPlan.screen_count} screens` : ''}
                            </div>
                          </div>
                          <div className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-100/85">
                            {visionUiPlan.target_label}
                          </div>
                          <div className="mt-2 text-sm text-slate-200/76">{visionUiPlan.summary}</div>
                          {visionUiPlan.steps.length ? (
                            <div className="mt-3 grid gap-2">
                              {visionUiPlan.steps.map((step: any, index: number) => (
                                <div
                                  key={`${visionUiPlan.target_label}-${index}`}
                                  className="rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-2 text-sm text-slate-100/80"
                                >
                                  {index + 1}. {step}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => injectCommand(visionUiPlan.prompt || visionUiPlan.steps.join('\n'))}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                            >
                              Load Plan
                            </button>
                            <button
                              onClick={() => stageVisualDesktopIntent(visionUiPlan.desktop_intent)}
                              disabled={!visionUiPlan.desktop_intent}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Stage Desktop
                            </button>
                            <button
                              onClick={async () => {
                                setActionBusy('stage');
                                try {
                                  const next = await stageTask({
                                    title: `UI plan · ${visionUiPlan.target_label}`,
                                    notes: `${visionUiPlan.summary}\n\n${visionUiPlan.steps.join('\n')}\n\n${visionUiPlan.prompt}`,
                                  });
                                  setActionCenter(next);
                                  setActionNotice('UI interaction plan staged as a task.');
                                } catch (error) {
                                  setActionNotice(error instanceof Error ? error.message : 'Unable to stage UI plan.');
                                } finally {
                                  setActionBusy(null);
                                }
                              }}
                              className="rounded-[0.85rem] border border-emerald-300/18 bg-emerald-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-400/[0.14]"
                            >
                              Stage Task
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {visionSuggestedActions?.actions?.length ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Visual Next Actions</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionSuggestedActions.model}
                              {visionSuggestedActions.screen_count ? ` · ${visionSuggestedActions.screen_count} screens` : ''}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {visionSuggestedActions.actions.map((item: any, index: number) => (
                              <div
                                key={`${item.title}-${index}`}
                                className="rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">{item.title}</div>
                                  <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">
                                    priority {item.priority}
                                  </div>
                                </div>
                                <div className="mt-2 text-sm text-slate-200/76">{item.detail}</div>
                                <div className="mt-3 flex gap-2">
                                  <button
                                    onClick={() => injectCommand(item.prompt)}
                                    className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                                  >
                                    Load Prompt
                                  </button>
                                  <button
                                    onClick={() => stageVisualDesktopIntent(item.desktop_intent)}
                                    disabled={!item.desktop_intent}
                                    className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Stage Desktop
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setActionBusy('stage');
                                      try {
                                        const next = await stageTask({
                                          title: item.title,
                                          notes: `${item.detail}\n\n${item.prompt}`,
                                        });
                                        setActionCenter(next);
                                        setActionNotice('Visual action staged as a task.');
                                      } catch (error) {
                                        setActionNotice(error instanceof Error ? error.message : 'Unable to stage visual action.');
                                      } finally {
                                        setActionBusy(null);
                                      }
                                    }}
                                    className="rounded-[0.85rem] border border-emerald-300/18 bg-emerald-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-400/[0.14]"
                                  >
                                    Stage Task
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {durableOperatorMemory?.visual_observations?.length ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Recent Visual Memory</div>
                      <div className="mt-3 grid gap-2">
                        {durableOperatorMemory.visual_observations.slice(0, 3).map((item: any) => (
                          <div
                            key={item.id}
                            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3"
                          >
                            {item.image_path ? (
                              <img
                                src={`${apiBase}/v1/operator-memory/visual/${encodeURIComponent(item.id)}/asset`}
                                alt={item.label}
                                className="mb-3 max-h-32 w-full rounded-[0.85rem] border border-cyan-400/10 object-cover"
                              />
                            ) : null}
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">{item.label}</div>
                              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                                {item.source}
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-slate-200/76">{item.note}</div>
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => restoreVisualObservation(item)}
                                className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                              >
                                Reload
                              </button>
                              <button
                                onClick={() =>
                                  injectCommand(
                                    `I restored a saved visual memory called "${item.label}". Help me continue from this context: ${item.note}`,
                                  )
                                }
                                className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                Load Prompt
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {durableOperatorMemory?.visual_insights?.length ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Recent Visual Answers</div>
                      <div className="mt-3 grid gap-2">
                        {durableOperatorMemory.visual_insights.slice(0, 4).map((item: any) => (
                          <div
                            key={item.id}
                            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3"
                          >
                            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">
                              {item.label} - {item.created_at ? new Date(item.created_at).toLocaleString() : 'saved'}
                            </div>
                            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-cyan-100/85">
                              {item.question}
                            </div>
                            <div className="mt-2 text-sm text-slate-200/76">{item.answer}</div>
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => {
                                  setVisionQuestion(item.question);
                                  setVisionQuery({
                                    question: item.question,
                                    answer: item.answer,
                                    model: 'memory',
                                    label: item.label,
                                  });
                                  setWorkbenchNotice('Visual answer restored from memory.');
                                }}
                                className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                              >
                                Reload Answer
                              </button>
                              <button
                                onClick={() =>
                                  injectCommand(
                                    `I previously asked a visual question.\nLabel: ${item.label}\nQuestion: ${item.question}\nAnswer:\n${item.answer}\nContinue from this visual context and suggest the next best action.`,
                                  )
                                }
                                className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                Load Into Core
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {durableOperatorMemory?.visual_briefs?.length ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Recent Visual Briefs</div>
                      <div className="mt-3 grid gap-2">
                        {durableOperatorMemory.visual_briefs.slice(0, 4).map((item: any) => (
                          <div
                            key={item.id}
                            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3"
                          >
                            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">
                              {item.label} - {item.created_at ? new Date(item.created_at).toLocaleString() : 'saved'}
                            </div>
                            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-cyan-100/85">
                              {item.summary}
                            </div>
                            <div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200/76">{item.details}</div>
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() =>
                                  injectCommand(
                                    `I saved a visual brief.\nLabel: ${item.label}\nSummary: ${item.summary}\nDetails:\n${item.details}\nContinue from this visual context and suggest the next best action.`,
                                  )
                                }
                                className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                              >
                                Load Brief
                              </button>
                              <button
                                onClick={() =>
                                  injectCommand(
                                    `Act as my executive operations copilot.\nBlend this saved visual brief into my current daily operations view.\nLabel: ${item.label}\nSummary: ${item.summary}\nDetails:\n${item.details}`,
                                  )
                                }
                                className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                Load Into Ops
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
    </>
  );
}
