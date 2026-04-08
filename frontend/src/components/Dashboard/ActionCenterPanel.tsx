type ActionMode = 'email' | 'calendar';

type ExecutionHint = {
  ready: boolean;
  button: string;
  label: string;
};

type ConnectorCapability = {
  label: string;
  value: string;
};

export function ActionCenterPanel({
  actionMode,
  onActionModeChange,
  emailRecipient,
  onEmailRecipientChange,
  emailSubject,
  onEmailSubjectChange,
  emailBody,
  onEmailBodyChange,
  calendarTitle,
  onCalendarTitleChange,
  calendarStartAt,
  onCalendarStartAtChange,
  calendarEndAt,
  onCalendarEndAtChange,
  calendarAttendees,
  onCalendarAttendeesChange,
  calendarLocation,
  onCalendarLocationChange,
  calendarNotes,
  onCalendarNotesChange,
  onStageAction,
  actionBusy,
  executionHint,
  connectorCapabilities,
}: {
  actionMode: ActionMode;
  onActionModeChange: (mode: ActionMode) => void;
  emailRecipient: string;
  onEmailRecipientChange: (value: string) => void;
  emailSubject: string;
  onEmailSubjectChange: (value: string) => void;
  emailBody: string;
  onEmailBodyChange: (value: string) => void;
  calendarTitle: string;
  onCalendarTitleChange: (value: string) => void;
  calendarStartAt: string;
  onCalendarStartAtChange: (value: string) => void;
  calendarEndAt: string;
  onCalendarEndAtChange: (value: string) => void;
  calendarAttendees: string;
  onCalendarAttendeesChange: (value: string) => void;
  calendarLocation: string;
  onCalendarLocationChange: (value: string) => void;
  calendarNotes: string;
  onCalendarNotesChange: (value: string) => void;
  onStageAction: () => void;
  actionBusy: 'stage' | 'approve' | 'hold' | null;
  executionHint: ExecutionHint;
  connectorCapabilities: ConnectorCapability[];
}) {
  return (
    <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">Action Center</div>
        <div className="flex gap-2">
          {(['email', 'calendar'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onActionModeChange(mode)}
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em] transition ${
                actionMode === mode
                  ? 'border-cyan-300/30 bg-cyan-400/[0.12] text-cyan-50'
                  : 'border-cyan-400/10 bg-slate-950/60 text-cyan-200/65 hover:bg-cyan-400/[0.08]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      {actionMode === 'email' ? (
        <div className="grid gap-3">
          <input
            value={emailRecipient}
            onChange={(event) => onEmailRecipientChange(event.target.value)}
            placeholder="recipient@example.com"
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <input
            value={emailSubject}
            onChange={(event) => onEmailSubjectChange(event.target.value)}
            placeholder="Subject"
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <textarea
            value={emailBody}
            onChange={(event) => onEmailBodyChange(event.target.value)}
            rows={4}
            placeholder="Write the email body JARVIS should stage."
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
        </div>
      ) : (
        <div className="grid gap-3">
          <input
            value={calendarTitle}
            onChange={(event) => onCalendarTitleChange(event.target.value)}
            placeholder="Meeting title"
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <input
            value={calendarStartAt}
            onChange={(event) => onCalendarStartAtChange(event.target.value)}
            placeholder="2026-04-08T14:00:00+02:00"
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <input
            value={calendarEndAt}
            onChange={(event) => onCalendarEndAtChange(event.target.value)}
            placeholder="2026-04-08T15:00:00+02:00"
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={calendarAttendees}
              onChange={(event) => onCalendarAttendeesChange(event.target.value)}
              placeholder="Attendees"
              className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              value={calendarLocation}
              onChange={(event) => onCalendarLocationChange(event.target.value)}
              placeholder="Location"
              className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
          </div>
          <textarea
            value={calendarNotes}
            onChange={(event) => onCalendarNotesChange(event.target.value)}
            rows={3}
            placeholder="Talking points or notes"
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
        </div>
      )}
      <button
        onClick={onStageAction}
        disabled={actionBusy !== null || !executionHint.ready}
        className="mt-3 w-full rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {actionBusy === 'stage' ? 'Staging' : executionHint.button}
      </button>
      <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-sm text-slate-200/76">
        {executionHint.label}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {connectorCapabilities.map((item) => (
          <div key={item.label} className="rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">{item.label}</div>
            <div className="mt-1 text-sm text-slate-200/76">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
