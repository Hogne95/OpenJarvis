import { authFetch } from './core';
import type { ShopifySummary } from '../api';
export interface DurableOperatorProfile {
  honorific: string;
  reply_tone: string;
  verbosity_preference?: string;
  technical_depth?: string;
  decisiveness_preference?: string;
  autonomy_preference?: string;
  personality_notes?: string;
  priority_contacts: string[];
  workday_start: string;
  workday_end: string;
  active_desktop_target?: string;
  active_browser_target?: string;
}

export interface DurableOperatorSignals {
  reply_drafts: number;
  meetings_created: number;
  tasks_created: number;
  urgent_reviews: number;
  top_contacts: string[];
}

export interface DurableOperatorMemory {
  profile: DurableOperatorProfile;
  signals: DurableOperatorSignals;
  coding_repos?: Record<string, CodingRepoMemory>;
  missions?: Array<{
    id: string;
    title: string;
    domain: string;
    status: string;
    phase: string;
    summary: string;
    next_step: string;
    result: string;
    retry_hint: string;
    result_data?: Record<string, unknown>;
    next_action?: {
      kind: string;
      content?: string;
      label?: string;
      [key: string]: unknown;
    };
    updated_at: string;
  }>;
  explicit_memories?: Array<{
    id: string;
    content: string;
    created_at: string;
    tags: string[];
  }>;
  visual_observations?: Array<{
    id: string;
    label: string;
    source: string;
    note: string;
    created_at: string;
    image_path: string;
  }>;
  visual_insights?: Array<{
    id: string;
    label: string;
    question: string;
    answer: string;
    created_at: string;
  }>;
  visual_briefs?: Array<{
    id: string;
    label: string;
    summary: string;
    details: string;
    created_at: string;
  }>;
  document_briefs?: Array<{
    id: string;
    label: string;
    mode: string;
    summary: string;
    details: string;
    created_at: string;
  }>;
  design_briefs?: Array<{
    id: string;
    label: string;
    archetype: string;
    summary: string;
    details: string;
    scorecard?: Array<{
      label: string;
      score: number;
      note: string;
    }>;
    created_at: string;
  }>;
  fivem_briefs?: Array<{
    id: string;
    label: string;
    resource_key: string;
    framework: string;
    topology: string;
    summary: string;
    details: string;
    native_families?: string[];
    risk_tags?: string[];
    created_at: string;
  }>;
  learning_experiences?: Array<{
    id: string;
    label: string;
    domain: string;
    context_key: string;
    outcome_type: string;
    summary: string;
    lesson: string;
    reuse_hint: string;
    tags: string[];
    confidence?: number;
    use_count?: number;
    last_reused_at?: string;
    created_at: string;
  }>;
  relationships: Record<
    string,
    {
      contact: string;
      name: string;
      importance: string;
      relationship: string;
      notes: string;
    }
  >;
  meetings: Record<
    string,
    {
      key: string;
      title: string;
      importance: string;
      prep_style: string;
      notes: string;
    }
  >;
  projects: Record<
    string,
    {
      key: string;
      title: string;
      focus: string;
      status: string;
      next_step: string;
      notes: string;
    }
  >;
  sales_accounts?: Record<
    string,
    {
      key: string;
      name: string;
      owner: string;
      segment: string;
      status: string;
      next_step: string;
      risk_level: string;
      last_interaction: string;
      notes: string;
    }
  >;
  sales_leads?: Record<
    string,
    {
      key: string;
      name: string;
      company: string;
      owner: string;
      stage: string;
      source: string;
      next_step: string;
      risk_level: string;
      last_interaction: string;
      notes: string;
    }
  >;
  sales_deals?: Record<
    string,
    {
      key: string;
      title: string;
      account_key: string;
      owner: string;
      stage: string;
      value: string;
      close_target: string;
      next_step: string;
      risk_level: string;
      last_interaction: string;
      notes: string;
    }
  >;
  customer_accounts?: Record<
    string,
    {
      key: string;
      name: string;
      owner: string;
      segment: string;
      health: string;
      sentiment: string;
      churn_risk: string;
      next_step: string;
      last_interaction: string;
      notes: string;
    }
  >;
  customer_interactions?: Record<
    string,
    {
      key: string;
      account_key: string;
      contact: string;
      channel: string;
      topic: string;
      sentiment: string;
      urgency: string;
      status: string;
      promised_follow_up: string;
      last_interaction: string;
      notes: string;
    }
  >;
}

export interface CodingRepoMemory {
  key: string;
  title: string;
  convention_notes: string;
  workflow_notes: string;
  preferred_verification_commands: string[];
  common_pitfalls: string[];
  repeated_failures: string[];
  last_successful_verification: string;
  updated_at: string;
}

