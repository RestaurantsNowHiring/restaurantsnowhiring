"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { homeCardStyle, homeInputStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";

type EmployerRole = "account_owner" | "hiring_manager" | "viewer";
type EmployerAccessScope = "single_location" | "multi_location" | "full_account_access";
type AccountStatusFilter = "all" | "active" | "invited";
type RoutingFilter = "all" | "enabled" | "disabled";

type EmployerStore = {
  id: string;
  location_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  store_email: string | null;
  ta_email: string | null;
  gm_op_email: string | null;
  minimum_wage: string | null;
  pay_range: string | null;
  default_application_url: string | null;
  active: boolean;
  is_assignable_location: boolean;
  created_at: string;
  updated_at: string;
};

type TeamEditForm = {
  location_name: string;
  state: string;
  address: string;
  city: string;
  store_email: string;
  ta_email: string;
  gm_op_email: string;
  minimum_wage: string;
  pay_range: string;
  default_application_url: string;
  can_manage_notification_routing: boolean;
  role: EmployerRole;
  user_type: EmployerAccessScope;
  assigned_store_ids: string[];
};

type EmployerAccess = {
  role: EmployerRole;
  canManageTeam: boolean;
};

type TeamMember = {
  id: string;
  email: string;
  location_name: string | null;
  user_id: string | null;
  role: EmployerRole;
  status: string;
  can_manage_notification_routing: boolean;
  created_at: string;
  updated_at: string;
  employer_store_id?: string | null;
  user_type: EmployerAccessScope;
  assigned_store_ids?: string[];
};

const ACCESS_SCOPE_LABELS: Record<EmployerAccessScope, string> = {
  single_location: "Single Location",
  multi_location: "Multi Location",
  full_account_access: "Full Account Access",
};

const ACCESS_SCOPE_HELP: Record<EmployerAccessScope, string> = {
  single_location: "Preserves existing store/location login behavior.",
  multi_location: "Viewer access can span selected active stores without changing role permissions.",
  full_account_access: "Can see every location on this employer account.",
};

const ROLE_LABELS: Record<EmployerRole, string> = {
  account_owner: "Account Owner",
  hiring_manager: "Hiring Manager",
  viewer: "Viewer",
};

const ROLE_HELP: Record<EmployerRole, string> = {
  account_owner: "Full access to company profile, billing, jobs, candidates, team, and notification routing.",
  hiring_manager: "Can post and manage jobs and candidates, but cannot access billing, company profile, or team settings.",
  viewer: "Can view the dashboard, jobs, and candidates, and update candidate statuses only.",
};

const JOINED_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const STATE_PATTERN = /(?:,|\s)([A-Z]{2})(?:\s|$)/;

function isPendingTeamInvite(member: TeamMember) {
  const status = member.status?.trim().toLowerCase();
  return status === "invited" || status === "pending";
}

function getAccountStatus(member: TeamMember) {
  return isPendingTeamInvite(member) ? "Invitation Pending" : "Active";
}

function getTeamMemberAccessScope(member: TeamMember) {
  return member.user_type ?? "single_location";
}

function getTeamMemberDisplayName(member: TeamMember) {
  return member.location_name?.trim() || member.email;
}

function getJoinedDisplay(member: TeamMember) {
  if (isPendingTeamInvite(member)) return "-";

  const joinedDate = new Date(member.updated_at);
  if (Number.isNaN(joinedDate.getTime())) return "-";

  return JOINED_DATE_FORMATTER.format(joinedDate);
}

function getMemberState(member: TeamMember) {
  const match = member.location_name?.toUpperCase().match(STATE_PATTERN);
  return match?.[1] ?? "";
}

function getCandidateRoutingEmails(store: EmployerStore | null) {
  return [store?.store_email, store?.ta_email, store?.gm_op_email]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function formatCandidateRoutingEmails(store: EmployerStore | null) {
  const emails = getCandidateRoutingEmails(store);
  return emails.length > 0 ? emails.join(", ") : "—";
}

function employerAccountHeaders(token: string, contentType?: string) {
  const selectedEmployerAccountId = typeof window === "undefined" ? null : window.localStorage.getItem("rn-selected-employer-account-id");
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(selectedEmployerAccountId ? { "X-Employer-Account-Id": selectedEmployerAccountId } : {}),
  };
}

