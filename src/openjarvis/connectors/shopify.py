"""Shopify connector for store, order, customer, and product sync.

This is a conservative first pass that supports token-based Admin API access
using a combined credential string in the form:

    store-name.myshopify.com:shpat_xxx
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple

import httpx

from openjarvis.connectors._stubs import BaseConnector, Document, SyncStatus
from openjarvis.connectors.oauth import delete_tokens, load_tokens, save_tokens
from openjarvis.core.config import DEFAULT_CONFIG_DIR
from openjarvis.core.registry import ConnectorRegistry
from openjarvis.tools._stubs import ToolSpec

_DEFAULT_CREDENTIALS_PATH = str(DEFAULT_CONFIG_DIR / "connectors" / "shopify.json")
_SHOPIFY_API_VERSION = "2024-10"


def _parse_store_token(raw_token: str) -> Tuple[str, str]:
    token = raw_token.strip()
    if ":" not in token:
        raise ValueError("Shopify token must look like store-name.myshopify.com:shpat_xxx")
    store, access_token = token.split(":", 1)
    store = store.strip()
    access_token = access_token.strip()
    if not store or not access_token:
        raise ValueError("Shopify token must include both store domain and access token")
    if not store.endswith(".myshopify.com"):
        raise ValueError("Shopify store must end with .myshopify.com")
    return store, access_token


def _shopify_api_get(store: str, access_token: str, path: str, *, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    response = httpx.get(
        f"https://{store}/admin/api/{_SHOPIFY_API_VERSION}/{path}",
        headers={"X-Shopify-Access-Token": access_token},
        params=params or {},
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()


def _shopify_recent_summary(store: str, access_token: str) -> Dict[str, Any]:
    orders = _shopify_api_get(store, access_token, "orders.json", params={"limit": 25, "status": "any"}).get("orders", [])
    customers = _shopify_api_get(store, access_token, "customers.json", params={"limit": 25}).get("customers", [])
    products = _shopify_api_get(store, access_token, "products.json", params={"limit": 25}).get("products", [])

    open_orders = [item for item in orders if item.get("fulfillment_status") not in {"fulfilled", "restocked"}]
    canceled_orders = [item for item in orders if item.get("cancelled_at")]
    refunded_orders = []
    for item in orders:
        refunds = item.get("refunds") or []
        financial_status = str(item.get("financial_status", "")).strip().lower()
        if refunds or financial_status in {"refunded", "partially_refunded"}:
            refunded_orders.append(item)
    total_revenue = 0.0
    for item in orders:
        try:
            total_revenue += float(item.get("total_price", 0) or 0)
        except (TypeError, ValueError):
            continue

    top_customers = sorted(customers, key=lambda item: float(item.get("total_spent", 0) or 0), reverse=True)[:3]
    low_stock_products = []
    for product in products:
        inventory_total = 0
        for variant in product.get("variants", []):
            try:
                inventory_total += int(variant.get("inventory_quantity", 0) or 0)
            except (TypeError, ValueError):
                continue
        if inventory_total <= 5:
            low_stock_products.append(
                {
                    "title": product.get("title", str(product.get("id", "product"))),
                    "inventory": inventory_total,
                }
            )

    active_products = [item for item in products if str(item.get("status", "")).lower() == "active"]
    repeat_customer_count = len([item for item in customers if int(item.get("orders_count", 0) or 0) > 1])

    return {
        "store": store,
        "orders": len(orders),
        "open_orders": len(open_orders),
        "canceled_orders": len(canceled_orders),
        "refunded_orders": len(refunded_orders),
        "customers": len(customers),
        "products": len(products),
        "active_products": len(active_products),
        "estimated_revenue": round(total_revenue, 2),
        "repeat_customers": repeat_customer_count,
        "low_stock_products": low_stock_products[:5],
        "top_customers": [
            {
                "name": " ".join(part for part in [item.get("first_name", ""), item.get("last_name", "")] if part).strip()
                or item.get("email", "")
                or str(item.get("id", "customer")),
                "total_spent": item.get("total_spent", "0"),
                "orders_count": int(item.get("orders_count", 0) or 0),
            }
            for item in top_customers
        ],
        "top_products": [
            {
                "title": item.get("title", str(item.get("id", "product"))),
                "status": item.get("status", "unknown"),
                "variant_count": len(item.get("variants", [])),
            }
            for item in products[:3]
        ],
    }


def _parse_timestamp(raw: str) -> datetime:
    if not raw:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


@ConnectorRegistry.register("shopify")
class ShopifyConnector(BaseConnector):
    connector_id = "shopify"
    display_name = "Shopify"
    auth_type = "local"

    def __init__(self, credentials_path: str = "") -> None:
        self._credentials_path = credentials_path or _DEFAULT_CREDENTIALS_PATH
        self._token: str = ""
        self._items_synced = 0
        self._items_total = 0
        self._last_sync: Optional[datetime] = None

    def _credentials(self) -> Optional[Tuple[str, str]]:
        tokens = load_tokens(self._credentials_path)
        if tokens and tokens.get("token"):
            try:
                return _parse_store_token(str(tokens["token"]))
            except ValueError:
                return None
        if self._token:
            try:
                return _parse_store_token(self._token)
            except ValueError:
                return None
        return None

    def is_connected(self) -> bool:
        return self._credentials() is not None

    def disconnect(self) -> None:
        self._token = ""
        delete_tokens(self._credentials_path)

    def store_summary(self) -> Dict[str, Any]:
        creds = self._credentials()
        if not creds:
            raise ValueError("Shopify connector is not connected")
        store, access_token = creds
        save_tokens(self._credentials_path, {"token": f"{store}:{access_token}"})
        return _shopify_recent_summary(store, access_token)

    def sync(
        self,
        *,
        since: Optional[datetime] = None,
        cursor: Optional[str] = None,  # noqa: ARG002
    ) -> Iterator[Document]:
        creds = self._credentials()
        if not creds:
            return
        store, access_token = creds
        save_tokens(self._credentials_path, {"token": f"{store}:{access_token}"})

        synced = 0
        total = 0
        updated_at_min = since.isoformat() if since else None

        orders = _shopify_api_get(
            store,
            access_token,
            "orders.json",
            params={
                "limit": 50,
                "status": "any",
                **({"updated_at_min": updated_at_min} if updated_at_min else {}),
            },
        ).get("orders", [])
        total += len(orders)
        for order in orders:
            title = f"Order #{order.get('order_number', order.get('id', 'unknown'))}"
            content = (
                f"Customer: {order.get('email', 'unknown')}\n"
                f"Financial status: {order.get('financial_status', 'unknown')}\n"
                f"Fulfillment status: {order.get('fulfillment_status', 'unknown')}\n"
                f"Total price: {order.get('total_price', 'unknown')} {order.get('currency', '')}\n"
                f"Tags: {order.get('tags', '')}\n"
                f"Line items: {', '.join(item.get('title', '') for item in order.get('line_items', []))}"
            )
            synced += 1
            yield Document(
                doc_id=f"shopify:order:{order.get('id')}",
                source="shopify",
                doc_type="order",
                content=content,
                title=title,
                author=order.get("email", ""),
                timestamp=_parse_timestamp(order.get("updated_at", "")),
                url=f"https://{store}/admin/orders/{order.get('id')}",
                metadata={
                    "store": store,
                    "order_id": order.get("id"),
                    "financial_status": order.get("financial_status"),
                    "fulfillment_status": order.get("fulfillment_status"),
                    "total_price": order.get("total_price"),
                    "currency": order.get("currency"),
                },
            )

        customers = _shopify_api_get(
            store,
            access_token,
            "customers.json",
            params={"limit": 50, **({"updated_at_min": updated_at_min} if updated_at_min else {})},
        ).get("customers", [])
        total += len(customers)
        for customer in customers:
            name = " ".join(part for part in [customer.get("first_name", ""), customer.get("last_name", "")] if part).strip() or str(customer.get("id", "customer"))
            content = (
                f"Email: {customer.get('email', 'unknown')}\n"
                f"Orders count: {customer.get('orders_count', 0)}\n"
                f"Total spent: {customer.get('total_spent', '0')}\n"
                f"State: {customer.get('state', 'unknown')}\n"
                f"Tags: {customer.get('tags', '')}"
            )
            synced += 1
            yield Document(
                doc_id=f"shopify:customer:{customer.get('id')}",
                source="shopify",
                doc_type="customer",
                content=content,
                title=name,
                author=customer.get("email", ""),
                timestamp=_parse_timestamp(customer.get("updated_at", "")),
                url=f"https://{store}/admin/customers/{customer.get('id')}",
                metadata={
                    "store": store,
                    "customer_id": customer.get("id"),
                    "orders_count": customer.get("orders_count"),
                    "total_spent": customer.get("total_spent"),
                    "state": customer.get("state"),
                },
            )

        products = _shopify_api_get(
            store,
            access_token,
            "products.json",
            params={"limit": 50, **({"updated_at_min": updated_at_min} if updated_at_min else {})},
        ).get("products", [])
        total += len(products)
        for product in products:
            variant_count = len(product.get("variants", []))
            content = (
                f"Vendor: {product.get('vendor', 'unknown')}\n"
                f"Status: {product.get('status', 'unknown')}\n"
                f"Product type: {product.get('product_type', 'unknown')}\n"
                f"Tags: {product.get('tags', '')}\n"
                f"Variants: {variant_count}"
            )
            synced += 1
            yield Document(
                doc_id=f"shopify:product:{product.get('id')}",
                source="shopify",
                doc_type="product",
                content=content,
                title=product.get("title", str(product.get("id", "product"))),
                timestamp=_parse_timestamp(product.get("updated_at", "")),
                url=f"https://{store}/admin/products/{product.get('id')}",
                metadata={
                    "store": store,
                    "product_id": product.get("id"),
                    "status": product.get("status"),
                    "vendor": product.get("vendor"),
                    "product_type": product.get("product_type"),
                    "variant_count": variant_count,
                },
            )

        self._items_synced = synced
        self._items_total = total
        self._last_sync = datetime.now(timezone.utc)

    def sync_status(self) -> SyncStatus:
        return SyncStatus(
            state="idle",
            items_synced=self._items_synced,
            items_total=self._items_total,
            last_sync=self._last_sync,
        )

    def mcp_tools(self) -> List[ToolSpec]:
        return [
            ToolSpec(
                name="shopify_store_summary",
                description="Summarize recent Shopify orders, customers, and products for the connected store.",
                parameters={"type": "object", "properties": {}, "required": []},
                category="business",
            ),
        ]
