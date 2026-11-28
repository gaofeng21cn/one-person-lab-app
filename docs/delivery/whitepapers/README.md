# Whitepaper Delivery Evidence

Owner: `one-person-lab-app`
Purpose: `app_whitepaper_delivery_evidence_boundary`
State: `active_support`
Machine boundary: Human-readable routing for generated whitepaper evidence. The
source and build profile live in `docs/whitepapers/` and
`contracts/whitepaper_profile.json`; exact artifact and publication truth lives
in generated bundles and GitHub Actions receipts.

Whitepaper verification is generated with the HTML/PDF bundle under the ignored
`docs/site/latest/whitepapers/` directory. Rendered page evidence is generated
under the ignored `tmp/pdfs/opl-app-whitepaper/rendered/` directory. Neither is
tracked on `main`, because a committed verification file can drift away from the
bytes it claims to verify.

App `main` has no whitepaper publication workflow or write token. Build and
inspect the App profile locally with `npm run docs:whitepaper`. The Framework
repository owns the protected family publisher, binds the exact App source into
the family whitepaper bundle, and publishes it on the One Person Lab branded site.
Only that publisher's artifact and post-deployment exact-byte receipt, not this
directory or an App build, is publication evidence.