export async function fetchOperatorMemory(): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator memory fetch failed: ${res.status}`);
  }
  return res.json();
}

export interface OperatorMemoryContextItem {
  label: string;
  detail: string;
  reason?: string;
}

export interface OperatorMemoryContextResponse {
  query: string;
  identity: OperatorMemoryContextItem[];
  session_focus: OperatorMemoryContextItem[];
  long_term: OperatorMemoryContextItem[];
  flattened: OperatorMemoryContextItem[];
}

export interface OperatorMemoryAnalyticsResponse {
  signals: {
    reply_drafts: number;
    meetings_created: number;
    tasks_created: number;
    urgent_reviews: number;
    top_contacts: string[];
  };
  active_missions: Array<{
    id: string;
    title: string;
    status: string;
    phase: string;
    next_step: string;
  }>;
  blocked_missions: Array<{
    id: string;
    title: string;
    status: string;
    phase: string;
    next_step: string;
  }>;
  top_lessons: Array<{
    id: string;
    label: string;
    domain?: string;
    summary?: string;
    lesson?: string;
    confidence?: number;
  }>;
  focus_recommendations: string[];
  review_items: Array<{
    id: string;
    category: string;
    label: string;
    summary: string;
    detail: string;
    status: string;
    source: string;
    created_at: string;
  }>;
  recurring_patterns: Array<{
    key: string;
    count: number;
    kind: string;
  }>;
  improvement_opportunities: string[];
  friction_brief: {
    summary: string;
    root_cause: string;
    pressure_points: string[];
    recommended_focus: string;
  };
  operating_profile: {
    summary: string;
    execution_mode: string;
    briefing_mode: string;
    caution_level: string;
    adaptation_note: string;
  };
}

export interface OperatorCommanderBriefResponse {
  headline: string;
  recommendation: string;
  why: string;
  friction_summary: string;
  root_cause: string;
  risks: string[];
  best_next_step: string;
  queue: Array<{
    id: string;
    label: string;
    title: string;
    detail: string;
    action_label: string;
    action_hint: string;
    execution_lane: string;
    verification_signal: string;
    priority: number;
  }>;
  execution_plan: Array<{
    phase: string;
    goal: string;
    success_signal: string;
  }>;
  execution_summary: string;
  operating_mode: string;
  interaction_style: string;
  user_temperament: string;
  command_posture: string;
  guidance_note: string;
  planner_prompt: string;
}

export interface OperatorCodingCommanderBriefResponse {
  headline: string;
  repo_name: string;
  repo_root: string;
  branch: string;
  objective: string;
  workflow_mode: string;
  recommendation: string;
  why: string;
  best_next_step: string;
  risks: string[];
  phases: Array<{
    phase: string;
    goal: string;
    verification: string;
  }>;
  checklist: string[];
  deliverables: string[];
  exit_criteria: string[];
  report_template: string;
  preferred_checks: string[];
  execution_summary: string;
  planner_prompt: string;
  user_temperament: string;
}

export async function fetchOperatorMemoryContext(body: {
  query: string;
  limit?: number;
}): Promise<OperatorMemoryContextResponse> {
  const res = await authFetch('/v1/operator-memory/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator memory context failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchOperatorMemoryAnalytics(): Promise<OperatorMemoryAnalyticsResponse> {
  const res = await authFetch('/v1/operator-memory/analytics');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator memory analytics failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchOperatorCommanderBrief(): Promise<OperatorCommanderBriefResponse> {
  const res = await authFetch('/v1/operator-memory/commander-brief');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator commander brief failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchOperatorCodingBrief(objective = ''): Promise<OperatorCodingCommanderBriefResponse> {
  const suffix = objective.trim() ? `?objective=${encodeURIComponent(objective.trim())}` : '';
  const res = await authFetch(`/v1/operator-memory/coding-brief${suffix}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator coding brief failed: ${res.status}`);
  }
  return res.json();
}

export async function addOperatorReviewItem(body: {
  category?: string;
  label?: string;
  summary: string;
  detail?: string;
  source?: string;
  status?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator review item failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchShopifySummary(): Promise<ShopifySummary> {
  const res = await authFetch('/v1/shopify/summary');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Shopify summary failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorMemoryProfile(body: Partial<DurableOperatorProfile>): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator profile update failed: ${res.status}`);
  }
  return res.json();
}

