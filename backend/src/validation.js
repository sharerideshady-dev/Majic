const { z } = require("zod");

const locatorSchema = z
  .object({
    type: z.enum(["text", "select"]).optional(),
    selector: z.string().trim().min(1).optional(),
    fallback: z
      .object({
        placeholder: z.string().trim().min(1).optional(),
        label: z.string().trim().min(1).optional(),
        name: z.string().trim().min(1).optional(),
      })
      .optional(),
  })
  .refine(
    (value) =>
      value.selector ||
      value.fallback?.placeholder ||
      value.fallback?.label ||
      value.fallback?.name,
    "A locator needs selector or fallback"
  );

const templateSchema = z
  .object({
    name: z.string().trim().min(1),
    url: z.string().url(),
    fields: z.record(z.string().trim().min(1), locatorSchema),
    submitButton: locatorSchema,
    success: z.object({
      urlContains: z.string().trim().min(1).optional(),
      textSelector: z.string().trim().min(1).optional(),
      textContains: z.string().trim().min(1).optional(),
    }),
  })
  .refine((value) => Object.keys(value.fields).length > 0, {
    message: "At least one field is required",
    path: ["fields"],
  })
  .refine(
    (value) =>
      value.success.urlContains ||
      (value.success.textSelector && value.success.textContains),
    {
      message: "Success needs urlContains or textSelector with textContains",
      path: ["success"],
    }
  );

const jobSchema = z
  .object({
    templateId: z.string().trim().min(1),
    settings: z
      .object({
        minDelayMs: z.number().int().min(0).optional(),
        maxDelayMs: z.number().int().min(0).optional(),
        registrationCase: z.string().trim().min(1).optional(),
        concurrency: z.number().int().min(1).max(10).optional(),
        headless: z.boolean().optional(),
        showBrowser: z.boolean().optional(),
        livePreview: z.boolean().optional(),
        keepBrowserOpenOnError: z.boolean().optional(),
        slowMoMs: z.number().int().min(0).max(5000).optional(),
        useZyteProxy: z.boolean().optional(),
        fieldOrder: z.array(z.string().trim().min(1)).optional(),
      })
      .optional()
      .default({}),
    records: z.array(z.record(z.string(), z.unknown())).min(1),
  })
  .refine(
    (value) => {
      const minDelayMs = value.settings.minDelayMs ?? 0;
      const maxDelayMs = value.settings.maxDelayMs ?? minDelayMs;
      return maxDelayMs >= minDelayMs;
    },
    {
      message: "maxDelayMs must be greater than or equal to minDelayMs",
      path: ["settings", "maxDelayMs"],
    }
  );

const apiAutomationSchema = z.object({
  loginUrl: z.string().trim().url(),
  targetUrl: z.string().trim().url(),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  useZyteProxy: z.boolean().optional().default(false),
  requestedActions: z
    .object({
      followPage: z.boolean().optional().default(false),
      likePosts: z.boolean().optional().default(false),
      sharePosts: z.boolean().optional().default(false),
    })
    .optional()
    .default({}),
});

const zyteExtractSchema = z.object({
  url: z.string().trim().url(),
  httpResponseBody: z.boolean().optional().default(true),
  includeBase64: z.boolean().optional().default(false),
});

const apiAutomationAccountSchema = z
  .object({
    username: z.string().trim().optional(),
    email: z.string().trim().optional(),
    mobile: z.string().trim().optional(),
    contact: z.string().trim().optional(),
    password: z.string().min(1),
    loginUrl: z.string().trim().url().optional(),
    targetUrl: z.string().trim().url().optional(),
    registrationCase: z.string().trim().min(1).optional(),
    proxyCase: z.string().trim().min(1).optional(),
    proxySessionId: z.string().trim().min(1).optional(),
  })
  .catchall(z.unknown())
  .refine(
    (value) => value.username || value.email || value.mobile || value.contact,
    {
      message: "Account needs username, email, mobile, or contact",
      path: ["username"],
    }
  );

const apiAutomationJobSchema = z
  .object({
    loginUrl: z.string().trim().url(),
    targetUrl: z.string().trim().url(),
    settings: z
      .object({
        minDelayMs: z.number().int().min(0).optional(),
        maxDelayMs: z.number().int().min(0).optional(),
        concurrency: z.number().int().min(1).max(10).optional(),
        registrationCase: z.string().trim().min(1).optional(),
        useZyteProxy: z.boolean().optional(),
        requestedActions: z
          .object({
            followPage: z.boolean().optional().default(false),
            likePosts: z.boolean().optional().default(false),
            sharePosts: z.boolean().optional().default(false),
          })
          .optional()
          .default({}),
      })
      .optional()
      .default({}),
    accounts: z.array(apiAutomationAccountSchema).min(1),
  })
  .refine(
    (value) => {
      const minDelayMs = value.settings.minDelayMs ?? 0;
      const maxDelayMs = value.settings.maxDelayMs ?? minDelayMs;
      return maxDelayMs >= minDelayMs;
    },
    {
      message: "maxDelayMs must be greater than or equal to minDelayMs",
      path: ["settings", "maxDelayMs"],
    }
  );

const apiAutomationRegisteredJobSchema = z
  .object({
    loginUrl: z.string().trim().url(),
    targetUrl: z.string().trim().url(),
    settings: z
      .object({
        minDelayMs: z.number().int().min(0).optional(),
        maxDelayMs: z.number().int().min(0).optional(),
        concurrency: z.number().int().min(1).max(10).optional(),
        registrationCase: z.string().trim().min(1).optional(),
        useZyteProxy: z.boolean().optional(),
        requestedActions: z
          .object({
            followPage: z.boolean().optional().default(false),
            likePosts: z.boolean().optional().default(false),
            sharePosts: z.boolean().optional().default(false),
          })
          .optional()
          .default({}),
      })
      .optional()
      .default({}),
    accountIds: z.array(z.string().trim().min(1)).min(1),
  })
  .refine(
    (value) => {
      const minDelayMs = value.settings.minDelayMs ?? 0;
      const maxDelayMs = value.settings.maxDelayMs ?? minDelayMs;
      return maxDelayMs >= minDelayMs;
    },
    {
      message: "maxDelayMs must be greater than or equal to minDelayMs",
      path: ["settings", "maxDelayMs"],
    }
  );

const otpSessionCreateSchema = z
  .object({
    expiresInMinutes: z.number().int().min(5).max(10).optional(),
  })
  .optional()
  .default({});

function validate(schema, payload) {
  const result = schema.safeParse(payload);

  if (!result.success) {
    const error = new Error("Validation failed");
    error.statusCode = 400;
    error.details = result.error.flatten();
    throw error;
  }

  return result.data;
}

module.exports = {
  templateSchema,
  jobSchema,
  apiAutomationSchema,
  apiAutomationJobSchema,
  apiAutomationRegisteredJobSchema,
  zyteExtractSchema,
  otpSessionCreateSchema,
  validate,
};
