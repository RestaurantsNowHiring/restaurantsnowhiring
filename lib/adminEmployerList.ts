export const ADMIN_EMPLOYERS_PER_PAGE = 15;

export type AdminEmployerRow = {
  employer: string;
  email: string;
  adCount: number;
  latest: string;
};

export function filterAdminEmployers(
  employers: AdminEmployerRow[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return employers;

  return employers.filter(
    ({ employer, email }) =>
      employer.toLocaleLowerCase().includes(normalizedQuery) ||
      email.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function paginateAdminEmployers(
  employers: AdminEmployerRow[],
  requestedPage: number,
  pageSize = ADMIN_EMPLOYERS_PER_PAGE,
) {
  const totalPages = Math.max(1, Math.ceil(employers.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const startIndex = (page - 1) * pageSize;
  const rows = employers.slice(startIndex, startIndex + pageSize);

  return {
    rows,
    page,
    totalPages,
    total: employers.length,
    showingStart: rows.length === 0 ? 0 : startIndex + 1,
    showingEnd: startIndex + rows.length,
  };
}
