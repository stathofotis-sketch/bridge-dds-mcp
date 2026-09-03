import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

interface Env {
  DDS_BACKEND: {
    fetch(
      input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response>;
  };
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "bridge-dds-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "solve_dd",
    {
      description:
        "Calculate a 20-cell bridge double-dummy matrix for a complete 52-card PBN-style deal through the validated Bridge Analysis Workflow v1.28 direct DDS computational route. The returned matrix is direct Bo Haglund DDS computational evidence via endplay.calc_dd_table. It must not be described as an OptimumResultTable, canonical OptimumResultTable-semantic output, or final project DD closure. Where an independent OptimumResultTable is available, final DD validation requires separate reconciliation under the project QA rules.",
      inputSchema: {
        dealstr: z
          .string()
          .describe(
            'Complete PBN-style deal, e.g. "N:handN handE handS handW", with each hand in S.H.D.C order.'
          ),
      },
    },
    async ({ dealstr }) => {
      try {
        const response = await env.DDS_BACKEND.fetch(
          "https://bridge-dds-native-test.internal/solve-dd",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({ dealstr }),
          }
        );

        const bodyText = await response.text();
        let payload: unknown;

        try {
          payload = JSON.parse(bodyText);
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
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
                type: "text" as const,
                text: JSON.stringify(payload),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
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

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: any
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        ok: true,
        service: "bridge-dds-mcp",
        mcp_endpoint: "/mcp",
        tool: "solve_dd",
        backend:
          "Service Binding DDS_BACKEND -> bridge-dds-native-test",
        workflow: "Bridge Analysis Workflow v1.28",
        evidence_type:
          "direct Bo Haglund DDS computational evidence",
        final_dd_claim_allowed: false,
      });
    }

    if (url.pathname === "/mcp") {
      return createMcpHandler(
        () => createServer(env)
      )(request, env, ctx);
    }

    return Response.json(
      {
        ok: false,
        error: "Use GET / for health or /mcp for MCP.",
      },
      { status: 404 }
    );
  },
};