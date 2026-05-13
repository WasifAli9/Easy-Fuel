const { withAndroidManifest, withDangerousMod, withInfoPlist } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Android + iOS network posture for Easy Fuel (aligned with Inspect360 pattern).
 * Optional intermediate cert bundle (.pem/.crt/.cer) is bundled when present
 * (custom CA chain); otherwise system + user trust anchors are used.
 */
const withNetworkSecurity = (config) => {
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    let application = androidManifest.manifest.application?.[0];
    if (!application) {
      application = {};
      androidManifest.manifest.application = [application];
    }
    application.$ = {
      ...application.$,
      "android:networkSecurityConfig": "@xml/network_security_config",
    };
    return config;
  });

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidResPath = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      const androidRawPath = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "res",
        "raw",
      );
      const certSourcePath = firstExistingPath([
        path.join(projectRoot, "assets", "certs", "intermediate-ca-bundle.pem"),
        path.join(projectRoot, "assets", "certs", "intermediate-ca-bundle.crt"),
        path.join(projectRoot, "assets", "certs", "intermediate-ca-bundle.cer"),
        path.join(projectRoot, "ssl", "intermediate-ca-bundle.pem"),
        path.join(projectRoot, "ssl", "intermediate-ca-bundle.crt"),
        path.join(projectRoot, "ssl", "intermediate-ca-bundle.cer"),
        path.join(projectRoot, "STAR_easyfuel_ai", "STAR_easyfuel_ai.crt"),
      ]);

      if (!fs.existsSync(androidResPath)) {
        fs.mkdirSync(androidResPath, { recursive: true });
      }
      if (!fs.existsSync(androidRawPath)) {
        fs.mkdirSync(androidRawPath, { recursive: true });
      }

      let includeBundledCa = false;
      if (certSourcePath) {
        fs.copyFileSync(certSourcePath, path.join(androidRawPath, "intermediate_ca_bundle.pem"));
        includeBundledCa = true;
        console.log(`✓ Bundled intermediate CA for Easy Fuel (Android): ${path.basename(certSourcePath)}`);
      }

      const bundledAnchor = includeBundledCa
        ? `            <certificates src="@raw/intermediate_ca_bundle" />\n`
        : "";

      const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- User CAs in base help debugging (corporate proxies) and match domain rules below. -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>

    <!-- List more-specific hosts before the parent domain so Android applies the intended rule. -->
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">portal.easyfuel.ai</domain>
        <trust-anchors>
            <certificates src="system" />
${bundledAnchor}            <certificates src="user" />
        </trust-anchors>
    </domain-config>

    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">easyfuel.ai</domain>
        <trust-anchors>
            <certificates src="system" />
${bundledAnchor}            <certificates src="user" />
        </trust-anchors>
    </domain-config>

    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">devportal.easyfuel.ai</domain>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </domain-config>

    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </domain-config>
</network-security-config>`;

      fs.writeFileSync(path.join(androidResPath, "network_security_config.xml"), networkSecurityConfig);
      return config;
    },
  ]);

  config = withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      ...config.modResults.NSAppTransportSecurity,
      NSExceptionDomains: {
        ...config.modResults.NSAppTransportSecurity?.NSExceptionDomains,
        "easyfuel.ai": {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: false,
          NSExceptionRequiresForwardSecrecy: true,
          NSExceptionMinimumTLSVersion: "TLSv1.2",
        },
        "portal.easyfuel.ai": {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: false,
          NSExceptionRequiresForwardSecrecy: true,
          NSExceptionMinimumTLSVersion: "TLSv1.2",
        },
        "devportal.easyfuel.ai": {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSExceptionRequiresForwardSecrecy: true,
          NSExceptionMinimumTLSVersion: "TLSv1.2",
        },
      },
    };
    return config;
  });

  return config;
};

module.exports = withNetworkSecurity;
