"""Tests for the web search tool."""

from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

from openjarvis.core.registry import ToolRegistry
from openjarvis.tools.web_search import WebSearchTool


class TestWebSearchTool:
    def test_spec_name_and_category(self):
        tool = WebSearchTool(api_key="test-key")
        assert tool.spec.name == "web_search"
        assert tool.spec.category == "search"

    def test_spec_requires_api_key_metadata(self):
        tool = WebSearchTool(api_key="test-key")
        assert tool.spec.metadata["requires_api_key"] == "TAVILY_API_KEY"

    def test_spec_parameters_require_query(self):
        tool = WebSearchTool(api_key="test-key")
        assert "query" in tool.spec.parameters["properties"]
        assert "query" in tool.spec.parameters["required"]

    def test_execute_no_query(self):
        tool = WebSearchTool(api_key="test-key")
        result = tool.execute(query="")
        assert result.success is False
        assert "No query" in result.content

    def test_execute_no_query_param(self):
        tool = WebSearchTool(api_key="test-key")
        result = tool.execute()
        assert result.success is False
        assert "No query" in result.content

    def test_execute_no_api_key(self):
        tool = WebSearchTool(api_key=None)
        # Clear env var to ensure no fallback
        with patch.dict("os.environ", {}, clear=True):
            tool._api_key = None
            result = tool.execute(query="test query")
        assert result.success is False
        assert "No API key" in result.content

    def test_execute_mocked_tavily(self, monkeypatch):
        mock_client = MagicMock()
        mock_client.search.return_value = {
            "results": [
                {
                    "title": "Result 1",
                    "url": "https://example.com/1",
                    "content": "Content about test.",
                },
                {
                    "title": "Result 2",
                    "url": "https://example.com/2",
                    "content": "More content.",
                },
            ]
        }
        mock_tavily_module = MagicMock()
        mock_tavily_module.TavilyClient.return_value = mock_client
        monkeypatch.setitem(sys.modules, "tavily", mock_tavily_module)

        tool = WebSearchTool(api_key="test-key")
        result = tool.execute(query="test query")
        assert result.success is True
        assert "Result 1" in result.content
        assert "Result 2" in result.content
        assert result.metadata["num_results"] == 2

    def test_execute_tavily_error(self, monkeypatch):
        mock_client = MagicMock()
        mock_client.search.side_effect = RuntimeError("API rate limit exceeded")
        mock_tavily_module = MagicMock()
        mock_tavily_module.TavilyClient.return_value = mock_client
        monkeypatch.setitem(sys.modules, "tavily", mock_tavily_module)

        tool = WebSearchTool(api_key="test-key")
        result = tool.execute(query="test query")
        assert result.success is False
        assert "Search error" in result.content

    def test_max_results_parameter(self, monkeypatch):
        mock_client = MagicMock()
        mock_client.search.return_value = {"results": []}
        mock_tavily_module = MagicMock()
        mock_tavily_module.TavilyClient.return_value = mock_client
        monkeypatch.setitem(sys.modules, "tavily", mock_tavily_module)

        tool = WebSearchTool(api_key="test-key", max_results=3)
        tool.execute(query="test", max_results=7)
        mock_client.search.assert_called_once_with("test", max_results=7)

    def test_to_openai_function(self):
        tool = WebSearchTool(api_key="test-key")
        fn = tool.to_openai_function()
        assert fn["type"] == "function"
        assert fn["function"]["name"] == "web_search"
        assert "query" in fn["function"]["parameters"]["properties"]

    def test_execute_import_error(self, monkeypatch):
        """Simulate tavily-python not being installed."""
        # Remove tavily from sys.modules if present, and make import fail
        monkeypatch.delitem(sys.modules, "tavily", raising=False)
        import builtins

        original_import = builtins.__import__

        def _mock_import(name, *args, **kwargs):
            if name == "tavily":
                raise ImportError("No module named 'tavily'")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", _mock_import)

        tool = WebSearchTool(api_key="test-key")
        result = tool.execute(query="test query")
        assert result.success is False
        assert "tavily-python not installed" in result.content

    def test_empty_results(self, monkeypatch):
        mock_client = MagicMock()
        mock_client.search.return_value = {"results": []}
        mock_tavily_module = MagicMock()
        mock_tavily_module.TavilyClient.return_value = mock_client
        monkeypatch.setitem(sys.modules, "tavily", mock_tavily_module)

        tool = WebSearchTool(api_key="test-key")
        result = tool.execute(query="obscure query")
        assert result.success is True
        assert result.content == "No results found."

    def test_tool_id(self):
        tool = WebSearchTool(api_key="test-key")
        assert tool.tool_id == "web_search"

    def test_registry_registration(self):
        ToolRegistry.register_value("web_search", WebSearchTool)
        assert ToolRegistry.contains("web_search")
