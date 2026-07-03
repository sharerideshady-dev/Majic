const net = require("net");
const tls = require("tls");
const config = require("../config");
const { processInboundEmail } = require("./otpReceiver");

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
    const tag = `A${String(++this.tagCounter).padStart(4, "0")}`;
    this.buffer = "";
    this.socket.write(`${tag} ${commandText}\r\n`);

    const response = await this.waitFor((buffer) => {
      const pattern = new RegExp(`^${tag} (OK|NO|BAD)`, "m");
      return pattern.test(buffer);
    });
    const statusMatch = response.match(new RegExp(`^${tag} (OK|NO|BAD)`, "m"));

    if (!statusMatch || statusMatch[1] !== "OK") {
      throw new Error(`IMAP command failed: ${commandText}`);
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

  async selectInbox() {
    await this.command("SELECT INBOX");
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
  const client = new SimpleImapClient(config.otp.imap);

  try {
    await client.connect();
    await client.login();
    await client.selectInbox();

    const uids = (await client.searchUnseen()).slice(
      0,
      config.otp.imap.maxMessagesPerPoll
    );
    for (const uid of uids) {
      const raw = await client.fetchRaw(uid);
      const result = await processInboundEmail({
        payload: raw,
        source: "imap",
      });

      await client.archive(uid);
      console.log(`Processed IMAP message UID ${uid}: ${result.status}`);
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
  startImapPoller,
};
