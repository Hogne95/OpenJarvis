"""Shopify connector routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from openjarvis.connectors.shopify import ShopifyConnector


shopify_router = APIRouter(prefix="/v1/shopify", tags=["shopify"])


@shopify_router.get("/summary")
async def shopify_summary():
    connector = ShopifyConnector()
    if not connector.is_connected():
        raise HTTPException(status_code=400, detail="Shopify connector is not connected")
    try:
        return connector.store_summary()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
