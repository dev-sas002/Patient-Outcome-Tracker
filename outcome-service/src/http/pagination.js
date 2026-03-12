'use strict';

/**
 * Pagination values arrive as untrusted query strings. Unparsable, negative or
 * absurdly large values previously produced NaN skips, negative skips and
 * `?limit=100000` dumping an entire clinic's patient records in one response.
 *
 * Clamping rather than rejecting is deliberate: a paging bug in a caller should
 * degrade to the default page, not 400 a clinician out of their own dashboard.
 */
function parsePagination(query = {}, { defaultPageSize, maxPageSize }) {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxPageSize) : defaultPageSize;

  return { page, limit, skip: (page - 1) * limit };
}

function paginationMeta({ page, limit }, total) {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}

module.exports = { parsePagination, paginationMeta };
