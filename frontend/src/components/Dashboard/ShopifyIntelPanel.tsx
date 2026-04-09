import type { ShopifySummary } from '../../lib/api';

export type ShopifyIntelBrief = {
  title: string;
  summary: string;
  details: string;
  prompt: string;
  plannerPrompt: string;
  counts: Array<{ label: string; value: string }>;
  focusItems: Array<{ label: string; detail: string }>;
};

export function ShopifyIntelPanel({
  brief,
  summary,
  architectureBusy,
  onRefresh,
  onLoadBrief,
  onRouteToPlanner,
  onMakeTask,
}: {
  brief: ShopifyIntelBrief | null;
  summary: ShopifySummary | null;
  architectureBusy: boolean;
  onRefresh: () => void;
  onLoadBrief: () => void;
  onRouteToPlanner: () => void;
  onMakeTask: () => void;
}) {
  return (
    <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">Shopify Intel</div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">orders / customers / products</div>
      </div>
      <div className="mt-2 text-sm leading-7 text-slate-200/75">
        Keep an eye on recent store activity, customer value, and product movement from the connected Shopify store.
      </div>
      {summary ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{summary.store}</div>
          {brief ? <div className="mt-2 text-sm leading-6 text-cyan-50/88">{brief.summary}</div> : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(brief?.counts || [
              ['Orders', String(summary.orders)],
              ['Open Orders', String(summary.open_orders)],
              ['Refunded Orders', String(summary.refunded_orders)],
              ['Canceled Orders', String(summary.canceled_orders)],
              ['Customers', String(summary.customers)],
              ['Products', String(summary.products)],
              ['Active Products', String(summary.active_products)],
              ['Repeat Customers', String(summary.repeat_customers)],
              ['Revenue', String(summary.estimated_revenue)],
            ]).map((item) => (
              <div key={Array.isArray(item) ? item[0] : item.label} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">{Array.isArray(item) ? item[0] : item.label}</div>
                <div className="mt-1 text-lg text-cyan-50/92">{Array.isArray(item) ? item[1] : item.value}</div>
              </div>
            ))}
          </div>
          {brief?.focusItems?.length ? (
            <div className="mt-3 space-y-2">
              {brief.focusItems.map((item) => (
                <div key={`${item.label}-${item.detail}`} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">{item.label}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-200/76">{item.detail}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Top Customers</div>
              <div className="mt-2 space-y-2 text-sm leading-6 text-slate-200/76">
                {summary.top_customers.length ? summary.top_customers.map((item) => (
                  <div key={item.name}>{item.name} / spent: {item.total_spent} / orders: {item.orders_count}</div>
                )) : <div>No recent customer summary yet.</div>}
              </div>
            </div>
            <div className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Top Products</div>
              <div className="mt-2 space-y-2 text-sm leading-6 text-slate-200/76">
                {summary.top_products.length ? summary.top_products.map((item) => (
                  <div key={item.title}>{item.title} / {item.status} / variants: {item.variant_count}</div>
                )) : <div>No recent product summary yet.</div>}
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Low Stock Watch</div>
            <div className="mt-2 space-y-2 text-sm leading-6 text-slate-200/76">
              {summary.low_stock_products.length ? summary.low_stock_products.map((item) => (
                <div key={item.title}>{item.title} / inventory: {item.inventory}</div>
              )) : <div>No low-stock products detected in the recent summary.</div>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/20"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onLoadBrief}
              className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-500/20"
            >
              Load Brief
            </button>
            <button
              type="button"
              onClick={onRouteToPlanner}
              disabled={architectureBusy}
              className="rounded-full border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-fuchsia-100 transition hover:border-fuchsia-300/40 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {architectureBusy ? 'Routing' : 'Route To Planner'}
            </button>
            <button
              type="button"
              onClick={onMakeTask}
              className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-500/20"
            >
              Make Task
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-sm leading-6 text-slate-300/72">
          Connect Shopify first, then refresh store intel to see orders, customers, products, and a quick revenue snapshot.
        </div>
      )}
    </div>
  );
}
