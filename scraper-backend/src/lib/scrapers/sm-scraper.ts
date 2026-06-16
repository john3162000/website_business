/**
 * SM Markets (smmarkets.ph) price scraper.
 *
 * smmarkets.ph is a Magento PWA Studio (Venia) storefront — its product list
 * pages are rendered client-side, so a plain HTML fetch returns an empty shell.
 * Instead we pull data from Magento's GraphQL API at `/graphql`, which is the
 * same source the storefront itself uses.
 *
 * The catalog is large, so the crawl is chunked: the first call fetches the
 * category tree, then each subsequent call fetches ONE page of products for the
 * current category. The client keeps calling POST until `done` is true. Each
 * product is stored as a dated snapshot (one StoreProduct row per SKU per day),
 * mirroring how DA commodity prices are stored.
 */

import { prisma } from "@/lib/db";

const SM_BASE = "https://smmarkets.ph";
const GRAPHQL_URL = `${SM_BASE}/graphql`;
const PAGE_SIZE = 50;

const FETCH_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; ScraperBackend/1.0)",
};

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: FETCH_HEADERS,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`SM GraphQL HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors && json.errors.length > 0) {
    throw new Error(`SM GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("SM GraphQL returned no data");
  return json.data;
}

// ─────────────────────────── Schema probe ───────────────────────────

/**
 * Raw, non-throwing probe of a single product by SKU. Returns the full GraphQL
 * payload (data + errors) for several candidate nutrition-bearing field sets so
 * we can discover which one SM Markets actually exposes. Keyed by SKU so the
 * nutrition data can later be tied back to the priced StoreProduct row.
 */
export async function probeSMProduct(sku: string): Promise<unknown> {
  const queries: Record<string, string> = {
    custom_attributes: `
      query Probe($sku: String!) {
        products(filter: { sku: { eq: $sku } }) {
          items {
            sku name
            custom_attributes { code selected_attribute_options { attribute_option { label } } entered_attribute_value { value } }
          }
        }
      }`,
    description: `
      query Probe($sku: String!) {
        products(filter: { sku: { eq: $sku } }) {
          items { sku name description { html } short_description { html } }
        }
      }`,
  };

  const results: Record<string, unknown> = {};
  for (const [key, query] of Object.entries(queries)) {
    try {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: FETCH_HEADERS,
        body: JSON.stringify({ query, variables: { sku } }),
        signal: AbortSignal.timeout(30000),
      });
      results[key] = await res.json();
    } catch (err) {
      results[key] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { sku, results };
}

// ─────────────────────────── Category tree ───────────────────────────

interface RawCategory {
  uid: string;
  name: string;
  product_count: number;
  children?: RawCategory[];
}

const CATEGORY_QUERY = `
  query CategoryTree {
    categoryList(filters: { ids: { eq: "2" } }) {
      uid
      name
      children {
        uid name product_count
        children {
          uid name product_count
          children { uid name product_count }
        }
      }
    }
  }
`;

interface SMCategory {
  uid: string;
  name: string;
}

/**
 * Category name substrings (case-insensitive) that are considered food/grocery.
 * Any category whose name does NOT match at least one of these is skipped, so
 * the scrape stays limited to consumable products and avoids home goods, beauty,
 * fashion, electronics, etc.
 */
const FOOD_CATEGORY_KEYWORDS = [
  "produce", "vegetable", "fruit",
  "meat", "seafood", "fish", "pork", "chicken", "beef",
  "frozen", "chilled", "dairy", "milk", "cheese", "egg",
  "bakery", "bread", "deli",
  "pantry", "grocery", "canned", "condiment", "sauce", "oil", "vinegar",
  "rice", "noodle", "pasta", "flour", "sugar",
  "snack", "biscuit", "cracker", "chips",
  "beverage", "drink", "juice", "water", "coffee", "tea",
  "ready to", "heat", "cook", "instant",
  "spice", "seasoning", "herb",
  "baby food", "infant",
];

function isFoodCategory(name: string): boolean {
  const lc = name.toLowerCase();
  return FOOD_CATEGORY_KEYWORDS.some((kw) => lc.includes(kw));
}

/**
 * Flattens the category tree into a de-duplicated list of **food/grocery**
 * categories that actually contain products.
 */
function flattenCategories(root: RawCategory | undefined): SMCategory[] {
  const out: SMCategory[] = [];
  const seen = new Set<string>();
  const walk = (cat: RawCategory | undefined) => {
    if (!cat) return;
    if (cat.product_count > 0 && !seen.has(cat.uid) && isFoodCategory(cat.name)) {
      seen.add(cat.uid);
      out.push({ uid: cat.uid, name: cat.name });
    }
    for (const child of cat.children ?? []) walk(child);
  };
  // The root (uid "2") itself is the store root; start from its children.
  for (const child of root?.children ?? []) walk(child);
  return out;
}