export async function recordOperatorMemorySignal(body: {
  kind: 'reply' | 'meeting' | 'task' | 'urgent';
  contact?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator signal failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorRelationship(body: {
  contact: string;
  name?: string;
  importance?: string;
  relationship?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/relationship', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator relationship update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorMeeting(body: {
  key: string;
  title?: string;
  importance?: string;
  prep_style?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/meeting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator meeting update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorProject(body: {
  key: string;
  title?: string;
  focus?: string;
  status?: string;
  next_step?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator project update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorSalesAccount(body: {
  key: string;
  name?: string;
  owner?: string;
  segment?: string;
  status?: string;
  next_step?: string;
  risk_level?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/sales-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Sales account update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorSalesLead(body: {
  key: string;
  name?: string;
  company?: string;
  owner?: string;
  stage?: string;
  source?: string;
  next_step?: string;
  risk_level?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/sales-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Sales lead update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorSalesDeal(body: {
  key: string;
  title?: string;
  account_key?: string;
  owner?: string;
  stage?: string;
  value?: string;
  close_target?: string;
  next_step?: string;
  risk_level?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/sales-deal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Sales deal update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorCustomerAccount(body: {
  key: string;
  name?: string;
  owner?: string;
  segment?: string;
  health?: string;
  sentiment?: string;
  churn_risk?: string;
  next_step?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/customer-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Customer account update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorCustomerInteraction(body: {
  key: string;
  account_key?: string;
  contact?: string;
  channel?: string;
  topic?: string;
  sentiment?: string;
  urgency?: string;
  status?: string;
  promised_follow_up?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/customer-interaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Customer interaction update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorVisualObservation(body: {
  label: string;
  source?: string;
  note: string;
  image_data_url?: string;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/visual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator visual update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorVisualInsight(body: {
  label: string;
  question: string;
  answer: string;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/visual-insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator visual insight update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorVisualBrief(body: {
  label: string;
  summary: string;
  details?: string;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/visual-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Visual brief update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorDocumentBrief(body: {
  label: string;
  mode: string;
  summary: string;
  details?: string;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/document-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Document brief update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorDesignBrief(body: {
  label: string;
  archetype: string;
  summary: string;
  details?: string;
  scorecard?: Array<{
    label: string;
    score: number;
    note: string;
  }>;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/design-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Design brief update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorFivemBrief(body: {
  label: string;
  resource_key: string;
  framework: string;
  topology: string;
  summary: string;
  details?: string;
  native_families?: string[];
  risk_tags?: string[];
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/fivem-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `FiveM brief update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorLearningExperience(body: {
  label: string;
  domain: string;
  context_key?: string;
  outcome_type?: string;
  summary: string;
  lesson?: string;
  reuse_hint?: string;
  tags?: string[];
  confidence?: number;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/learning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Learning experience update failed: ${res.status}`);
  }
  return res.json();
}

export async function markOperatorLearningExperiencesReused(ids: string[], reused_at?: string): Promise<DurableOperatorMemory> {
  const cleaned = ids.map((id) => id.trim()).filter(Boolean);
  if (!cleaned.length) {
    throw new Error('At least one learning experience id is required.');
  }
  const res = await authFetch('/v1/operator-memory/learning/reuse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: cleaned, reused_at }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Learning reuse update failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchOperatorLearningExperiences(params: {
  domain?: string;
  context_key?: string;
  limit?: number;
} = {}): Promise<
  Array<{
    id: string;
    label: string;
    domain: string;
    context_key: string;
    outcome_type: string;
    summary: string;
    lesson: string;
    reuse_hint: string;
    tags: string[];
    confidence?: number;
    use_count?: number;
    last_reused_at?: string;
    created_at: string;
  }>
> {
  const query = new URLSearchParams();
  if (params.domain) query.set('domain', params.domain);
  if (params.context_key) query.set('context_key', params.context_key);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const res = await authFetch(`/v1/operator-memory/learning${suffix}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Learning experiences fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.items || [];
}

export async function updateOperatorMission(body: {
  id: string;
  title: string;
  domain?: string;
  status?: string;
  phase?: string;
  summary?: string;
  next_step?: string;
  result?: string;
  retry_hint?: string;
  result_data?: Record<string, unknown>;
  next_action?: Record<string, unknown>;
  updated_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/mission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator mission update failed: ${res.status}`);
  }
  return res.json();
}

export async function actOnOperatorMission(body: {
  id: string;
  action: 'resume' | 'retry' | 'complete' | 'block';
  summary?: string;
  result?: string;
  retry_hint?: string;
}): Promise<{
  memory: DurableOperatorMemory;
  mission?: {
    id: string;
    title: string;
    domain: string;
    status: string;
    phase: string;
    summary: string;
    next_step: string;
    result: string;
    retry_hint: string;
    result_data?: Record<string, unknown>;
    next_action?: {
      kind: string;
      content?: string;
      label?: string;
      [key: string]: unknown;
    };
    updated_at?: string;
  };
  followup?: {
    kind: 'brief' | 'prompt' | string;
    content: string;
    label?: string;
    [key: string]: unknown;
  } | null;
}> {
  const res = await authFetch('/v1/operator-memory/mission/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator mission action failed: ${res.status}`);
  }
  return res.json();
}
