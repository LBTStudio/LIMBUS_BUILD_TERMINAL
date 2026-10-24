# Cloudflare R2 share publishing

This folder contains the R2-backed share endpoint intended to be integrated into the existing `lbt-ogp` Worker.

## Behavior

- `POST /api/r2-share/v1` validates the compressed LBT token, applies a per-IP upload limit, renders a fixed HTML shell with escaped OGP metadata, and stores it in R2. Clients cannot upload arbitrary HTML.
- `GET /s/<16-character-id>` serves the immutable HTML share page. It contains the short OGP metadata and embeds the existing GitHub Pages share viewer with the compressed token in the URL fragment.
- `GET /s?s=...` and `GET /d?s=...` retain the existing external-store URL format for legacy Rentry/Telegraph links. `/d` retrieves the token from those stores for the viewer's fallback path.
- Publishing still writes a Rentry/Telegraph fallback first. If the R2 publish API is unavailable, LBT uses the old share URL path. If R2 returns an error while the Worker is available, the URL's fallback source IDs allow the Worker to retrieve the legacy token.
- The publisher displays a legacy fallback URL alongside the new short URL. A complete Cloudflare outage cannot be auto-routed by a URL on the same Cloudflare hostname; use the visible fallback URL in that case.

## Deploying without breaking existing links

The live Worker is currently managed outside this repository. Do not deploy a new script over it until its current source has been backed up and the routes used by existing links have been compared. The implementation here retains the observed legacy `/s` and `/d` routes, but the live Worker may contain additional routes or behavior not represented in this repository.

1. In Cloudflare Dashboard, create an R2 **Standard** bucket named `lbt-share-html` (or update `bucket_name` below to an existing bucket).
2. Back up/export the current `lbt-ogp` Worker source.
3. Merge `worker.js` into the current Worker or deploy it after verifying all existing endpoints. Configure the R2 binding named `SHARES` to the bucket.
4. Add the `SHARE_PUBLISH_LIMIT` rate limit binding (10 publish operations per IP per 60 seconds, per Cloudflare location). The limit is a best-effort abuse guard, not a globally strict quota.
5. Verify the Worker name/account subdomain matches `SHARE_PUBLIC_ORIGIN`. The app currently validates the existing `lbt-ogp.*.workers.dev` origin.
6. Deploy with Wrangler 4.x (the `[cache]` section needs a version supporting Workers Cache) or configure equivalent Worker response caching. The immutable share HTML uses `s-maxage=86400` so cached reads can bypass Worker execution after the first cache miss at an edge.
7. Verify `GET /healthz` returns `r2Configured: true`; verify POST publish from the GitHub Pages origin; open the generated `/s/<id>` URL; paste it into Discord and confirm its OGP card.
8. Test a forced R2 miss and confirm `b=` fallback sources open the preserved Rentry/Telegraph data. Also test with the new endpoint disabled: the app should continue to create a legacy share URL.

## Configuration and limits

- The default public URL remains on the existing `lbt-ogp.lbtstudio-share.workers.dev` host so the new path works without DNS changes. For higher-scale static distribution, a later migration can serve the `s/<id>` objects directly from an R2 custom domain; doing so bypasses the Worker on reads, but also means a missing R2 object cannot be recovered automatically by that same request.
- The endpoint only stores a bounded token and fixed HTML template, never user-supplied raw HTML. OGP fields are length-limited and HTML-escaped.
- Each publish writes one R2 object. The existing Rentry and Telegraph fallback saves are also retained, intentionally trading a few extra write calls for independent recovery paths.
- This initial version has no deletion UI or automatic expiry. R2 object lifecycle/retention needs a separate explicit policy; do not silently expire links that users expect to remain permanent.

Cloudflare's Workers Rate Limiting API is intentionally approximate per data-center. Keep an account-level Cloudflare WAF/rate-limiting rule on `/api/r2-share/v1` as a second line of defense before making the publish endpoint widely public.
