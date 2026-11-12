# Architect
Gateway owns AuthN/Z, policy, SSRF, audit. Adapters execute only. New domains = new adapter + capability flag default off.
