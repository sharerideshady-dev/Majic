const net = require("net");
const tls = require("tls");
const config = require("../config");
const { processInboundEmail } = require("./otpReceiver");
const { parseMimeMessage, sanitizePreview } = require("./emailParser");

const FALLBACK_MAILBOXES = ["Spam", "Junk", "Junk Email"];
const IMAP_RECONNECT_ATTEMPTS = 3;
const IMAP_RECONNECT_DELAY_MS = 5000;

function quoteImapString(value) {
  return `"${String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}"`;
}

class SimpleImapClient {
  constructor(options) {
    this.options = options;
    this.socket = null;
    this.buffer = "";
    this.waiter = null;
    this.tagCounter = 0;
    this.disconnected = false;
  }

  async connect() {
    this.socket = this.options.secure
      ? tls.connect({
          host: this.options.host,
          port: this.options.port,
          servername: this.options.host,
        })
      : net.connect({
          host: this.options.host,
          port: this.options.port,
        });

    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => {
      this.buffer += chunk;
      this.resolveWaiter();
    });
    this.socket.on("error", (error) => {
      if (this.waiter) {
        this.waiter.reject(error);
        this.waiter = null;
      }
    });
    this.socket.on("close", () => {
      this.disconnected = true;
    });

    await this.waitFor((buffer) => /^\* OK/m.test(buffer), 15000);
  }

  resolveWaiter() {
    if (!this.waiter) return;

    if (this.waiter.predicate(this.buffer)) {
      const response = this.buffer;
      clearTimeout(this.waiter.timeout);
      this.waiter.resolve(response);
      this.waiter = null;
    }
  }

  waitFor(predicate, timeoutMs = 30000) {
    if (predicate(this.buffer)) return Promise.resolve(this.buffer);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiter = null;
        reject(new Error("IMAP command timed out"));
      }, timeoutMs);

      this.waiter = { predicate, resolve, reject, timeout };
      this.resolveWaiter();
    });
  }

  async command(commandText) {
    if (!this.socket || this.socket.destroyed || this.disconnected) {
      throw new Error("IMAP connection is not open");
    }

    const tag = `A${String(++this.tagCounter).padStart(4, "0")}`;
    this.buffer = "";
    this.socket.write(`${tag} ${commandText}\r\n`);

    const response = await this.waitFor((buffer) => {
      const pattern = new RegExp(`^${tag} (OK|NO|BAD)`, "m");
      return pattern.test(buffer);
    });
    const statusMatch = response.match(new RegExp(`^${tag} (OK|NO|BAD)`, "m"));

    if (!statusMatch || statusMatch[1] !== "OK") {
      const commandName = String(commandText || "").split(/\s+/, 1)[0] || "UNKNOWN";
      throw new Error(`IMAP command failed: ${commandName}`);
    }

    return response;
  }

  async login() {
    await this.command(
      `LOGIN ${quoteImapString(this.options.user)} ${quoteImapString(
        this.options.password
      )}`
    );
  }

  async selectMailbox(folder) {
    await this.command(`SELECT ${quoteImapString(folder || "INBOX")}`);
  }

  async searchRecentOrUnseen() {
    let response = "";
    try {
      response = await this.command("UID SEARCH OR UNSEEN RECENT");
    } catch (_error) {
      const unseenResponse = await this.command("UID SEARCH UNSEEN");
      const recentResponse = await this.command("UID SEARCH RECENT");
      response = `${unseenResponse}\n${recentResponse}`;
    }

    const uids = [];
    const searchMatches = response.matchAll(/\* SEARCH(?: ([^\r\n]*))?/g);
    for (const match of searchMatches) {
      if (!match || !match[1]) continue;
      uids.push(
        ...match[1]
          .trim()
          .split(/\s+/)
          .filter(Boolean)
      );
    }

    return [...new Set(uids)];
  }

  async searchUnseen() {
    const response = await this.command("UID SEARCH UNSEEN");
    const match = response.match(/\* SEARCH(?: ([^\r\n]*))?/);
    if (!match || !match[1]) return [];

    return match[1]
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  async fetchRaw(uid) {
    const response = await this.command(`UID FETCH ${uid} (BODY.PEEK[])`);
    const literalMatch = response.match(/\{(\d+)\}\r\n/);
    if (!literalMatch) return "";

    const startIndex = literalMatch.index + literalMatch[0].length;
    let raw = response.slice(startIndex);
    const endIndex = raw.lastIndexOf("\r\n)");
    if (endIndex !== -1) raw = raw.slice(0, endIndex);

    return raw;
  }

  async markSeen(uid) {
    await this.command(`UID STORE ${uid} +FLAGS.SILENT (\\Seen)`);
  }

  async archive(uid) {
    if (this.options.archiveFolder) {
      try {
        await this.command(`UID MOVE ${uid} ${quoteImapString(this.options.archiveFolder)}`);
        return;
      } catch (error) {
        console.warn(`IMAP archive move failed for UID ${uid}: ${error.message}`);
      }
    }

    await this.markSeen(uid);
  }

  async logout() {
    if (!this.socket) return;

    try {
      await this.command("LOGOUT");
    } catch (_error) {
      this.socket.end();
    }
  }
}

