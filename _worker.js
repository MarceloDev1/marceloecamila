const ASSET_FILE_PATTERN = /\.(?:avif|css|gif|ico|jpe?g|js|json|map|mp4|png|svg|txt|webp|woff2?)$/i;
const ADMIN_PANEL_PATH = "/painel.html";
const ACCESS_API_PATH = "/api/accessos";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === ACCESS_API_PATH) {
      return handleAccessApi(request, env);
    }

    const response = await env.ASSETS.fetch(request);

    if (shouldLogRequest(request, response, url.pathname)) {
      ctx.waitUntil(logAccess(request, env, url));
    }

    return response;
  }
};

function shouldLogRequest(request, response, pathname) {
  if (request.method !== "GET") {
    return false;
  }

  if (!response.ok) {
    return false;
  }

  if (pathname.startsWith("/api/") || pathname === ADMIN_PANEL_PATH || ASSET_FILE_PATTERN.test(pathname)) {
    return false;
  }

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

async function logAccess(request, env, url) {
  if (!env.DB) {
    return;
  }

  const cf = request.cf || {};
  const headers = request.headers;
  const ip = headers.get("CF-Connecting-IP") || headers.get("x-forwarded-for") || null;
  const latitude = toNullableNumber(cf.latitude);
  const longitude = toNullableNumber(cf.longitude);
  const asn = toNullableNumber(cf.asn);

  await env.DB.prepare(
    `INSERT INTO access_logs (
      visited_at,
      host,
      path,
      method,
      ip,
      country,
      region,
      city,
      colo,
      timezone,
      latitude,
      longitude,
      asn,
      as_organization,
      user_agent,
      referer,
      ray_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      new Date().toISOString(),
      url.host,
      url.pathname,
      request.method,
      ip,
      cf.country || null,
      cf.region || null,
      cf.city || null,
      cf.colo || null,
      cf.timezone || null,
      latitude,
      longitude,
      asn,
      cf.asOrganization || null,
      headers.get("user-agent"),
      headers.get("referer"),
      headers.get("cf-ray")
    )
    .run();
}

async function handleAccessApi(request, env) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!env.DB) {
    return json({ error: "D1 binding DB nao configurado." }, 500);
  }

  if (!isAuthorized(request, env)) {
    return json({ error: "Nao autorizado." }, 401);
  }

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 200)
    : 50;
  const country = normalizeCountry(url.searchParams.get("country"));
  const startDate = normalizeDateBoundary(url.searchParams.get("start"), "start");
  const endDate = normalizeDateBoundary(url.searchParams.get("end"), "end");

  if (url.searchParams.get("start") && !startDate) {
    return json({ error: "Data inicial invalida." }, 400);
  }

  if (url.searchParams.get("end") && !endDate) {
    return json({ error: "Data final invalida." }, 400);
  }

  if (startDate && endDate && startDate >= endDate) {
    return json({ error: "O periodo informado e invalido." }, 400);
  }

  const filters = buildFilters({ country, startDate, endDate });

  const [rowsResult, totalsResult, countriesResult, availableCountriesResult] = await Promise.all([
    env.DB.prepare(
      `SELECT
        id,
        visited_at,
        host,
        path,
        method,
        ip,
        country,
        region,
        city,
        colo,
        timezone,
        latitude,
        longitude,
        asn,
        as_organization,
        user_agent,
        referer,
        ray_id
      FROM access_logs
      ${filters.whereClause}
      ORDER BY datetime(visited_at) DESC
      LIMIT ?`
    ).bind(...filters.values, limit).all(),
    env.DB.prepare(
      `SELECT
        COUNT(*) AS total_accesses,
        COUNT(DISTINCT ip) AS unique_visitors
      FROM access_logs
      ${filters.whereClause}`
    ).bind(...filters.values).first(),
    env.DB.prepare(
      `SELECT country, COUNT(*) AS total
      FROM access_logs
      ${filters.whereClauseWithCountryGuard}
      GROUP BY country
      ORDER BY total DESC
      LIMIT 5`
    ).bind(...filters.values).all(),
    env.DB.prepare(
      `SELECT DISTINCT country
      FROM access_logs
      WHERE country IS NOT NULL AND country <> ''
      ORDER BY country ASC`
    ).all()
  ]);

  const items = (rowsResult.results || []).map((row) => ({
    ...row,
    ip: undefined,
    masked_ip: maskIp(row.ip)
  }));

  return json({
    items,
    summary: {
      totalAccesses: totalsResult?.total_accesses || 0,
      uniqueVisitors: totalsResult?.unique_visitors || 0,
      topCountries: countriesResult.results || []
    },
    filters: {
      country: country || "",
      start: url.searchParams.get("start") || "",
      end: url.searchParams.get("end") || ""
    },
    options: {
      countries: (availableCountriesResult.results || []).map((entry) => entry.country).filter(Boolean)
    }
  });
}

function buildFilters({ country, startDate, endDate }) {
  const clauses = [];
  const values = [];

  if (country) {
    clauses.push("country = ?");
    values.push(country);
  }

  if (startDate) {
    clauses.push("visited_at >= ?");
    values.push(startDate);
  }

  if (endDate) {
    clauses.push("visited_at < ?");
    values.push(endDate);
  }

  const whereClause = clauses.length > 0
    ? `WHERE ${clauses.join(" AND ")}`
    : "";
  const whereClauseWithCountryGuard = clauses.length > 0
    ? `WHERE country IS NOT NULL AND country <> '' AND ${clauses.join(" AND ")}`
    : "WHERE country IS NOT NULL AND country <> ''";

  return {
    whereClause,
    whereClauseWithCountryGuard,
    values
  };
}

function normalizeCountry(value) {
  if (!value) {
    return "";
  }

  return value.trim().slice(0, 80);
}

function normalizeDateBoundary(value, boundary) {
  if (!value) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  if (boundary === "start") {
    return `${value}T00:00:00.000Z`;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function maskIp(ip) {
  if (!ip) {
    return "-";
  }

  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
  }

  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    if (parts.length > 1) {
      return `${parts.slice(0, 2).join(":")}:****:****`;
    }
  }

  return "***";
}

function isAuthorized(request, env) {
  const adminToken = env.ADMIN_TOKEN;

  if (!adminToken) {
    return false;
  }

  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  const headerToken = request.headers.get("x-admin-token") || "";

  return bearerToken === adminToken || headerToken === adminToken;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}