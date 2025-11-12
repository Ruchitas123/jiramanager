import { Client, Change, Attribute } from "ldapts";

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

const {
  AD_SERVER = "ldap://globalad.corp.adobe.com",
  AD_USER = "",
  AD_PASSWORD = "",
  BASE_DN = "CN=Users,DC=adobenet,DC=global,DC=adobe,DC=com",
  AD_WRITE_ENABLED = "false",
} = process.env;

if (!AD_SERVER || !BASE_DN) {
  throw new Error("Missing required configuration. Ensure AD_SERVER and BASE_DN are set.");
}

// Convert string env to boolean
const WRITE_ENABLED = AD_WRITE_ENABLED.toLowerCase() === "true";

// Accounts & attributes that receive special handling for security reasons
const PROTECTED_ACCOUNTS = new Set([
  "administrator",
  "admin",
  "krbtgt",
  "guest",
  "domain controller",
  "cert publisher",
  "dns",
  "domain admins",
  "schema admins",
  "enterprise admins",
  "group policy creator owners",
  "nt authority",
  "system",
  "backup",
  "service",
  "iis_iusrs",
  "network service",
  "local service",
  "everyone",
  "authenticated users",
  // Org-specific additions
  "backup_admin",
  "service_account",
  "sql_service",
  "exchange_service",
]);

const SERVICE_ACCOUNT_PATTERNS = [
  /.*\$$/i, // machine accounts
  /^svc_.*/i,
  /^service_.*/i,
  /^sa_.*/i,
  /^adm_.*/i,
  /^sys_.*/i,
];

const PASSWORD_RELATED_ATTRS = new Set([
  "unicodepwd",
  "userpassword",
  "password",
  "pwdlastset",
  "useraccountcontrol",
  "lockouttime",
  "accountexpires",
]);

const PROTECTED_ATTRIBUTES = new Set([
  "objectguid",
  "objectsid",
  "distinguishedname",
  "cn",
  "name",
  "samaccountname",
  "useraccountcontrol",
  "memberof",
  "member",
]);

