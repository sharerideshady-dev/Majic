const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { connectDatabase } = require("./src/db");
const config = require("./src/config");
const jobsRouter = require("./src/routes/jobs");
const mailInboundRouter = require("./src/routes/mailInbound");
const otpSessionsRouter = require("./src/routes/otpSessions");
const templatesRouter = require("./src/routes/templates");
const apiAutomationRouter = require("./src/routes/apiAutomation");
const registeredAccountsRouter = require("./src/routes/registeredAccounts");
const { startImapPoller } = require("./src/services/imapPoller");

const app = express();

app.use(cors());
app.use(
  "/api/mail/inbound",
  express.raw({
    type: ["message/rfc822", "text/plain", "application/octet-stream"],
    limit: "10mb",
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({ message: "Backend is running", service: "majic-automation" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/templates", templatesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/api-automation", apiAutomationRouter);
app.use("/api/registered-accounts", registeredAccountsRouter);
app.use("/api/otp-sessions", otpSessionsRouter);
app.use("/api/mail/inbound", mailInboundRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    error: error.message || "Internal server error",
    details: error.details,
  });
});

async function startServer() {
  try {
    await connectDatabase();
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      startImapPoller();
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
