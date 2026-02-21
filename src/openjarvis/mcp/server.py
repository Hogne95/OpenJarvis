"""MCP Server — wraps OpenJarvis tools as MCP-discoverable tools."""

from __future__ import annotations

from typing import Dict, List

from openjarvis.core.types import ToolCall
from openjarvis.mcp.protocol import (
    INTERNAL_ERROR,
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    MCPRequest,
    MCPResponse,
)
from openjarvis.tools._stubs import BaseTool, ToolExecutor


class MCPServer:
    """MCP server that exposes OpenJarvis tools via JSON-RPC.

    Parameters
    ----------
    tools:
        List of ``BaseTool`` instances to expose.
    """

    SERVER_NAME = "openjarvis"
    SERVER_VERSION = "1.0.0"
    PROTOCOL_VERSION = "2024-11-05"

    def __init__(self, tools: List[BaseTool]) -> None:
        self._tools: Dict[str, BaseTool] = {t.spec.name: t for t in tools}
        self._executor = ToolExecutor(tools)

    def handle(self, request: MCPRequest) -> MCPResponse:
        """Dispatch an MCP request and return a response."""
        if request.method == "initialize":
            return self._handle_initialize(request)
        elif request.method == "tools/list":
            return self._handle_tools_list(request)
        elif request.method == "tools/call":
            return self._handle_tools_call(request)
        else:
            return MCPResponse.error_response(
                request.id,
                METHOD_NOT_FOUND,
                f"Unknown method: {request.method}",
            )

    def _handle_initialize(self, req: MCPRequest) -> MCPResponse:
        """Handle the initialize handshake."""
        return MCPResponse(
            result={
                "protocolVersion": self.PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {"listChanged": False},
                },
                "serverInfo": {
                    "name": self.SERVER_NAME,
                    "version": self.SERVER_VERSION,
                },
            },
            id=req.id,
        )

    def _handle_tools_list(self, req: MCPRequest) -> MCPResponse:
        """Handle tools/list — return specs for all registered tools."""
        tool_list = []
        for tool in self._tools.values():
            s = tool.spec
            tool_list.append(
                {
                    "name": s.name,
                    "description": s.description,
                    "inputSchema": s.parameters,
                }
            )
        return MCPResponse(result={"tools": tool_list}, id=req.id)

    def _handle_tools_call(self, req: MCPRequest) -> MCPResponse:
        """Handle tools/call — execute a tool and return the result."""
        tool_name = req.params.get("name")
        arguments = req.params.get("arguments", {})

        if not tool_name:
            return MCPResponse.error_response(
                req.id,
                INVALID_PARAMS,
                "Missing required parameter: name",
            )

        if tool_name not in self._tools:
            return MCPResponse.error_response(
                req.id,
                INVALID_PARAMS,
                f"Unknown tool: {tool_name}",
            )

        try:
            import json

            tool_call = ToolCall(
                id=f"mcp-{req.id}",
                name=tool_name,
                arguments=json.dumps(arguments),
            )
            result = self._executor.execute(tool_call)
            return MCPResponse(
                result={
                    "content": [
                        {"type": "text", "text": result.content},
                    ],
                    "isError": not result.success,
                },
                id=req.id,
            )
        except Exception as exc:
            return MCPResponse.error_response(
                req.id,
                INTERNAL_ERROR,
                f"Tool execution error: {exc}",
            )


__all__ = ["MCPServer"]
