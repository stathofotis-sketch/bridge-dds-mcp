import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";

const DDS_WORKER_URL =
  "https://bridge-dds-native-test.stathofotis.workers.dev/solve-dd";

function createServer() {
  const server = new McpServer({
    name: "bridge-dds-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "solve_dd",
    {
      description:
        "Calculate and validate a bridge double-dummy 20-cell matrix for a complete 52-card PBN-style deal through the validated Bridge Analysis Workflow v1.25 Route B service. Final project DD closure still depends on caller/project context and independent-source reconciliation when applicable.",
      inputSchema: z.object({
        dealstr: z.string().describe(
          'Complete PBN-style deal, e.g. "N:handN handE handS handW", with each hand in S.H.D.C order.'
        ),
      }),
    },
    async ({ dealstr }) => {
      try {
        const response = await fetch(DDS_WORKER_URL, {
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
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  stage: "validated_dd_worker_response",
                  http_status: response.status,
                  error:
                    "Validated DD Worker returned a non-JSON response.",
                  body: bodyText.slice(0, 1000),
                }),
              },
            ],
          };
        }

        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify(payload),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(payload),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                stage: "mcp_gateway",
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown MCP gateway error.",
              }),
            },
          ],
        };
      }
    }
  );

  return server;
}

const mcpHandler = createMcpHandler(createServer);

export default {
  async fetch(
    request: Request,
    env: unknown,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        ok: true,
        service: "bridge-dds-mcp",
        mcp_endpoint: "/mcp",
        tool: "solve_dd",
        backend:
          "bridge-dds-native-test.stathofotis.workers.dev/solve-dd",
      });
    }

    return mcpHandler(request, env, ctx);
  },
};