export default function TeamAccessPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [access, setAccess] = useState<EmployerAccess | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [stores, setStores] = useState<EmployerStore[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<EmployerRole>("viewer");
  const [accessScope, setAccessScope] = useState<EmployerAccessScope>("single_location");
  const [assignedStoreIds, setAssignedStoreIds] = useState<string[]>([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [editStoreSearch, setEditStoreSearch] = useState("");
  const [showSingleStorePicker, setShowSingleStorePicker] = useState(false);
  const [showEditSingleStorePicker, setShowEditSingleStorePicker] = useState(false);
  const [canRouteNotifications, setCanRouteNotifications] = useState(false);
  const [detailsSelection, setDetailsSelection] = useState<{ member: TeamMember; store: EmployerStore | null } | null>(null);
  const [editingSelection, setEditingSelection] = useState<{ member: TeamMember; store: EmployerStore | null } | null>(null);
  const [editForm, setEditForm] = useState<TeamEditForm | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusFilter>("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState<"all" | EmployerRole>("all");
  const [routingFilter, setRoutingFilter] = useState<RoutingFilter>("all");
  const [busy, setBusy] = useState(false);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadTeam = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/team")}`);
      return;
    }

    const [meResponse, teamResponse, storesResponse] = await Promise.all([
      fetch("/api/employer/me", { headers: employerAccountHeaders(token) }),
      fetch("/api/employer/team", { headers: employerAccountHeaders(token) }),
      fetch("/api/employer/stores", { headers: employerAccountHeaders(token) }),
    ]);

    const mePayload = (await meResponse.json().catch(() => null)) as { employer?: EmployerAccess; error?: string } | null;
    setAccess(mePayload?.employer ?? null);

    if (!teamResponse.ok) {
      const payload = (await teamResponse.json().catch(() => null)) as { error?: string } | null;
      setMessage(payload?.error || "Only Account Owners can manage team access.");
      setMembers([]);
      setAuthStatus("allowed");
      return;
    }

    const teamPayload = (await teamResponse.json()) as { members?: TeamMember[] };
    const storesPayload = storesResponse.ok ? ((await storesResponse.json().catch(() => null)) as { stores?: EmployerStore[] } | null) : null;
    setMembers(teamPayload.members ?? []);
    setStores(storesPayload?.stores ?? []);
    setAuthStatus("allowed");
  }, [getAccessToken, router]);

  useEffect(() => {
    void Promise.resolve().then(loadTeam);
  }, [loadTeam]);

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const token = await getAccessToken();
    if (!token) {
      setBusy(false);
      setMessage("Please sign in again before managing team access.");
      return;
    }

    const response = await fetch("/api/employer/team", {
      method: "POST",
      headers: employerAccountHeaders(token, "application/json"),
      body: JSON.stringify({ email, role, user_type: accessScope, assigned_store_ids: accessScope === "full_account_access" ? [] : assignedStoreIds, can_manage_notification_routing: canRouteNotifications }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; inviteEmailWarning?: string | null } | null;

    if (!response.ok) {
      setMessage(payload?.error || "Could not save team user.");
      setBusy(false);
      return;
    }

    setEmail("");
    setRole("viewer");
    setAccessScope("single_location");
    setAssignedStoreIds([]);
    setStoreSearch("");
    setShowSingleStorePicker(false);
    setCanRouteNotifications(false);
    setMessage(payload?.inviteEmailWarning || "Team access saved and invitation email sent.");
    setBusy(false);
    await loadTeam();
  }

  async function resendInvite(member: TeamMember) {
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/employer/team/${encodeURIComponent(member.id)}/invite`, {
      method: "POST",
      headers: employerAccountHeaders(token),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "Could not resend the invitation email.");
      return;
    }
    setMessage(`Invitation email resent to ${member.email}.`);
  }

  async function removeMember(member: TeamMember) {
    const confirmed = window.confirm(`Remove team access for ${member.email}? They will no longer be able to access this employer account.`);
    if (!confirmed) return;

    const token = await getAccessToken();
    if (!token) {
      setMessage("Please sign in again before removing team access.");
      return;
    }

    setBusy(true);
    setMessage(null);

    const response = await fetch(`/api/employer/team?id=${encodeURIComponent(member.id)}`, {
      method: "DELETE",
      headers: employerAccountHeaders(token),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setBusy(false);
      setMessage(payload?.error || "Could not remove team user. Please try again.");
      return;
    }

    setMembers((current) => current.filter((teamMember) => teamMember.id !== member.id));
    setDetailsSelection(null);
    closeEditModal();
    setBusy(false);
    setMessage(`Team access removed for ${member.email}.`);
    await loadTeam();
  }

  const normalizeEmail = useCallback((value: string | null | undefined) => {
    return value?.trim().toLowerCase() ?? "";
  }, []);

  const activeStoreOptions = useMemo(() => {
    const byId = new Map<string, EmployerStore>();
    stores.forEach((store) => {
      if (store.active && store.is_assignable_location !== false && store.id) byId.set(store.id, store);
    });
    return Array.from(byId.values()).sort((left, right) => left.location_name.localeCompare(right.location_name, undefined, { sensitivity: "base" }));
  }, [stores]);

  const filteredStoreOptions = useMemo(() => {
    const normalizedSearch = storeSearch.trim().toLowerCase();
    if (!normalizedSearch) return activeStoreOptions;
    return activeStoreOptions.filter((store) => [store.location_name, store.city, store.state].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch)));
  }, [activeStoreOptions, storeSearch]);

  const selectedAssignedStore = useMemo(() => activeStoreOptions.find((store) => assignedStoreIds.includes(store.id)) ?? null, [activeStoreOptions, assignedStoreIds]);

  const filteredEditStoreOptions = useMemo(() => {
    const normalizedSearch = editStoreSearch.trim().toLowerCase();
    if (!normalizedSearch) return activeStoreOptions;
    return activeStoreOptions.filter((store) => [store.location_name, store.city, store.state].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch)));
  }, [activeStoreOptions, editStoreSearch]);

  function toggleAssignedStore(storeId: string) {
    setAssignedStoreIds((current) => {
      if (accessScope === "single_location") return current.includes(storeId) ? [] : [storeId];
      return current.includes(storeId) ? current.filter((id) => id !== storeId) : [...current, storeId];
    });
  }

  const getStoreRoutingEmailKeys = useCallback((store: EmployerStore) => {
    return new Set([store.store_email, store.ta_email, store.gm_op_email].map(normalizeEmail).filter(Boolean));
  }, [normalizeEmail]);

  const findStoreForMember = useCallback((member: TeamMember) => {
    if (getTeamMemberAccessScope(member) !== "single_location") return null;

    const activeStores = stores.filter((store) => store.active && store.is_assignable_location !== false);
    const assignedStoreIds = member.assigned_store_ids ?? [];
    if (assignedStoreIds.length === 1) return activeStores.find((store) => store.id === assignedStoreIds[0]) ?? null;

    const linkedStoreId = typeof member.employer_store_id === "string" ? member.employer_store_id.trim() : "";
    if (linkedStoreId) return activeStores.find((store) => store.id === linkedStoreId) ?? null;

    const memberLocationName = member.location_name?.trim().toLowerCase() ?? "";
    if (memberLocationName) {
      const locationMatches = activeStores.filter((store) => store.location_name.trim().toLowerCase() === memberLocationName);
      if (locationMatches.length === 1) return locationMatches[0];
    }

    const memberEmail = normalizeEmail(member.email);
    if (!memberEmail) return null;

    const emailMatches = activeStores.filter((store) => getStoreRoutingEmailKeys(store).has(memberEmail));
    return emailMatches.length === 1 ? emailMatches[0] : null;
  }, [getStoreRoutingEmailKeys, normalizeEmail, stores]);

  const getMemberStateDisplay = useCallback((member: TeamMember) => {
    return findStoreForMember(member)?.state?.toUpperCase() || getMemberState(member) || "";
  }, [findStoreForMember]);

  const getMemberLocationDisplay = useCallback((member: TeamMember) => {
    if (getTeamMemberAccessScope(member) !== "single_location") return getTeamMemberDisplayName(member);

    const store = findStoreForMember(member);
    const state = getMemberStateDisplay(member);
    const city = store?.city?.trim() ?? "";
    let location = (store?.location_name ?? getTeamMemberDisplayName(member)).trim();

    if (city && !location.toLowerCase().includes(city.toLowerCase())) {
      location = `${location} - ${city}`;
    }

    if (state && !new RegExp(`(?:,|\\s)${state}$`, "i").test(location)) {
      location = `${location}, ${state}`;
    }

    return location;
  }, [findStoreForMember, getMemberStateDisplay]);

  function buildEditForm(member: TeamMember, store = findStoreForMember(member)): TeamEditForm {
    return {
      location_name: store?.location_name ?? member.location_name ?? "",
      state: store?.state ?? getMemberState(member),
      address: store?.address ?? "",
      city: store?.city ?? "",
      store_email: store?.store_email ?? "",
      ta_email: store?.ta_email ?? "",
      gm_op_email: store?.gm_op_email ?? "",
      minimum_wage: store?.minimum_wage ?? "",
      pay_range: store?.pay_range ?? "",
      default_application_url: store?.default_application_url ?? "",
      can_manage_notification_routing: member.can_manage_notification_routing,
      role: member.role,
      user_type: member.user_type ?? "single_location",
      assigned_store_ids: member.assigned_store_ids?.length ? member.assigned_store_ids : store?.id ? [store.id] : [],
    };
  }

  function openDetailsModal(member: TeamMember) {
    setDetailsSelection({ member: { ...member }, store: findStoreForMember(member) });
    setMessage(null);
  }

  function closeDetailsModal() {
    setDetailsSelection(null);
  }

  function openEditModal(member: TeamMember) {
    const store = findStoreForMember(member);
    setEditingSelection({ member: { ...member }, store });
    setEditForm(buildEditForm(member, store));
    setEditStoreSearch("");
    setShowEditSingleStorePicker(false);
    setMessage(null);
  }

  function closeEditModal() {
    setEditingSelection(null);
    setEditForm(null);
    setEditStoreSearch("");
    setShowEditSingleStorePicker(false);
  }

  function toggleEditAssignedStore(storeId: string) {
    setEditForm((current) => {
      if (!current) return current;
      const assigned = current.user_type === "single_location"
        ? current.assigned_store_ids.includes(storeId) ? [] : [storeId]
        : current.assigned_store_ids.includes(storeId)
          ? current.assigned_store_ids.filter((id) => id !== storeId)
          : [...current.assigned_store_ids, storeId];
      return { ...current, assigned_store_ids: assigned };
    });
  }

  function updateEditField<K extends keyof TeamEditForm>(field: K, value: TeamEditForm[K]) {
    setEditForm((current) => (current ? { ...current, [field]: value } : current));
  }

  async function saveEditModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selection = editingSelection;
    const member = selection?.member;
    if (!selection || !member || !editForm) return;

    const token = await getAccessToken();
    if (!token) {
      setMessage("Please sign in again before managing team access.");
      return;
    }

    setBusy(true);
    setMessage(null);

    const locationName = editForm.location_name.trim();
    const teamResponse = await fetch("/api/employer/team", {
      method: "PATCH",
      headers: employerAccountHeaders(token, "application/json"),
      body: JSON.stringify({
        id: member.id,
        role: editForm.role,
        user_type: editForm.user_type,
        assigned_store_ids: editForm.user_type === "full_account_access" ? [] : editForm.assigned_store_ids,
        can_manage_notification_routing: editForm.can_manage_notification_routing,
        location_name: locationName || null,
      }),
    });
    const teamPayload = (await teamResponse.json().catch(() => null)) as { error?: string; member?: TeamMember } | null;

    if (!teamResponse.ok) {
      setBusy(false);
      setMessage(teamPayload?.error || "Could not update team user.");
      return;
    }

    const assignedStoreId = teamPayload?.member?.assigned_store_ids?.[0] ?? editForm.assigned_store_ids[0] ?? null;
    const store = selection.store ?? activeStoreOptions.find((option) => option.id === assignedStoreId) ?? null;
    const previousLocationName = member.location_name;
    const hasStoreDetails = Boolean(
      locationName ||
      editForm.address.trim() ||
      editForm.city.trim() ||
      editForm.state.trim() ||
      editForm.store_email.trim() ||
      editForm.ta_email.trim() ||
      editForm.gm_op_email.trim() ||
      editForm.minimum_wage.trim() ||
      editForm.pay_range.trim() ||
      editForm.default_application_url.trim(),
    );

    if (editForm.user_type === "single_location" && hasStoreDetails) {
      const preserveAutoDetectedStoreValues = Boolean(store?.id && !selection.store);
      const storePayload = {
        ...(store?.id ? { id: store.id } : {}),
        location_name: locationName || store?.location_name || member.location_name || member.email,
        address: preserveAutoDetectedStoreValues && !editForm.address.trim() ? store?.address ?? "" : editForm.address,
        city: preserveAutoDetectedStoreValues && !editForm.city.trim() ? store?.city ?? "" : editForm.city,
        state: preserveAutoDetectedStoreValues && !editForm.state.trim() ? store?.state ?? "" : editForm.state,
        store_email: preserveAutoDetectedStoreValues && !editForm.store_email.trim() ? store?.store_email ?? "" : editForm.store_email,
        ta_email: preserveAutoDetectedStoreValues && !editForm.ta_email.trim() ? store?.ta_email ?? "" : editForm.ta_email,
        gm_op_email: preserveAutoDetectedStoreValues && !editForm.gm_op_email.trim() ? store?.gm_op_email ?? "" : editForm.gm_op_email,
        minimum_wage: preserveAutoDetectedStoreValues && !editForm.minimum_wage.trim() ? store?.minimum_wage ?? "" : editForm.minimum_wage,
        pay_range: preserveAutoDetectedStoreValues && !editForm.pay_range.trim() ? store?.pay_range ?? "" : editForm.pay_range,
        default_application_url: preserveAutoDetectedStoreValues && !editForm.default_application_url.trim() ? store?.default_application_url ?? "" : editForm.default_application_url,
        active: true,
      };
      const storeResponse = await fetch("/api/employer/stores", {
        method: store?.id ? "PATCH" : "POST",
        headers: employerAccountHeaders(token, "application/json"),
        body: JSON.stringify(storePayload),
      });
      const storeResult = (await storeResponse.json().catch(() => null)) as { error?: string } | null;
      if (!storeResponse.ok) {
        if (previousLocationName !== locationName) {
          await fetch("/api/employer/team", {
            method: "PATCH",
            headers: employerAccountHeaders(token, "application/json"),
            body: JSON.stringify({
              id: member.id,
              role: member.role,
              user_type: member.user_type,
              assigned_store_ids: member.user_type === "full_account_access" ? [] : member.assigned_store_ids ?? [],
              can_manage_notification_routing: member.can_manage_notification_routing,
              location_name: previousLocationName,
            }),
          });
        }
        setBusy(false);
        setMessage(storeResult?.error || "Could not save team access and store details.");
        await loadTeam();
        return;
      }
    }

    setBusy(false);
    closeEditModal();
    setMessage("Team access and store details saved.");
    await loadTeam();
  }

  const canManage = Boolean(access?.canManageTeam);
  const isSuccessMessage = Boolean(message && !message.startsWith("Warning:") && (message.includes("saved") || message.includes("sent") || message.includes("resent") || message.includes("removed")));

  const uniqueStates = useMemo(() => Array.from(new Set(members.map(getMemberStateDisplay).filter(Boolean))).sort(), [getMemberStateDisplay, members]);
  const uniqueLocations = useMemo(() => Array.from(new Set(members.map((member) => member.location_name?.trim()).filter((location): location is string => Boolean(location)))).sort(), [members]);
  const teamSummary = useMemo(() => {
    const active = members.filter((member) => !isPendingTeamInvite(member)).length;
    const pending = members.filter(isPendingTeamInvite).length;
    const routingEnabled = members.filter((member) => member.can_manage_notification_routing).length;
    return {
      total: members.length,
      active,
      pending,
      routingEnabled,
      routingDisabled: members.length - routingEnabled,
    };
  }, [members]);
  const filteredMembers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return members.filter((member) => {
      const state = getMemberStateDisplay(member);
      const accountStatus = isPendingTeamInvite(member) ? "invited" : "active";
      const routingStatus = member.can_manage_notification_routing ? "enabled" : "disabled";
      const matchesSearch = !normalizedSearch || [getMemberLocationDisplay(member), member.location_name, state, member.email, ROLE_LABELS[member.role], getAccountStatus(member)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchesSearch
        && (accountStatusFilter === "all" || accountStatusFilter === accountStatus)
        && (stateFilter === "all" || stateFilter === state)
        && (locationFilter === "all" || member.location_name === locationFilter)
        && (roleFilter === "all" || member.role === roleFilter)
        && (routingFilter === "all" || routingFilter === routingStatus);
    });
  }, [accountStatusFilter, getMemberLocationDisplay, getMemberStateDisplay, locationFilter, members, roleFilter, routingFilter, searchQuery, stateFilter]);


  const rowsPerPage = 25;
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedMembers = filteredMembers.slice((safeCurrentPage - 1) * rowsPerPage, safeCurrentPage * rowsPerPage);
  const detailsMember = detailsSelection?.member ?? null;
  const detailsStore = detailsSelection?.store ?? null;
  const editingMember = editingSelection?.member ?? null;
  const detailsAssignedStores = activeStoreOptions.filter((store) => detailsMember?.assigned_store_ids?.includes(store.id));
  const editLinkedStore = editForm ? activeStoreOptions.find((store) => editForm.assigned_store_ids.includes(store.id)) ?? null : null;
  const detailsRows = detailsMember?.user_type === "multi_location"
    ? [
        ["Name/location", detailsMember.location_name ?? detailsMember.email],
        ["Email", detailsMember.email],
        ["Access scope", ACCESS_SCOPE_LABELS.multi_location],
        ["Access level", ROLE_LABELS[detailsMember.role]],
        ["Assigned locations", detailsAssignedStores.length > 0 ? detailsAssignedStores.map((store) => [store.location_name, store.city, store.state].filter(Boolean).join(" — ")).join(", ") : "—"],
        ["Account status", getAccountStatus(detailsMember)],
        ["Candidate routing", detailsMember.can_manage_notification_routing ? "Enabled" : "Disabled"],
        ["Joined date", getJoinedDisplay(detailsMember)],
      ]
    : detailsMember?.user_type === "full_account_access"
      ? [
          ["Name/location", detailsMember.location_name ?? detailsMember.email],
          ["Email", detailsMember.email],
          ["Access scope", ACCESS_SCOPE_LABELS.full_account_access],
          ["Access level", ROLE_LABELS[detailsMember.role]],
          ["Assigned locations", "All locations available"],
          ["Account status", getAccountStatus(detailsMember)],
          ["Candidate routing", detailsMember.can_manage_notification_routing ? "Enabled" : "Disabled"],
          ["Joined date", getJoinedDisplay(detailsMember)],
        ]
      : detailsMember
        ? [
            ["Location name", detailsStore?.location_name ?? detailsMember.location_name ?? "—"],
            ["Address", detailsStore?.address ?? "—"],
            ["City", detailsStore?.city ?? "—"],
            ["State", (detailsStore?.state ?? getMemberState(detailsMember)) || "—"],
            ["Candidate routing emails", formatCandidateRoutingEmails(detailsStore)],
            ["Minimum wage", detailsStore?.minimum_wage ?? "—"],
            ["Pay range", detailsStore?.pay_range ?? "—"],
            ["Default application URL", detailsStore?.default_application_url ?? "—"],
            ["Access scope", ACCESS_SCOPE_LABELS.single_location],
            ["Role", ROLE_LABELS[detailsMember.role]],
            ["Account status", getAccountStatus(detailsMember)],
            ["Candidate routing", detailsMember.can_manage_notification_routing ? "Enabled" : "Disabled"],
            ["Joined date", getJoinedDisplay(detailsMember)],
          ]
        : [];

  if (authStatus === "loading") {
    return <main className="rn-team-page" style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg }}>Loading team access…</main>;
  }

  return (
    <main className="rn-team-page" style={{ minHeight: "100vh", paddingTop: 100, paddingBottom: 72, backgroundColor: homeTheme.bg }}>
      <div className="rn-team-container" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 18px" }}>
        <section className="rn-team-hero" style={{ ...homeCardStyle, marginBottom: 16 }}>
          <p style={{ margin: 0, color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Users & Permissions
          </p>
          <h1 style={{ margin: "8px 0", fontSize: 38, lineHeight: 1.1, fontFamily: "var(--font-heading)", color: homeTheme.green }}>
            Team Access
          </h1>
          <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 700 }}>
            Invite coworkers by email and choose whether they can own the account, manage jobs, or view candidates only.
          </p>
        </section>

        {message ? (
          <div role="alert" style={{ ...homeCardStyle, marginBottom: 16, color: isSuccessMessage ? homeTheme.green : "#8a2f2f", fontWeight: 900 }}>
            {message}
          </div>
        ) : null}

        {!canManage ? (
          <section style={{ ...homeCardStyle, marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Contact your account admin</h2>
            <p style={{ color: homeTheme.muted, fontWeight: 700 }}>
              Your current role can view employer information, but only Account Owners can add users, change roles, or remove access.
            </p>
          </section>
        ) : (
          <>
            <section className="rn-team-panel" style={{ ...homeCardStyle, marginBottom: 16 }}>
              <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Invite or add a user</h2>
              <form onSubmit={saveMember} style={{ display: "grid", gap: 12 }}>
                <label style={{ fontWeight: 900, color: homeTheme.text }}>
                  Email address
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="manager@example.com"
                    className="rn-team-input"
                    style={{ ...homeInputStyle, marginTop: 6, minHeight: 50 }}
                  />
                </label>
                <label style={{ fontWeight: 900, color: homeTheme.text }}>
                  Access level
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as EmployerRole)}
                    className="rn-team-select"
                    style={{ ...homeInputStyle, marginTop: 6, minHeight: 50, appearance: "none" }}
                  >
                    {(Object.keys(ROLE_LABELS) as EmployerRole[]).map((option) => (
                      <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                    ))}
                  </select>
                  <span style={{ display: "block", marginTop: 6, color: homeTheme.muted, fontSize: 13 }}>{ROLE_HELP[role]}</span>
                </label>
                <label style={{ fontWeight: 900, color: homeTheme.text }}>
                  Access scope / user type
                  <select
                    value={accessScope}
                    onChange={(event) => {
                      const nextScope = event.target.value as EmployerAccessScope;
                      setAccessScope(nextScope);
                      if (nextScope === "full_account_access") setAssignedStoreIds([]);
                      if (nextScope === "single_location") {
                        setAssignedStoreIds((current) => current.slice(0, 1));
                        setShowSingleStorePicker(false);
                      }
                      if (nextScope === "multi_location") setShowSingleStorePicker(true);
                    }}
                    className="rn-team-select"
                    style={{ ...homeInputStyle, marginTop: 6, minHeight: 50, appearance: "none" }}
                  >
                    {(Object.keys(ACCESS_SCOPE_LABELS) as EmployerAccessScope[]).map((option) => (
                      <option key={option} value={option}>{ACCESS_SCOPE_LABELS[option]}</option>
                    ))}
                  </select>
                  <span style={{ display: "block", marginTop: 6, color: homeTheme.muted, fontSize: 13 }}>{ACCESS_SCOPE_HELP[accessScope]}</span>
                </label>
                {accessScope === "single_location" ? (
                  <div style={{ display: "grid", gap: 8, fontWeight: 900, color: homeTheme.text }}>
                    <span>Linked store: {selectedAssignedStore ? [selectedAssignedStore.location_name, selectedAssignedStore.city, selectedAssignedStore.state].filter(Boolean).join(" — ") : "Auto-match by location name or routing email"}</span>
                    <button type="button" className="rn-btn-secondary" style={{ ...homeSecondaryButton, justifySelf: "start" }} onClick={() => setShowSingleStorePicker((current) => !current)}>
                      {showSingleStorePicker ? "Hide linked store picker" : "Change linked store"}
                    </button>
                    {showSingleStorePicker ? (
                      <>
                        <input value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} placeholder="Search locations" className="rn-team-input" style={homeInputStyle} />
                        <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto", padding: 10, border: `1px solid ${homeTheme.border}`, borderRadius: 12, background: "#fff" }}>
                          {filteredStoreOptions.map((store) => (
                            <label key={store.id} className="rn-team-checkbox-row" style={{ color: homeTheme.text }}>
                              <input className="rn-team-checkbox" type="radio" name="assigned-store" checked={assignedStoreIds.includes(store.id)} onChange={() => toggleAssignedStore(store.id)} />
                              <span>{[store.location_name, store.city, store.state].filter(Boolean).join(" — ")}</span>
                            </label>
                          ))}
                          {filteredStoreOptions.length === 0 ? <span style={{ color: homeTheme.muted }}>No assignable active stores found.</span> : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : accessScope === "multi_location" ? (
                  <div style={{ display: "grid", gap: 8, fontWeight: 900, color: homeTheme.text }}>
                    <span>Assigned active stores</span>
                    <input value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} placeholder="Search locations" className="rn-team-input" style={homeInputStyle} />
                    <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto", padding: 10, border: `1px solid ${homeTheme.border}`, borderRadius: 12, background: "#fff" }}>
                      {filteredStoreOptions.map((store) => (
                        <label key={store.id} className="rn-team-checkbox-row" style={{ color: homeTheme.text }}>
                          <input className="rn-team-checkbox" type="checkbox" checked={assignedStoreIds.includes(store.id)} onChange={() => toggleAssignedStore(store.id)} />
                          <span>{[store.location_name, store.city, store.state].filter(Boolean).join(" — ")}</span>
                        </label>
                      ))}
                      {filteredStoreOptions.length === 0 ? <span style={{ color: homeTheme.muted }}>No assignable active stores found.</span> : null}
                    </div>
                  </div>
                ) : null}
                <label className="rn-team-checkbox-row" style={{ fontWeight: 800, color: homeTheme.text }}>
                  <input
                    className="rn-team-checkbox"
                    type="checkbox"
                    checked={canRouteNotifications}
                    onChange={(event) => setCanRouteNotifications(event.target.checked)}
                  />
                  <span>Allow this user to change candidate notification routing</span>
                </label>
                <button type="submit" className="rn-btn-primary" style={homePrimaryButton} disabled={busy}>
                  {busy ? "Saving..." : "Invite Team Member"}
                </button>
              </form>
            </section>

            <section className="rn-team-panel" style={{ ...homeCardStyle, marginBottom: 16 }}>
              <div className="rn-team-summary-grid">
                {[
                  { label: "Total team users/locations", value: teamSummary.total },
                  { label: "Active", value: teamSummary.active },
                  { label: "Invitation pending", value: teamSummary.pending },
                  { label: "Routing enabled", value: teamSummary.routingEnabled },
                  { label: "Routing disabled", value: teamSummary.routingDisabled },
                ].map((metric) => (
                  <article key={metric.label} className="rn-team-summary-card">
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="rn-team-panel" style={{ ...homeCardStyle, marginBottom: 16 }}>
              <div className="rn-team-list-header">
                <div>
                  <h2 style={{ marginTop: 0, marginBottom: 6, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Current team users</h2>
                  <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>Search team members and edit details or change access level.</p>
                </div>
              </div>

              <div className="rn-team-filter-grid">
                <label>
                  Search
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Location, email, role, status" className="rn-team-input" style={{ ...homeInputStyle, marginTop: 6 }} />
                </label>
                <label>
                  Account status
                  <select value={accountStatusFilter} onChange={(event) => setAccountStatusFilter(event.target.value as AccountStatusFilter)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="invited">Invitation pending</option>
                  </select>
                </label>
                <label>
                  State
                  <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All states</option>
                    {uniqueStates.map((state) => <option key={state} value={state}>{state}</option>)}
                  </select>
                </label>
                <label>
                  Location
                  <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All locations</option>
                    {uniqueLocations.map((location) => <option key={location} value={location}>{location}</option>)}
                  </select>
                </label>
                <label>
                  Role
                  <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | EmployerRole)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All roles</option>
                    {(Object.keys(ROLE_LABELS) as EmployerRole[]).map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
                  </select>
                </label>
                <label>
                  Candidate routing
                  <select value={routingFilter} onChange={(event) => setRoutingFilter(event.target.value as RoutingFilter)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All routing</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>

              <div className="rn-team-card-list" aria-live="polite">
                {filteredMembers.length === 0 ? (
                  <div className="rn-team-empty-card">No team users match these filters.</div>
                ) : null}
                {paginatedMembers.map((member) => (
                  <article className="rn-team-access-card" key={member.id}>
                    <div className="rn-team-access-card__identity">
                      <strong className="rn-team-access-card__location" title={getMemberLocationDisplay(member)}>{getMemberLocationDisplay(member)}</strong>
                      <span className="rn-team-access-card__email" title={member.email}>{member.email}</span>
                    </div>
                    <div className="rn-team-access-card__badges" aria-label={`${ROLE_LABELS[member.role]}, ${ACCESS_SCOPE_LABELS[member.user_type ?? "single_location"]}, ${getAccountStatus(member)}, candidate routing ${member.can_manage_notification_routing ? "enabled" : "disabled"}`}>
                      <span className="rn-team-role-pill">{ROLE_LABELS[member.role]}</span>
                      <span className="rn-team-role-pill">{ACCESS_SCOPE_LABELS[member.user_type ?? "single_location"]}</span>
                      <span className={isPendingTeamInvite(member) ? "rn-team-status-pill rn-team-status-pill--pending" : "rn-team-status-pill rn-team-status-pill--active"}>{getAccountStatus(member)}</span>
                      <span className={member.can_manage_notification_routing ? "rn-team-routing-pill rn-team-routing-pill--enabled" : "rn-team-routing-pill"}>{member.can_manage_notification_routing ? "Routing enabled" : "Routing disabled"}</span>
                    </div>
                    <div className="rn-team-access-card__actions">
                      <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={() => openDetailsModal(member)} disabled={busy}>Details</button>
                      <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={() => openEditModal(member)} disabled={busy}>Edit</button>
                    </div>
                  </article>
                ))}
              </div>

              {filteredMembers.length > rowsPerPage ? (
                <div className="rn-team-pagination" aria-label="Team access pagination">
                  <span>Showing {(safeCurrentPage - 1) * rowsPerPage + 1}-{Math.min(safeCurrentPage * rowsPerPage, filteredMembers.length)} of {filteredMembers.length}</span>
                  <div>
                    <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1}>Previous</button>
                    <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages}>Next</button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        )}

        {detailsMember ? (
          <div className="rn-team-modal-backdrop" role="presentation" onClick={closeDetailsModal}>
            <section key={detailsMember.id} className="rn-team-modal" role="dialog" aria-modal="true" aria-labelledby="team-details-title" onClick={(event) => event.stopPropagation()}>
              <div className="rn-team-modal__header">
                <div>
                  <p style={{ margin: 0, color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>Team access details</p>
                  <h2 id="team-details-title" style={{ margin: "6px 0 0", fontFamily: "var(--font-heading)", color: homeTheme.text }}>{getTeamMemberDisplayName(detailsMember)}</h2>
                </div>
                <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={closeDetailsModal}>Close</button>
              </div>
              <div className="rn-team-detail-grid">
                {detailsRows.map(([label, value]) => (
                  <div key={label} className="rn-team-detail-item">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              {!detailsMember.user_id ? (
                <div className="rn-team-modal__actions rn-team-modal__actions--secondary">
                  <button type="button" className="rn-btn-secondary rn-team-resend-button" style={homeSecondaryButton} onClick={() => resendInvite(detailsMember)} disabled={busy}>Resend invite</button>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {editingMember && editForm ? (
          <div className="rn-team-modal-backdrop" role="presentation" onClick={closeEditModal}>
            <section key={editingMember.id} className="rn-team-modal rn-team-modal--wide" role="dialog" aria-modal="true" aria-labelledby="team-edit-title" onClick={(event) => event.stopPropagation()}>
              <div className="rn-team-modal__header">
                <div>
                  <p style={{ margin: 0, color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>Edit team access</p>
                  <h2 id="team-edit-title" style={{ margin: "6px 0 0", fontFamily: "var(--font-heading)", color: homeTheme.text }}>{editingMember.email}</h2>
                </div>
                <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={closeEditModal} disabled={busy}>Close</button>
              </div>
              <form className="rn-team-edit-grid" onSubmit={saveEditModal}>
                <label>Access scope / user type<select className="rn-team-select" style={{ ...homeInputStyle, appearance: "none" }} value={editForm.user_type} onChange={(event) => {
                  const nextScope = event.target.value as EmployerAccessScope;
                  setEditForm((current) => {
                    if (!current) return current;
                    return {
                      ...current,
                      user_type: nextScope,
                      assigned_store_ids: nextScope === "full_account_access" ? [] : nextScope === "single_location" ? current.assigned_store_ids.slice(0, 1) : current.assigned_store_ids,
                    };
                  });
                  if (nextScope === "single_location") setShowEditSingleStorePicker(false);
                  if (nextScope === "multi_location") setShowEditSingleStorePicker(true);
                }}>{(Object.keys(ACCESS_SCOPE_LABELS) as EmployerAccessScope[]).map((option) => <option key={option} value={option}>{ACCESS_SCOPE_LABELS[option]}</option>)}</select></label>
                {editForm.user_type === "single_location" ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <strong>Linked store: {editLinkedStore ? [editLinkedStore.location_name, editLinkedStore.city, editLinkedStore.state].filter(Boolean).join(" — ") : "Auto-match by location name or routing email"}</strong>
                    <button type="button" className="rn-btn-secondary" style={{ ...homeSecondaryButton, justifySelf: "start" }} onClick={() => setShowEditSingleStorePicker((current) => !current)}>{showEditSingleStorePicker ? "Hide linked store picker" : "Change linked store"}</button>
                    {showEditSingleStorePicker ? (
                      <>
                        <input value={editStoreSearch} onChange={(event) => setEditStoreSearch(event.target.value)} placeholder="Search locations" className="rn-team-input" style={homeInputStyle} />
                        <div style={{ display: "grid", gap: 8, maxHeight: 240, overflow: "auto", padding: 10, border: `1px solid ${homeTheme.border}`, borderRadius: 12, background: "#fff" }}>
                          {filteredEditStoreOptions.map((store) => (
                            <label key={store.id} className="rn-team-checkbox-row">
                              <input className="rn-team-checkbox" type="radio" name="edit-assigned-store" checked={editForm.assigned_store_ids.includes(store.id)} onChange={() => toggleEditAssignedStore(store.id)} />
                              <span>{[store.location_name, store.city, store.state].filter(Boolean).join(" — ")}</span>
                            </label>
                          ))}
                          {filteredEditStoreOptions.length === 0 ? <span style={{ color: homeTheme.muted }}>No assignable active stores found.</span> : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : editForm.user_type === "multi_location" ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <strong>Assigned active stores</strong>
                    <input value={editStoreSearch} onChange={(event) => setEditStoreSearch(event.target.value)} placeholder="Search locations" className="rn-team-input" style={homeInputStyle} />
                    <div style={{ display: "grid", gap: 8, maxHeight: 240, overflow: "auto", padding: 10, border: `1px solid ${homeTheme.border}`, borderRadius: 12, background: "#fff" }}>
                      {filteredEditStoreOptions.map((store) => (
                        <label key={store.id} className="rn-team-checkbox-row">
                          <input className="rn-team-checkbox" type="checkbox" checked={editForm.assigned_store_ids.includes(store.id)} onChange={() => toggleEditAssignedStore(store.id)} />
                          <span>{[store.location_name, store.city, store.state].filter(Boolean).join(" — ")}</span>
                        </label>
                      ))}
                      {filteredEditStoreOptions.length === 0 ? <span style={{ color: homeTheme.muted }}>No assignable active stores found.</span> : null}
                    </div>
                  </div>
                ) : null}
                {editForm.user_type === "full_account_access" ? (
                  <div style={{ color: homeTheme.muted, fontWeight: 800 }}>Full Account Access users can view all locations on this employer account.</div>
                ) : null}
                {editForm.user_type === "single_location" ? (
                  <>
                    <label>Location name<input className="rn-team-input" style={homeInputStyle} value={editForm.location_name} onChange={(event) => updateEditField("location_name", event.target.value)} maxLength={180} placeholder="Store name, City, ST" /></label>
                    <label>State<input className="rn-team-input" style={homeInputStyle} value={editForm.state} onChange={(event) => updateEditField("state", event.target.value.toUpperCase().slice(0, 2))} maxLength={2} placeholder="MD" /></label>
                    <label>Address<input className="rn-team-input" style={homeInputStyle} value={editForm.address} onChange={(event) => updateEditField("address", event.target.value)} /></label>
                    <label>City<input className="rn-team-input" style={homeInputStyle} value={editForm.city} onChange={(event) => updateEditField("city", event.target.value)} /></label>
                    <label>Candidate routing email 1<input className="rn-team-input" style={homeInputStyle} type="email" value={editForm.store_email} onChange={(event) => updateEditField("store_email", event.target.value)} placeholder="routing1@example.com" /></label>
                    <label>Candidate routing email 2<input className="rn-team-input" style={homeInputStyle} type="email" value={editForm.ta_email} onChange={(event) => updateEditField("ta_email", event.target.value)} placeholder="routing2@example.com" /></label>
                    <label>Candidate routing email 3<input className="rn-team-input" style={homeInputStyle} type="email" value={editForm.gm_op_email} onChange={(event) => updateEditField("gm_op_email", event.target.value)} placeholder="routing3@example.com" /></label>
                    <label>Minimum wage<input className="rn-team-input" style={homeInputStyle} value={editForm.minimum_wage} onChange={(event) => updateEditField("minimum_wage", event.target.value)} /></label>
                    <label>Pay range<input className="rn-team-input" style={homeInputStyle} value={editForm.pay_range} onChange={(event) => updateEditField("pay_range", event.target.value)} /></label>
                    <label>Default application URL<input className="rn-team-input" style={homeInputStyle} value={editForm.default_application_url} onChange={(event) => updateEditField("default_application_url", event.target.value)} placeholder="https://" /></label>
                  </>
                ) : null}
                <label>Role<select className="rn-team-select" style={{ ...homeInputStyle, appearance: "none" }} value={editForm.role} onChange={(event) => updateEditField("role", event.target.value as EmployerRole)}>{(Object.keys(ROLE_LABELS) as EmployerRole[]).map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}</select></label>
                <label className="rn-team-checkbox-row rn-team-edit-checkbox"><input className="rn-team-checkbox" type="checkbox" checked={editForm.can_manage_notification_routing} onChange={(event) => updateEditField("can_manage_notification_routing", event.target.checked)} disabled={editingMember.role === "account_owner"} /><span>Candidate routing enabled</span></label>
                <div className="rn-team-modal__actions">
                  <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={closeEditModal} disabled={busy}>Cancel</button>
                  <button type="submit" className="rn-btn-primary" style={homePrimaryButton} disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
                </div>
                <div className="rn-team-modal__actions rn-team-modal__actions--secondary">
                  <button type="button" className="rn-btn-secondary rn-team-remove-button" style={homeSecondaryButton} onClick={() => removeMember(editingMember)} disabled={busy || editingMember.role === "account_owner"}>Remove team access</button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">Back to Dashboard</Link>
      </div>
    </main>
  );
}