async function fetchCategories(): Promise<SMCategory[]> {
  const data = await gql<{ categoryList: RawCategory[] }>(CATEGORY_QUERY, {});
  const root = data.categoryList?.[0];
  const cats = flattenCategories(root);
  if (cats.length === 0) {
    throw new Error("SM GraphQL returned no categories with products");
  }
  return cats;
}

// ─────────────────────────── Products ───────────────────────────

interface RawProduct {
  sku: string;
  name: string;
  url_key: string | null;
  small_image: { url: string | null } | null;
  price_range: {
    minimum_price: { final_price: { value: number | string | null } | null } | null;
  } | null;
}

const PRODUCTS_QUERY = `
  query CategoryProducts($uid: String!, $page: Int!, $pageSize: Int!) {
    products(
      filter: { category_uid: { eq: $uid } }
      pageSize: $pageSize
      currentPage: $page
    ) {
      total_count
      page_info { current_page total_pages }
      items {
        sku
        name
        url_key
        small_image { url }
        price_range { minimum_price { final_price { value } } }
      }
    }
  }
`;

/** Pull a trailing unit-of-measure out of names like "Regent Cheese Ring | 60g". */
function parseUom(name: string): string | null {
  const idx = name.lastIndexOf("|");
  if (idx < 0) return null;
  const tail = name.slice(idx + 1).trim();
  return tail.length > 0 && tail.length <= 24 ? tail : null;
}

export interface SMCursor {
  /** Categories to crawl; null until the first call fetches the tree. */
  cats: SMCategory[] | null;
  /** Index of the category currently being crawled. */
  catIndex: number;
  /** 1-based page within the current category. */
  page: number;
}

export function initialSMCursor(): SMCursor {
  return { cats: null, catIndex: 0, page: 1 };
}

/**
 * Processes one unit of work per call:
 *  - if categories aren't loaded yet, fetch the tree and return;
 *  - otherwise fetch one page of products for the current category, upsert
 *    them, and advance the cursor (next page, or next category).
 */
export async function scrapeSMChunk(
  cursor: SMCursor,
  onProgress?: (msg: string) => void
): Promise<{ saved: number; cursor: SMCursor; done: boolean }> {
  if (cursor.cats === null) {
    onProgress?.("Fetching SM Markets category tree...");
    const cats = await fetchCategories();
    onProgress?.(`Queued ${cats.length} categories to crawl.`);
    return { saved: 0, cursor: { cats, catIndex: 0, page: 1 }, done: false };
  }

  const cats = cursor.cats;
  if (cursor.catIndex >= cats.length) {
    return { saved: 0, cursor, done: true };
  }

  const cat = cats[cursor.catIndex];
  onProgress?.(`Fetching "${cat.name}" page ${cursor.page} (${cursor.catIndex + 1}/${cats.length})...`);

  const data = await gql<{
    products: {
      total_count: number;
      page_info: { current_page: number; total_pages: number };
      items: RawProduct[];
    };
  }>(PRODUCTS_QUERY, { uid: cat.uid, page: cursor.page, pageSize: PAGE_SIZE });

  const items = data.products?.items ?? [];
  const totalPages = data.products?.page_info?.total_pages ?? 1;

  // Snapshot date is UTC midnight so multiple runs on the same day upsert into
  // a single daily snapshot.
  const now = new Date();
  const sourceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let saved = 0;
  for (const p of items) {
    if (!p.sku || !p.name) continue;
    // Magento can return the price as a string ("300.00") or a number; coerce.
    const rawPrice = p.price_range?.minimum_price?.final_price?.value ?? null;
    const priceNum = rawPrice == null ? NaN : Number(rawPrice);
    const price = Number.isFinite(priceNum) ? priceNum : null;
    const url = p.url_key ? `${SM_BASE}/${p.url_key}.html` : null;
    await prisma.storeProduct.upsert({
      where: { sku_sourceDate: { sku: p.sku, sourceDate } },
      create: {
        sku: p.sku,
        name: p.name,
        category: cat.name,
        uom: parseUom(p.name),
        price,
        imageUrl: p.small_image?.url ?? null,
        url,
        sourceDate,
      },
      update: {
        name: p.name,
        category: cat.name,
        uom: parseUom(p.name),
        price,
        imageUrl: p.small_image?.url ?? null,
        url,
      },
    });
    saved++;
  }

  // Advance: next page within this category, or move to the next category.
  let next: SMCursor;
  if (cursor.page < totalPages) {
    next = { cats, catIndex: cursor.catIndex, page: cursor.page + 1 };
  } else {
    next = { cats, catIndex: cursor.catIndex + 1, page: 1 };
  }
  const done = next.catIndex >= cats.length;

  onProgress?.(`Saved ${saved} products from "${cat.name}" page ${cursor.page}/${totalPages}.`);
  return { saved, cursor: next, done };
}
