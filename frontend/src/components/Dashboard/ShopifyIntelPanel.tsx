import type { ShopifySummary } from '../../lib/api';

export function ShopifyIntelPanel({
  summary,
  onRefresh,
  onLoadBrief,
}: {
  summary: ShopifySummary | null;
  onRefresh: () => void;
  onLoadBrief: () => void;
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
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ['Orders', String(summary.orders)],
              ['Open Orders', String(summary.open_orders)],
              ['Customers', String(summary.customers)],
              ['Products', String(summary.products)],
              ['Active Products', String(summary.active_products)],
              ['Revenue', String(summary.estimated_revenue)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">{label}</div>
                <div className="mt-1 text-lg text-cyan-50/92">{value}</div>
              </div>
            ))}
          </div>
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
