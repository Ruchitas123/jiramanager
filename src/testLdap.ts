// Simple manual test script for the LDAP utility
// Usage:
//   ts-node --esm src/testLdap.ts <searchTerm> [department]
//
// Make sure your .env (or shell environment) contains the required LDAP
// connection variables (AD_SERVER, AD_USER, AD_PASSWORD, BASE_DN, etc.)
// before running this script.

import "dotenv/config";
import { queryAd } from "./ldap.js";

async function main() {
  const [searchTerm = "*"] = process.argv.slice(2);

  try {
    const res = await queryAd("search_users", {
      search_term: searchTerm,
      exact: false,
    });

    console.log(
      JSON.stringify(
        {
          status: res.status,
          count: Array.isArray(res.data) ? res.data.length : 1,
          data: res.data,
        },
        null,
        2,
      ),
    );
  } catch (err: any) {
    console.error("\n❌ Test failed:", err.message || err);
    process.exit(1);
  }
}

main(); 