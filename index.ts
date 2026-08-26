import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";

const NATIVE_DDS_URL = "https://bridge-dds-native-1.onrender.com/dd";

function createServer() {
  const server = new McpServer({
    name: "bridge-dds-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "solve_dd",
    {
      description:
        "Calculate a 20-cell bridge double-dummy table for a complete 52-card PBN-style deal. " +
        "Returns direct Bo Haglund DDS computational evidence. Final project DD validation remains " +
        "subject to the project's OptimumResultTable QA rule.",
      inputSchema: z.object({
        dealstr: z.string().describe(
          'Complete PBN-style deal, e.g. "N:handN handE handS handW", with each hand in S.H.D.C order.'
        ),
      }),
    },
    async ({ dealstr }) => {
      try {
        const response = await fetch(NATIVE_DDS_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ dealstr }),
        });

        const bodyText = await response.text();
        let payload: unknown;

        try {
          payload = JSON.parse(bodyText);
        } catch {
          return {
            isError: true,
            content: [{
              type: "text",
              text: JSON.stringify({
                ok: false,
                stage: "native_dd_response",
                http_status: response.status,
                error: "Native DDS service returned a non-JSON response.",
                body: bodyText.slice(0, 1000),
              }),
            }],
          };
        }

        if (!response.ok) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify(payload) }],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              stage: "mcp_gateway",
              error: error instanceof Error ? error.message : "Unknown MCP gateway error.",
            }),
          }],
        };
      }
    }
  );

  return server;
}

const mcpHandler = createMcpHandler(createServer);

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        ok: true,
        service: "bridge-dds-mcp",
        mcp_endpoint: "/mcp",
        tool: "solve_dd",
        backend: "bridge-dds-native-1.onrender.com/dd",
      });
    }

    return mcpHandler(request, env, ctx);
  },
};
