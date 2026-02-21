"""Web search tool — Tavily API with DuckDuckGo fallback."""

from __future__ import annotations

import os
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("web_search")
class WebSearchTool(BaseTool):
    """Search the web via Tavily API."""

    tool_id = "web_search"

    def __init__(self, api_key: str | None = None, max_results: int = 5):
        self._api_key = api_key or os.environ.get("TAVILY_API_KEY")
        self._max_results = max_results

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="web_search",
            description=(
                "Search the web for current information."
                " Returns relevant search results."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query."},
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum results to return.",
                    },
                },
                "required": ["query"],
            },
            category="search",
            metadata={"requires_api_key": "TAVILY_API_KEY"},
        )

    def execute(self, **params: Any) -> ToolResult:
        query = params.get("query", "")
        if not query:
            return ToolResult(
                tool_name="web_search",
                content="No query provided.",
                success=False,
            )
        if not self._api_key:
            return ToolResult(
                tool_name="web_search",
                content="No API key configured. Set TAVILY_API_KEY.",
                success=False,
            )
        max_results = params.get("max_results", self._max_results)
        try:
            from tavily import TavilyClient

            client = TavilyClient(api_key=self._api_key)
            response = client.search(query, max_results=max_results)
            results = response.get("results", [])
            formatted = "\n\n".join(
                f"**{r.get('title', 'Untitled')}**\n"
                f"{r.get('url', '')}\n{r.get('content', '')}"
                for r in results
            )
            return ToolResult(
                tool_name="web_search",
                content=formatted or "No results found.",
                success=True,
                metadata={"num_results": len(results)},
            )
        except ImportError:
            return ToolResult(
                tool_name="web_search",
                content=(
                    "tavily-python not installed."
                    " Install with: pip install tavily-python"
                ),
                success=False,
            )
        except Exception as exc:
            return ToolResult(
                tool_name="web_search",
                content=f"Search error: {exc}",
                success=False,
            )


__all__ = ["WebSearchTool"]