function validateImapConfig() {
  const missing = [];
  if (!config.otp.mailDomain) missing.push("MAIL_DOMAIN");
  if (!config.otp.imap.host) missing.push("IMAP_HOST");
  if (!config.otp.imap.user) missing.push("IMAP_USER");
  if (!config.otp.imap.password) missing.push("IMAP_PASSWORD");

  if (missing.length > 0) {
    console.warn(`IMAP polling disabled. Missing ${missing.join(", ")}`);
    return false;
  }

  return true;
}

async function pollMailbox() {
  for (let attempt = 1; attempt <= IMAP_RECONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await pollMailboxOnce(attempt);
    } catch (error) {
      const canRetry = attempt < IMAP_RECONNECT_ATTEMPTS;
      console.error(
        `IMAP polling attempt ${attempt} failed: ${error.message}${
          canRetry ? ". Reconnecting..." : ""
        }`
      );
      if (!canRetry) throw error;
      await new Promise((resolve) => setTimeout(resolve, IMAP_RECONNECT_DELAY_MS));
    }
  }
}

function getMailboxesToCheck() {
  return ["INBOX", ...FALLBACK_MAILBOXES].filter(
    (folder, index, folders) => folder && folders.indexOf(folder) === index
  );
}

function formatDebugHeader(value) {
  return sanitizePreview(value || "", 500) || "(empty)";
}

async function pollMailboxOnce(attempt) {
  const client = new SimpleImapClient(config.otp.imap);

  try {
    console.log(
      `IMAP connecting to ${config.otp.imap.host}:${config.otp.imap.port} as ${config.otp.imap.user} (attempt ${attempt})`
    );
    await client.connect();
    console.log("IMAP connection established");
    await client.login();
    console.log("IMAP login successful");

    for (const folder of getMailboxesToCheck()) {
      try {
        await client.selectMailbox(folder);
        console.log(`IMAP selected mailbox: ${folder}`);
      } catch (error) {
        console.warn(`IMAP mailbox ${folder} unavailable: ${error.message}`);
        continue;
      }

      const uids = (await client.searchRecentOrUnseen()).slice(
        0,
        config.otp.imap.maxMessagesPerPoll
      );
      console.log(`IMAP ${folder}: found ${uids.length} unread/recent message(s)`);

      if (uids.length === 0) {
        if (folder === "INBOX") {
          console.log("IMAP INBOX empty; checking Spam/Junk fallback folders");
          continue;
        }
        continue;
      }

      console.log(`IMAP ${folder}: fetching message UID(s) ${uids.join(", ")}`);

      for (const uid of uids) {
        let result = null;
        try {
          const raw = await client.fetchRaw(uid);
          const parsed = parseMimeMessage(raw);
          const headers = parsed.debugHeaders || {};
          console.log(`IMAP UID ${uid}: To=${formatDebugHeader(headers.to)}`);
          console.log(`IMAP UID ${uid}: Delivered-To=${formatDebugHeader(headers.deliveredTo)}`);
          console.log(`IMAP UID ${uid}: X-Original-To=${formatDebugHeader(headers.xOriginalTo)}`);
          console.log(`IMAP UID ${uid}: Envelope-To=${formatDebugHeader(headers.envelopeTo)}`);
          console.log(`IMAP UID ${uid}: Received=${formatDebugHeader(headers.received)}`);
          console.log(`IMAP UID ${uid}: Subject=${formatDebugHeader(headers.subject)}`);
          console.log(`IMAP UID ${uid}: From=${formatDebugHeader(headers.from)}`);
          console.log(`IMAP UID ${uid}: Date=${formatDebugHeader(headers.date)}`);

          result = await processInboundEmail({
            payload: raw,
            source: "imap",
          });

          await client.archive(uid);
          if (result.status === "processed") {
            console.log(`IMAP UID ${uid}: processed successfully`);
          } else {
            console.log(`IMAP UID ${uid}: skipped (${result.status})`);
          }
        } catch (error) {
          console.error(`IMAP UID ${uid}: processing failed (${error.message})`);
        }
      }

      if (folder === "INBOX") {
        return;
      }
    }
  } finally {
    await client.logout();
  }
}

function startImapPoller() {
  if (config.otp.receiveMode !== "imap") return null;
  if (!validateImapConfig()) return null;

  let running = false;

  const run = async () => {
    if (running) return;
    running = true;

    try {
      await pollMailbox();
    } catch (error) {
      console.error("IMAP polling failed:", error.message);
    } finally {
      running = false;
    }
  };

  const interval = setInterval(run, config.otp.imap.pollIntervalMs);
  setTimeout(run, 2000);
  console.log(
    `IMAP polling enabled for ${config.otp.imap.user}@${config.otp.imap.host}`
  );

  return {
    stop() {
      clearInterval(interval);
    },
  };
}

module.exports = {
  SimpleImapClient,
  startImapPoller,
};
