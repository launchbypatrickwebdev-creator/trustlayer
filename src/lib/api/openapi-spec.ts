export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "TrustLayer Partner API",
    version: "1.2.0",
    description:
      "Partner integration API for TrustLayer deals, user links, event polling, crypto sessions and signed webhooks. Consequential actions use separate least-privilege scopes: deals:finalize, funding:initiate, settlement:execute and transactions:cancel. API permission to request an action does not grant authority to sign an on-chain transaction. Fiat settlement is not available through this API. Deal lifecycle state is not itself proof of on-chain settlement.",
    contact: { name: "TrustLayer Developer Support" },
  },
  servers: [{ url: "/api/v1", description: "TrustLayer API" }],
  tags: [
    { name: "Deals" },
    { name: "Users" },
    { name: "Events" },
    { name: "Webhooks" },
    { name: "Crypto sessions" },
  ],
  components: {
    securitySchemes: {
      PartnerApiKey: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "TrustLayer API key",
        description:
          "Use the full API key returned at issuance. Test keys begin tl_test_; live keys begin tl_live_. Keep keys server-side.",
      },
    },
    parameters: {
      IdempotencyKey: {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        description:
          "Required for supported write operations. Reuse the same key only to retry the same method, path, and request body.",
        schema: { type: "string", minLength: 8, maxLength: 200 },
      },
      Limit: {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      Cursor: {
        name: "cursor",
        in: "query",
        required: false,
        schema: { type: "string" },
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message", "request_id"],
            properties: {
              code: {
                type: "string",
                enum: [
                  "INVALID_REQUEST",
                  "UNAUTHORIZED",
                  "FORBIDDEN",
                  "NOT_FOUND",
                  "CONFLICT",
                  "INVALID_STATE",
                  "IDEMPOTENCY_CONFLICT",
                  "IDEMPOTENCY_MISMATCH",
                  "RATE_LIMITED",
                  "UNSUPPORTED_RAIL",
                  "LINK_USER_REQUIRED",
                  "PROVIDER_ERROR",
                  "BLOCKCHAIN_ERROR",
                  "CONFIGURATION_ERROR",
                  "INTERNAL",
                ],
              },
              message: { type: "string" },
              request_id: { type: "string" },
              details: { type: "object", additionalProperties: true },
            },
          },
        },
      },
      MilestoneInput: {
        type: "object",
        required: ["amount"],
        properties: {
          index: { type: "integer", minimum: 0 },
          title: { type: "string", maxLength: 200 },
          label: { type: "string", maxLength: 200 },
          amount: { type: "string", pattern: "^\\d+(\\.\\d+)?$" },
        },
      },
      PartyInput: {
        type: "object",
        required: ["external_id"],
        properties: {
          external_id: { type: "string", minLength: 1, maxLength: 200 },
        },
      },
      CreateDealRequest: {
        type: "object",
        required: ["external_id", "title", "amount", "buyer", "seller"],
        properties: {
          external_id: { type: "string", minLength: 1, maxLength: 200 },
          title: { type: "string", minLength: 1, maxLength: 200 },
          description: { type: "string", maxLength: 10000 },
          amount: { type: "string", pattern: "^\\d+(\\.\\d+)?$" },
          currency: { type: "string" },
          rail: { type: "string", enum: ["crypto"] },
          chain: {
            type: "string",
            enum: ["solana", "ethereum"],
            default: "solana",
          },
          settlement_adapter: {
            type: "string",
            enum: ["solana_escrow", "solana_ax", "ethereum_escrow"],
            default: "solana_escrow",
          },
          legs: {
            type: "array",
            description: "Required when settlement_adapter is solana_ax (exactly 2 legs).",
            items: {
              type: "object",
              required: ["asset_code", "amount"],
              properties: {
                leg_index: { type: "integer", enum: [0, 1] },
                party_role: { type: "string", enum: ["buyer", "seller"] },
                asset_code: {
                  type: "string",
                  enum: ["SOL", "USDC", "USDT", "EURC", "PYUSD", "USDS", "FDUSD"],
                },
                amount: { type: "string", pattern: "^\\d+(\\.\\d+)?$" },
                mint: { type: "string", nullable: true },
                valuation_usd: { type: "string", nullable: true },
              },
            },
          },
          asset_code: {
            type: "string",
            enum: ["SOL", "USDC", "USDT", "EURC", "PYUSD", "USDS", "FDUSD"],
          },
          escrow_type: { type: "string", enum: ["one_time", "milestone"] },
          initiated_by: { type: "string", enum: ["buyer", "seller"] },
          buyer: { $ref: "#/components/schemas/PartyInput" },
          seller: { $ref: "#/components/schemas/PartyInput" },
          milestones: {
            type: "array",
            items: { $ref: "#/components/schemas/MilestoneInput" },
          },
          duration_seconds: { type: "integer", minimum: 60 },
          auto_finalize: { type: "boolean", default: false },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      Settlement: {
        type: "object",
        properties: {
          milestone_index: { type: "integer" },
          status: { type: "string" },
          funded: { type: "boolean" },
          rail: { type: "string" },
          asset_code: { type: "string", nullable: true },
          ax_leg_index: { type: "integer", nullable: true },
          blockchain: {
            type: "object",
            properties: {
              network: { type: "string", enum: ["solana"] },
              transaction_signature: { type: "string", nullable: true },
              escrow_pda: { type: "string", nullable: true },
            },
          },
        },
      },
      Deal: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          external_id: { type: "string", nullable: true },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          amount: { type: "string" },
          currency: { type: "string", nullable: true },
          asset_code: { type: "string", nullable: true },
          rail: { type: "string", enum: ["crypto"] },
          chain: { type: "string", nullable: true },
          settlement_adapter: { type: "string", nullable: true },
          legs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                leg_index: { type: "integer" },
                party_role: { type: "string", nullable: true },
                asset_code: { type: "string", nullable: true },
                asset_type: { type: "string", nullable: true },
                amount: { type: "string" },
                decimals: { type: "integer" },
                fee_bps: { type: "integer", nullable: true },
                mint: { type: "string", nullable: true },
              },
            },
          },
          status: { type: "string" },
          escrow_type: { type: "string", enum: ["one_time", "milestone"] },
          agreed_deadline: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
          milestones: {
            type: "array",
            items: {
              type: "object",
              properties: {
                milestone_index: { type: "integer" },
                amount: { type: "string" },
                label: { type: "string", nullable: true },
              },
            },
          },
          settlements: {
            type: "array",
            items: { $ref: "#/components/schemas/Settlement" },
          },
          buyer: {
            type: "object",
            nullable: true,
            properties: {
              external_id: { type: "string" },
              user_id: { type: "string", format: "uuid", nullable: true },
              claim_url: { type: "string", format: "uri", nullable: true },
              claim_pending: { type: "boolean" },
            },
          },
          seller: {
            type: "object",
            nullable: true,
            properties: {
              external_id: { type: "string" },
              user_id: { type: "string", format: "uuid", nullable: true },
              claim_url: { type: "string", format: "uri", nullable: true },
              claim_pending: { type: "boolean" },
            },
          },
          actions: {
            type: "object",
            properties: { open: { type: "string", format: "uri" } },
            additionalProperties: { type: "string", format: "uri" },
          },
        },
      },
      DealResponse: {
        type: "object",
        properties: {
          data: { $ref: "#/components/schemas/Deal" },
          request_id: { type: "string" },
          environment: { type: "string", enum: ["test", "live"] },
          idempotent: { type: "boolean" },
        },
      },
      UserLink: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          external_user_id: { type: "string" },
          user_id: { type: "string", format: "uuid" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      DealList: {
        type: "object",
        required: ["data", "has_more"],
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Deal" },
          },
          next_cursor: { type: "string", nullable: true },
          has_more: { type: "boolean" },
          request_id: { type: "string" },
          environment: { type: "string", enum: ["test", "live"] },
        },
      },
      SuccessEnvelope: {
        type: "object",
        properties: {
          data: { type: "object", additionalProperties: true },
          request_id: { type: "string" },
          environment: { type: "string", enum: ["test", "live"] },
        },
      },
      WebhookRegistration: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri", pattern: "^https://" },
          description: { type: "string", maxLength: 120 },
        },
      },
      LinkUserRequest: {
        type: "object",
        required: ["external_user_id", "trustlayer_user_id"],
        properties: {
          external_user_id: { type: "string", minLength: 1, maxLength: 200 },
          trustlayer_user_id: { type: "string", format: "uuid" },
        },
      },
      CryptoSessionRequest: {
        type: "object",
        required: ["deal_id", "action"],
        properties: {
          deal_id: {
            type: "string",
            description: "TrustLayer deal UUID or partner external_id",
          },
          action: {
            type: "string",
            enum: ["deposit", "release", "cancel", "cancel_unfunded", "fund", "open_dispute"],
          },
          milestone_index: {
            type: "integer",
            minimum: 0,
            maximum: 9,
            default: 0,
          },
          actor_external_id: { type: "string" },
        },
      },
      CryptoSession: {
        type: "object",
        properties: {
          session_id: { type: "string", nullable: true },
          action: { type: "string" },
          deal_id: { type: "string" },
          milestone_index: { type: "integer" },
          role: { type: "string", enum: ["buyer", "seller"] },
          expires_at: { type: "string", format: "date-time" },
          url: { type: "string", format: "uri" },
        },
      },
      PartnerEvent: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          deal_id: { type: "string" },
          external_id: { type: "string", nullable: true },
          occurred_at: { type: "string", format: "date-time" },
          data: { type: "object", additionalProperties: true },
        },
      },
      EventList: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/PartnerEvent" },
          },
          next_cursor: { type: "string", nullable: true },
          request_id: { type: "string" },
          environment: { type: "string", enum: ["test", "live"] },
        },
      },
      WebhookEndpoint: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          url: { type: "string", format: "uri" },
          environment: { type: "string", enum: ["test", "live"] },
          status: { type: "string" },
          description: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      WebhookRegistrationResponse: {
        type: "object",
        properties: {
          data: {
            allOf: [
              { $ref: "#/components/schemas/WebhookEndpoint" },
              {
                type: "object",
                properties: {
                  signing_secret: {
                    type: "string",
                    description: "Returned only once; store securely",
                  },
                  note: { type: "string" },
                },
              },
            ],
          },
          request_id: { type: "string" },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Invalid request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Unauthorized: {
        description: "Missing or invalid API key",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Forbidden: {
        description: "Required scope or workspace permission is missing",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      RateLimited: {
        description: "Rate limit exceeded; respect rate-limit headers",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
  security: [{ PartnerApiKey: [] }],
  paths: {
    "/health": {
      get: {
        security: [],
        tags: ["Health"],
        summary: "API health endpoint",
        responses: { "200": { description: "API route is reachable" } },
      },
    },
    "/openapi": {
      get: {
        security: [],
        tags: ["Documentation"],
        summary: "OpenAPI 3.0 document",
        responses: { "200": { description: "OpenAPI JSON" } },
      },
    },
    "/deals": {
      get: {
        tags: ["Deals"],
        summary: "List partner deals using cursor pagination",
        parameters: [
          { $ref: "#/components/parameters/Limit" },
          { $ref: "#/components/parameters/Cursor" },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Deal page",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DealList" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
      post: {
        tags: ["Deals"],
        summary:
          "Create a crypto escrow deal (draft unless auto_finalize is true)",
        description:
          "Requires deals:create. If auto_finalize is true, the key must also have deals:finalize.",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateDealRequest" },
              example: {
                external_id: "order_123",
                title: "Design project",
                amount: "25.00",
                asset_code: "USDC",
                rail: "crypto",
                chain: "solana",
                settlement_adapter: "solana_escrow",
                buyer: { external_id: "buyer_1" },
                seller: { external_id: "seller_1" },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Deal created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DealResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "409": { description: "Idempotency conflict" },
          "422": { description: "Unsupported payment rail" },
        },
      },
    },
    "/deals/{id}": {
      get: {
        tags: ["Deals"],
        summary: "Get a deal by TrustLayer UUID or partner external_id",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Deal",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DealResponse" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/deals/{id}/finalize": {
      post: {
        tags: ["Deals"],
        summary: "Finalize a draft agreement",
        description:
          "Requires the separate deals:finalize scope. A key with deals:create alone cannot finalize a deal or use auto_finalize.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        responses: {
          "200": {
            description: "Agreement finalized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DealResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "409": { description: "Idempotency conflict" },
        },
      },
    },
    "/crypto/sessions": {
      post: {
        tags: ["Crypto sessions"],
        summary: "Create a time-limited crypto payment/session URL",
        description:
          "Action-specific scopes are required: funding:initiate for deposit, settlement:execute for release, and transactions:cancel for cancellation. These scopes request a party capability URL; they do not grant signing authority.",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CryptoSessionRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Session created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/CryptoSession" },
                    request_id: { type: "string" },
                    environment: { type: "string" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "409": { description: "Idempotency conflict" },
        },
      },
    },
    "/users/link": {
      post: {
        tags: ["Users"],
        summary: "Link a partner external user identifier to a TrustLayer user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LinkUserRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "User linked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/UserLink" },
                    request_id: { type: "string" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/events": {
      get: {
        tags: ["Events"],
        summary: "Poll partner events using a cursor",
        parameters: [
          { $ref: "#/components/parameters/Cursor" },
          { $ref: "#/components/parameters/Limit" },
        ],
        responses: {
          "200": {
            description: "Events page",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EventList" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/webhooks": {
      get: {
        tags: ["Webhooks"],
        summary: "List webhook endpoints for the API key environment",
        responses: {
          "200": {
            description: "Endpoint list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/WebhookEndpoint" },
                    },
                    request_id: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Webhooks"],
        summary: "Register endpoint; returns signing_secret once",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WebhookRegistration" },
            },
          },
        },
        responses: {
          "201": {
            description: "Endpoint registered; save signing_secret immediately",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/WebhookRegistrationResponse",
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "500": { description: "Secret encryption configuration required" },
        },
      },
    },
  },
} as const;
