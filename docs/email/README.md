# Verification email design

Status: design artifact only; not connected to production email delivery.

Open `verification.html` for the HTML design. `verification.txt` is the plain-text counterpart, including the proposed subject. The design uses CollabEdge's sage green, a light canvas, a white card, inline styles and presentation tables. It needs no remote images, tracking pixels, JavaScript, fonts or sending service.

`{{code}}` is a provider-neutral placeholder, not a Cloudflare substitution token. A future sender must replace it with a server-generated, validated numeric OTP and supply matching plain text. Never send the template with an unresolved placeholder. Expiration must match the authentication backend; the template intentionally promises no invented duration.

Production still uses Cloudflare Access OTP and its existing email. As checked on 2026-09-22, the [OTP documentation](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) describes Cloudflare-managed sending, while the [organization API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/organizations/) documents login-page branding but exposes no OTP email HTML field. No supported integration for this template was found. Login-page branding is not email customization.

The app now binds private registrations and password recovery to the signed Access email, but this custom template is still not sent. [Cloudflare Email Sending](https://developers.cloudflare.com/email-service/) currently requires Workers Paid, so it is not enabled under the user's Workers Free requirement. No paid service, plan upgrade or app-originated email send is included. Owner-only Access and production usage limits remain in force. Preview screenshots are browser renders, not evidence of Gmail/Outlook delivery or rendering compatibility.
