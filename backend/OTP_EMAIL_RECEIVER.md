# Inbound Email OTP Receiver

This backend receives OTP emails sent by external services. It does not generate OTPs.

## Environment

Set these values in Replit Secrets or your deployment environment:

```env
MAIL_DOMAIN=mydomain.com
MAIL_RECEIVE_MODE=webhook
OTP_SESSION_EXPIRE_MINUTES=10
OTP_REQUESTER_API_KEYS=requester_1:replace-with-long-random-key
INBOUND_MAIL_WEBHOOK_SECRET=replace-with-long-random-webhook-secret
```

For IMAP polling:

```env
MAIL_RECEIVE_MODE=imap
IMAP_HOST=mail.mydomain.com
IMAP_PORT=993
IMAP_USER=otp@mydomain.com
IMAP_PASSWORD=replace-with-mailbox-password
IMAP_SECURE=true
```

Your mail server must deliver plus-addressed aliases such as
`otp+REQUEST_ID@mydomain.com` into the webhook or mailbox watched by this app.

## Requester API

Create a receiving session:

```bash
curl -X POST "$BASE_URL/api/otp-sessions" \
  -H "Authorization: Bearer replace-with-long-random-key" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:

```json
{
  "session": {
    "requestId": "87f3...",
    "alias": "otp+87f3...@mydomain.com",
    "status": "pending",
    "expiresAt": "2026-07-02T12:00:00.000Z"
  }
}
```

Poll for the OTP:

```bash
curl "$BASE_URL/api/otp-sessions/REQUEST_ID" \
  -H "Authorization: Bearer replace-with-long-random-key"
```

When an OTP has arrived, the first successful owner request returns it and marks
the session completed. Later reads return the completed status without the OTP.

## Inbound Webhook

Configure your mail server or inbound parser to POST to:

```text
POST /api/mail/inbound
Authorization: Bearer replace-with-long-random-webhook-secret
```

The endpoint accepts common JSON/form fields such as `from`, `to`, `subject`,
`text`, `html`, `body-plain`, `body-html`, or a raw MIME payload with content
type `message/rfc822`.

Webhook responses never include the extracted OTP.