const ADMIN_GROUP_PATTERNS = [
  /CN=Domain Admins/i,
  /CN=Enterprise Admins/i,
  /CN=Schema Admins/i,
  /CN=Administrators/i,
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function isProtectedAccount(username: string = ""): boolean {
  const lower = username.toLowerCase();
  if (PROTECTED_ACCOUNTS.has(lower)) return true;
  return SERVICE_ACCOUNT_PATTERNS.some((re) => re.test(lower));
}

function fileTimeToDate(fileTime: number): Date | null {
  // Converts Windows FILETIME (100-ns ticks since 1601-01-01) to JS Date
  if (!fileTime || typeof fileTime !== "number" || fileTime <= 0) return null;
  const EPOCH_DIFFERENCE = 116444736000000000; // 1601-01-01 → 1970-01-01 in 100ns
  const MS_PER_100NS = 0.0001; // 100ns → ms
  return new Date((fileTime - EPOCH_DIFFERENCE) * MS_PER_100NS);
}

function ensureWriteEnabled(): void {
  if (!WRITE_ENABLED) {
    throw new Error("Write operations are disabled. Set AD_WRITE_ENABLED=true to enable.");
  }
}

// Wrap ldapjs client operations into Promises for async/await ergonomics
async function ldapBindClient() {
  if (!AD_USER || !AD_PASSWORD) {
    throw new Error("Missing AD_USER or AD_PASSWORD env variables");
  }

  const client = new Client({ url: AD_SERVER });

  // If using ldap:// scheme, attempt to upgrade via StartTLS.
  if (AD_SERVER.startsWith("ldap://")) {
    try {
      await client.startTLS();
    } catch (err: any) {
      console.warn("[ldap] startTLS failed – attempting to continue without TLS:", err.message);
    }
  }

  await client.bind(AD_USER, AD_PASSWORD);
  return client;
}

async function ldapSearch(client: Client, base: string, filter: string, attributes: string[] = ["*"]) {
  const { searchEntries } = await client.search(base, {
    scope: "sub",
    filter,
    attributes,
  });
  return searchEntries;
}

async function ldapModify(client: Client, dn: string, changeObj: Change) {
  await client.modify(dn, changeObj);
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

export async function queryAd(queryType: string, params: Record<string, any> = {}): Promise<any> {
  console.log(`[ldap] queryAd → ${queryType}`, { ...params, confirmed: undefined });

  const client = await ldapBindClient();

  try {
    switch (queryType) {
      case "search_ldap": {
        const { search_base = BASE_DN, search_filter, attributes = ["*"] } = params;
        if (!search_filter) throw new Error("search_filter is required for search_ldap");
        const data = await ldapSearch(client, search_base, search_filter, attributes);

        // Post-process attributes similar to Python version
        const processed = data.map((obj: any) => {
          const out = { ...obj } as Record<string, any>;
          for (const [key, val] of Object.entries(obj)) {
            if (
              [
                "lastlogon",
                "lastlogontimestamp",
                "pwdlastset",
                "badpasswordtime",
                "lockouttime",
              ].includes(key.toLowerCase())
            ) {
              out[key] = fileTimeToDate(Number(val))?.toISOString() ?? null;
            }
          }
          return out;
        });
        return { status: "success", count: processed.length, data: processed };
      }

      case "search_users": {
        const searchTerm = (params.search_term || params.name || params.username || "").trim();
        const department = (params.department || "").trim();
        const exact = !!params.exact;

        if (!searchTerm && !department) {
          throw new Error("Search term or department is required");
        }

        if (searchTerm === "*" && !department) {
          throw new Error("Wildcard '*' alone is not allowed; specify a department or more specific term");
        }

        const filterParts = ["(objectClass=user)", "(!(objectClass=computer))"];

        if (searchTerm) {
          if (exact) {
            filterParts.push(`(sAMAccountName=${searchTerm})`);
          } else {
            filterParts.push(
              `(|(cn=*${searchTerm}*)(sAMAccountName=*${searchTerm}*)(givenName=*${searchTerm}*)(displayName=*${searchTerm}*)(mail=*${searchTerm}*))`,
            );
          }
        }
        if (department) filterParts.push(`(department=${department})`);

        const filter = `(&${filterParts.join("")})`;
        const attributes = [
          "cn",
          "mail",
          "sAMAccountName",
          "givenName",
          "displayName",
          "department",
          "title",
          "lastLogon",
          "street",
          "l",
          "st",
          "c",
          "postalCode",
          "telephoneNumber",
          "division",
          "manager",
          "mobile",
          "roomNumber",
          "AdobeStartDate",
        ];

        const raw = await ldapSearch(client, BASE_DN, filter, attributes);
        const results = raw
          .filter((e: any) => !(e.sAMAccountName && e.sAMAccountName.endsWith("$"))) // skip computer accounts
          .map((e: any) => ({
            name: e.cn || "N/A",
            username: e.sAMAccountName,
            email: e.mail || "N/A",
            first_name: e.givenName || "N/A",
            display_name: e.displayName || "N/A",
            department: e.department || "N/A",
            title: e.title || "N/A",
            street: e.street || "N/A",
            city: e.l || "N/A",
            state: e.st || "N/A",
            country: e.c || "N/A",
            postal_code: e.postalCode || "N/A",
            phone: e.telephoneNumber || "N/A",
            division: e.division || "N/A",
            manager: e.manager || "N/A",
            mobile: e.mobile || "N/A",
            room_number: e.roomNumber || "N/A",
            adobe_start_date: e.AdobeStartDate || "N/A",
          }));

        if (!results.length) return { status: "success", data: [], message: "No matching users found" };
        if (exact && results.length === 1) {
          return {
            status: "success",
            data: results[0],
            note: `For actions like adding to groups, use the 'username' field: '${results[0].username}'.`,
          };
        }
        return {
          status: "success",
          data: results,
          message: "For actions like adding to groups, use the 'username' field (e.g., 'tsmith').",
        };
      }
      
      default:
        throw new Error(`Unknown query_type: ${queryType}`);
    }
  } finally {
    // Always close connection
    try {
      client.unbind();
    } catch (_) {
      /* ignore */
    }
  }
}

export default queryAd; 